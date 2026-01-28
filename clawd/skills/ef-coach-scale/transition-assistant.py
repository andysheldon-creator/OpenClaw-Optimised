#!/usr/bin/env python3
"""
Transition Assistant - Meeting/event transition prompts.
Detect meeting end (<15m ago), prompt for capture, link to PARA context.
"""

import sqlite3
import subprocess
import json
from datetime import datetime, timedelta
from pathlib import Path
from typing import Dict, List, Optional


class TransitionAssistant:
    """
    Manages meeting and event transitions - detects when meetings end
    and prompts for capture/context linking.
    """

    def __init__(self, db_path: str = None, para_db_path: str = None):
        """
        Initialize Transition Assistant.

        Args:
            db_path: Path to patterns.db. Defaults to skill directory.
            para_db_path: Path to PARA database. Defaults to ~/clawd/memory/para.sqlite.
        """
        if db_path is None:
            db_path = str(Path(__file__).parent / "patterns.db")
        if para_db_path is None:
            para_db_path = str(Path.home() / "clawd" / "memory" / "para.sqlite")

        self.db_path = db_path
        self.para_db_path = para_db_path
        self.conn = None
        self.para_conn = None

    def connect(self) -> None:
        """Establish database connections."""
        self.conn = sqlite3.connect(self.db_path)
        self.para_conn = sqlite3.connect(self.para_db_path)

    def close(self) -> None:
        """Close database connections."""
        if self.conn:
            self.conn.close()
        if self.para_conn:
            self.para_conn.close()

    def get_recent_calendar_events(self, minutes_back: int = 60) -> List[Dict]:
        """
        Fetch recent calendar events.

        Args:
            minutes_back: How many minutes back to look.

        Returns:
            List of event dictionaries.
        """
        try:
            cmd = [
                "gog", "calendar", "events", "primary",
                "--from", "today",
                "--to", "+2d",
                "--account", "clawdbot@puenteworks.com"
            ]
            result = subprocess.run(cmd, capture_output=True, text=True, timeout=30)

            if result.returncode != 0:
                return []

            events = json.loads(result.stdout)
            now = datetime.now()
            past = now - timedelta(minutes=minutes_back)

            filtered_events = []
            for event in events.get("items", []):
                start_str = event.get("start", {}).get("dateTime", "")
                end_str = event.get("end", {}).get("dateTime", "")

                if not start_str:
                    continue

                try:
                    start = datetime.fromisoformat(start_str.replace("Z", "+00:00"))
                    end = datetime.fromisoformat(end_str.replace("Z", "+00:00")) if end_str else start + timedelta(hours=1)

                    # Events that ended recently (within minutes_back)
                    if end > past and end < now:
                        minutes_ago = (now - end).total_seconds() / 60
                        filtered_events.append({
                            "start": start,
                            "end": end,
                            "summary": event.get("summary", "No title"),
                            "description": event.get("description", ""),
                            "minutes_ago": int(minutes_ago)
                        })

                except (ValueError, TypeError):
                    continue

            # Sort by most recent
            return sorted(filtered_events, key=lambda x: x["end"], reverse=True)

        except Exception as e:
            print(f"Error fetching calendar: {e}")
            return []

    def find_recently_ended_meetings(self, minutes_threshold: int = 15) -> List[Dict]:
        """
        Find meetings that ended recently.

        Args:
            minutes_threshold: Threshold for "recent" in minutes.

        Returns:
            List of recently ended meeting dictionaries.
        """
        events = self.get_recent_calendar_events(minutes_back=minutes_threshold + 30)

        recently_ended = []
        for event in events:
            if event["minutes_ago"] <= minutes_threshold:
                recently_ended.append(event)

        return recently_ended

    def get_related_para_context(self, keywords: List[str]) -> List[Dict]:
        """
        Find relevant PARA projects/areas based on keywords.

        Args:
            keywords: List of keywords to search for.

        Returns:
            List of matching PARA items.
        """
        try:
            cursor = self.para_conn.cursor()

            context_items = []

            # Search in projects
            for keyword in keywords:
                cursor.execute("""
                    SELECT 'project', id, title, description
                    FROM projects
                    WHERE title LIKE ? OR description LIKE ?
                    LIMIT 3
                """, (f"%{keyword}%", f"%{keyword}%"))

                for row in cursor.fetchall():
                    if row not in [(i['type'], i['id'], i['title'], i['description']) for i in context_items]:
                        context_items.append({
                            "type": row[0],
                            "id": row[1],
                            "title": row[2],
                            "description": row[3]
                        })

            # Search in areas
            for keyword in keywords:
                cursor.execute("""
                    SELECT 'area', id, title, description
                    FROM areas
                    WHERE title LIKE ? OR description LIKE ?
                    LIMIT 3
                """, (f"%{keyword}%", f"%{keyword}%"))

                for row in cursor.fetchall():
                    if row not in [(i['type'], i['id'], i['title'], i['description']) for i in context_items]:
                        context_items.append({
                            "type": row[0],
                            "id": row[1],
                            "title": row[2],
                            "description": row[3]
                        })

            return context_items[:10]  # Limit to 10 items

        except sqlite3.Error as e:
            print(f"Error searching PARA: {e}")
            return []

    def generate_transition_prompt(self, meeting: Dict, context: List[Dict] = None) -> str:
        """
        Generate a transition prompt for a recently ended meeting.

        Args:
            meeting: Meeting dictionary.
            context: Optional list of related PARA context.

        Returns:
            Transition prompt message.
        """
        minutes_ago = meeting["minutes_ago"]
        title = meeting["summary"]
        description = meeting.get("description", "")

        # Build prompt
        if minutes_ago < 2:
            time_phrase = "just ended"
        elif minutes_ago < 10:
            time_phrase = f"{minutes_ago} min ago"
        else:
            time_phrase = f"{minutes_ago} min ago"

        prompt = f"📋 Meeting '{title}' {time_phrase}.\n\n"

        # Add capture prompt
        prompt += "Anything to capture? (action items, decisions, insights, follow-ups)\n\n"

        # Add PARA context if available
        if context:
            prompt += "📁 Related PARA context:\n"
            for item in context[:3]:  # Show top 3
                prompt += f"  • [{item['type']}] {item['title']}\n"

        # Add resume/pivot prompt
        prompt += "\nReady to resume previous work or pivot to something new?"

        return prompt

    def check_transitions(self, minutes_threshold: int = 15) -> List[Dict]:
        """
        Check for meeting transitions and generate prompts.

        Args:
            minutes_threshold: Threshold for "recent" in minutes.

        Returns:
            List of transition dictionaries with prompts.
        """
        self.connect()

        recently_ended = self.find_recently_ended_meetings(minutes_threshold)

        transitions = []

        for meeting in recently_ended:
            # Extract keywords from meeting title/description
            text = f"{meeting['summary']} {meeting.get('description', '')}"
            keywords = self._extract_keywords(text)

            # Find related PARA context
            context = self.get_related_para_context(keywords) if keywords else []

            # Generate prompt
            prompt = self.generate_transition_prompt(meeting, context)

            # Log to context_suggestions
            cursor = self.conn.cursor()
            cursor.execute("""
                INSERT INTO context_suggestions (suggestion, context_type, reason)
                VALUES (?, 'transition', ?)
            """, (prompt, f"Meeting: {meeting['summary']}"))

            self.conn.commit()
            suggestion_id = cursor.lastrowid

            transitions.append({
                "id": suggestion_id,
                "meeting": meeting,
                "prompt": prompt,
                "context": context,
                "timestamp": datetime.now().isoformat()
            })

        self.close()
        return transitions

    def _extract_keywords(self, text: str) -> List[str]:
        """
        Extract potential keywords from text for PARA search.

        Args:
            text: Text to extract from.

        Returns:
            List of keywords.
        """
        # Simple keyword extraction - split on common delimiters
        # Remove common words
        stop_words = {
            "the", "and", "for", "are", "but", "not", "you", "all", "can",
            "her", "was", "one", "our", "out", "with", "just", "from",
            "have", "new", "more", "about", "this", "that", "will", "your",
            "when", "what", "which", "their", "there", "been", "call",
            "meeting", "call", "sync", "check", "in", "review", "status"
        }

        words = text.lower().replace("-", " ").split()

        # Filter: 3+ chars, not stop word, not just numbers
        keywords = []
        for word in words:
            word = word.strip(".,!?:;'\"()[]{}")
            if len(word) >= 3 and word not in stop_words and not word.isdigit():
                keywords.append(word)

        return keywords[:10]  # Limit to 10 keywords

    def log_transition_outcome(self, suggestion_id: int, captured: str = "",
                               pivoted_to: str = "", resumed: bool = None) -> bool:
        """
        Log the outcome of a transition prompt.

        Args:
            suggestion_id: ID of the transition suggestion.
            captured: What was captured (action items, notes).
            pivoted_to: What was pivoted to (if anything).
            resumed: Whether work was resumed.

        Returns:
            True if successful, False otherwise.
        """
        try:
            self.connect()
            cursor = self.conn.cursor()

            reason_parts = []
            if captured:
                reason_parts.append(f"Captured: {captured}")
            if pivoted_to:
                reason_parts.append(f"Pivoted to: {pivoted_to}")
            if resumed is not None:
                reason_parts.append(f"Resumed: {resumed}")

            cursor.execute("""
                UPDATE context_suggestions
                SET accepted = 1, reason = ?
                WHERE id = ?
            """, (" | ".join(reason_parts), suggestion_id))

            self.conn.commit()
            self.close()
            return True

        except sqlite3.Error as e:
            print(f"Error logging outcome: {e}")
            return False

    def get_upcoming_transitions(self, minutes_ahead: int = 30) -> List[Dict]:
        """
        Get meetings that will end soon (pre-transition prep).

        Args:
            minutes_ahead: How many minutes ahead to look.

        Returns:
            List of soon-to-end meeting dictionaries.
        """
        try:
            cmd = [
                "gog", "calendar", "events", "primary",
                "--from", "today",
                "--to", "+2d",
                "--account", "clawdbot@puenteworks.com"
            ]
            result = subprocess.run(cmd, capture_output=True, text=True, timeout=30)

            if result.returncode != 0:
                return []

            events = json.loads(result.stdout)
            now = datetime.now()
            future = now + timedelta(minutes=minutes_ahead)

            soon_to_end = []
            for event in events.get("items", []):
                end_str = event.get("end", {}).get("dateTime", "")

                if not end_str:
                    continue

                try:
                    end = datetime.fromisoformat(end_str.replace("Z", "+00:00"))

                    # Events ending within minutes_ahead
                    if end > now and end <= future:
                        minutes_until = (end - now).total_seconds() / 60
                        soon_to_end.append({
                            "summary": event.get("summary", "No title"),
                            "end": end,
                            "minutes_until": int(minutes_until)
                        })

                except (ValueError, TypeError):
                    continue

            return sorted(soon_to_end, key=lambda x: x["end"])

        except Exception as e:
            print(f"Error fetching calendar: {e}")
            return []


if __name__ == "__main__":
    import sys

    assistant = TransitionAssistant()

    if len(sys.argv) > 1:
        command = sys.argv[1]

        if command == "check":
            print("\n=== Checking for Recent Transitions ===")
            transitions = assistant.check_transitions(minutes_threshold=15)

            if transitions:
                for t in transitions:
                    print(f"\n--- Meeting: {t['meeting']['summary']} ({t['meeting']['minutes_ago']} min ago) ---")
                    print(f"\n{t['prompt']}")
                    print(f"\n[Transition ID: {t['id']}]")
            else:
                print("\nNo recent meeting transitions")

        elif command == "upcoming":
            print("\n=== Upcoming Meeting Ends ===")
            upcoming = assistant.get_upcoming_transitions(minutes_ahead=30)

            if upcoming:
                for meeting in upcoming:
                    print(f"  • '{meeting['summary']}' ends in {meeting['minutes_until']} min")
            else:
                print("  No meetings ending soon")

        elif command == "outcome":
            if len(sys.argv) > 2:
                suggestion_id = int(sys.argv[2])
                captured = sys.argv[3] if len(sys.argv) > 3 else ""
                pivoted_to = sys.argv[4] if len(sys.argv) > 4 else ""
                resumed = sys.argv[5].lower() in ["true", "yes"] if len(sys.argv) > 5 else None

                success = assistant.log_transition_outcome(suggestion_id, captured, pivoted_to, resumed)
                print(f"\n{'✓' if success else '✗'} Outcome logged")

        else:
            print("Unknown command")
    else:
        print("Usage: python transition-assistant.py check")
        print("       python transition-assistant.py upcoming")
        print("       python transition-assistant.py outcome <id> [captured] [pivoted_to] [resumed|true|false]")

#!/usr/bin/env python3
"""
Context Engine - Core prediction logic for EF Coaching at Scale.

Analyzes calendar (via gog), time, and PARA tasks to suggest context cues.
Learns from suggestion acceptance rates.
"""

import sqlite3
import json
import subprocess
import re
from datetime import datetime, timedelta
from pathlib import Path
from typing import Dict, List, Optional, Tuple


class ContextEngine:
    """
    Predictive context engine that suggests appropriate work contexts
    based on calendar events, time patterns, and task priorities.
    """

    def __init__(self, db_path: str = None, para_db_path: str = None):
        """
        Initialize the Context Engine.

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

    def get_calendar_events(self, hours_ahead: int = 4) -> List[Dict]:
        """
        Fetch calendar events using gog CLI.

        Args:
            hours_ahead: How many hours ahead to look.

        Returns:
            List of event dictionaries with start, end, summary keys.
        """
        try:
            # Use gog CLI to get calendar events
            cmd = [
                "gog", "calendar", "events", "primary",
                "--from", "today",
                "--to", "+2d",
                "--account", "clawdbot@puenteworks.com"
            ]
            result = subprocess.run(cmd, capture_output=True, text=True, timeout=30)

            if result.returncode != 0:
                return []

            # Parse gog output (expecting JSON)
            events = json.loads(result.stdout)

            # Filter events within time window and parse dates
            now = datetime.now()
            future = now + timedelta(hours=hours_ahead)

            filtered_events = []
            for event in events.get("items", []):
                start_str = event.get("start", {}).get("dateTime", event.get("start", {}).get("dateTime", ""))
                end_str = event.get("end", {}).get("dateTime", event.get("end", {}).get("dateTime", ""))

                if not start_str:
                    continue

                try:
                    start = datetime.fromisoformat(start_str.replace("Z", "+00:00"))
                    end = datetime.fromisoformat(end_str.replace("Z", "+00:00")) if end_str else start + timedelta(hours=1)

                    if start <= future and end > now:
                        filtered_events.append({
                            "start": start,
                            "end": end,
                            "summary": event.get("summary", "No title"),
                            "description": event.get("description", "")
                        })
                except (ValueError, TypeError):
                    continue

            return sorted(filtered_events, key=lambda x: x["start"])

        except (subprocess.TimeoutExpired, json.JSONDecodeError, FileNotFoundError, Exception) as e:
            print(f"Error fetching calendar: {e}")
            return []

    def get_active_para_tasks(self, limit: int = 5) -> List[Dict]:
        """
        Fetch active tasks from PARA system.

        Args:
            limit: Maximum number of tasks to return.

        Returns:
            List of task dictionaries.
        """
        try:
            cursor = self.para_conn.cursor()
            cursor.execute("""
                SELECT id, title, project_id, status, priority
                FROM tasks
                WHERE status IN ('active', 'in_progress', 'pending')
                ORDER BY priority DESC, created_at ASC
                LIMIT ?
            """, (limit,))

            tasks = []
            for row in cursor.fetchall():
                tasks.append({
                    "id": row[0],
                    "title": row[1],
                    "project_id": row[2],
                    "status": row[3],
                    "priority": row[4]
                })

            return tasks

        except sqlite3.Error as e:
            print(f"Error querying PARA tasks: {e}")
            return []

    def get_time_block(self) -> str:
        """
        Determine current time block.

        Returns:
            'morning', 'afternoon', 'evening', or 'night'
        """
        hour = datetime.now().hour

        if 5 <= hour < 12:
            return "morning"
        elif 12 <= hour < 17:
            return "afternoon"
        elif 17 <= hour < 21:
            return "evening"
        else:
            return "night"

    def get_energy_pattern(self, time_block: str) -> float:
        """
        Get average energy level for a time block from historical data.

        Args:
            time_block: Time block to query.

        Returns:
            Average energy level (1-10).
        """
        try:
            cursor = self.conn.cursor()
            cursor.execute("""
                SELECT AVG(energy_level)
                FROM energy_log
                WHERE time_block = ?
                AND timestamp > datetime('now', '-14 days')
            """, (time_block,))

            result = cursor.fetchone()
            return float(result[0]) if result[0] else 5.0

        except sqlite3.Error:
            return 5.0

    def calculate_acceptance_rate(self, context_type: str, days_back: int = 7) -> float:
        """
        Calculate acceptance rate for a suggestion type.

        Args:
            context_type: Type of context suggestion.
            days_back: How many days to look back.

        Returns:
            Acceptance rate (0-1).
        """
        try:
            cursor = self.conn.cursor()
            cursor.execute("""
                SELECT AVG(CASE WHEN accepted = 1 THEN 1.0 ELSE 0.0 END)
                FROM context_suggestions
                WHERE context_type = ?
                AND timestamp > datetime('now', '-{} days')
            """.format(days_back), (context_type,))

            result = cursor.fetchone()
            return float(result[0]) if result[0] else 0.5

        except sqlite3.Error:
            return 0.5

    def generate_suggestion(self, context: Dict) -> Tuple[str, str, float]:
        """
        Generate a context suggestion based on current state.

        Args:
            context: Dictionary with calendar, tasks, energy, time_block info.

        Returns:
            Tuple of (suggestion_text, context_type, confidence).
        """
        calendar = context.get("calendar", [])
        tasks = context.get("tasks", [])
        energy = context.get("energy", 5.0)
        time_block = context.get("time_block", "afternoon")

        now = datetime.now()

        # Rule 1: If meeting ending soon (<15min), suggest transition prep
        for event in calendar:
            time_until_end = (event["end"] - now).total_seconds()
            if 0 < time_until_end < 900:  # Less than 15 minutes
                return (
                    f"Meeting '{event['summary']}' ending soon. Anything to capture before you pivot?",
                    "transition",
                    0.8
                )

        # Rule 2: Large time gap (>2h) with no meetings -> deep work opportunity
        if calendar:
            next_event = calendar[0]
            gap = (next_event["start"] - now).total_seconds()
            if gap > 7200:  # More than 2 hours
                high_priority_task = None
                for task in tasks:
                    if task.get("priority", 0) >= 3:
                        high_priority_task = task
                        break

                if high_priority_task and energy >= 6:
                    return (
                        f"Large time gap ({int(gap/60)}min). Good time for deep work on: {high_priority_task['title']}",
                        "deep_work",
                        0.85
                    )
                elif energy >= 6:
                    return (
                        f"Large time gap ({int(gap/60)}min). Great for deep work. What needs your focus?",
                        "deep_work",
                        0.75
                    )

        # Rule 3: Low energy + time gap -> admin or rest
        if energy < 5 and len(calendar) > 0:
            gap = (calendar[0]["start"] - now).total_seconds() / 60
            if gap > 30:
                return (
                    f"Energy's a bit low ({energy:.1f}). Good time for admin tasks or a quick break?",
                    "slack",
                    0.7
                )

        # Rule 4: Pending tasks with medium+ energy
        if tasks and energy >= 5:
            task = tasks[0]
            return (
                f"Upcoming time available. Tackle: {task['title']}?",
                "slack",
                0.65
            )

        # Rule 5: High energy in morning/afternoon -> proactive suggestion
        if energy >= 7 and time_block in ["morning", "afternoon"]:
            acceptance = self.calculate_acceptance_rate("deep_work")
            if acceptance > 0.4:
                return (
                    f"Energy's high ({energy:.1f})! Prime time for your most challenging work.",
                    "deep_work",
                    acceptance * 0.8
                )

        # Default: gentle check-in
        return (
            "How's your focus right now? Ready to dive in or need a moment?",
            "slack",
            0.4
        )

    def suggest_context(self) -> Dict:
        """
        Main entry point: Generate and log a context suggestion.

        Returns:
            Dictionary with suggestion details.
        """
        self.connect()

        # Gather context data
        calendar = self.get_calendar_events(hours_ahead=4)
        tasks = self.get_active_para_tasks(limit=5)
        time_block = self.get_time_block()
        energy = self.get_energy_pattern(time_block)

        context = {
            "calendar": calendar,
            "tasks": tasks,
            "energy": energy,
            "time_block": time_block,
            "timestamp": datetime.now().isoformat()
        }

        # Generate suggestion
        suggestion, context_type, confidence = self.generate_suggestion(context)

        # Log suggestion
        cursor = self.conn.cursor()
        cursor.execute("""
            INSERT INTO context_suggestions (suggestion, context_type, confidence)
            VALUES (?, ?, ?)
        """, (suggestion, context_type, confidence))
        self.conn.commit()

        suggestion_id = cursor.lastrowid

        self.close()

        return {
            "id": suggestion_id,
            "suggestion": suggestion,
            "context_type": context_type,
            "confidence": confidence,
            "context": context
        }

    def record_feedback(self, suggestion_id: int, accepted: bool, reason: str = "") -> bool:
        """
        Record user feedback on a suggestion.

        Args:
            suggestion_id: ID of the suggestion.
            accepted: Whether the suggestion was helpful.
            reason: Optional feedback reason.

        Returns:
            True if successful, False otherwise.
        """
        try:
            self.connect()
            cursor = self.conn.cursor()
            cursor.execute("""
                UPDATE context_suggestions
                SET accepted = ?, reason = ?
                WHERE id = ?
            """, (accepted, reason, suggestion_id))
            self.conn.commit()
            self.close()
            return True
        except sqlite3.Error as e:
            print(f"Error recording feedback: {e}")
            return False


if __name__ == "__main__":
    import sys

    engine = ContextEngine()

    if len(sys.argv) > 1 and sys.argv[1] == "suggest":
        result = engine.suggest_context()
        print(f"\n=== Context Suggestion ===")
        print(f"Type: {result['context_type']}")
        print(f"Confidence: {result['confidence']:.2f}")
        print(f"\n{result['suggestion']}")
        print(f"\nContext: {len(result['context']['calendar'])} upcoming events, {len(result['context']['tasks'])} active tasks")
        print(f"Energy level: {result['context']['energy']:.1f}/10 ({result['context']['time_block']})")

    elif len(sys.argv) > 2 and sys.argv[1] == "feedback":
        suggestion_id = int(sys.argv[2])
        accepted = sys.argv[3].lower() in ["true", "1", "yes", "y"]
        reason = sys.argv[4] if len(sys.argv) > 4 else ""
        success = engine.record_feedback(suggestion_id, accepted, reason)
        print("Feedback recorded successfully" if success else "Failed to record feedback")

    else:
        print("Usage: python context-engine.py suggest")
        print("       python context-engine.py feedback <id> <true|false> [reason]")
        print("\nExamples:")
        print("  python context-engine.py suggest")
        print("  python context-engine.py feedback 42 true 'Helpful!'")
        print("  python context-engine.py feedback 42 false 'Not now'")

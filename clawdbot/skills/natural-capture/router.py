#!/usr/bin/env python3
"""Natural Capture Router - Route captures to appropriate storage.

This module routes parsed captures to their destinations:
- Ideas -> ~/clawd/memory/ideas.md
- Todos/Tasks -> PARA sqlite (tasks table)
- Notes -> Daily memory files (~/clawd/memory/YYYY-MM-DD.md)
- Reminders -> Calendar or PARA tasks
- Bookmarks -> ~/clawd/memory/ideas.md or dedicated file
- Quotes -> ~/clawd/memory/ideas.md
"""

import os
import sqlite3
from dataclasses import dataclass
from datetime import datetime
from typing import Optional

from parser import Capture, CaptureType


@dataclass
class RouteResult:
    """Result of routing a capture.

    Attributes:
        success: Whether the routing succeeded
        destination: Where the capture was routed to
        error: Error message if unsuccessful
    """

    success: bool
    destination: str
    error: Optional[str] = None


class CaptureRouter:
    """Router for Natural Capture destinations."""

    def __init__(
        self,
        workspace: str = "/home/liam/clawd",
        memory_dir: str = "memory",
        ideas_file: str = "ideas.md",
        para_db: str = "memory/para.sqlite",
    ):
        """Initialize the router.

        Args:
            workspace: Path to workspace directory
            memory_dir: Name of memory subdirectory
            ideas_file: Name of ideas file
            para_db: Path to PARA sqlite database (relative to workspace)
        """
        self.workspace = workspace
        self.memory_dir = os.path.join(workspace, memory_dir)
        self.ideas_file = os.path.join(self.memory_dir, ideas_file)
        self.para_db = os.path.join(workspace, para_db)

    def route(self, capture: Capture) -> RouteResult:
        """Route a capture to its appropriate destination.

        Args:
            capture: The parsed capture to route

        Returns:
            RouteResult with success status and destination
        """
        capture_type = capture.capture_type

        if capture_type == CaptureType.IDEA:
            return self._route_idea(capture)
        elif capture_type in (CaptureType.TODO, CaptureType.TASK):
            return self._route_task(capture)
        elif capture_type == CaptureType.NOTE:
            return self._route_note(capture)
        elif capture_type == CaptureType.REMINDER:
            return self._route_reminder(capture)
        elif capture_type == CaptureType.BOOKMARK:
            return self._route_bookmark(capture)
        elif capture_type == CaptureType.QUOTE:
            return self._route_quote(capture)
        elif capture_type == CaptureType.BRAIN_DUMP:
            return self._route_brain_dump(capture)
        else:
            return RouteResult(
                success=False,
                destination="none",
                error=f"Unknown capture type: {capture_type.value}",
            )

    def _route_idea(self, capture: Capture) -> RouteResult:
        """Route an idea to ideas.md.

        Args:
            capture: The idea capture to route

        Returns:
            RouteResult with success status
        """
        try:
            # Ensure ideas.md exists
            if not os.path.exists(self.ideas_file):
                self._create_ideas_file()

            # Format the idea entry
            today = datetime.now().strftime("%Y-%m-%d")
            idea_entry = self._format_idea(capture, today)

            # Append to ideas.md
            with open(self.ideas_file, "a") as f:
                f.write(idea_entry)

            return RouteResult(
                success=True,
                destination=self.ideas_file,
            )
        except Exception as e:
            return RouteResult(
                success=False,
                destination=self.ideas_file,
                error=str(e),
            )

    def _create_ideas_file(self):
        """Create ideas.md with header if it doesn't exist."""
        os.makedirs(os.path.dirname(self.ideas_file), exist_ok=True)
        with open(self.ideas_file, "w") as f:
            f.write("# Ideas & Things to Explore\n\n")
            f.write("> Capture interesting things to revisit, analyze, or build.\n\n")
            f.write("---\n\n")

    def _format_idea(self, capture: Capture, date: str) -> str:
        """Format an idea for ideas.md.

        Args:
            capture: The idea capture
            date: Date string (YYYY-MM-DD)

        Returns:
            Formatted idea entry
        """
        title = capture.content[:100] + "..." if len(capture.content) > 100 else capture.content
        entry = f"\n## {date}\n\n"
        entry += f"### {title}\n"
        entry += f"**Captured:** {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n"
        if capture.source != "unknown":
            entry += f"**Source:** {capture.source}\n"
        if capture.project:
            entry += f"**Project:** {capture.project}\n"
        entry += "\n**Content:**\n\n"
        entry += f"{capture.content}\n\n"
        entry += "---\n"
        return entry

    def _route_task(self, capture: Capture) -> RouteResult:
        """Route a task/todo to PARA sqlite.

        Args:
            capture: The task capture to route

        Returns:
            RouteResult with success status
        """
        try:
            # Extract due date if present
            due_timestamp = None
            if capture.due_date:
                due_datetime = datetime.fromisoformat(capture.due_date)
                due_timestamp = int(due_datetime.timestamp())

            # Connect to PARA database
            conn = sqlite3.connect(self.para_db)
            cursor = conn.cursor()

            # Insert task
            cursor.execute(
                """
                INSERT INTO tasks (title, description, category, status, due_date)
                VALUES (?, ?, ?, ?, ?)
                """,
                (
                    capture.content[:100],  # Title (truncated if too long)
                    capture.content,  # Full content as description
                    "task",  # Category
                    "pending",  # Default status
                    due_timestamp,
                ),
            )

            conn.commit()
            conn.close()

            return RouteResult(
                success=True,
                destination=self.para_db,
            )
        except Exception as e:
            return RouteResult(
                success=False,
                destination=self.para_db,
                error=str(e),
            )

    def _route_note(self, capture: Capture) -> RouteResult:
        """Route a note to daily memory file.

        Args:
            capture: The note capture to route

        Returns:
            RouteResult with success status
        """
        try:
            # Get today's date for filename
            today = datetime.now().strftime("%Y-%m-%d")
            note_file = os.path.join(self.memory_dir, f"{today}.md")

            # Ensure file exists
            if not os.path.exists(note_file):
                self._create_daily_note(note_file, today)

            # Format the note entry
            note_entry = self._format_note(capture)

            # Append to daily note
            with open(note_file, "a") as f:
                f.write(note_entry)

            return RouteResult(
                success=True,
                destination=note_file,
            )
        except Exception as e:
            return RouteResult(
                success=False,
                destination=note_file if 'note_file' in locals() else "unknown",
                error=str(e),
            )

    def _create_daily_note(self, filepath: str, date: str):
        """Create a daily note file with header.

        Args:
            filepath: Path to create the file
            date: Date string (YYYY-MM-DD)
        """
        os.makedirs(os.path.dirname(filepath), exist_ok=True)
        with open(filepath, "w") as f:
            f.write(f"# Daily Notes - {date}\n\n")
            f.write("---\n\n")

    def _format_note(self, capture: Capture) -> str:
        """Format a note for daily memory.

        Args:
            capture: The note capture

        Returns:
            Formatted note entry
        """
        timestamp = datetime.now().strftime("%H:%M")
        entry = f"\n## {timestamp} - Note\n\n"
        if capture.source != "unknown":
            entry += f"**Source:** {capture.source}\n\n"
        entry += f"{capture.content}\n\n"
        return entry

    def _route_reminder(self, capture: Capture) -> RouteResult:
        """Route a reminder to PARA tasks.

        Args:
            capture: The reminder capture to route

        Returns:
            RouteResult with success status
        """
        # For now, route reminders as tasks with "reminder" category
        # Could be enhanced to create calendar events in the future
        try:
            conn = sqlite3.connect(self.para_db)
            cursor = conn.cursor()

            # Extract due date if present
            due_timestamp = None
            if capture.due_date:
                due_datetime = datetime.fromisoformat(capture.due_date)
                due_timestamp = int(due_datetime.timestamp())

            cursor.execute(
                """
                INSERT INTO tasks (title, description, category, status, due_date)
                VALUES (?, ?, ?, ?, ?)
                """,
                (
                    capture.content[:100],
                    capture.content,
                    "reminder",
                    "pending",
                    due_timestamp,
                ),
            )

            conn.commit()
            conn.close()

            return RouteResult(
                success=True,
                destination=self.para_db,
            )
        except Exception as e:
            return RouteResult(
                success=False,
                destination=self.para_db,
                error=str(e),
            )

    def _route_bookmark(self, capture: Capture) -> RouteResult:
        """Route a bookmark to ideas.md.

        Args:
            capture: The bookmark capture to route

        Returns:
            RouteResult with success status
        """
        # For now, route bookmarks to ideas.md with special formatting
        try:
            if not os.path.exists(self.ideas_file):
                self._create_ideas_file()

            today = datetime.now().strftime("%Y-%m-%d")
            bookmark_entry = self._format_bookmark(capture, today)

            with open(self.ideas_file, "a") as f:
                f.write(bookmark_entry)

            return RouteResult(
                success=True,
                destination=self.ideas_file,
            )
        except Exception as e:
            return RouteResult(
                success=False,
                destination=self.ideas_file,
                error=str(e),
            )

    def _format_bookmark(self, capture: Capture, date: str) -> str:
        """Format a bookmark for ideas.md.

        Args:
            capture: The bookmark capture
            date: Date string (YYYY-MM-DD)

        Returns:
            Formatted bookmark entry
        """
        # Extract URL from content
        url = capture.content.strip()
        title = url[:80] + "..." if len(url) > 80 else url

        entry = f"\n## {date} - Bookmark\n\n"
        entry += f"### {title}\n"
        entry += f"**Link:** {url}\n"
        entry += f"**Captured:** {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n"
        if capture.source != "unknown":
            entry += f"**Source:** {capture.source}\n"
        entry += "\n---\n"
        return entry

    def _route_quote(self, capture: Capture) -> RouteResult:
        """Route a quote to ideas.md.

        Args:
            capture: The quote capture to route

        Returns:
            RouteResult with success status
        """
        try:
            if not os.path.exists(self.ideas_file):
                self._create_ideas_file()

            today = datetime.now().strftime("%Y-%m-%d")
            quote_entry = self._format_quote(capture, today)

            with open(self.ideas_file, "a") as f:
                f.write(quote_entry)

            return RouteResult(
                success=True,
                destination=self.ideas_file,
            )
        except Exception as e:
            return RouteResult(
                success=False,
                destination=self.ideas_file,
                error=str(e),
            )

    def _format_quote(self, capture: Capture, date: str) -> str:
        """Format a quote for ideas.md.

        Args:
            capture: The quote capture
            date: Date string (YYYY-MM-DD)

        Returns:
            Formatted quote entry
        """
        title = capture.content[:80] + "..." if len(capture.content) > 80 else capture.content
        entry = f"\n## {date} - Quote\n\n"
        entry += f"### {title}\n"
        entry += f"**Quote:** {capture.content}\n"
        entry += f"**Captured:** {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n"
        if capture.source != "unknown":
            entry += f"**Source:** {capture.source}\n"
        entry += "\n---\n"
        return entry

    def _route_brain_dump(self, capture: Capture) -> RouteResult:
        """Route a brain dump to daily memory with special formatting.

        Args:
            capture: The brain dump capture to route

        Returns:
            RouteResult with success status
        """
        try:
            today = datetime.now().strftime("%Y-%m-%d")
            note_file = os.path.join(self.memory_dir, f"{today}.md")

            if not os.path.exists(note_file):
                self._create_daily_note(note_file, today)

            brain_dump_entry = self._format_brain_dump(capture)

            with open(note_file, "a") as f:
                f.write(brain_dump_entry)

            return RouteResult(
                success=True,
                destination=note_file,
            )
        except Exception as e:
            return RouteResult(
                success=False,
                destination=note_file if 'note_file' in locals() else "unknown",
                error=str(e),
            )

    def _format_brain_dump(self, capture: Capture) -> str:
        """Format a brain dump for daily memory.

        Args:
            capture: The brain dump capture

        Returns:
            Formatted brain dump entry
        """
        timestamp = datetime.now().strftime("%H:%M")
        entry = f"\n## {timestamp} - Brain Dump\n\n"
        if capture.source != "unknown":
            entry += f"**Source:** {capture.source}\n\n"
        entry += f"{capture.content}\n\n"
        return entry


def route_capture(capture: Capture) -> RouteResult:
    """Convenience function to route a capture.

    Args:
        capture: The parsed capture to route

    Returns:
        RouteResult with success status and destination
    """
    router = CaptureRouter()
    return router.route(capture)


if __name__ == "__main__":
    # Test the router
    from parser import parse_capture

    test_messages = [
        ("idea: what if we added dark mode to the app", "test"),
        ("remind me to call John tomorrow", "test"),
        ("note: Edison uses SAP for payroll", "test"),
        ("bookmark: https://example.com/article", "test"),
        ('"The only way to do great work is to love what you do"', "test"),
        ("todo: prepare the quarterly report", "test"),
    ]

    router = CaptureRouter()

    for msg, source in test_messages:
        capture = parse_capture(msg, source)
        result = router.route(capture)

        print(f"Message: {msg!r}")
        print(f"  Type: {capture.capture_type.value}")
        print(f"  Route: {result.destination}")
        print(f"  Success: {result.success}")
        if result.error:
            print(f"  Error: {result.error}")
        print()

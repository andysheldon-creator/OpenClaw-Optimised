#!/usr/bin/env python3
"""Natural Capture Parser - Extract capture intent from natural language.

This module parses incoming messages (Telegram, email) to detect:
- Capture type (idea, todo, note, reminder, bookmark, quote, task)
- Content to capture
- Optional metadata (project tags, due dates, etc.)
"""

import re
from dataclasses import dataclass
from datetime import datetime
from enum import Enum
from typing import Optional


class CaptureType(Enum):
    """Capture types recognized by Natural Capture."""

    IDEA = "idea"
    TODO = "todo"
    NOTE = "note"
    REMINDER = "reminder"
    BOOKMARK = "bookmark"
    QUOTE = "quote"
    TASK = "task"
    BRAIN_DUMP = "brain_dump"
    UNKNOWN = "unknown"


@dataclass
class Capture:
    """Parsed capture from natural language.

    Attributes:
        capture_type: The type of capture
        content: The main content to capture
        prefix: The prefix that triggered capture (e.g., "idea:")
        project: Optional project tag [Project: name]
        due_date: Optional due date extracted from content
        source: Source of the capture (telegram, email, etc.)
    """

    capture_type: CaptureType
    content: str
    prefix: str = ""
    project: Optional[str] = None
    due_date: Optional[str] = None
    source: str = "unknown"


class CaptureParser:
    """Parser for natural language captures.

    Recognizes various patterns without requiring special commands.
    """

    # Prefix patterns (case-insensitive)
    PREFIX_PATTERNS = {
        CaptureType.IDEA: [
            r"idea\s*:",
            r"thought\s*:",
            r"brainstorm\s*:",
            r"ideas?",
        ],
        CaptureType.TODO: [
            r"todo\s*:",
            r"task\s*:",
            r"to[- ]?do\s*:",
        ],
        CaptureType.NOTE: [
            r"note\s*:",
            r"notes?",
            r"note\s+to\s+self\s*:",
            r"capture\s*this\s*:",
            r"remember\s+that\s*:",
        ],
        CaptureType.REMINDER: [
            r"remind\s+me\s+to\s+",
            r"reminder\s*:",
            r"don't\s+let\s+me\s+forget\s*",
        ],
        CaptureType.BOOKMARK: [
            r"bookmark\s*:",
            r"link\s*:",
            r"save\s+link\s*:",
        ],
        CaptureType.QUOTE: [
            r"quote\s*:",
            r"quotation\s*:",
            r'"',
        ],
        CaptureType.BRAIN_DUMP: [
            r"brain\s*dump\s*:",
            r"let\s+me\s+just\s+get\s+this\s+out",
            r"braindump\s*:",
        ],
    }

    # Phrase patterns (full phrases, not prefixes)
    PHRASE_PATTERNS = {
        CaptureType.TODO: [
            r"i\s+need\s+to\s+",
            r"need\s+to\s+",
            r"add\s+to\s+my\s+list",
        ],
        CaptureType.IDEA: [
            r"what\s+if\s+",
            r"i\s+just\s+realized",
        ],
        CaptureType.NOTE: [
            r"for\s+the\s+record",
        ],
    }

    # URL pattern for bookmark detection
    URL_PATTERN = re.compile(
        r"https?://[^\s]+"
    )

    # Project tag pattern
    PROJECT_TAG_PATTERN = re.compile(
        r"\[Project:\s*([^\]]+)\]", re.IGNORECASE
    )

    # Due date patterns (basic)
    DUE_DATE_PATTERNS = None  # Set in __init__

    @staticmethod
    def _parse_relative_date(days: int) -> str:
        """Parse relative date to YYYY-MM-DD format."""
        date = datetime.now().date()
        if days > 0:
            from datetime import timedelta
            date = date + timedelta(days=days)
        return date.isoformat()

    @staticmethod
    def _parse_relative_date(days: int) -> str:
        """Parse relative date to YYYY-MM-DD format."""
        date = datetime.now().date()
        if days > 0:
            from datetime import timedelta
            date = date + timedelta(days=days)
        return date.isoformat()

    def __init__(self):
        """Initialize parser with compiled patterns."""
        self._compiled_prefixes = {}
        self._compiled_phrases = {}

        for capture_type, patterns in self.PREFIX_PATTERNS.items():
            self._compiled_prefixes[capture_type] = [
                re.compile(pattern, re.IGNORECASE) for pattern in patterns
            ]

        for capture_type, patterns in self.PHRASE_PATTERNS.items():
            self._compiled_phrases[capture_type] = [
                re.compile(pattern, re.IGNORECASE) for pattern in patterns
            ]

        # Initialize due date patterns with static method references
        self.DUE_DATE_PATTERNS = [
            (r"tomorrow", lambda: CaptureParser._parse_relative_date(1)),
            (r"today", lambda: CaptureParser._parse_relative_date(0)),
            (r"next\s+week", lambda: CaptureParser._parse_relative_date(7)),
        ]

    def parse(self, message: str, source: str = "unknown") -> Capture:
        """Parse a message to extract capture information.

        Args:
            message: The incoming message text
            source: Source of the message (telegram, email, etc.)

        Returns:
            Capture object with parsed information
        """
        message = message.strip()

        # Check prefix patterns first
        for capture_type, patterns in self._compiled_prefixes.items():
            for pattern in patterns:
                match = pattern.search(message)
                if match:
                    prefix = match.group(0)
                    content = message[match.end():].strip()
                    return Capture(
                        capture_type=capture_type,
                        content=content or message[len(prefix):].strip(),
                        prefix=prefix,
                        source=source,
                    )

        # Check phrase patterns
        for capture_type, patterns in self._compiled_phrases.items():
            for pattern in patterns:
                match = pattern.search(message)
                if match:
                    content = message[match.start():].strip()
                    return Capture(
                        capture_type=capture_type,
                        content=content,
                        prefix="",
                        source=source,
                    )

        # Check for URL -> bookmark
        if self.URL_PATTERN.search(message):
            return Capture(
                capture_type=CaptureType.BOOKMARK,
                content=message,
                source=source,
            )

        # Check for quote (starts with quote mark)
        if message.startswith('"') or message.startswith("'"):
            return Capture(
                capture_type=CaptureType.QUOTE,
                content=message.strip('"\''),
                source=source,
            )

        # Default to note if nothing matches
        return Capture(
            capture_type=CaptureType.NOTE,
            content=message,
            source=source,
        )

    def extract_project_tag(self, content: str) -> Optional[str]:
        """Extract project tag from content.

        Args:
            content: Content to search for project tag

        Returns:
            Project name if found, None otherwise
        """
        match = self.PROJECT_TAG_PATTERN.search(content)
        if match:
            return match.group(1).strip()
        return None

    def extract_due_date(self, content: str) -> Optional[str]:
        """Extract due date from content.

        Args:
            content: Content to search for due date

        Returns:
            Due date in YYYY-MM-DD format if found, None otherwise
        """
        for pattern, parser in self.DUE_DATE_PATTERNS:
            if re.search(pattern, content, re.IGNORECASE):
                return parser()
        return None


def parse_capture(message: str, source: str = "unknown") -> Capture:
    """Convenience function to parse a capture.

    Args:
        message: The incoming message text
        source: Source of the message (telegram, email, etc.)

    Returns:
        Capture object with parsed information
    """
    parser = CaptureParser()
    capture = parser.parse(message, source)

    # Extract project tag and due date
    capture.project = parser.extract_project_tag(capture.content)
    capture.due_date = parser.extract_due_date(capture.content)

    return capture


if __name__ == "__main__":
    # Test the parser
    test_messages = [
        "idea: what if we added dark mode to the app",
        "remind me to call John tomorrow",
        "note: Edison uses SAP for payroll",
        "bookmark: https://example.com/article",
        '"The only way to do great work is to love what you do" - Steve Jobs',
        "i need to finish the quarterly report",
        "brain dump: I need to do X, Y, and Z",
        "todo: [Project: Edison] prepare presentation",
    ]

    parser = CaptureParser()
    for msg in test_messages:
        capture = parser.parse(msg, "test")
        print(f"{msg!r}")
        print(f"  Type: {capture.capture_type.value}")
        print(f"  Content: {capture.content!r}")
        print(f"  Prefix: {capture.prefix!r}")
        print()

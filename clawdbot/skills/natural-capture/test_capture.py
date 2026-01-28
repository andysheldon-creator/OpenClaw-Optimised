#!/usr/bin/env python3
"""Test script for Natural Capture skill.

This script tests various capture types and verifies routing.
"""

from parser import parse_capture, CaptureType
from router import route_capture


def test_capture(message: str, source: str = "test"):
    """Test a single capture.

    Args:
        message: The message to test
        source: Source of the message
    """
    print(f"\n{'=' * 60}")
    print(f"Message: {message!r}")
    print(f"{'=' * 60}")

    # Parse
    capture = parse_capture(message, source)
    print(f"Type: {capture.capture_type.value}")
    print(f"Content: {capture.content!r}")
    print(f"Prefix: {capture.prefix!r}")
    if capture.project:
        print(f"Project: {capture.project}")
    if capture.due_date:
        print(f"Due date: {capture.due_date}")

    # Route
    result = route_capture(capture)
    print(f"Routed to: {result.destination}")
    print(f"Success: {result.success}")
    if result.error:
        print(f"Error: {result.error}")


def main():
    """Run all tests."""
    print("Testing Natural Capture Skill")
    print("=" * 60)

    # Test various capture types
    tests = [
        # Ideas
        "idea: what if we added dark mode to the app",
        "idea integrate natural capture with EF Coach",
        "thought: maybe we should simplify the onboarding flow",
        "brainstorm: new features for the ceramics inventory",

        # Todos/Tasks
        "todo: prepare the quarterly report",
        "task: review code changes",
        "i need to finish the Edison presentation",
        "need to call mom tonight",

        # Notes
        "note: Edison uses SAP for payroll",
        "remember that the meeting is at 3pm",
        "note to self: check the server logs tomorrow",
        "for the record, the client prefers the blue theme",

        # Reminders
        "remind me to call John tomorrow",
        "reminder: renew the domain next week",
        "don't let me forget to send the invoice",

        # Bookmarks
        "bookmark: https://example.com/article",
        "save this link: https://github.com/user/repo",

        # Quotes
        '"The only way to do great work is to love what you do"',
        "quote: simplicity is the ultimate sophistication - da Vinci",

        # Brain dumps
        "brain dump: I need to do X, Y, and Z, plus check email",
        "let me just get this out: I'm feeling overwhelmed about the project",

        # With project tags
        "todo: [Project: Edison] prepare presentation",
        "idea: [Project: Ceramics] implement barcode scanning",
        "note: [Project: Clawdbot] fix the memory leak",

        # With due dates
        "remind me to call John tomorrow",
        "todo: submit the report today",
        "reminder: review the proposal next week",
    ]

    for test in tests:
        test_capture(test)

    print("\n" + "=" * 60)
    print("All tests completed!")
    print("=" * 60)


if __name__ == "__main__":
    main()

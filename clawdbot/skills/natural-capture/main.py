#!/usr/bin/env python3
"""Natural Capture - Main entry point for the skill.

This module provides the main interface for Natural Capture,
handling both Telegram and email messages.
"""

import sys
from parser import parse_capture, Capture
from router import route_capture, RouteResult


def capture_message(
    message: str, source: str = "unknown", verbose: bool = False
) -> tuple[Capture, RouteResult]:
    """Parse and route a capture message.

    Args:
        message: The incoming message text
        source: Source of the message (telegram, email, etc.)
        verbose: Print verbose output

    Returns:
        Tuple of (Capture, RouteResult)
    """
    # Parse the message
    capture = parse_capture(message, source)

    if verbose:
        print(f"Parsed capture:")
        print(f"  Type: {capture.capture_type.value}")
        print(f"  Content: {capture.content}")
        print(f"  Prefix: {capture.prefix}")
        print(f"  Project: {capture.project}")
        print(f"  Due date: {capture.due_date}")

    # Route the capture
    result = route_capture(capture)

    if verbose:
        print(f"\nRouted to: {result.destination}")
        print(f"Success: {result.success}")
        if result.error:
            print(f"Error: {result.error}")

    return capture, result


def format_response(capture: Capture, result: RouteResult) -> str:
    """Format a response message for the user.

    Args:
        capture: The parsed capture
        result: The routing result

    Returns:
        Formatted response message
    """
    if not result.success:
        return f"Sorry, couldn't capture that: {result.error}"

    capture_type = capture.capture_type.value

    # Different responses based on capture type
    responses = {
        "idea": "Got it. Added to ideas.",
        "todo": "Got it. Added task.",
        "note": "Noted.",
        "reminder": "Got it. Set reminder.",
        "bookmark": "Saved the link.",
        "quote": "Captured the quote.",
        "brain_dump": "Got it all.",
    }

    base_response = responses.get(capture_type, "Got it.")

    # Add project context if applicable
    if capture.project:
        base_response += f" Project: {capture.project}"

    # Add due date context if applicable
    if capture.due_date:
        base_response += f" Due: {capture.due_date}"

    return base_response


def process_and_respond(
    message: str, source: str = "unknown", verbose: bool = False
) -> str:
    """Process a capture and return a response message.

    Args:
        message: The incoming message text
        source: Source of the message
        verbose: Print verbose output

    Returns:
        Response message for the user
    """
    capture, result = capture_message(message, source, verbose)
    return format_response(capture, result)


def main():
    """Main entry point for command-line usage."""
    import argparse

    parser = argparse.ArgumentParser(
        description="Natural Capture - Parse and route captures from natural language"
    )
    parser.add_argument(
        "message",
        help="The message to capture",
    )
    parser.add_argument(
        "--source",
        default="cli",
        help="Source of the message (default: cli)",
    )
    parser.add_argument(
        "-v", "--verbose",
        action="store_true",
        help="Print verbose output",
    )

    args = parser.parse_args()

    # Process the message
    response = process_and_respond(args.message, args.source, args.verbose)

    # Print response
    print(response)

    # Exit with appropriate code
    sys.exit(0)


if __name__ == "__main__":
    main()

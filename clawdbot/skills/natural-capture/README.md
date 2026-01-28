# Natural Capture Skill

Low-friction thought capture via natural language for NeuroSecond methodology.

## Overview

Natural Capture enables <2 second capture by recognizing **intent from natural language** instead of requiring special commands. Just talk naturally to Liam and he'll parse and route your thoughts.

## Quick Start

### Python Usage
```python
from main import process_and_respond

response = process_and_respond(
    "idea: what if we added dark mode to the app",
    source="telegram"
)
print(response)  # "Got it. Added to ideas."
```

### CLI Usage
```bash
cd ~/clawdbot/skills/natural-capture

# Capture an idea
python3 main.py "idea: integrate with EF Coach" --source telegram

# Capture a task with verbose output
python3 main.py "todo: review code changes" --source email --verbose
```

### Run Tests
```bash
cd ~/clawdbot/skills/natural-capture
python3 test_capture.py
```

## Capture Types

| Type | Triggers | Destination |
|------|----------|-------------|
| **Idea** | `idea:`, `thought:`, `brainstorm:`, "what if..." | `~/clawd/memory/ideas.md` |
| **Todo/Task** | `todo:`, `task:`, "i need to...", "need to..." | PARA sqlite (tasks table) |
| **Note** | `note:`, "remember...", "note to self:", "for the record..." | Daily memory (`YYYY-MM-DD.md`) |
| **Reminder** | `remind me to...`, `reminder:`, "don't let me forget..." | PARA sqlite (category: reminder) |
| **Bookmark** | `bookmark:`, `link:`, URLs in message | `~/clawd/memory/ideas.md` |
| **Quote** | `quote:`, messages starting with quotes | `~/clawd/memory/ideas.md` |
| **Brain Dump** | `brain dump:`, "let me just get this out..." | Daily memory with special formatting |

## Examples

**User:** "remind me to send the invoice tomorrow"
**Liam:** "Got it. Set reminder. Due: [date]"

**User:** "idea: what if we added dark mode"
**Liam:** "Got it. Added to ideas."

**User:** "todo: [Project: Edison] prepare presentation"
**Liam:** "Got it. Added task. Project: Edison"

**User:** "note to self: Edison uses SAP"
**Liam:** "Noted."

**User:** "brain dump: I need to finish X, Y, and Z"
**Liam:** "Got it all."

## Features

### Pattern Variations
The parser handles many variations:
- Case-insensitive: `idea:`, `IDEA:`, `Idea:`
- No colon: `idea`, `thought`, `brainstorm`
- Phrases: "i need to...", "what if...", "for the record..."

### Project Tagging
Use project tags to link captures to PARA projects:
```
todo: [Project: Edison] prepare presentation
idea: [Project: Ceramics] implement barcode scanning
```

### Due Dates
Automatic due date extraction:
```
remind me to call John tomorrow  → Due tomorrow
todo: submit the report today     → Due today
reminder: review proposal next week → Due next week
```

## Architecture

```
natural-capture/
├── parser.py      # Pattern matching and intent recognition
├── router.py      # Route captures to storage destinations
├── main.py        # Main entry point and CLI interface
├── test_capture.py # Test suite
├── SKILL.md       # Skill documentation (for Clawdbot)
└── README.md      # This file
```

## Storage Destinations

| Capture Type | File/Table | Location |
|--------------|-----------|----------|
| Ideas | `ideas.md` | `~/clawd/memory/ideas.md` |
| Todos/Tasks | `tasks` table | `~/clawd/memory/para.sqlite` |
| Notes | `YYYY-MM-DD.md` | `~/clawd/memory/` |
| Reminders | `tasks` table (category: reminder) | `~/clawd/memory/para.sqlite` |
| Bookmarks | `ideas.md` | `~/clawd/memory/ideas.md` |
| Quotes | `ideas.md` | `~/clawd/memory/ideas.md` |
| Brain Dumps | `YYYY-MM-DD.md` | `~/clawd/memory/` |

## Integration with Clawdbot

### Telegram Integration
```python
# In your Telegram message handler
from main import process_and_respond

async def handle_message(message):
    response = process_and_respond(
        message.text,
        source="telegram"
    )
    await message.reply(response)
```

### Email Integration
```python
# In your email handler
from main import process_and_respond

def handle_email(email_subject, email_body, sender):
    # Parse subject or body based on content
    content = email_body if email_body else email_subject
    response = process_and_respond(
        content,
        source=f"email:{sender}"
    )
    return response
```

## Quality Gates

- ✅ All Python code passes syntax validation
- ✅ Pattern matching handles variations (idea:, IDEA:, idea, "idea")
- ✅ Routing verified (ideas.md, PARA tasks, daily memory)
- ✅ No capture is lost (all tested)
- ✅ Project tags extracted correctly
- ✅ Due dates parsed and stored

## License

Part of the Clawdbot ecosystem.

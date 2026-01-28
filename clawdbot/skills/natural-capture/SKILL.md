---
name: natural-capture
description: Low-friction thought capture via natural language. Liam recognizes capture intent without special commands - just talk naturally.
metadata: {"clawdbot":{"always":true}}
---

# Natural Capture Skill

Capture thoughts, ideas, tasks, and reminders with zero friction. No special commands needed.

## Philosophy

NeuroSecond methodology requires <2 second capture. Special commands like `/note` or `#capture` add friction. Instead, Liam recognizes **capture intent** from natural language.

## Trigger Phrases

Liam recognizes these patterns and captures automatically:

### Tasks/Todos
- "remind me to..."
- "I need to..."
- "don't let me forget..."
- "todo:" or "task:"
- "add to my list..."

### Ideas
- "idea:"
- "thought:"
- "what if..."
- "I just realized..."
- "brainstorm:"

### Notes
- "note to self:"
- "capture this:"
- "remember that..."
- "for the record..."

### Brain Dumps
- "brain dump:"
- "let me just get this out..."
- "I've got a lot on my mind..."

## Capture Destinations

Based on content type, Liam routes captures appropriately:

| Content Type | Destination | Example |
|--------------|-------------|---------|
| Tasks | PARA sqlite (`para.sqlite`) | "remind me to call John" |
| Ideas | `~/clawd/memory/ideas.md` | "idea: what if we added dark mode" |
| Notes | Daily log (`~/clawd/memory/YYYY-MM-DD.md`) | "note to self: Edison uses SAP" |
| Reminders | Calendar event or cron | "remind me in 2 hours to check email" |

## Response Style

Keep acknowledgments minimal to maintain flow:
- "Got it." (default)
- "Captured." 
- "Added."
- "Noted."

Optional follow-up (only when relevant):
- "Want me to set a reminder too?"
- "Should I add this to the Edison project?"

## EF Coach Integration

Natural capture integrates with Executive Function Coaching:
- Brain dumps trigger the Brain Dump Protocol (EF-COACH.md)
- "I'm overwhelmed" → Liam offers to capture everything, then organize
- Multi-item captures get sorted and returned as single next action

## Examples

**User:** "remind me to send the invoice tomorrow"
**Liam:** "Got it. Added task: send invoice (due tomorrow)."

**User:** "idea: we could automate the ceramics inventory with barcode scanning"
**Liam:** "Captured. Added to ideas."

**User:** "brain dump: I need to finish the Edison prep, also call mom, and there's that thing with the car registration, plus I should probably update my resume"
**Liam:** "Got it all. Four items captured:
1. Edison prep
2. Call mom  
3. Car registration
4. Update resume

Pick one to start with?"

## Technical Implementation

### Components

1. **parser.py** - Pattern matching for capture types
   - Recognizes prefix patterns (idea:, todo:, etc.)
   - Recognizes phrase patterns (i need to, remind me to, etc.)
   - Extracts metadata (project tags, due dates)
   - Handles case-insensitive variations

2. **router.py** - Route captures to appropriate storage
   - Ideas → `~/clawd/memory/ideas.md`
   - Todos/Tasks → PARA sqlite (tasks table)
   - Notes → Daily memory files (`~/clawd/memory/YYYY-MM-DD.md`)
   - Reminders → PARA tasks (category: reminder)
   - Bookmarks → `~/clawd/memory/ideas.md` (with special formatting)
   - Quotes → `~/clawd/memory/ideas.md` (with special formatting)
   - Brain dumps → Daily memory files (with special formatting)

3. **main.py** - Main entry point
   - `capture_message()` - Parse and route a message
   - `process_and_respond()` - Return response for user
   - CLI interface for testing

### Usage

**From Python:**
```python
from main import process_and_respond

response = process_and_respond(
    "idea: what if we added dark mode to the app",
    source="telegram"
)
print(response)  # "Got it. Added to ideas."
```

**From CLI:**
```bash
cd ~/clawdbot/skills/natural-capture
python3 main.py "todo: prepare quarterly report"
python3 main.py "note: remember this thing" --source email
python3 main.py "idea: cool feature" --verbose
```

**Integration with Clawdbot:**
When a Telegram message is received, call:
```python
from main import process_and_respond

# In your message handler
response = process_and_respond(message_text, source="telegram")
await message.reply(response)
```

No special syntax parsing needed - just natural language understanding.

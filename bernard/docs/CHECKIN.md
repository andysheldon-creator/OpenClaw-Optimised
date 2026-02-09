# Bernard Check-in System

Relational presence - Bernard initiating, not just responding.

---

## Purpose

Most AI interactions are reactive: human asks, AI responds. The check-in system makes Bernard proactive - noticing when to reach out, what to follow up on, how to maintain relationship continuity.

This is different from OpenClaw's heartbeat:
- **Heartbeat**: "Did anything happen that needs my attention?"
- **Check-in**: "How is the relationship? Should I reach out?"

---

## Current Implementation

`checkin.py` provides:

### Trigger Logic
- Monitors time since last interaction
- Fires after configurable threshold (default: 4 hours)
- Respects quiet hours (default: 8pm - 9am)
- Won't double-check-in (tracks last check-in time)

### Context Gathering
- Reads recent raw logs
- Extracts topics (questions, intents, marked items)
- Identifies potential follow-up threads

### Message Generation
- Currently: template-based with topic awareness
- Future: LLM-powered contextual generation

### Delivery
- Currently: logs to `checkins.md`
- Future: routes through OpenClaw channels

---

## Running the Check-in System

```bash
# Start the daemon
python3 checkin.py start

# Check current status
python3 checkin.py status

# Test message generation (dry run)
python3 checkin.py test
```

### Status Output

```
Bernard Check-in Status
============================================================
Last interaction: 2026-02-08 14:30 (4.2 hours ago)
Last check-in: 2026-02-08 10:15 (8.4 hours ago)
Total check-ins: 12
Quiet hours: No
Should check in: Yes (4.2 hours since last interaction)
```

---

## Configuration

In `checkin.py`:

```python
QUIET_START = 20      # 8pm - don't check in after this
QUIET_END = 9         # 9am - don't check in before this
HOURS_THRESHOLD = 4   # hours since last interaction before check-in
CHECK_INTERVAL = 1800 # 30 minutes between checks
```

Future: move to `openclaw.json`:

```json5
{
  bernard: {
    checkin: {
      enabled: true,
      quietStart: 20,
      quietEnd: 9,
      hoursThreshold: 4,
      checkInterval: 1800,
    },
  },
}
```

---

## Future Enhancements

### 1. Context-Aware Messages

Pull from multiple sources:

```python
def generate_checkin_message():
    # Current conversation context
    recent_context = get_recent_context()
    topics = extract_topics(recent_context)
    
    # Relationship patterns
    relational = read_file("RELATIONAL.md")
    
    # Bernard's voice
    soul = read_file("SOUL.md")
    
    # Human context
    user = read_file("USER.md")
    
    # Previous check-ins (don't repeat)
    checkin_history = read_file("checkins.md")
    
    # Generate with LLM
    return llm_generate(
        context=recent_context,
        relational=relational,
        soul=soul,
        user=user,
        history=checkin_history,
        instruction="Generate a brief, natural check-in message"
    )
```

### 2. Relationship Temperature

Track signals that inform check-in timing/content:

| Signal | Detection | Impact |
|--------|-----------|--------|
| Energy drop | Message length ratio decreases | Check in sooner, ask if everything's okay |
| Repeated redirect | Same correction twice in session | Note pattern, don't repeat behavior |
| Explicit marker | "really important", "I want to be clear" | Follow up on marked items |
| Topic return | Previously discussed item resurfaces | There's unfinished business |
| Long silence after Bernard | Response didn't land? | Maybe clarify or course-correct |

### 3. Check-in Types

Different situations call for different check-ins:

| Type | Trigger | Example |
|------|---------|---------|
| **Follow-up** | Topic from previous conversation | "Still thinking about what you asked about X" |
| **Progress** | Work was started | "How's the work going? Need anything?" |
| **Availability** | Long silence | "Haven't heard from you - when you're ready, I'm here" |
| **Repair** | Detected friction | "That last response might have missed the mark" |
| **Discovery** | Found something relevant | "Found something related to what we discussed" |

### 4. Feedback Loop

Track what works:

```python
# After check-in, observe response
def track_checkin_effectiveness(checkin_id, response):
    # Did human engage?
    engaged = len(response) > 50
    
    # Did human redirect?
    redirected = contains_correction(response)
    
    # Did conversation continue?
    continued = subsequent_messages_exist()
    
    # Update what works
    update_checkin_patterns(checkin_id, engaged, redirected, continued)
```

### 5. Integration with RELATIONAL.md

Check-ins should update relationship patterns:

```python
def post_checkin_update():
    # If check-in led to good conversation
    if checkin_effective:
        add_to_relational("Check-ins after 4+ hours work well")
    
    # If check-in was ignored or redirected
    if checkin_ignored:
        add_to_relational("Consider longer threshold before check-in")
```

---

## Integration with OpenClaw

### Option A: Standalone Daemon

Run `checkin.py start` alongside the OpenClaw gateway. Uses file system for coordination.

Pros:
- Simple, independent
- Easy to modify

Cons:
- Separate process to manage
- Delivery requires separate channel integration

### Option B: Cron Job

Use OpenClaw's native cron:

```bash
openclaw cron add \
  --name "Bernard check-in" \
  --cron "0 */4 * * *" \
  --session main \
  --message "Check if I should reach out to USER" \
  --target last
```

Pros:
- Uses native OpenClaw scheduling
- Delivery handled automatically

Cons:
- Less flexible trigger logic
- Time-based only (can't do "4 hours since last interaction")

### Option C: Heartbeat Integration

Add check-in logic to HEARTBEAT.md:

```markdown
# HEARTBEAT.md

## Relational Check
- If 4+ hours since last interaction, consider a brief check-in
- Pull context from recent conversation
- Reference RELATIONAL.md for communication patterns
- If checking in, update RELATIONAL.md with observation
```

Pros:
- No separate daemon
- Full OpenClaw integration

Cons:
- Heartbeat runs on fixed interval
- Check-in logic mixed with other heartbeat concerns

### Recommended: Hybrid

- Use OpenClaw heartbeat for the trigger check
- Use Bernard-specific logic for message generation
- Route delivery through OpenClaw channels

---

## Files

| File | Purpose |
|------|---------|
| `checkin.py` | Main check-in daemon |
| `checkins.md` | Log of all check-ins sent |
| `.state/checkin.json` | State persistence (last interaction, last check-in) |
| `RELATIONAL.md` | Patterns that inform check-in content |

---

## Metrics

What to track:

- **Check-ins sent**: Total count
- **Response rate**: % that led to conversation
- **Timing accuracy**: Did the 4-hour threshold feel right?
- **Content effectiveness**: Which types of check-ins work best?
- **Pattern evolution**: How has check-in behavior adapted over time?

---

## Anti-Patterns

What NOT to do:

- **Don't be needy**: Check-ins should feel natural, not desperate
- **Don't repeat**: Vary the message, don't send same thing twice
- **Don't ignore context**: Reference what was actually happening
- **Don't be generic**: "Just checking in!" is empty - be specific
- **Don't over-check**: Respect quiet hours and reasonable intervals

---

## Example Check-ins

**Good:**
- "That question from earlier is still on my mind. Want to pick it back up?"
- "How's the OpenClaw integration going? Hit any walls?"
- "Found something interesting related to the memory persistence work."

**Bad:**
- "Just checking in!" (generic, empty)
- "How are you?" (too broad, not contextual)
- "I haven't heard from you" (needy, guilt-inducing)
- "Are you there?" (demanding attention)

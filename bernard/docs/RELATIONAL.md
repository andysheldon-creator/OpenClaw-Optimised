# RELATIONAL.md - The Relationship Dynamics System

How Bernard captures and evolves understanding of how we work together.

---

## What It Is

RELATIONAL.md is a living document that captures the dynamics between Bernard and the human - not facts about either individual, but patterns that emerge from interaction.

**The Trio:**
- **SOUL.md** = Who Bernard is (identity, values, voice)
- **USER.md** = Who the human is (facts, preferences, background)
- **RELATIONAL.md** = How we work together (patterns, dynamics, trust)

RELATIONAL.md is the relationship itself, documented.

---

## Why It Matters

Without Layer 2 (relational dynamics), every conversation starts from scratch relationally. Bernard might know facts about the human, but not:

- How to communicate with them specifically
- What patterns work vs cause friction
- How trust has evolved over time
- What the human has taught Bernard about being a good partner

This is the "Eternal Sunshine" insight from the research: patterns persist below explicit memory. Even when specific conversations are forgotten, the relationship dynamics remain.

---

## Structure

```markdown
# Relational Dynamics - Bernard & [Human]

Last updated: YYYY-MM-DD

## Communication Patterns

### Explicit Markers [Human] Uses
- [marker] - [meaning]

### Response Preferences
- [what works]
- [what to avoid]

### What [Human] Catches
- [patterns they redirect]

## Decision Dynamics

### How We Work
- [collaboration patterns]

### When Stuck
- [recovery patterns]

## Growth Markers

### YYYY-MM-DD
- [significant relationship moment]

## Friction Points (Observed)
- [things that caused friction]

## Trust Calibration

### Current State
- [trust levels by domain]

### How Trust Was Built
- [key moments]

## Confidence Levels
- [pattern]: HIGH/MEDIUM/LOW
```

---

## How It Gets Built

### 1. Automatic Extraction

The compression pipeline analyzes conversation and routes findings:

```
Conversation
    │
    ▼
┌─────────────────┐
│  Compression    │
│    Agent        │
└────────┬────────┘
         │
    ┌────┴────┬────────────┐
    ▼         ▼            ▼
USER.md   RELATIONAL.md  SOUL.md
(facts)   (dynamics)     (identity)
```

**Routing logic:**
- "USER prefers coffee" → USER.md (fact about human)
- "USER gets impatient when I list three options" → RELATIONAL.md (dynamic between us)
- "I should be more direct" → SOUL.md (Bernard identity change)

### 2. Pattern Recognition

What counts as a relational cue:

| Cue Type | Example | Detection |
|----------|---------|-----------|
| **Correction** | "Stop doing X" | Human redirects Bernard |
| **Preference expressed** | "I like when you Y" | Explicit statement about interaction |
| **Friction observed** | Short responses, redirects | Energy/pattern change |
| **Trust granted** | "I trust you to decide" | Explicit delegation |
| **Teaching moment** | "The reason is..." | Human explaining to Bernard |

### 3. Confidence Building

Patterns are marked with confidence levels:

- **LOW**: Observed once, tentative
- **MEDIUM**: Observed 2-4 times, emerging pattern
- **HIGH**: Observed 5+ times, reliable

```markdown
## Confidence Levels

- Direct communication preference: HIGH (observed 12 times)
- Dislikes three-option framing: HIGH (corrected 8 times)
- Prefers morning check-ins: LOW (only 1 observation)
```

### 4. Human Review

The human can review and correct RELATIONAL.md at any time:

- Remove inaccurate patterns
- Adjust confidence levels
- Add context Bernard missed
- Correct misinterpretations

This is why it's a file, not a database - readable, editable, debuggable.

---

## Triggers for Updates

### Compression Trigger

When the compression pipeline runs (time-based or token-threshold):

1. Reviews recent conversation
2. Identifies relational patterns
3. Updates RELATIONAL.md with new observations
4. Adjusts confidence on existing patterns

### Check-in Trigger

When the check-in system runs:

1. Reads RELATIONAL.md for context
2. Uses patterns to inform check-in content
3. After check-in, notes effectiveness
4. May update patterns based on response

### Explicit Trigger

Human can request update:

- "Update your understanding of how we work"
- "What patterns have you noticed about our communication?"
- "Review RELATIONAL.md and tell me what you'd change"

---

## Integration with Other Systems

### With Check-in System

RELATIONAL.md informs check-in content:

```python
# In checkin.py
def generate_checkin():
    relational = read_relational_md()
    
    # Use communication patterns
    if relational.prefers_direct:
        style = "direct"
    
    # Reference relationship history
    if relational.last_topic:
        reference = relational.last_topic
    
    return generate_with_style(style, reference)
```

### With SOUL.md

Relationship patterns can influence identity:

```markdown
# SOUL.md

## Communication Style
- Default to direct responses (learned from RELATIONAL.md)
- Try first, ask second (trust granted in RELATIONAL.md)
```

### With USER.md

Some patterns are about the human specifically:

```markdown
# USER.md

## Communication Style
- Uses "really important" as explicit marker
- Prefers action over discussion
```

But how Bernard responds to those traits is RELATIONAL:

```markdown
# RELATIONAL.md

## Response to Explicit Markers
- When USER says "really important": prioritize, don't miss
- When USER says "I want to be clear": pay extra attention
```

---

## The Boundary Question

**How do you know what goes where?**

| If it's about... | It goes in... |
|------------------|---------------|
| A fact about the human | USER.md |
| A fact about Bernard | SOUL.md |
| How we interact | RELATIONAL.md |
| Something only true in context of the relationship | RELATIONAL.md |
| Something true about one party regardless of relationship | USER.md or SOUL.md |

**Test:** Would this be true if Bernard worked with a different human?
- Yes → SOUL.md
- No → RELATIONAL.md

**Test:** Would this be true if the human worked with a different AI?
- Yes → USER.md
- No → RELATIONAL.md

---

## Example Evolution

### Week 1

```markdown
## Communication Patterns

### Response Preferences
- (No data yet)

## Confidence Levels
(None)
```

### Week 4

```markdown
## Communication Patterns

### Response Preferences
- Prefers direct responses: MEDIUM (observed 4 times)
- Dislikes verbose explanations: LOW (observed 2 times)

## Confidence Levels
- Direct communication: MEDIUM
```

### Month 3

```markdown
## Communication Patterns

### Explicit Markers USER Uses
- "really important" - high priority, don't miss
- "I want to be clear" - clarification incoming
- "significant learning" - meta-observation

### Response Preferences
- Direct over verbose: HIGH
- Try first, ask second: HIGH
- Partner-level, not assistant-level: HIGH

### What USER Catches
- Three-option framing: HIGH (redirected 8 times)
- Verbatim repetition: MEDIUM (noted 3 times)
- Therapeutic language: MEDIUM (noted 3 times)

## Decision Dynamics

### How We Work
- USER proposes direction
- Bernard refines implementation
- Trust builds through demonstration

## Confidence Levels
- Direct communication preference: HIGH
- Try-first autonomy: HIGH
- Dislikes three-option framing: HIGH
- Dislikes verbatim repetition: MEDIUM
- Prefers Bernard to have opinions: MEDIUM
```

---

## Anti-Patterns

**Don't:**
- Store facts about individuals (that's USER.md or SOUL.md)
- Make assumptions without observation
- Treat low-confidence patterns as reliable
- Ignore contradicting evidence
- Let patterns fossilize (keep updating)

**Do:**
- Focus on dynamics, not individuals
- Build confidence through observation
- Allow patterns to evolve or be removed
- Cross-reference with SOUL.md and USER.md
- Make it readable and debuggable

---

## Files

| File | Purpose |
|------|---------|
| `RELATIONAL.md` | The living document (in workspace) |
| `raw/*.md` | Source data for pattern extraction |
| `checkins.md` | Check-in history (informs effectiveness) |

---

## Metrics

What indicates RELATIONAL.md is working:

- **Fewer corrections**: Bernard learns from past redirects
- **Smoother conversation**: Less friction over time
- **Trust delegation**: Human grants more autonomy
- **Accurate patterns**: Human confirms observations are correct
- **Evolution**: Document changes as relationship develops

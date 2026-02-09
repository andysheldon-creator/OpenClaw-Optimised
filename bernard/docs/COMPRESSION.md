# Bernard Compression Pipeline

How conversation becomes persistent context.

---

## Overview

The compression pipeline transforms raw conversation into structured, persistent context. It's the bridge between ephemeral chat and lasting relationship memory.

```
Raw Conversation
      │
      ▼
┌─────────────────┐
│    Trigger      │──── Time-based (every 2h)
│    System       │──── Token-based (70% window)
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│   Extraction    │──── Significance detection
│     Agent       │──── Pattern recognition
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│    Routing      │
│    Logic        │
└────────┬────────┘
         │
    ┌────┼────┬────────────┐
    ▼    ▼    ▼            ▼
USER.md  │  SOUL.md    Embeddings
         │             (memory-lancedb)
         ▼
   RELATIONAL.md
```

---

## Triggers

### Time-Based

Run compression on a schedule:

```python
# Every 2 hours during active conversation
if hours_since_last_compression >= 2:
    run_compression()
```

Pros:
- Predictable
- Catches everything eventually
- Simple to implement

Cons:
- May run when nothing interesting happened
- May miss urgent patterns

### Token-Based

Run compression when context window is filling:

```python
# When approaching context limit
if token_usage / context_window >= 0.7:
    run_compression()
```

Pros:
- Only runs when needed
- Prevents context overflow
- Natural breakpoints

Cons:
- Requires token counting
- May miss patterns in short conversations

### Hybrid (Recommended)

Combine both:

```python
should_compress = (
    hours_since_last >= 2 or
    token_usage / context_window >= 0.7
)
```

---

## Extraction

### What Gets Extracted

| Type | Example | Destination |
|------|---------|-------------|
| **Fact about human** | "USER works in crypto tax" | USER.md |
| **Relationship pattern** | "USER redirected verbosity 3x" | RELATIONAL.md |
| **Bernard learning** | "I should be more direct" | SOUL.md |
| **General context** | "We discussed memory architecture" | Embeddings |
| **Decision made** | "Chose Option 1 for check-in system" | Embeddings + daily log |
| **Explicit marker** | "This is really important" | Flag for priority |

### Significance Detection

Not everything matters equally. Weight by:

1. **Explicit markers**: Human used "important", "critical", "I want to be clear"
2. **Correction patterns**: Human redirected Bernard's behavior
3. **Trust signals**: Delegation, autonomy grants
4. **Repeated topics**: Something keeps coming up
5. **Emotional weight**: Frustration, excitement, breakthrough moments

### Current Implementation

`agents/cluster.py` runs a multi-agent process:

```python
# Significance agent
def detect_significance(conversation):
    # Look for explicit markers
    # Identify correction patterns
    # Flag high-weight moments
    return weighted_moments

# Pattern agent  
def detect_patterns(conversation, existing_patterns):
    # Compare to known patterns
    # Identify new patterns
    # Note contradictions
    return pattern_updates

# Synthesis agent
def synthesize(moments, patterns):
    # Combine into coherent updates
    # Route to appropriate destinations
    return synthesis
```

---

## Routing Logic

### Decision Tree

```
For each extracted item:

Is it about the human as a person?
├── Yes → USER.md
└── No ↓

Is it about how we work together?
├── Yes → RELATIONAL.md
└── No ↓

Is it about Bernard's identity/approach?
├── Yes → SOUL.md
└── No ↓

Is it general context worth remembering?
├── Yes → Embeddings (memory-lancedb)
└── No → Drop (not significant enough)
```

### Examples

| Extracted | Routing | Reasoning |
|-----------|---------|-----------|
| "USER prefers mornings for deep work" | USER.md | Fact about USER |
| "USER got short when I was verbose" | RELATIONAL.md | Dynamic between us |
| "I should try before asking" | SOUL.md | Bernard behavior change |
| "We decided to use Option 1" | Embeddings | Context, not core doc |
| "Weather is nice today" | Drop | Not significant |

---

## Destination Formats

### USER.md Updates

```markdown
## Updates from 2026-02-08

**Observed:**
- Prefers action over extensive planning
- Works on crypto tax (MoonTax)

**Inferred:**
- Technical background (comfortable with architecture discussions)
```

### RELATIONAL.md Updates

```markdown
## Growth Markers

### 2026-02-08
- Established trigger-based doc updates
- USER emphasized: "I don't want to miss ANYTHING"
- Trust granted for compression decisions
```

### SOUL.md Updates

```markdown
## Communication Evolution

### 2026-02-08
- Learned: try first, ask second
- Learned: direct over verbose
```

### Embeddings

Chunks stored in memory-lancedb with metadata:

```json
{
  "text": "Discussed memory persistence architecture...",
  "date": "2026-02-08",
  "significance": 0.8,
  "topics": ["memory", "architecture", "bernard"],
  "type": "decision"
}
```

---

## Conflict Resolution

### Pattern Contradictions

When new observation contradicts existing pattern:

1. Check confidence levels
2. If new observation is one-off, note but don't override
3. If pattern is repeated, update or remove old pattern
4. Flag for human review if uncertain

```markdown
## Observed Contradiction

Previous: "USER prefers brief responses"
New: "USER asked for more detail on X"

Resolution: Context matters. Brief for status updates, 
detailed for architecture discussions.

Updated pattern: "Response length should match topic depth"
```

### Confidence Degradation

Patterns that aren't reinforced should fade:

```python
def update_confidence(pattern, observation):
    if observation.confirms(pattern):
        pattern.confidence += 1
    elif observation.contradicts(pattern):
        pattern.confidence -= 2
    
    # Decay over time
    pattern.confidence -= 0.1 * days_since_last_confirmation
    
    if pattern.confidence < 1:
        flag_for_removal(pattern)
```

---

## Configuration

### In scheduler.py

```python
# Compression triggers
TIME_INTERVAL = 2 * 60 * 60  # 2 hours
TOKEN_THRESHOLD = 0.7         # 70% of context window
```

### Future: openclaw.json

```json5
{
  bernard: {
    compression: {
      trigger: "both",           // "time" | "token" | "both"
      timeInterval: "2h",
      tokenThreshold: 0.7,
      destinations: {
        user: "~/.openclaw/workspace/USER.md",
        relational: "~/.openclaw/workspace/RELATIONAL.md",
        soul: "~/.openclaw/workspace/SOUL.md",
        embeddings: "memory-lancedb",
      },
    },
  },
}
```

---

## Running Compression

### Automatic (Scheduler)

```bash
python3 scheduler.py start
```

Runs in background, triggers compression on schedule.

### Manual

```bash
python3 agents/cluster.py process 2026-02-08
```

Process a specific date's conversations.

### Batch

```bash
python3 scheduler.py process
```

Process all unprocessed dates.

---

## Files

| File | Purpose |
|------|---------|
| `scheduler.py` | Trigger system, runs compression |
| `agents/cluster.py` | Multi-agent extraction/routing |
| `raw/*.md` | Source: daily conversation logs |
| `daily/*.md` | Output: processed summaries |
| `.state/scheduler.json` | State: last processed, timing |

---

## Quality Checks

### Extraction Quality

- Are explicit markers being caught?
- Are corrections being detected?
- Is significance weighting accurate?

### Routing Quality

- Are items going to the right destination?
- Is RELATIONAL.md getting dynamics, not facts?
- Is USER.md getting facts, not dynamics?

### Coverage

- What percentage of conversations get processed?
- Are any days being skipped?
- Is the trigger firing at appropriate times?

---

## Future Enhancements

### 1. LLM-Powered Extraction

Currently using pattern matching. Future: use Claude API for nuanced extraction.

```python
def extract_with_llm(conversation):
    prompt = """
    Analyze this conversation for:
    1. Facts about the human
    2. Relationship dynamics
    3. Bernard learnings
    4. Significant decisions
    
    Route each to USER.md, RELATIONAL.md, SOUL.md, or embeddings.
    """
    return claude_api.complete(prompt + conversation)
```

### 2. Semantic Chunking

Instead of fixed-size chunks, chunk by semantic coherence:

```python
def semantic_chunk(text):
    # Group by topic/theme
    # Keep related content together
    # Respect conversation boundaries
    return chunks
```

### 3. Hierarchical Summarization

As data grows, compress further:

```
Daily logs → Weekly summaries → Monthly summaries → Yearly summaries
```

Each level keeps full detail available but surfaces key patterns.

### 4. Feedback Loop

Track what extractions prove useful:

```python
def track_extraction_utility(extraction_id, was_useful):
    # Did this extraction get referenced later?
    # Did it inform a good decision?
    # Update extraction patterns based on utility
    pass
```

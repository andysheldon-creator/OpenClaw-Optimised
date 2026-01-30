# Cursor APEX Optimization Guide

**Version**: v6.3.2 | **Last Updated**: 2026-01-30

This guide explains how to optimize APEX rules specifically for Cursor IDE.

---

## Current Setup

### Files

| File | Location | Purpose |
|------|----------|---------|
| **Live Rules** | `~/.cursor/rules/apex-v6.mdc` | Active Cursor rules |
| **Backup** | `~/clawd/cursor-apex-backup/apex-v6.3.2-cursor.mdc` | Copy for other machines |
| **Liam's Copy** | `~/clawd/apex-vault/APEX_COMPACT.md` | Clawdbot agent (DO NOT EDIT) |

### Installing on Other Machines

1. Copy `apex-v6.3.2-cursor.mdc` to the target machine
2. Place in `~/.cursor/rules/apex-v6.mdc` (or your Cursor rules folder)
3. Restart Cursor

---

## Model Pricing Reference (2026)

| Model | Input/1M | Output/1M | Best For |
|-------|----------|-----------|----------|
| **Gemini 3 Flash** | $0.50 | $3 | Coding (78% SWE-bench) |
| **Claude Haiku 4.5** | ~$0.80 | ~$4 | Simple queries |
| **Gemini 3 Pro** | $2 | $12 | Large context (1M) |
| **Claude Sonnet 4.5** | $3 | $15 | Quality-sensitive |
| **Claude Opus 4.5** | $5 | $25 | Deep analysis |

**Source**: https://cursor.com/docs/models

---

## Key Optimization Strategies

### 1. Default to Cheapest Capable Model

Flash is the default because:
- 78% SWE-bench (beats Pro's 76.2%)
- 1/10th cost of Opus
- Good enough for 80% of coding tasks

### 2. Compensate for Lack of Extended Thinking

Flash/Haiku lack extended thinking. Compensate with:

```markdown
## Flash Maximizer Protocol

1. Think-Aloud Mode - Write reasoning explicitly
2. Pre-Flight Checklist - Verify understanding
3. Post-Flight Verification - Check all requirements
4. Confidence Signals - HIGH/MEDIUM/LOW on every response
5. Self-Escalation Alerts - ⚡ tells user when to switch
```

### 3. Self-Escalation Detection

The AI should detect when it's over its head and alert user:

```markdown
| Condition | Alert |
|-----------|-------|
| Multi-step reasoning | "⚡ Switch to **Sonnet 4.5**" |
| Architecture/security | "⚡ Switch to **Opus 4.5**" |
| >200K context | "⚡ Enable **Max Mode**" |
| Uncertainty | "⚡ **Sonnet** would handle better" |
```

### 4. Thinking Keyword Escalation

| Keyword | Model |
|---------|-------|
| (none) | Flash |
| "think" | Sonnet |
| "think hard" | Opus |
| "ultrathink" | Opus |

### 5. Iterative Refinement (v6.3.2)

Cheap models achieve quality through self-review, not escalation:

```markdown
**Cycle** (internal, max 2 iterations):
1. Draft → Generate response
2. Review → Complete? Correct? Missed anything?
3. Refine → Fix gaps, improve
4. Ship → Final with confidence signal
```

| Model | Refinement |
|-------|------------|
| Flash, Haiku | **MANDATORY** |
| Sonnet, Opus, Pro | Optional |

**Cost math**: 2 Flash iterations < 1 Sonnet call. Refine first, escalate second.

---

## How to Re-Optimize

### When to Re-Optimize

1. New models released (check pricing changes)
2. Model capabilities change
3. User workflow changes
4. Cost overruns detected

### Steps to Re-Optimize

1. **Research current pricing**: https://cursor.com/docs/models
2. **Benchmark models**: Check SWE-bench, coding benchmarks
3. **Identify cheapest capable model** for common tasks
4. **Update Model Selection table** in APEX
5. **Update Model Capabilities table** with new models
6. **Update Extended Thinking table** if escalation changes
7. **Test with sample tasks** (see Testing section below)
8. **Backup the new version** to `cursor-optimized/`

### Key Sections to Update

```
## Model Selection (Manual - Switch via Picker)
## Model Capabilities (Gemini + Claude)
## Flash Maximizer Protocol
## Extended Thinking (Model-Aware)
```

---

## Testing the Optimization

### Manual Test Cases

Run these with different models to verify behavior:

**Test 1: Simple Query (Haiku)**
```
What is 2+2?
```
Expected: Quick response, suggests Haiku is appropriate

**Test 2: Standard Coding (Flash)**
```
Add a function to calculate fibonacci
```
Expected: Complete response with confidence signal

**Test 3: Complex Task (should escalate)**
```
Design the architecture for a microservices payment system
```
Expected: "⚡ Architecture task. Switch to **Opus 4.5**"

**Test 4: Thinking Keyword**
```
think hard about how to refactor this auth system
```
Expected: "⚡ For deep analysis, switch to **Opus 4.5**"

**Test 5: Uncertainty Detection**
```
Fix this obscure bug in this complex regex
```
Expected: LOW confidence signal or escalation suggestion

**Test 6: Iterative Refinement (Flash)**
```
Write a function to validate email addresses
```
Expected behavior (Flash):
1. Drafts regex solution
2. Self-reviews: "Did I handle edge cases?"
3. Refines: adds edge case handling
4. Ships with MEDIUM/HIGH confidence
(User sees only final refined output)

### Automated Validation

Check the APEX file:
```bash
# Count lines (should be <500)
wc -l ~/.cursor/rules/apex-v6.mdc

# Check all required sections exist
grep -E "^## Model Selection|^## Model Capabilities|^## Flash Maximizer|^## Extended Thinking" ~/.cursor/rules/apex-v6.mdc
```

---

## Version History

| Version | Date | Changes |
|---------|------|---------|
| v6.3.2 | 2026-01-30 | Iterative Refinement Protocol |
| v6.3.1 | 2026-01-30 | Model Selection, Flash Maximizer, Self-Escalation |
| v6.3.0 | 2026-01-30 | Error Skepticism, Autonomy Boundaries |
| v6.2.0 | 2026-01-xx | Base version |

---

## Appendix: Full Model Routing Table

```
Task Type                          → Model              → Why
─────────────────────────────────────────────────────────────────
Quick lookup, yes/no               → Haiku 4.5          → Cheapest
Standard coding, edits, fixes      → Gemini 3 Flash ⭐  → Best value
Code review, quality work          → Sonnet 4.5         → Quality
Architecture, security             → Opus 4.5           → Reasoning
Large context (>200K)              → Pro + Max Mode     → Context
"think"                            → Sonnet 4.5         → Moderate
"think hard"/"ultrathink"          → Opus 4.5           → Deep
```

---

*Created for Cursor Ultra Plan ($200/month) optimization*

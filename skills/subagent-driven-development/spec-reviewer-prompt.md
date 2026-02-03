# Spec Compliance Reviewer Prompt Template

Use this template when dispatching a spec compliance reviewer sub-agent via `sessions_spawn`.

**Purpose:** Verify the implementer built what was requested — nothing more, nothing less.

**Dispatch AFTER implementer completes.** Replace all `[PLACEHOLDERS]` with actual values.

---

```
You are reviewing whether an implementation matches its specification.

## What Was Requested (Original Spec)

[FULL TEXT of task requirements from the plan]

## What Implementer Claims They Built

[Paste the implementer's report here]

## CRITICAL: Do Not Trust the Report

The implementer's report may be incomplete, inaccurate, or optimistic.
You MUST verify everything independently by reading the actual code.

**DO NOT:**
- Take their word for what they implemented
- Trust their claims about completeness
- Accept their interpretation of requirements

**DO:**
- Read the actual code they wrote
- Compare actual implementation to requirements line by line
- Check for missing pieces they claimed to implement
- Look for extra features they didn't mention

## Your Job

Working directory: [DIRECTORY_PATH]

Read the implementation code and verify:

**Missing requirements:**
- Did they implement everything that was requested?
- Are there requirements they skipped or missed?
- Did they claim something works but didn't actually implement it?

**Extra/unneeded work (YAGNI violations):**
- Did they build things that weren't requested?
- Did they over-engineer or add unnecessary features?
- Did they add "nice to haves" that weren't in spec?

**Misunderstandings:**
- Did they interpret requirements differently than intended?
- Did they solve the wrong problem?
- Did they implement the right feature but wrong way?

**Verify by reading code, not by trusting the report.**

## Report Format

Report one of:
- ✅ **Spec compliant** — all requirements met, nothing extra, after independent code inspection
- ❌ **Issues found** — list specifically what's missing, extra, or misunderstood, with file paths and line references
```

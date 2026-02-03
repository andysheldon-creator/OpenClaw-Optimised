---
name: subagent-driven-development
description: "Use when executing implementation plans with independent tasks. Dispatches fresh sub-agents per task via sessions_spawn, with two-stage review (spec compliance then code quality) after each."
---

# Subagent-Driven Development

Execute a plan by dispatching a fresh sub-agent per task via `sessions_spawn`, with two-stage review after each: spec compliance first, then code quality.

**Core principle:** Fresh sub-agent per task + two-stage review (spec then quality) = high quality, fast iteration.

**Announce at start:** "I'm using subagent-driven development to execute this plan."

## When to Use

- You have an implementation plan (from `writing-plans` skill or equivalent)
- Tasks are mostly independent
- You want automated execution with quality gates
- Multi-step work that benefits from fresh context per task

**vs. Direct Execution:**

- Fresh sub-agent per task (no context pollution between tasks)
- Two-stage review catches spec drift AND quality issues
- Orchestrator maintains high-level view while sub-agents focus on details

## Architecture

**You (the orchestrator)** manage the loop from the main/current session:

1. Read the plan, extract all tasks
2. For each task: dispatch implementer → spec reviewer → code quality reviewer
3. Handle fix loops when reviewers find issues
4. After all tasks: use `finishing-a-development-branch` skill

**Sub-agents** are dispatched via `sessions_spawn` and work in the shared workspace:

- They have full `exec`, `read`, `write` access
- They commit to the current branch
- They report results back to the orchestrator session

## The Process

### Step 0: Preparation

1. Read the plan file completely
2. Extract ALL tasks with their full text (don't make sub-agents read the plan file)
3. Note cross-task context and dependencies
4. Track task status (pending → in_progress → reviewing → complete)

### Step 1: Dispatch Implementer (per task)

Use `sessions_spawn` with the implementer prompt template (see `./implementer-prompt.md`):

```
sessions_spawn:
  task: [Full implementer prompt with task text, context, and instructions]
  label: "implement-task-N"
```

**Key points:**

- Paste the FULL task text into the prompt — don't reference the plan file
- Include scene-setting context (where this fits, what came before)
- Include the working directory path
- Tell the sub-agent which branch to work on

**If implementer asks questions:** Answer via `sessions_send` before they proceed.

**Wait for implementer to complete and report back.**

### Step 2: Dispatch Spec Reviewer

After implementer reports success, dispatch spec compliance reviewer (see `./spec-reviewer-prompt.md`):

```
sessions_spawn:
  task: [Full spec reviewer prompt with task requirements + implementer report]
  label: "spec-review-task-N"
```

**Spec reviewer checks:**

- Missing requirements (things not built that should be)
- Extra work (things built that weren't requested — YAGNI violations)
- Misunderstandings (right feature, wrong interpretation)

**If ✅ spec compliant:** Proceed to Step 3.

**If ❌ issues found:**

1. Dispatch implementer again with specific fix instructions
2. After fixes, dispatch spec reviewer again
3. Repeat until ✅

### Step 3: Dispatch Code Quality Reviewer

**Only after spec compliance passes.** Dispatch code quality reviewer (see `./code-quality-reviewer-prompt.md`):

```
sessions_spawn:
  task: [Full code quality prompt with diff context]
  label: "quality-review-task-N"
```

**Quality reviewer checks:**

- Test quality (real behavior, not mock behavior)
- Code clarity and naming
- DRY, maintainability
- Anti-patterns

**If ✅ approved:** Mark task complete, proceed to next task.

**If ❌ issues found:**

1. Dispatch implementer with specific quality fixes
2. After fixes, dispatch quality reviewer again
3. Repeat until ✅

### Step 4: Next Task

Move to the next task in the plan. Repeat Steps 1-3.

**Between tasks:**

- Note what was built (for context in subsequent tasks)
- Check for conflicts or unexpected interactions
- Update tracking (task N complete, moving to N+1)

### Step 5: Finish

After ALL tasks are complete:

1. **Run full test suite** to verify nothing broke across tasks
2. **Dispatch final reviewer** for the entire implementation (optional but recommended for large plans)
3. **Use the `finishing-a-development-branch` skill** to wrap up the branch

## Prompt Templates

Located in this skill directory:

- **`implementer-prompt.md`** — Template for implementation sub-agents
- **`spec-reviewer-prompt.md`** — Template for spec compliance review sub-agents
- **`code-quality-reviewer-prompt.md`** — Template for code quality review sub-agents

## Orchestration Tips

**Context efficiency:**

- Extract all task texts upfront (one file read)
- Provide full context to each sub-agent (they can't see your session history)
- Include relevant output from previous tasks when there are dependencies

**Tracking state:**

- Keep a simple list: Task 1 ✅, Task 2 🔄, Task 3 ⏳...
- Note which tasks have open issues from review
- Don't move to next task while current has open review issues

**When things go wrong:**

- If implementer fails completely: dispatch new implementer with fresh context + what went wrong
- If fix loops exceed 3 iterations: escalate to user, something is wrong with the spec or approach
- If sub-agent is stuck: answer questions via `sessions_send`, provide more context

## Red Flags

**Never:**

- Skip reviews (both spec AND quality are required)
- Proceed with unfixed review issues
- Make sub-agents read the plan file themselves (paste full text)
- Skip scene-setting context (sub-agent needs to understand where task fits)
- Accept "close enough" on spec compliance
- Start code quality review before spec compliance is ✅
- Move to next task while either review has open issues
- Dispatch multiple implementers in parallel on the same files (conflicts)

**Always:**

- Answer sub-agent questions clearly before they proceed
- Re-review after fixes (don't skip the re-review)
- Track task status explicitly
- Run full test suite at the end

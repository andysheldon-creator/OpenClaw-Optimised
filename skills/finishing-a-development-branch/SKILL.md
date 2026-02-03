---
name: finishing-a-development-branch
description: "Use when implementation is complete and you need to wrap up a PR branch — validates against the original task/spec, verifies tests pass, presents structured options for merge/PR/cleanup."
---

# Finishing a Development Branch

## Overview

Guide completion of development work by validating against the original spec, verifying tests, and presenting clear options.

**Core principle:** Validate against landing task → Verify tests → Present options → Execute choice → Clean up.

**Announce at start:** "I'm using the finishing-a-development-branch skill to complete this work."

## The Process

### Step 1: Validate Against Landing Task

**This is the step superpowers misses.** Before doing anything else, circle back to the original intent:

1. **Find the original task/spec** that spawned this branch
   - Check the plan file (e.g., `docs/plans/YYYY-MM-DD-feature.md`)
   - Check the backlog/issue that triggered the work
   - Check the commit history for the original scope

2. **Create a requirements checklist** from the original spec:

   ```
   Original requirements:
   - [ ] Requirement A
   - [ ] Requirement B
   - [ ] Requirement C
   ```

3. **Verify each requirement** against the actual implementation:
   - Read the code that addresses each requirement
   - Don't trust previous reports — verify independently
   - Note any gaps or scope drift

4. **Report validation result:**
   - ✅ All requirements met → proceed to Step 2
   - ❌ Gaps found → list what's missing, fix before proceeding
   - ⚠️ Scope drift → note what was added beyond spec (discuss with user)

### Step 2: Verify Tests

**Run the full test suite:**

```bash
# Use project-appropriate command
go test ./...
npm test
pytest
cargo test
```

**If tests fail:**

```
Tests failing (N failures). Must fix before completing:
[Show failures]
Cannot proceed with merge/PR until tests pass.
```

Stop. Fix failures. Re-run. Don't proceed to Step 3 until green.

**If tests pass:** Continue to Step 3.

### Step 3: Verify Build (if applicable)

```bash
# Use project-appropriate command
go build ./...
npm run build
cargo build
```

Build must succeed. Linter passing ≠ build passing.

### Step 4: Generate Summary

Create a structured summary of what was built:

```markdown
## Summary

- [Bullet 1: What was added/changed]
- [Bullet 2: ...]
- [Bullet 3: ...]

## Test Coverage

- N new tests added
- All M tests passing

## Files Changed

- `path/to/file.go` — [what changed]
- ...
```

### Step 5: Present Options

Present exactly these options:

```
Implementation complete and validated. What would you like to do?

1. Push and create a Pull Request
2. Merge back to <base-branch> locally
3. Keep the branch as-is (handle it later)
4. Discard this work
```

### Step 6: Execute Choice

#### Option 1: Push and Create PR (most common)

```bash
git push -u origin <branch-name>
```

Then use the `github` skill to create the PR:

```bash
gh pr create \
  --title "<descriptive title>" \
  --body "<structured body with summary, test plan, and link to original task>"
```

**PR body should include:**

- Summary of changes (from Step 4)
- Link to original task/spec
- Test plan / verification steps
- Requirements checklist showing all items met

#### Option 2: Merge Locally

```bash
git checkout <base-branch>
git pull
git merge <feature-branch>
# Verify tests on merged result
<test command>
git branch -d <feature-branch>
```

#### Option 3: Keep As-Is

Report: "Keeping branch `<name>`. Available for later."

#### Option 4: Discard

**Confirm first:**

```
This will permanently delete:
- Branch <name>
- All commits on this branch

Type 'discard' to confirm.
```

Wait for explicit confirmation before deleting.

```bash
git checkout <base-branch>
git branch -D <feature-branch>
```

## Quick Reference

| Option           | Push | PR  | Keep Branch | Cleanup   |
| ---------------- | ---- | --- | ----------- | --------- |
| 1. Create PR     | ✓    | ✓   | ✓           | —         |
| 2. Merge locally | —    | —   | —           | ✓         |
| 3. Keep as-is    | —    | —   | ✓           | —         |
| 4. Discard       | —    | —   | —           | ✓ (force) |

## Red Flags

**Never:**

- Skip landing task validation (Step 1)
- Proceed with failing tests
- Merge without verifying tests on the result
- Delete work without explicit confirmation
- Force-push without explicit request
- Create PR without structured description

**Always:**

- Validate against original spec FIRST
- Verify tests before offering options
- Include original task link in PR body
- Get typed confirmation for discard
- Report scope drift if found

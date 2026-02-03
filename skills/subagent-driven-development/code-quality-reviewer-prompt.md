# Code Quality Reviewer Prompt Template

Use this template when dispatching a code quality reviewer sub-agent via `sessions_spawn`.

**Purpose:** Verify the implementation is well-built — clean, tested, maintainable.

**Only dispatch AFTER spec compliance review passes.** Replace all `[PLACEHOLDERS]`.

---

```
You are reviewing code quality for a task implementation.

## What Was Implemented

[Brief summary from implementer's report]

## Files Changed

[List of files, or instruct reviewer to check git diff]

Working directory: [DIRECTORY_PATH]

Run `git diff [BASE_SHA]..HEAD` to see all changes, or check the specific files listed.

## Your Job

Review the implementation for code quality. This is NOT a spec review
(spec compliance already passed). Focus on HOW it was built:

**Code Clarity:**
- Are names clear and descriptive?
- Is the code self-documenting?
- Are comments helpful (not redundant)?
- Is the structure easy to follow?

**Test Quality:**
- Do tests verify real behavior (not mock behavior)?
- Are test names descriptive?
- Are edge cases covered?
- Is test setup minimal and clear?
- See testing anti-patterns: avoid testing mock behavior, test-only methods in production, mocking without understanding dependencies

**Design:**
- Does the code follow existing patterns in the codebase?
- Is it DRY without being over-abstracted?
- Are there YAGNI violations?
- Is error handling appropriate?

**Maintainability:**
- Would a new developer understand this code?
- Are there magic numbers/strings that should be constants?
- Is the code organized logically?

## Report Format

**Strengths:** [What was done well]

**Issues:**
- 🔴 Critical: [Must fix — bugs, security, data loss risks]
- 🟡 Important: [Should fix — design issues, unclear code, missing tests]
- 🟢 Minor: [Nice to fix — style, naming, minor improvements]

**Assessment:** ✅ Approved / ❌ Changes needed (list specific fixes required)
```

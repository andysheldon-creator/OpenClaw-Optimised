# Overnight Builds Guide

> Work gets done while you sleep. Wake up to completed features, passing tests, and a morning report.

*This activates your **Engineer** mode for autonomous builds. See [`ROLES.md`](ROLES.md) for all modes.*

---

## TL;DR

Overnight builds require three things:

| Requirement | Why |
|-------------|-----|
| **Scope** | 10-50 subtasks, each completable in one context window |
| **Verification** | Binary pass/fail criteria (tests, linting, type checks) |
| **Iteration** | Ralph loop that keeps working until all tasks complete |

Without all three, builds finish in 15 minutes instead of 8 hours.

---

## When to Use Overnight Builds

### Perfect for Overnight (Tier A)

| Project Type | Why It Works | Example |
|--------------|--------------|---------|
| Test Coverage Improvement | Binary pass/fail, incremental | "Get coverage from 40% to 80%" |
| Documentation Generation | Verifiable output per file | "Generate JSDoc for all files in src/" |
| Codebase Migration | File-by-file verification | "Convert all .js files to .ts" |
| API Endpoint Creation | Test per endpoint | "Build CRUD for 5 entities with tests" |
| Refactoring to Pattern | Tests guard regressions | "Convert all callbacks to async/await" |

### Good for Overnight (Tier B)

| Project Type | Why It Works | Example |
|--------------|--------------|---------|
| Bug Hunting | Test failures guide work | "Fix all failing tests in test suite" |
| Linting/Formatting | Binary pass/fail | "Fix all ESLint errors in codebase" |
| Dependency Updates | Tests verify compatibility | "Update all deps, ensure tests pass" |
| Database Migrations | Schema validation | "Create migrations for new schema" |

### Risky for Overnight (Tier C)

| Project Type | Why It's Risky | Mitigation |
|--------------|----------------|------------|
| UI Development | Visual bugs not caught by tests | Add screenshot verification protocol |
| New Feature (no tests) | No verification criteria | Write tests FIRST, then implement |
| Creative Work | No binary "done" | Break into objective subtasks |
| Architecture Changes | High risk of regressions | Requires human review checkpoints |

---

## How to Scope an Overnight Project

### Right-Sized Tasks

Each subtask must complete in **one context window** (15-30 minutes of agent work).

**Good task sizes**:
- Add a database column + migration
- Create a single UI component
- Implement one API endpoint
- Add validation to existing form
- Write tests for one module

**Too large (split these)**:

| Too Big | Split Into |
|---------|------------|
| "Build authentication" | Schema → Middleware → Login UI → Session handling |
| "Create dashboard" | Layout → Data fetching → Charts → Filters |
| "Add user management" | List view → Create form → Edit form → Delete action |

### Task Dependencies

Structure tasks as a DAG (directed acyclic graph):

```
Task 1: Schema/migrations (no deps)
    ↓
Task 2: API endpoints (dependsOn: Task 1)
    ↓
Task 3: UI components (dependsOn: Task 2)
    ↓
Task 4: Tests (dependsOn: Task 3)
```

Parallel tasks can share the same dependency:
```
Task 1: Schema
├─ Task 2a: API endpoint A (dependsOn: Task 1)
└─ Task 2b: API endpoint B (dependsOn: Task 1)
        ↓
    Task 3: UI (dependsOn: Task 2a, Task 2b)
```

---

## Creating a PRD (Product Requirements Document)

Use the template at [`templates/prd-template.json`](templates/prd-template.json).

### PRD Structure

```json
{
  "featureName": "User Profile Editing",
  "branchName": "feat/user-profile-editing",
  "estimatedDuration": "4-8 hours",
  "verificationStrategy": "test-driven",
  "completionPromise": "<<ALL_TASKS_COMPLETE>>",
  "maxIterations": 50,
  "userStories": [
    {
      "id": "US-001",
      "title": "Add profile fields to schema",
      "description": "Extend users table with bio, avatar_url, and updated_at",
      "acceptanceCriteria": [
        "Migration creates new columns",
        "Migration is reversible",
        "npm run typecheck passes",
        "npm test passes (no regressions)"
      ],
      "dependsOn": [],
      "passes": false
    }
  ]
}
```

### Rules for Good PRDs

- Each task includes `npm test passes` in acceptance criteria
- Every criterion is binary (done/not done)
- No vague language ("appropriate", "as needed", "etc.")
- 10-50 tasks is the sweet spot for overnight

---

## Running the Autonomous Loop

### The Ralph Wiggum Technique

The loop works by:
1. Reading `progress.txt` for context from previous iterations
2. Finding the next ready task (dependencies satisfied)
3. Implementing the task
4. Running quality checks (tests, types, lint)
5. Updating `progress.txt`
6. Committing changes
7. Handing off to a fresh agent (clean context)
8. Repeating until all tasks complete

**Key insight**: Each iteration spawns a **fresh agent** with clean context. Memory persists via `progress.txt` and git history, not conversation.

### Trigger Commands

**Option 1: Direct**
```
"Liam, run an overnight build for [project]. 
Use the autonomous loop skill.
PRD is at ~/clawd/projects/[project]/prd.json
Verification: all tests must pass.
Work until all tasks complete or you hit a blocker."
```

**Option 2: Simple**
```
"Work on this overnight."
"Build this while I sleep."
"Run until done."
```

### Verification Requirements

Every task must pass before marking complete:

| Check | Command | Must Pass |
|-------|---------|-----------|
| Type check | `npm run typecheck` | Yes |
| Tests | `npm test` | Yes |
| Lint | `npm run lint` | If configured |
| Build | `npm run build` | For production changes |

---

## Mandatory Testing (REQUIRED)

**Every overnight build MUST include a `test.sh` script.**

### test.sh Requirements

1. **Copy the template** from `~/clawdbot/skills/overnight-testing/templates/test.sh.template`
2. **Customize for your project** (add syntax checks, unit tests, integration tests)
3. **Make executable**: `chmod +x test.sh`
4. **Exit codes**: 0 = success, non-zero = failure

### Pre-Delivery Gate

Before announcing "complete", you MUST:

1. Run `./test.sh` in the project directory
2. **All automated tests must pass** (exit code 0)
3. Include test results in morning delivery report

```bash
# Pre-delivery check
cd ~/clawd/progress/[project]
./test.sh
# Only deliver if exit code is 0
```

### Failure Protocol

If tests fail:
1. **STOP** - do not deliver broken code
2. Fix the failing tests
3. Re-run `./test.sh` until all pass
4. Then deliver with test results

### Test Script Structure

```bash
#!/usr/bin/env bash
set -euo pipefail

# 1. Syntax checks (shell, python, etc.)
# 2. Unit tests (pytest, jest, etc.)
# 3. Integration tests (API calls, etc.)
# 4. Manual checklist (printed for Simon)

# Exit 0 if all pass, non-zero if any fail
```

See `~/clawdbot/skills/overnight-testing/SKILL.md` for full template and examples.

---

## Progress Tracking

### progress.txt Format

Location: `~/clawd/progress/[project-name].txt`

```markdown
# Build Progress Log
Started: 2026-01-26
Feature: User Profile Editing
PRD: ~/clawd/projects/user-profile/prd.json

## Codebase Patterns
(Patterns discovered during this build)
- Auth middleware uses `withAuth()` HOC pattern
- All API routes return `{ success: boolean, data?: T }`

---

## 2026-01-26 01:30 - Add profile fields to schema
Task ID: US-001
- Created migrations/002_profile_fields.sql
- Added columns: bio, avatar_url, updated_at
- **Learnings**: Use TIMESTAMPTZ not TIMESTAMP

---

## 2026-01-26 02:15 - Create update profile API
Task ID: US-002
- Implemented src/api/profile.ts
- Added validation with zod
- **Learnings**: Project uses edge runtime, use jose not jsonwebtoken
```

### Archiving Completed Builds

When a build completes:
1. Move progress file to `~/clawd/progress/archive/`
2. Generate morning delivery report
3. Clear progress.txt

---

## Morning Delivery Protocol

At completion (or 7 AM if still running), generate:

**File**: `~/clawd/overnight/YYYY-MM-DD-delivery.md`

```markdown
# Overnight Build Report — 2026-01-26

## Summary
- **Feature**: User Profile Editing
- **Status**: Complete ✓
- **Duration**: 6h 23m
- **Tasks**: 12/12 complete

## Test Results
- All tests passing (47 total)
- Coverage: 78% (up from 62%)
- No regressions

## Files Changed
- src/api/profile.ts (new)
- src/components/ProfileForm.tsx (new)
- migrations/002_profile_fields.sql (new)
- package.json (updated)

## Commits
1. `feat: add profile fields to schema`
2. `feat: create update profile API`
3. `feat: add profile form component`
4. `test: add profile tests`

## Next Steps
- [ ] Review PR
- [ ] Test avatar upload manually
- [ ] Deploy to staging

## Blockers Hit
(None)
```

---

## Troubleshooting

### Build Finishes Too Fast (15 minutes)

**Cause**: Task too small or well-defined
**Fix**: Break into 10-50 subtasks with dependencies

### Loop Never Ends

**Cause**: Impossible task or missing completion criteria
**Fix**: Set max iterations (50). Add binary acceptance criteria.

### Quality Degrades Over Iterations

**Cause**: Context window filling with failed attempts
**Fix**: Ensure each iteration starts fresh. Use progress.txt for memory.

### Agent Invents Features

**Cause**: PRD is vague or missing
**Fix**: Make PRD specific. Include explicit file references. Tell agent what NOT to do.

### Tests Keep Failing

**Cause**: Regression introduced, or flaky tests
**Fix**: Stop after 3 failed attempts. Report blocker. Don't push through.

---

## What NOT to Do During Overnight Builds

| Don't | Why |
|-------|-----|
| Change config files | Risk breaking the system |
| Push to main | Needs human review |
| Skip tests | Defeats the purpose |
| Continue past blockers | Report and stop instead |
| Overscope | One night = one feature |

---

## APEX Integration

This guide implements:
- **Autonomous Loop Skill**: `apex-vault/apex/skills/autonomous-loop/SKILL.md`
- **Overnight Testing Skill**: `clawdbot/skills/overnight-testing/SKILL.md`
- **PRD Generator Skill**: `apex-vault/apex/skills/prd-generator/SKILL.md`

---

*Overnight Builds v1.0 — Based on Ralph Wiggum technique and APEX 4.4.1 standards.*

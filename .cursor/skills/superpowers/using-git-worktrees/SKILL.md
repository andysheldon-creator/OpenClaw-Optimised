---
name: using-git-worktrees
description: Use when starting feature work that needs isolation from the current workspace or before executing implementation plans. Guides using Cursor's built-in worktree/Parallel Agents flow so the agent and plans run in the same workspace.
---

# Using Git Worktrees (Cursor-Aligned)

## When to Use

- Before executing implementation plans that should run in isolation
- When brainstorming/subagent-driven-development requires an isolated workspace
- When the user wants to work on a feature branch without touching the current workspace

**Announce at start:** "I'm using the using-git-worktrees skill to set up an isolated workspace with Cursor's flow."

## Cursor's Built-in Worktree Flow

Cursor can create and use Git worktrees in a **fixed, user-global location** (e.g. `~/.cursor/worktrees/<repo>/<id>`). Use that flow so plans and edits live in the **same workspace** the agent sees.

### 1. Start Isolated Work

- **Parallel Agents:** Use Cursor's Parallel Agents (or equivalent) so Cursor creates a worktree and opens a session there.
- **Or:** User opens a new Cursor window and starts a session "in worktree" if the UI offers it.

Result: the agent runs in a workspace that is a Git worktree (separate branch, same repo). No project-local `.worktrees/` or manual `git worktree add` required for the standard case.

### 2. Where Plans and Files Live

- **Critical:** Implementation plans (e.g. `.cursor/plans/*.md`) must be in the **worktree workspace** that will execute them.
- If the user will run **executing-plans** in that worktree session, the plan must be created or saved **in that worktree** (e.g. that window's `.cursor/plans/`).
- If the plan was created in the main repo: either (a) write the plan file into the worktree's `.cursor/plans/` from the main repo (if the worktree path is known), or (b) tell the user to open the worktree folder in Cursor and create the plan again there.

### 3. After Work Is Done

- Use **finishing-a-development-branch** in the worktree session to merge/push, then discard or keep the worktree as needed.
- Cursor-managed worktrees are cleaned up via Cursor or the user's workflow; no project-local cleanup of `.worktrees/` required.

## Optional: Project-Local Worktrees

If the user or project explicitly wants **project-local** worktrees (e.g. `.worktrees/` in the repo):

1. Prefer a directory already in use: `.worktrees/` or `worktrees/` (if present).
2. **Must** ensure that directory is in `.gitignore` and run `git check-ignore -q .worktrees` (or `worktrees`) before creating a worktree there.
3. Create with: `git worktree add .worktrees/<branch-name> -b <branch-name>`, then run project setup and baseline tests as in the "Verify baseline" section below.

Treat this as the exception; default to Cursor's flow above.

## Verify Baseline (Any Worktree)

When a worktree is ready (Cursor-created or project-local), run the project's test command to confirm a clean baseline:

```bash
# Examples - use project-appropriate command
npm test
cargo test
pytest
go test ./...
```

**If tests fail:** Report failures and ask whether to proceed or investigate.

**If tests pass:** Report ready, e.g. "Worktree ready. Tests passing (N tests, 0 failures). Ready to implement <feature>."

## Quick Reference

| Goal                                  | Action                                                                     |
| ------------------------------------- | -------------------------------------------------------------------------- |
| Isolated workspace for plans/features | Use Cursor's Parallel Agents / session-in-worktree flow                    |
| Plans executed in worktree            | Create or copy plan into that worktree's `.cursor/plans/`                  |
| Project-local worktree                | Use `.worktrees/` or `worktrees/` only if ignored; then `git worktree add` |
| After work done                       | Use finishing-a-development-branch in that session                         |

## Integration

**Called by / pairs with:**

- **brainstorming** — when design is approved and implementation follows
- **writing-plans** — save plan in the worktree workspace if execution will be there
- **executing-plans** — run in the worktree session where the plan lives
- **finishing-a-development-branch** — cleanup/merge from the worktree session

**Red flags:** Do not assume the plan lives in the main repo when execution will run in a Cursor-created worktree; ensure the plan is in that worktree's workspace.

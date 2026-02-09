# lazy-code-skill

## 1. Project Overview

**What it does:** Collection of Cursor **skills** and **rules** in three namespaces: **`.cursor/skills/lazy-code-skill/`** (own: pre-commit docs sync, new-project scaffold, dual-remote push, efficient code, latency logging, jira skill collection), **`.cursor/skills/superpowers/`** (from [Superpowers](https://github.com/obra/superpowers): brainstorming, writing-plans, TDD, debugging, code review, git worktrees, etc.), and **`.cursor/skills/anthropic/`** (from [anthropics/skills](https://github.com/anthropics/skills): all Anthropic example skills, synced via script). One **rule**: **skill-first-engineering** (skills first + deliberate, efficient implementation). Install at **project level** so any Cursor project can use them.

**Anthropic skills:** Cursor discovers skills under `.cursor/skills/anthropic/<skill-name>/SKILL.md` automatically. No extra wiring. Skills are mirrored as-is from upstream; Cursor-specific adaptations (paths, wording) can be added in a later plan if needed.

**Who it is for:** Developers using Cursor who want shared workflows and standards (docs sync, scaffolding, dual-remote push, etc.) in their projects.

---

## 2. Prerequisites

- **Cursor** (with Agent)
- **git** (to clone this repo during install)

No minimum version required beyond a recent Cursor release that supports skills and rules.

---

## 3. Environment Setup

No environment variables or `.env` files are required to install or use these skills. Installation is copy-based into your project’s `.cursor/` directory.

---

## 4. How to Run / Use (Install into Your Project)

Run these steps from the **root of the project** where you want the skills and rules.

### Step 1: Trigger install via Cursor Agent

In **Cursor Agent chat**, paste and send:

```
Fetch and follow instructions from https://raw.githubusercontent.com/bakwankawa/lazy-code-skill/refs/heads/main/.cursor/INSTALL.md
```

**Success:** The agent fetches INSTALL.md and will run the install steps below.

### Step 2: Agent runs install (or run manually)

The agent will (or you can run from project root):

1. Clone this repo into `.cursor/lazy-code-skill`
2. Create `.cursor/skills` and `.cursor/rules`
3. Copy all three skill folders to `.cursor/skills/lazy-code-skill/`, `.cursor/skills/superpowers/`, and `.cursor/skills/anthropic/`
4. Copy rules to `.cursor/rules/` with prefix `lazy-code-skill-`
5. Copy `.cursor/project_architecture.md` only if missing (never overwrite if user already has it)
6. Copy README to `.cursor/lazy-code-skill-README.md` (Basic Workflow reference)
7. Remove the clone so only skills, rules, and README copy remain. `.cursor/plans/` and `.cursor/project_architecture.md` are never overwritten if they exist.

**Success:** You have `.cursor/skills/lazy-code-skill/`, `.cursor/skills/superpowers/`, `.cursor/skills/anthropic/`, and `.cursor/rules/`. Cursor discovers them automatically.

### Step 3: Use skills and rules

- **Skills:** Cursor Settings → Rules → Agent Decides, or in Agent chat type `/skill-name` (e.g. `/pre-commit-docs-sync`, `/dual-remote-push`).
- **Rules:** Active for the project; loaded from `.cursor/rules/`.

**Direct link to install instructions:** [.cursor/INSTALL.md](https://raw.githubusercontent.com/bakwankawa/lazy-code-skill/refs/heads/main/.cursor/INSTALL.md)

---

## 5. How to Run (Docker / Containerized)

Not applicable. This repo is Cursor skills and rules only; there is no application to run in Docker.

---

## 6. Configuration & Runtime Behavior

- **Skills** are invoked by the agent when relevant or manually via `/skill-name`.
- **Rules** (e.g. `lazy-code-skill-skill-first-engineering.mdc`) apply at project level when Cursor loads the project.
- **Updating:** Re-run the full install (steps in section 4) to force-update skills, rules, and README copy. `.cursor/plans/` and `.cursor/project_architecture.md` are never overwritten if they exist.

---

## Basic Workflow (from Superpowers — use as reference)

When you use the Superpowers-style skills, this is the intended order. The agent checks for relevant skills before any task. Mandatory workflows, not suggestions.

1. **brainstorming** — Before writing code. Refines rough ideas through questions, explores alternatives, presents design in sections for validation. Saves design document.

2. **using-git-worktrees** — After design approval. Creates isolated workspace on new branch, runs project setup, verifies clean test baseline.

3. **writing-plans** — With approved design. Breaks work into bite-sized tasks (2–5 minutes each). Every task has exact file paths, complete code, verification steps. **If you will execute in a worktree (option 2):** open the worktree folder in Cursor first, then run writing-plans there so the plan is saved in that workspace.

4. **subagent-driven-development** or **executing-plans** — With a plan. Dispatches fresh subagent per task with two-stage review (spec compliance, then code quality), or executes in batches with human checkpoints.

5. **test-driven-development** — During implementation. Enforces RED-GREEN-REFACTOR: write failing test, watch it fail, write minimal code, watch it pass, commit. Deletes code written before tests.

6. **requesting-code-review** — Between tasks. Reviews against plan, reports issues by severity. Critical issues block progress.

7. **finishing-a-development-branch** — When tasks complete. Verifies tests, presents options (merge/PR/keep/discard), cleans up worktree.

**To update skills from Superpowers:** In Cursor Agent, ask the agent to run the sync script:  
`./.cursor/scripts/sync-superpowers-skills.sh`  
(from the repo root). Then review and commit.

**To update Anthropic skills:** Only in this repo (lazy-code-skill). Run `./.cursor/scripts/sync-anthropic-skills.sh` from repo root, then review and commit. Installing projects get the synced copy; they do not run the script.

---

## 7. Common Changes Introduced by This Commit

- **Install: copy README on install.** INSTALL.md includes step 6: copy repo README to `.cursor/lazy-code-skill-README.md` in the target project so Basic Workflow and sync instructions are available without overwriting the project's README.
- **project_architecture.md:** Data flow and Components updated to include `.cursor/lazy-code-skill-README.md` and all three skill namespaces; Data Flow step 2 describes copying all three skill folders.
- **Cursor adaptation (Superpowers):** Skills in `.cursor/skills/superpowers/` updated for Cursor: paths (`.cursor/skills/`), project rules (`.cursor/rules/`), agent-agnostic wording (ASO), Cursor variant in writing-skills examples, Subagents note in subagent-driven-development and dispatching-parallel-agents.
- **Anthropic skills namespace:** Three namespaces (lazy-code-skill, superpowers, anthropic). `.cursor/skills/anthropic/` is synced from [anthropics/skills](https://github.com/anthropics/skills) via `./.cursor/scripts/sync-anthropic-skills.sh` (maintainers of this repo only). Install copies all three skill folders; README and INSTALL.md document how to update Anthropic skills.

- **Jira skill collection:** Added Jira skill under `.cursor/skills/lazy-code-skill/jira/` mirroring the upstream Jira skill README and reference files, enabling conversational Jira operations via jira CLI or Atlassian MCP.

---

## Repo

[https://github.com/bakwankawa/lazy-code-skill](https://github.com/bakwankawa/lazy-code-skill)

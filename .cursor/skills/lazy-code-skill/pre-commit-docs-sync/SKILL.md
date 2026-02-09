---
name: pre-commit-docs-sync
description: Ensures README.md and .cursor/project_architecture.md are fully updated and accurate BEFORE a commit is created. README.md must function as a complete, step-by-step SOP for running and operating the application. Prevents commits from landing with outdated, incomplete, or misleading documentation.
---

# Skill: Pre-Commit Documentation Sync

## Purpose

Ensure project documentation is **fully aligned with code changes BEFORE committing**.  
This skill acts as a **pre-commit gate**, guaranteeing that:

- **README.md** serves as a complete, executable **SOP for running the application**
- **project_architecture.md** accurately reflects system structure and flow

The commit should only proceed once documentation parity is achieved.

This skill is designed for **pre-commit discipline**, **documentation hygiene**, and **agent reliability**.

---

## When to Run

Run this skill **immediately before** a commit is created, when:

- The user is about to commit changes
- The user asks to prepare or review documentation before committing
- The user wants to ensure documentation is up to date prior to version control

Primary objective: **no commit without correct documentation**.

---

## Inputs & Sources of Truth

Use the following as the authoritative source of change:

- `git diff --staged` → primary source (changes about to be committed)
- `git diff` → only if explicitly requested by the user

Never infer changes from memory or assumptions—**only from diffs**.

---

## Execution Workflow

### Step 1: Analyze the Change Set

From the diff, classify changes into one or more of the following:

- **New Feature**
  - New modules, services, endpoints, configs, UI elements, or capabilities
- **Bug Fix**
  - Corrected behavior, logic errors, crashes, or incorrect outputs
- **Refactor**
  - Renames, file moves, or structural changes without behavior change
- **Removal / Deprecation**
  - Deleted features, APIs, flags, or obsolete workflows

Extract:

- What changed
- Where it changed
- How it affects users, developers, or system operation

---

### Step 2: Update `README.md` (MANDATORY SOP)

**Location:** `README.md` (repository root)

#### Role of README.md

README.md is **not a marketing summary**.  
It must function as a **complete operational SOP** that a future developer can follow **from zero to running system** without external explanation.

#### Creation Rules

- If the file does not exist, create it.
- If it exists, update all impacted sections.
- Never assume prior knowledge of the project.

#### Required Sections (Enforced)

README.md MUST include and maintain:

1. **Project Overview**
   - What the system does
   - Who it is for (developers / operators)

2. **Prerequisites**
   - Required tools (e.g. Docker, Docker Compose, Node, Python, Make, etc.)
   - Minimum versions if relevant

3. **Environment Setup**
   - Required environment variables
   - `.env` files (what exists, what is required, examples)
   - Secrets or credentials needed (without exposing values)

4. **How to Run the Application (Local)**
   - Step-by-step commands
   - Clear ordering
   - Expected outcome per step (what “success” looks like)

5. **How to Run the Application (Docker / Containerized)**
   - Docker build & run commands
   - Docker Compose usage if applicable
   - Ports, volumes, networks explained briefly

6. **Configuration & Runtime Behavior**
   - Important flags, configs, or modes
   - Anything that materially affects runtime behavior

7. **Common Changes Introduced by This Commit**
   - New setup steps added
   - Removed or changed commands
   - Migration or breaking changes (if any)

#### Constraints

- Step-by-step, copy-paste friendly
- Clear ordering (no missing steps)
- No architectural deep dives
- Remove or rewrite anything that is no longer true

README.md must be **sufficient as a standalone SOP**.

---

### Step 3: Update `project_architecture.md`

**Location:** `.cursor/project_architecture.md`

#### Creation Rules

- Create `.cursor/` if missing
- Create `project_architecture.md` if missing

#### Required Sections

- **Overview**
  - High-level system description, updated to include new or modified components
- **Components / Modules**
  - Add new files, services, or layers
  - Update responsibilities of modified components
- **Data Flow / APIs**
  - Document new or changed endpoints, events, pipelines, or integrations
- **Deprecated / Removed**
  - Explicitly list removed or obsolete components (or fully delete them if no longer relevant)

#### Constraints

- Architecture-level detail only
- Clear, structured, agent-readable
- No setup instructions or tutorials

---

### Step 4: Validation Rules (Strict)

- ❌ Do NOT change code
- ❌ Do NOT create, amend, or execute commits
- ❌ Do NOT invent features, fixes, or future plans
- ❌ Do NOT allow the commit to proceed with incomplete SOP documentation

Documentation must reflect **exactly what the staged diff proves**.

---

## Quality Checklist

Before allowing the commit, verify:

- [ ] Changes were derived strictly from `git diff --staged`
- [ ] README.md can be followed end-to-end by a new developer
- [ ] Docker and local run paths are documented if applicable
- [ ] Environment setup is explicit and complete
- [ ] project_architecture.md reflects current structure and flow
- [ ] No outdated, misleading, or speculative content remains

---

## File Reference

| Document     | Path                              |
| ------------ | --------------------------------- |
| README       | `README.md`                       |
| Architecture | `.cursor/project_architecture.md` |

---

## Expected Outcome

After running this skill:

- Documentation is **accurate, complete, and commit-ready**
- README.md acts as a **living SOP**, not a summary
- Commits never introduce documentation debt
- Future developers can onboard and run the system without tribal knowledge

# Contribute Text2SQL to OpenClaw Upstream — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Open a PR from your fork to `openclaw/openclaw` with only the text2sql skill changes, passing CI expectations and the contributing guidelines (gate, focused PR, AI-assisted disclosure).

**Architecture:** Add the upstream repo as a remote, create a branch from `upstream/main`, bring in only the text2sql-related commits (via cherry-pick or patch), run the full gate, push the branch to your fork, then open a PR with base = openclaw/openclaw `main` and head = your fork’s branch. No code changes—only contribution workflow.

**Tech Stack:** Git (remotes, branches, cherry-pick/patch), pnpm (build/check/test), GitHub PR (openclaw/openclaw).

---

## Task 1: Add upstream remote and fetch

**Files:**

- No file edits; repo root only.

**Step 1: List current remotes**

Run:

```bash
git remote -v
```

Expected: `origin` points to `bakwankawa/openclaw`. There may be no `upstream` yet.

**Step 2: Add upstream if missing**

Run:

```bash
git remote add upstream https://github.com/openclaw/openclaw.git
```

If you see "remote upstream already exists", skip this step.

**Step 3: Fetch upstream**

Run:

```bash
git fetch upstream
```

Expected: Objects and refs for `upstream/main` (and others) are fetched.

**Step 4: Verify**

Run:

```bash
git branch -r | grep upstream
```

Expected: At least `remotes/upstream/main`.

---

## Task 2: Create contribution branch from upstream/main

**Files:**

- No file edits; repo root only.

**Step 1: Ensure working tree is clean**

Run:

```bash
git status
```

If you have uncommitted changes, either commit them on the current branch or stash (only if you intend to contribute only text2sql from a clean branch).

**Step 2: Create branch from upstream/main**

Run:

```bash
git checkout -b contribute/text2sql-upstream upstream/main
```

Expected: New branch `contribute/text2sql-upstream` checked out, tracking no remote yet; tree matches `upstream/main`.

**Step 3: Confirm you are behind upstream and have no text2sql yet**

Run:

```bash
ls skills/text2sql 2>/dev/null || echo "No text2sql dir"
```

Expected: Either "No text2sql dir" or an empty/old state—text2sql from your fork is not on this branch yet.

---

## Task 3: Bring text2sql changes onto the contribution branch

**Files:**

- Will add/modify: `skills/text2sql/`, `package.json`, `pnpm-lock.yaml`, `vitest.unit.config.ts`, root `README.md` (only if your text2sql PR touched it).

**Option A — Cherry-pick (if you have the commit hashes from your fork)**

**Step 1: Find text2sql commits on your fork’s main**

From your fork (e.g. with `origin` = bakwankawa/openclaw), run:

```bash
git fetch origin
git log origin/main --oneline -20 -- skills/ package.json vitest.unit.config.ts README.md
```

Note the hashes of commits that are only for text2sql (e.g. "feat(text2sql):...", "fix(text2sql):...", "docs: ..." for text2sql).

**Step 2: Cherry-pick in order**

Run (replace with your hashes):

```bash
git cherry-pick <hash1> <hash2> <hash3>
```

Resolve any conflicts if prompted; then `git add` and `git cherry-pick --continue`. Repeat until all text2sql commits are applied.

**Option B — Patch from fork (if cherry-pick is messy)**

**Step 1: Generate patch on a branch that has text2sql**

Switch to a branch that has text2sql (e.g. your fork’s main or feat/text2sql-skill). Ensure `upstream` is fetched. Then, from repo root:

```bash
git fetch origin
git fetch upstream
git diff upstream/main origin/main -- skills/ package.json pnpm-lock.yaml vitest.unit.config.ts README.md > /tmp/text2sql.patch
```

**Step 2: Apply patch on contribution branch**

Switch back to the contribution branch:

```bash
git checkout contribute/text2sql-upstream
git apply /tmp/text2sql.patch
```

If `git apply` reports errors (e.g. already applied or context mismatch), try:

```bash
git apply --3way /tmp/text2sql.patch
```

Resolve conflicts, then `git add` the resolved files.

**Step 3: Stage and commit**

Run:

```bash
git add skills/text2sql package.json pnpm-lock.yaml vitest.unit.config.ts README.md
git status
git commit -m "feat(text2sql): skill for read-only natural-language SQL over PostgreSQL"
```

Use a single commit message summarizing the feature, or keep multiple commits if you prefer a detailed history.

**Step 4: Verify tree**

Run:

```bash
ls skills/text2sql/scripts/query.ts skills/text2sql/SKILL.md
```

Expected: Files exist and contain the text2sql implementation.

---

## Task 4: Run the gate (build, check, test)

**Files:**

- No edits; verification only.

**Step 1: Install dependencies**

Run:

```bash
pnpm install
```

Expected: Install completes without errors.

**Step 2: Build**

Run:

```bash
pnpm build
```

Expected: Build succeeds (no TypeScript or build errors).

**Step 3: Lint and format**

Run:

```bash
pnpm check
```

Expected: Lint and format checks pass. If only unrelated files (e.g. under `.cursor/`) fail format, you can still proceed; ensure `skills/text2sql/` and any changed root files pass.

**Step 4: Tests**

Run:

```bash
pnpm test
```

Expected: All tests pass (or only known flaky/unrelated failures). At minimum, text2sql tests must pass:

```bash
pnpm exec vitest run skills/text2sql/scripts/query.test.ts skills/text2sql/scripts/readonly-validator.test.ts --config vitest.unit.config.ts
```

Expected: All listed tests pass.

**Step 5: Commit any gate fixes (if you had to fix anything)**

If you changed code or config to pass the gate:

```bash
git add -A
git commit -m "fix: address gate (build/check/test)"
```

---

## Task 5: Push branch to your fork and open PR

**Files:**

- No local file edits; GitHub PR description is filled in the browser.

**Step 1: Push contribution branch to origin**

Run:

```bash
git push -u origin contribute/text2sql-upstream
```

Expected: Branch exists on `bakwankawa/openclaw` as `contribute/text2sql-upstream`.

**Step 2: Open PR on GitHub**

1. Go to: https://github.com/openclaw/openclaw/compare
2. Set **base repository** to `openclaw/openclaw`, **base** to `main`.
3. Set **head repository** to `bakwankawa/openclaw`, **compare** to `contribute/text2sql-upstream`.
4. Click "Create pull request".

**Step 3: Fill PR title**

Use:

```
feat(text2sql): skill for read-only natural-language SQL over PostgreSQL [AI-assisted]
```

**Step 4: Fill PR description**

Include:

- **What:** Adds the text2sql skill under `skills/text2sql/`: read-only natural-language SQL over PostgreSQL (SKILL.md, README.md, scripts/query.ts, readonly-validator, tests).
- **Why:** Lets agents answer data questions via the database without write access; credentials in OpenClaw config.
- **Testing:** Unit tests for validator and query script; run with `pnpm test` (or vitest on `skills/text2sql/scripts/*.test.ts`).

Then add the AI-assisted checklist (from contributing guidelines):

- [ ] Mark as AI-assisted in the PR title or description — **done in title**
- [ ] Note the degree of testing: **fully tested** (unit tests + local)
- [ ] Include prompts or session logs if possible (e.g. link to Cursor plan or paste summary)
- [ ] Confirm you understand what the code does

**Step 5: Create the PR**

Click "Create pull request". Ensure the PR is from `bakwankawa/openclaw:contribute/text2sql-upstream` into `openclaw/openclaw:main`.

---

## Task 6: Post-submission (optional)

- Respond to review comments on the PR.
- If maintainers ask for changes, make commits on `contribute/text2sql-upstream`, then push; the PR will update.
- After merge, you can delete the branch locally and on the fork, and pull `upstream/main` into your local `main` if desired.

---

## Summary checklist

- [ ] Task 1: Upstream remote added and fetched
- [ ] Task 2: Branch `contribute/text2sql-upstream` created from `upstream/main`
- [ ] Task 3: Text2sql changes applied (cherry-pick or patch) and committed
- [ ] Task 4: `pnpm build && pnpm check && pnpm test` pass
- [ ] Task 5: Branch pushed to fork; PR opened to openclaw/openclaw with title and description above
- [ ] Task 6: (Optional) Follow up on review

---

**Execution handoff**

Plan saved to `.cursor/plans/2026-02-06-contribute-text2sql-upstream.md`.

**Two execution options:**

1. **Subagent-Driven (this session)** — I run the steps in this session (remotes, branch, patch/cherry-pick, gate, push). You open the PR in the browser and paste the description. Best if you want to stay in one chat.

2. **Parallel Session (separate)** — You open a new Cursor session (or worktree), attach the executing-plans skill, and point it at this plan file for batch execution with checkpoints. Best if you want strict task-by-task review elsewhere.

Which approach do you want?

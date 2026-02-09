---
name: dual-remote-push
description: Pushes the current branch to both remotes (upstream corporate and origin internal) so GitHub activity appears on the user's repo. Use only when the user explicitly asks to push to both remotes, sync to both repos, or invokes this dual-remote push workflow.
---

# Dual-Remote Push

Use this skill **only when the user explicitly asks** to push to both remotes (e.g. "push ke keduanya", "push both", "sync ke kedua remote"). Do not run automatically on every push.

## Purpose

- Work in a **corporate private repo** (primary).
- Keep a **clone in the user's internal/personal repo** so their GitHub shows activity.
- **Two remotes**: `upstream` = corporate (default), `origin` = internal.
- On demand: push the same branch to **both** remotes.

## One-Time Setup (if not already done)

In the repo:

```bash
# Corporate repo is already the default (e.g. cloned from corporate)
git remote -v
# If "origin" points to corporate, rename it to upstream and add internal as origin:

git remote rename origin upstream
git remote add origin <URL-repo-internal-user>
```

If the repo was cloned from corporate and you want to keep corporate as default:

- `upstream` → corporate repo
- `origin` → user's internal repo

Ensure default push/pull stays with corporate (e.g. `git config branch.<branch>.remote upstream` if needed).

## When User Asks to Push to Both

1. Confirm current branch (e.g. `main` or `feature/xyz`).
2. Push to **upstream** (corporate) first:
   ```bash
   git push upstream <branch>
   ```
3. Push to **origin** (internal) second:
   ```bash
   git push origin <branch>
   ```
4. If both use the same branch name (e.g. `main`):
   ```bash
   git push upstream <branch> && git push origin <branch>
   ```

## Rules

- **Only run when invoked.** Do not suggest or run this on every "git push" unless the user asked for "push ke keduanya" or equivalent.
- **Default remote** for normal work remains corporate (upstream).
- If push to one remote fails, report the error and do not push to the other until the user fixes it (e.g. permissions, branch protection).

## Checklist (when running)

- [ ] User explicitly asked to push to both remotes
- [ ] Current branch identified
- [ ] Pushed to upstream (corporate)
- [ ] Pushed to origin (internal)

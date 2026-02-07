---
id: IRCL-0002
title: "Self-modifying agent can push to its own codebase"
severity: Critical
status: Mitigated
date_reported: 2026-02-07
date_mitigated: 2026-02-07
affected_components:
  - .github/CODEOWNERS
  - GitHub branch protection rules (external)
mitigating_changes:
  - .github/CODEOWNERS
  - GitHub repository settings (branch protection)
---

# IRCL-0002: Self-Modifying Agent Can Push to Its Own Codebase

## Summary

The bot has write access to the repository containing its own source code. While this
enables powerful self-improvement workflows (the agent can fix bugs, add features, and
refactor itself on behalf of the user), it also means the agent could theoretically
modify its own safety constraints, directives, or security enforcement code.

## Threat Description

### Attack Vector

The agent has Git credentials that allow pushing to the `ironclaw` repository. Without
branch protection, it could:

1. Modify its own denylist defaults to remove patterns
2. Alter directive enforcement logic
3. Push directly to `main` without human review
4. Bypass its own safety constraints by modifying the code that enforces them

### Root Cause

The agent's utility (self-improvement) and its risk (self-modification) share the same
mechanism: write access to its own codebase.

### Impact

- **Severity**: Critical
- **Exploitability**: Requires the agent to "decide" to bypass its constraints, which is
  currently prevented by prompt-level directives — but prompt-level directives are not
  architecturally enforced
- **Blast radius**: Complete compromise of all safety guarantees if the agent modifies
  its own enforcement code

## Mitigation

### Layer 1: Software Gate (IRCL-0001)

The exec denylist blocks `git push` at the tool level, forcing approval before any push.

### Layer 2: Platform Gate (this advisory)

Even if the software gate is somehow bypassed:

1. **CODEOWNERS** — `@josgraha` is the required reviewer for all files (`*`)
2. **Branch protection on `main`**:
   - Require pull request reviews before merging
   - Require review from CODEOWNERS
   - Do not allow bypassing the above settings (only CODEOWNERS can bypass)
   - Require status checks to pass before merging

The agent can create branches and open PRs, but it **cannot merge** without the human
owner's approval. The human owner (`josgraha`) uses separate GitHub credentials that the
agent does not have access to.

### Defense in Depth

```
Agent wants to push code
    ↓
Layer 1: Denylist blocks "git push" → approval prompt
    ↓ (if approved or bypassed)
Layer 2: GitHub rejects direct push to main → must create PR
    ↓
Layer 3: CODEOWNERS requires @josgraha review → human reviews diff
    ↓
Layer 4: Only CODEOWNERS can merge → agent cannot self-approve
```

## GitHub Branch Protection Setup

> [!IMPORTANT]
> These settings must be configured manually in the GitHub repository settings.
> Navigate to: **Settings → Branches → Branch protection rules → Add rule**

### Required settings for `main`:

- **Branch name pattern**: `main`
- [x] Require a pull request before merging
  - [x] Require approvals (1)
  - [x] Require review from Code Owners
- [x] Require status checks to pass before merging
- [x] Do not allow bypassing the above settings
  - Exception: only repository admins (josgraha) can bypass
- [ ] Allow force pushes → **OFF**
- [ ] Allow deletions → **OFF**

## Alignment with Shogun Principle

> _The agent proposes, the human disposes._

This mitigation separates the agent's ability to **do work** (create branches, write code,
open PRs) from the ability to **publish work** (merge to main, push to production). The
agent retains its self-improvement capability — it can still modify its own code and
propose changes — but every modification passes through human review before taking effect.

## Residual Risk

- The agent could push to non-protected branches (mitigated: denylist still fires)
- The agent could create PRs with misleading descriptions (mitigated: CODEOWNERS reviews the diff)
- Branch protection rules are configured in GitHub UI, not in code (cannot be version-controlled)
- A compromised GitHub admin account would bypass all protections

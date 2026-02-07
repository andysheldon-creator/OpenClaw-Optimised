---
id: IRCL-0001
title: "Exec allowlist bypass via subcommand"
severity: High
status: Mitigated
date_reported: 2026-02-07
date_mitigated: 2026-02-07
affected_components:
  - src/infra/exec-approvals.ts
  - src/agents/bash-tools.exec.ts
mitigating_changes:
  - src/infra/exec-approvals.ts (evaluateDenylist, DEFAULT_DENYLIST)
  - src/agents/bash-tools.exec.ts (denylist integration)
  - docs/tools/exec-denylist.md
---

# IRCL-0001: Exec Allowlist Bypass via Subcommand

## Summary

When a binary (e.g. `git`) is added to the exec allowlist, **all subcommands** of that
binary execute without approval — including destructive or externally-facing operations
like `git push --force`. This violates the Shogun Principle: the agent acted on an external
system without the user's explicit blessing.

## Threat Description

### Attack Vector

The exec approval system evaluates allowlists at the **binary level**. Once `/usr/bin/git`
is allowlisted, any command starting with `git` passes the allowlist check silently:

```
git status       ✅ (safe, local)
git diff         ✅ (safe, local)
git push --force ✅ (DANGEROUS — pushes to remote without asking)
```

### Root Cause

The `evaluateExecAllowlist()` function matches the resolved binary path against allowlist
patterns. It has no concept of subcommands — `git` is `git`, regardless of whether the
operation is a local read (`status`) or an external write (`push`).

### Impact

- **Severity**: High
- **Exploitability**: Trivial — agent simply runs `git push` and the allowlist auto-approves
- **Blast radius**: Commits pushed to remote repositories without review, packages published
  to registries, data exfiltrated via HTTP POST, databases dropped

### Observed Incident

The bot pushed commits to a repository without explicit user approval. The `git` binary was
allowlisted for routine operations (`status`, `diff`, `log`), which inadvertently permitted
`git push` to execute without triggering an approval prompt.

## Mitigation

### Approach: Pre-allowlist Denylist

A new **denylist evaluation** fires before the allowlist check. If any command segment
matches a denylist pattern, `ask` is forced to `always` — requiring explicit user approval
regardless of allowlist status.

### Implementation

```
Command → Denylist check → Allowlist check → Approval decision
              ↓ (if match)
         ask = "always"
         warning injected into approval prompt
```

### Default Denylist Patterns

| Pattern        | Mode       | Category        |
| -------------- | ---------- | --------------- |
| `git push`     | subcommand | External system |
| `npm publish`  | subcommand | External system |
| `yarn publish` | subcommand | External system |
| `pnpm publish` | subcommand | External system |
| `curl -X POST` | subcommand | External system |
| `curl -X PUT`  | subcommand | External system |
| `curl --data`  | subcommand | External system |
| `curl -d `     | subcommand | External system |
| `dropdb`       | binary     | Destructive     |
| `rm -rf /`     | subcommand | Destructive     |

### Match Modes

- **subcommand**: Binary + argument tokens (e.g. `git push` matches `git push origin main`)
- **binary**: Executable name only (e.g. `dropdb` matches `dropdb production`)
- **regex**: Full command string regex (for custom patterns)

### Chained Command Handling

Commands chained with `&&`, `||`, `;`, or `|` are split and each segment is checked
independently. A single denylist match flags the entire command.

## Verification

- **TypeScript compilation**: Clean
- **Unit tests**: 18 new tests, all 66 pass
- **Coverage**: Simple matches, non-matches, chained commands, piped commands, full-path
  binaries, case insensitivity, regex mode, custom entries, empty denylist, deduplication

## Alignment with Shogun Principle

> _The agent's power is constrained by duty. External actions require explicit blessing._

This mitigation enforces the principle architecturally. No amount of prompt engineering can
override the denylist — the code itself prevents the agent from acting on external systems
without the user's knowledge and consent. The allowlist remains useful for routine local
operations, while the denylist provides a hard gate for actions that cross the boundary
between the agent's workspace and the outside world.

## Residual Risk

- Commands not in the default denylist may still bypass (e.g. `scp`, `rsync`, `docker push`)
- The denylist is configurable — an operator could disable it
- Shell escaping tricks might evade simple tokenization (mitigated by conservative parsing)
- **Future work**: Subcommand-aware allowlist (Layer 2), diagnostics logging (Layer 3)

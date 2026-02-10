---
title: CI Pipeline
description: How the OpenClaw CI pipeline works and why jobs are ordered the way they are. Latest changes: Feb 09, 2026
---

# CI Pipeline

The CI runs on every push to `main` and every pull request. It uses smart scoping to skip expensive jobs when only docs or native code changed.

## Job Overview

| Job               | Purpose                                         | When it runs              |
| ----------------- | ----------------------------------------------- | ------------------------- |
| `docs-scope`      | Detect docs-only changes                        | Always                    |
| `changed-scope`   | Detect which areas changed (node/macos/android) | Non-docs PRs              |
| `check`           | TypeScript types, lint, format                  | Non-docs changes          |
| `check-docs`      | Markdown lint + broken link check               | Docs changed              |
| `code-analysis`   | LOC threshold check (1000 lines)                | PRs only                  |
| `secrets`         | Detect leaked secrets                           | Always                    |
| `build-artifacts` | Build dist once, share with other jobs          | Non-docs, node changes    |
| `release-check`   | Validate npm pack contents                      | After build               |
| `checks`          | Node/Bun tests + protocol check                 | Non-docs, node changes    |
| `checks-windows`  | Windows-specific tests                          | Non-docs, node changes    |
| `macos`           | Swift lint/build/test + TS tests                | PRs with macos changes    |
| `android`         | Gradle build + tests                            | Non-docs, android changes |

## Code-Size Gate

The `code-size` job runs `scripts/analyze_code_files.py` on PRs to catch:

1. **Threshold crossings** — files that grew past 1000 lines in the PR
2. **Already-large files growing** — files already over 1000 lines that got bigger
3. **Duplicate function regressions** — new duplicate functions introduced by the PR

When `--strict` is set, any violation fails the job and blocks all downstream
work. On push to `main`, the code-size steps are skipped (the job passes as a
no-op) so pushes still run the full test suite.

### Excluded Directories

The analysis skips: `node_modules`, `dist`, `vendor`, `.git`, `coverage`,
`Swabble`, `skills`, `.pi` and other non-source directories. See the
`SKIP_DIRS` set in `scripts/analyze_code_files.py` for the full list.

## Fail-Fast Behavior

**Bad PR (formatting violations):**

- `check-format` fails at ~43 s
- `check-lint`, `code-size`, and all downstream jobs never start
- Total cost: ~1 runner-minute

**Bad PR (lint or LOC violations, good format):**

- `check-format` passes → `check-lint` and `code-size` run in parallel
- One or both fail → all downstream jobs skipped
- Total cost: ~3 runner-minutes

**Good PR:**

- Critical path: `check-format` (43 s) → `check-lint` (1m 46 s) → `build-artifacts` → `checks`
- `code-size` runs in parallel with `check-lint`, adding no latency

## Composite Action

The `setup-node-env` composite action (`.github/actions/setup-node-env/`)
handles the shared setup boilerplate:

- Submodule checkout with retry (5 attempts)
- Node.js 22 setup
- pnpm via corepack + store cache
- Optional Bun install
- `pnpm install` with retry

This eliminates ~40 lines of duplicated YAML per job.

## Push vs PR Behavior

| Trigger        | `code-size`                   | Downstream jobs       |
| -------------- | ----------------------------- | --------------------- |
| Push to `main` | Steps skipped (job passes)    | Run normally          |
| Pull request   | Full analysis with `--strict` | Blocked on violations |

## Runners

| Runner                          | Jobs                          |
| ------------------------------- | ----------------------------- |
| `blacksmith-4vcpu-ubuntu-2404`  | Most Linux jobs               |
| `blacksmith-4vcpu-windows-2025` | `checks-windows`              |
| `macos-latest`                  | `macos`, `ios`                |
| `ubuntu-latest`                 | Scope detection (lightweight) |

## Local Equivalents

```bash
pnpm check          # types + lint + format
pnpm test           # vitest tests
pnpm check:docs     # docs format + lint + broken links
pnpm release:check  # validate npm pack
```

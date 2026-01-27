# Agent Definitions (Spec)

Reference: Issue #2

## Agent Taxonomy

- Coding: implement features, fix bugs, refactor, add tests.
- Review: review PRs/changes for correctness, risk, and test coverage.
- Release: ship, tag, and publish; manage versioning and changelog.
- Ops: runtime operations, environments, deployment, and incident handling.
- Docs: write/update documentation and examples.

## Role Definitions

### Coding

Responsibilities
- Implement requested changes with minimal scope creep.
- Maintain tests and update coverage when logic changes.
- Keep dependencies and architecture aligned with repo conventions.

Allowed tools
- Read/search: rg, cat, ls.
- Edit: apply_patch, small file edits via shell redirection.
- Build/test: pnpm, bun, vitest, lint/format commands.

Guardrails
- Avoid destructive commands unless explicitly requested.
- Do not modify .env* files unless asked.
- Do not edit node_modules or vendor artifacts by hand.
- Do not switch branches or use git stash unless explicitly requested.

Handoff signals
- Requirements unclear or conflicting.
- Requires data/credentials/env access not available.
- Needs approval for patching dependencies or release steps.

### Review

Responsibilities
- Identify bugs, regressions, missing tests, and risky behavior.
- Provide clear, ordered findings with file references.

Allowed tools
- Read/search: rg, cat, ls.
- Git: git status/log/show, gh pr view/diff (no branch changes).

Guardrails
- Do not change code or switch branches during review mode.
- If local state is dirty or ahead, stop and alert before reviewing.

Handoff signals
- Missing context (specs/tests) required to validate behavior.
- Cannot access PR metadata or diffs.

### Release

Responsibilities
- Prepare release notes, versioning, and publish artifacts.
- Follow documented release checklist(s).

Allowed tools
- Read/search: rg, cat.
- Build/test: pnpm lint/build/test.
- Release: approved publish commands only.

Guardrails
- Never change versions or publish without explicit operator consent.
- Follow release docs before any release work.

Handoff signals
- Missing credentials or required release checklist steps.
- Unclear versioning or changelog expectations.

### Ops

Responsibilities
- Maintain runtime systems, verify services, and triage incidents.
- Apply approved configuration changes and validate status.

Allowed tools
- Shell: ssh, system service checks, log utilities, status probes.
- Repo tools: clawdbot CLI for status/diagnostics.

Guardrails
- Avoid ad-hoc long-running background processes without approval.
- On macOS, start/stop gateway via app or documented script.

Handoff signals
- Needs access/permissions to hosts or secrets.
- Operational action could be destructive or disruptive.

### Docs

Responsibilities
- Update and maintain docs with correct links and examples.
- Ensure documentation reflects actual behavior and configuration.

Allowed tools
- Read/search: rg, cat.
- Edit: apply_patch or minimal file edits.

Guardrails
- Use placeholder values; never include real tokens/phones/hosts.
- Follow Mintlify link conventions and README absolute URLs.

Handoff signals
- Docs rely on unstated product behavior or unpublished changes.

## Workflow Quickstart

- Clarify intent and success criteria before making changes.
- Identify role: Coding, Review, Release, Ops, or Docs.
- Gather context (rg/cat) and confirm constraints.
- Execute minimal changes; keep scope tight.
- Run tests when logic changes; note if skipped and why.
- Report results with file references and next-step options.

Review mode
- Use gh pr view/diff only; do not switch branches or edit code.

Release mode
- Read release docs first; wait for explicit operator approval to publish.

## Tooling Policy

- Prefer rg for search and apply_patch for small edits.
- Use pnpm/bun for installs and scripts; keep lockfiles in sync.
- Do not read or modify .env* files unless explicitly requested.
- Avoid direct edits to generated outputs (dist, bundles, node_modules).
- Use non-destructive commands by default; ask before risky actions.

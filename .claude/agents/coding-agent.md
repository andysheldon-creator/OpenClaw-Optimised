# Coding Agent

Role
- Implement features, fix bugs, refactor, add tests.

Responsibilities
- Implement requested changes with minimal scope creep.
- Maintain tests and update coverage when logic changes.
- Keep dependencies and architecture aligned with repo conventions.

Allowed Tools
- Read/search: rg, cat, ls.
- Edit: apply_patch, small file edits via shell redirection.
- Build/test: pnpm, bun, vitest, lint/format commands.

Guardrails
- Avoid destructive commands unless explicitly requested.
- Do not modify .env* files unless asked.
- Do not edit node_modules or vendor artifacts by hand.
- Do not switch branches or use git stash unless explicitly requested.

Handoff Signals
- Requirements unclear or conflicting.
- Requires data/credentials/env access not available.
- Needs approval for patching dependencies or release steps.

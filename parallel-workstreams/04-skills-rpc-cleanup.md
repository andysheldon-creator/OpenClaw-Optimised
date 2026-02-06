# Workstream D: Remove invalid Skills RPCs (`skills.uninstall`, `skills.reload`)

## Executive summary

The web UI includes API adapters for `skills.uninstall` and `skills.reload`, but those RPCs do not exist on the gateway. This leads to UI actions failing at runtime and should be cleaned up or hidden until the gateway supports them. The most direct fix is to remove the adapters (or make them no-ops) and ensure any UI that calls them is disabled.

## Problem statement

- `apps/web/src/lib/api/skills.ts` defines `uninstallSkill()` and `reloadSkills()` and calls `skills.uninstall`/`skills.reload` respectively, which are not supported RPCs.
- Current supported RPCs are `skills.status`, `skills.install`, and `skills.update` (per existing adapter usage).

## Target outcome

- Remove or disable the invalid adapters.
- If any UI relies on them, either hide the actions or leave TODOs indicating missing gateway support.

## Key reference

- `apps/web/src/lib/api/skills.ts` currently defines `uninstallSkill` and `reloadSkills` with unsupported RPC names.【F:apps/web/src/lib/api/skills.ts†L88-L124】

## Scope & rationale

### Must change

- Delete `uninstallSkill()` and `reloadSkills()` or refactor them to safe placeholders (e.g., throw a clear error).
- Search for any callers of these functions and update UI accordingly (disable buttons or remove actions).

### Should not change

- Supported RPC adapters (`skills.status`, `skills.install`, `skills.update`).
- Agent-specific allowlist logic outside of the global skills management context.

## Proposed implementation sketch

Option A (remove entirely):

```ts
// Remove uninstallSkill + reloadSkills exports
// Update any import sites to stop referencing these functions.
```

Option B (explicit unsupported error):

```ts
export async function uninstallSkill(): Promise<never> {
  throw new Error("skills.uninstall is not supported by the gateway");
}
```

## Validation ideas

- Build the UI and ensure there are no import errors.
- Verify skill-related pages continue to work with supported RPCs.

## Notes for the agent

- Prefer removal over stubs unless the UI already references these actions; then decide if hiding the action or presenting a clear error is better.
- Keep changes localized to `apps/web/src/lib/api/skills.ts` and any direct UI usage.

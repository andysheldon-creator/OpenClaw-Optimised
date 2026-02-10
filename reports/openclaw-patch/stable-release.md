# Stable Release Report (safe_call hardening)

## Scope

- Repo: `/Users/programcaicai/clawd/projects/openclaw`
- Branch: `fix/compact-content-normalize`
- OpenClaw commit: `dfc08d922` (`fix(tools): harden safe_call based on code review feedback`)

## Fixes Delivered

1. Prototype pollution defense in `safe_call` field paths:
   - Rejects dangerous path segments: `__proto__`, `constructor`, `prototype`
   - Uses `Object.create(null)` for constructed field-projection containers
   - Uses `Object.hasOwn(...)` in nested path reads
2. Parameter passthrough safety boundary:
   - Added explicit boundary comment
   - Added optional target-tool policy support via `safeCall.allowWrapping` and `safeCall.allowedParams`
3. Array pagination performance:
   - Paginates array first, then applies field projection only to the page window
   - Preserves `totalItems` from the original full array
4. Text pagination memory behavior:
   - Replaced full `split` materialization with newline index scanning
5. `session_compact` async structure and error handling:
   - Extracted core fire-and-forget logic into named `runScheduledCompaction(...)`
   - Added centralized unknown-error formatting and cleanup in promise chain
6. `extractPayload` null handling:
   - `details: null` no longer short-circuits payload extraction
7. Field metadata consistency:
   - Returns normalized effective field list in response metadata
8. Unicode truncation edge safety:
   - Added UTF-16-safe tail slicing to avoid surrogate pair boundary breaks

## Tests

Executed in `/Users/programcaicai/clawd/projects/openclaw`:

1. `npx vitest run src/agents/tools/safe-call-tool.test.ts`
   - Result: 1 file passed, 9 tests passed

2. `npx vitest run src/agents/tools/safe-call-tool.test.ts src/agents/openclaw-tools.sessions.test.ts`
   - Result: 2 files passed, 19 tests passed

## Added Test Coverage

- Reject prototype-pollution field paths
- Verify array projection happens after pagination windowing
- Verify `details: null` falls back to content extraction
- Verify tiny `maxChars` behavior
- Verify no dangling surrogate output after truncation

## Patch Repo Update

- Patch repo path: `/Users/programcaicai/clawd/tmp/openclaw-patch-clean-8fi88Y`
- Patch regeneration command run:
  - `git format-patch main..fix/compact-content-normalize -o /Users/programcaicai/clawd/tmp/openclaw-patch-clean-8fi88Y`
- Patch repo commit: `d872371` (`chore: refresh patch bundle for safe_call stable release`)
- Pushed to: `ProgramCaiCai/openclaw-patch` (`main`)

## Release

- Tag/Release: `v1.0.0`
- URL: https://github.com/ProgramCaiCai/openclaw-patch/releases/tag/v1.0.0

## Notes

- Push to `openclaw/openclaw` remote branch failed due permission (`403`), so OpenClaw changes are committed locally on `fix/compact-content-normalize`.

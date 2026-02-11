# Relay Fix Pack (PR-ready, no PR opened)

Date: 2026-02-11
Repo: `/Users/soumikbhatta/Projects/openclaw`
Scope: extension relay fallback hardening (`pw-session` + `agent.snapshot`)

## 1) Upstream equivalence check (required)

Checked `upstream/main` (`openclaw/openclaw`) at:

- `4200782a5` (`fix(heartbeat): honor heartbeat.model config...`)

Verification performed:

- `git fetch upstream`
- Inspected `upstream/main:src/browser/pw-session.ts`
- Inspected `upstream/main:src/browser/routes/agent.snapshot.ts`
- Searched upstream history for related markers (`Target.attachToBrowserTarget`, `/json/list`, extension relay page selection, snapshot fallback)

Result:

- **No equivalent full fix found upstream** for this exact fallback set.
- Upstream has earlier relay-hardening commits, but **does not include** this combined behavior:
  - single-page fast-path to avoid CDP attach probes,
  - robust `/json/list` helper + ordered mapping fallback for page lookup/list/create,
  - snapshot route preferring direct relay CDP (`tab.wsUrl`) before Playwright fallback in extension profile.

## 2) Clean diff summary

Working tree changes:

- `M src/browser/pw-session.ts`
- `M src/browser/routes/agent.snapshot.ts`
- `M src/browser/pw-session.get-page-for-targetid.extension-fallback.test.ts`
- `?? src/browser/pw-session.list-pages.extension-fallback.test.ts`

### Functional changes

#### A) `src/browser/pw-session.ts`

1. Added reusable relay target helpers:
   - `cdpBaseHttpUrl(cdpUrl)`
   - `fetchJsonListTargets(cdpUrl)`
   - `mapPageByTargetOrder(pages, targets, targetId)`

2. Hardened `findPageByTargetId(...)` fallback logic when CDP attach is blocked:
   - Uses `/json/list` metadata.
   - Match order:
     1. unique URL match,
     2. URL+title disambiguation,
     3. deterministic ordered mapping fallback.

3. Optimized `getPageForTargetId(...)`:
   - If `targetId` exists but Playwright exposes only one page, return it immediately.
   - Avoids `newCDPSession` attach path in extension relay single-page mode.

4. Hardened `listPagesViaPlaywright(...)`:
   - Existing flow unchanged when target IDs resolve via CDP.
   - New fallback: if no results and pages exist, map pages to `/json/list` by order and emit target IDs/titles/urls.

5. Hardened `createPageViaPlaywright(...)`:
   - Capture `/json/list` before and after `newPage()`.
   - If `pageTargetId()` fails, infer new target via set difference.
   - Final fallback: infer by page index order alignment.

#### B) `src/browser/routes/agent.snapshot.ts`

Adjusted aria snapshot strategy for extension relay:

- For extension driver:
  - If `tab.wsUrl` exists, **prefer** `snapshotAria({ wsUrl })` first.
  - On failure, fallback to `snapshotAriaViaPlaywright(...)`.
- If no `tab.wsUrl`, use existing Playwright fallback path.

Intent:

- Avoid unnecessary dependency on Playwright browser-level CDP attach where relay can deny `Target.attachToBrowserTarget`.

#### C) Tests

1. Updated:

- `src/browser/pw-session.get-page-for-targetid.extension-fallback.test.ts`
  - Explicitly verifies `newCDPSession` is **not called** in single-page fast path.

2. Added:

- `src/browser/pw-session.list-pages.extension-fallback.test.ts`
  - Validates `/json/list` ordered fallback when `newCDPSession` throws `Not allowed`.

## 3) Tests run

Executed successfully:

1. Targeted relay fallback tests:

```bash
pnpm --dir /Users/soumikbhatta/Projects/openclaw exec vitest run \
  src/browser/pw-session.get-page-for-targetid.extension-fallback.test.ts \
  src/browser/pw-session.list-pages.extension-fallback.test.ts
```

Result: **2 files passed, 2 tests passed**.

2. Broader unit coverage for this module:

```bash
pnpm --dir /Users/soumikbhatta/Projects/openclaw exec vitest run src/browser/pw-session.test.ts
```

Result: **1 file passed, 6 tests passed**.

## 4) Repro steps (before) + verify steps (after)

### Repro A: tab resolution fails in extension relay when CDP attach is blocked

Preconditions:

- Use Browser Relay (Chrome extension attached tab).
- Environment where `newCDPSession`/`Target.attachToBrowserTarget` is denied.

Before fix behavior:

- `getPageForTargetId` may fail with `tab not found` even when only one Playwright page exists.

After fix expected:

- Single-page case resolves immediately without CDP attach probe.
- Multi-page case uses `/json/list` fallback mapping and resolves deterministically.

### Repro B: list pages empty target IDs when attach blocked

Before fix behavior:

- `listPagesViaPlaywright` can return empty/incomplete results when `pageTargetId()` fails for all pages.

After fix expected:

- Falls back to `/json/list` ordering and returns populated `targetId/title/url/type` entries.

### Repro C: aria snapshot on extension profile can fail due to Playwright attach path

Before fix behavior:

- For extension profiles, snapshot always routed via Playwright fallback logic, which can depend on blocked attach flows.

After fix expected:

- If `tab.wsUrl` exists, snapshot uses direct relay CDP first.
- If that fails, it gracefully falls back to Playwright path.

## 5) Rollback steps

If regression is observed, rollback safely with one of:

Option 1 (discard local working-tree changes):

```bash
git -C /Users/soumikbhatta/Projects/openclaw restore \
  src/browser/pw-session.ts \
  src/browser/routes/agent.snapshot.ts \
  src/browser/pw-session.get-page-for-targetid.extension-fallback.test.ts
rm -f /Users/soumikbhatta/Projects/openclaw/src/browser/pw-session.list-pages.extension-fallback.test.ts
```

Option 2 (if committed locally later):

```bash
git -C /Users/soumikbhatta/Projects/openclaw revert <commit_sha>
```

## 6) Commit message draft

Suggested conventional commit:

```text
fix(browser): harden extension relay page/snapshot fallback when CDP attach is blocked

- add /json/list helpers for relay target metadata and ordering
- resolve target pages via url/title/order fallback in pw-session
- short-circuit single-page target resolution to avoid newCDPSession attach probes
- add listPagesViaPlaywright /json/list ordered fallback when targetId lookup fails
- harden createPageViaPlaywright targetId inference using before/after /json/list diff
- prefer direct relay ws snapshot for extension driver, fallback to Playwright only on failure
- add/extend tests for single-page fast path and list-pages fallback
```

## 7) PR checklist (ready)

- [x] Equivalent upstream fix checked
- [x] Diff scoped to relay fallback behavior
- [x] Tests added/updated
- [x] Relevant unit tests passing
- [x] Repro + verification steps documented
- [x] Rollback plan documented
- [x] Commit message drafted
- [x] **No PR opened, no push performed**

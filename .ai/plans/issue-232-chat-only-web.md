# Web: add chat-only URL (Issue #232)

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

This ExecPlan was authored following the format and requirements in `~/Developer/Projects/SamApp/.ai/plans/PLANS.md` as it existed on 2026-01-06.

## Purpose / Big Picture

Users who prefer a distraction-free “chat only” experience in the browser can open a dedicated URL that shows only the chat UI, without the Control UI navigation (Overview/Connections/Cron/etc.). This is especially useful when the web UI is used as the primary surface (for example, when the macOS app is unavailable).

After this change, a user can open:

    <control-ui-base>/chat-only

and see a clean, chat-only view (no sidebar, no top bar, no control-panel tabs), while the existing full Control UI remains available at the current URLs (for example, `<control-ui-base>/overview`, `<control-ui-base>/connections`, etc.).

## Progress

- [x] (2026-01-06 08:27Z) Reviewed Issue #232 and current Control UI routing + focus mode.
- [x] (2026-01-06 08:27Z) Confirmed product decisions (URL, navigation guard, “open full UI” link).
- [x] (2026-01-06 08:37Z) Added failing UI browser tests for `/chat-only` routing + chrome hiding + navigation guard.
- [x] (2026-01-06 08:37Z) Implemented `/chat-only` route (stable URL) + in-app navigation guard.
- [x] (2026-01-06 08:37Z) Implemented chat-only chrome (no topbar/sidebar/header) + “Open Control UI” escape hatch.
- [x] (2026-01-06 08:37Z) Updated docs for `/chat-only` usage.
- [x] (2026-01-06 08:37Z) Validated: `pnpm -C ui test` and `pnpm ui:build`.

## Surprises & Discoveries

- Observation: The UI already has a “Focus” mode that hides the top bar, sidebar, and page header when on the Chat tab via CSS (`.shell--chat-focus`).
  Evidence: `ui/src/styles/layout.css` and `ui/src/ui/focus-mode.browser.test.ts`.

- Observation: When the gateway serves the UI at the root (no basePath), the UI infers its basePath from the URL. Unknown paths like `/chat-only` currently cause the basePath inference to incorrectly treat the whole path as the basePath, which would break routing unless `/chat-only` is recognized as a route.
  Evidence: `ui/src/ui/navigation.ts` (`inferBasePathFromPathname`) + `ui/src/ui/app.ts` (`inferBasePath`).

- Observation: UI browser tests require Playwright browsers installed; otherwise `pnpm -C ui test` fails with “Executable doesn't exist … chrome-headless-shell”.
  Evidence: `pnpm -C ui test` suggested running `pnpm -C ui exec playwright install`.

## Decision Log

- Decision: Implement chat-only as `<basePath>/chat-only` (path-based route inside the existing SPA).
  Rationale: Keeps the UX clean (separate URL) without requiring gateway/server changes or a second frontend build/mount.
  Date/Author: 2026-01-06 / User + Codex CLI

- Decision: In chat-only mode, hard-block navigation away from chat and keep the URL stable on `/chat-only`.
  Rationale: Matches “chat-only” intent; prevents accidental exposure of control-panel pages via back/forward or manual clicks.
  Date/Author: 2026-01-06 / User + Codex CLI

- Decision: Provide an explicit “Open full Control UI” link/button from the chat-only view.
  Rationale: Gives an intentional escape hatch to reach settings and control-panel features without relying on the hidden sidebar.
  Date/Author: 2026-01-06 / User + Codex CLI

## Outcomes & Retrospective

Implemented a dedicated `/chat-only` URL for the Control UI that renders a clean, chat-only surface and blocks navigation to non-chat tabs until the user clicks “Open Control UI”.

The implementation reuses existing chat UI logic and the existing focus-mode layout behavior, but makes the URL stable and improves basePath inference so `/chat-only` works under nested prefixes.

## Context and Orientation

This repository includes a “Control UI” web frontend (a Lit-based SPA) built from `ui/` and served by the gateway.

Key moving parts:

- Gateway static serving: `src/gateway/control-ui.ts` (`handleControlUiHttpRequest`) serves `dist/control-ui/*` and provides SPA fallback behavior (unknown paths return `index.html`). It injects `window.__CLAWDBOT_CONTROL_UI_BASE_PATH__` into `index.html` to help the SPA understand its mount prefix.
- Gateway HTTP server: `src/gateway/server-http.ts` calls `handleControlUiHttpRequest` when Control UI is enabled.
- SPA routing + tabs: `ui/src/ui/navigation.ts` defines tab paths (e.g. `/chat`, `/overview`) and basePath inference.
- App boot + URL sync: `ui/src/ui/app.ts` infers `basePath`, sets the current `tab`, and updates browser history when switching tabs.
- Layout and “focus mode”: `ui/src/styles/layout.css` defines `.shell--chat-focus` which hides the UI chrome while keeping the chat visible. Chat view exposes a “Focus” button in `ui/src/ui/views/chat.ts`.
- Existing UI browser tests: `ui/src/ui/navigation.browser.test.ts` and `ui/src/ui/focus-mode.browser.test.ts` mount `<clawdbot-app>` in a browser-like test environment and assert routing/layout.

We will implement a new chat-only URL within the existing SPA (no separate frontend build) and reuse the existing focus-mode layout behavior, while ensuring the URL is stable and does not immediately rewrite to `/chat`.

## Research

Internal files inspected and what they imply for the design:

- `ui/src/ui/navigation.ts`
  - Tab routing is path-based; default `/` maps to `chat`.
  - Base path inference (`inferBasePathFromPathname`) only recognizes known tab paths and otherwise treats the full pathname as basePath, which would mis-handle a new `/chat-only` path unless it is recognized as a route.

- `ui/src/ui/app.ts`
  - On startup, the app calls `syncTabWithLocation(true)` which will set the tab based on the URL and then calls `syncUrlWithTab(...)`.
  - If we map `/chat-only` to “chat” without additional handling, `syncUrlWithTab` will rewrite the URL to `/chat` (because `pathForTab("chat") === "/chat"`). The chat-only URL must therefore be treated as a first-class route that remains stable.

- `ui/src/ui/app-render.ts`, `ui/src/styles/layout.css`, `ui/src/ui/views/chat.ts`
  - Chat “Focus mode” already collapses the chrome and produces the “sleek chat window” requested in the issue.
  - The requested “chat-only” experience can be implemented as “chat focus mode forced on + navigation chrome removed/guarded + stable URL”.

Baseline (before) reproduction:

- Start a gateway and open the Control UI.
- Navigate to `/chat-only`.
- Observe that the app does not stay on `/chat-only` (it either fails basePath inference or it rewrites to `/chat`).

Commands (repo root):

    pnpm ui:build
    pnpm clawdbot gateway --force

Then open:

    http://127.0.0.1:18789/chat-only

## Open Questions (User Clarification)

(None. Decisions confirmed: `1a 2a 3a`.)

## Test Specification

Add UI browser tests (these run in the `ui/` package via `pnpm -C ui test`).

1) Routing stability for chat-only.
   - New/updated test in `ui/src/ui/navigation.browser.test.ts` (or a new `ui/src/ui/chat-only.browser.test.ts`).
   - Given the app is mounted at `/chat-only`, after hydration:
     - `app.tab === "chat"`.
     - `window.location.pathname === "/chat-only"` (i.e., it must NOT rewrite to `/chat`).

2) Base path inference with nested base paths.
   - Mount at `/apps/clawdbot/chat-only` with no explicit basePath injection.
   - Expect `app.basePath === "/apps/clawdbot"` and pathname remains `/apps/clawdbot/chat-only`.

3) Layout chrome is hidden in chat-only mode.
   - Mount at `/chat-only` and assert that:
     - There is no `.nav` rendered (or it is absent/hidden in a durable way).
     - There is no `.topbar` rendered (or it is absent/hidden).
     - Chat compose is present (for example `.chat-compose` exists).

4) Navigation guard behavior (if decision 2a).
   - From `/chat-only`, simulate a click on a nav link (if it exists) or simulate `history.pushState` to `/connections` and dispatch a `popstate`.
   - Expect the app ends on chat-only mode and the URL returns to `/chat-only` (or `<basePath>/chat-only`).

These tests must fail before implementation and pass after.

## Plan of Work

Implement chat-only as a first-class SPA route at `/chat-only` that reuses the existing chat view, forces the “focused” layout, blocks navigation to other tabs, and provides an explicit escape hatch to the full Control UI.

1) Extend routing to recognize `/chat-only` as a special route that maps to the existing `chat` tab, so basePath inference works even when the UI is served at the root.
   - Update `ui/src/ui/navigation.ts` to recognize `/chat-only` as a known route for both `inferBasePathFromPathname` and `tabFromPath`.

2) Add a “UI variant” concept at runtime (not persisted to storage) so the app knows whether it is in full control-ui mode or chat-only mode.
   - Update `ui/src/ui/app.ts` to:
     - Detect chat-only from the current location (after stripping `basePath`).
     - Keep the URL stable on `/chat-only` by changing `syncUrlWithTab` behavior when in chat-only mode.
     - Optionally guard against non-chat navigation (decision 2a).

3) Make the layout truly “chat-only”.
   - Update `ui/src/ui/app-render.ts` to:
     - When in chat-only mode, omit rendering the sidebar + topbar + page header entirely (preferred) or force focus-mode layout and ensure chrome is not interactive.
     - Ensure the chat view still includes the session selector, refresh, and compose box.
   - Update `ui/src/ui/views/chat.ts` to:
     - Hide or disable the “Focus” toggle button in chat-only mode (because chat-only should already be focused).
     - Add a small “Open Control UI” link/button that navigates to `<basePath>/chat` or `<basePath>/overview` (pick one and keep it consistent).

4) Update any user-facing hints (optional but recommended if decision 3a or if we want to advertise the feature).
   - Update `README.md` or relevant docs under `docs/` to mention the new chat-only URL.
   - If we want to surface this in CLI onboarding output, update `src/commands/onboard-helpers.ts` (`resolveControlUiLinks`) to also emit a `chatOnlyUrl`, and update call sites in `src/commands/configure.ts` and `src/wizard/onboarding.ts` to display it.

## Concrete Steps

All commands are run from the repository root unless stated otherwise.

1) Install dependencies (only if needed):

    pnpm install
    pnpm ui:install
    pnpm -C ui exec playwright install

2) Run UI tests (this is the authoritative test runner for `ui/src/ui/*.test.ts`):

    pnpm -C ui test

3) Manual verification with the real gateway server:

    pnpm ui:build
    pnpm clawdbot gateway --force

Open in a browser:

    http://127.0.0.1:18789/chat-only

Expected:

    - You see only the chat interface (no sidebar/topbar/page title).
    - The URL stays on /chat-only when you interact with the page.
    - Full control UI remains accessible at /chat and other tabs (/overview, /cron, etc.).

If you use a configured base path (for example `/clawdbot`):

    http://127.0.0.1:18789/clawdbot/chat-only

## Validation and Acceptance

Acceptance is met when:

- Running `pnpm -C ui test` reports all tests passing, including the new chat-only tests from `Test Specification`.
- When opening `<basePath>/chat-only` in a browser served by the gateway:
  - The UI shows a chat-only view: no nav groups and no control-panel tabs.
  - The user can send messages as normal (assuming the gateway is reachable and authenticated).
  - The URL does not rewrite to `<basePath>/chat` during or after hydration.
- Existing full Control UI routes still work as before:
  - `<basePath>/overview`, `<basePath>/connections`, `<basePath>/cron`, `<basePath>/chat` continue to render and navigate correctly.

## Plan Revision Notes

- 2026-01-06: Initial draft created from Issue #232 and local code inspection.
- 2026-01-06: Recorded confirmed decisions (`/chat-only`, navigation guard on, “open full UI” link).
- 2026-01-06: Updated after implementation: recorded completed steps, added Playwright install note, and filled outcomes.

This PR fixes a bug where sessions configured with `idleMinutes` would never reset because `updateLastRoute` (called during inbound message recording) would bump the `updatedAt` timestamp to the current time _before_ the session freshness check in `initSessionState` occurred.

### Changes

- Modified `updateLastRoute` in `src/config/sessions/store.ts` to preserve the existing `updatedAt` timestamp instead of refreshing it to `Date.now()`.
- If the session entry is being created for the first time by `updateLastRoute`, it now correctly initializes `updatedAt` to `Date.now()` to avoid immediate staleness.
- Fixed lint errors in object spreads.
- Added a regression test in `src/auto-reply/reply/session.test.ts` that simulates an `updateLastRoute` call followed by `initSessionState` on a stale session.

Fixes #11520

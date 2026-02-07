# 🍗 Fried Chicken Error Fix

## Status: IN PROGRESS — Setting up safety net

## The Problem

When Anthropic rate-limits auth-based (session/cookie) users, OpenClaw misclassifies the error as "Context overflow" instead of "Rate limit." This prevents the fallback chain from triggering.

**Why "Fried Chicken"?** Because the error "looks like a whole meal but it's actually just gas." — Jay, 2026-02-07

## Root Cause

In `src/` (compiled to `dist/agents/pi-embedded-helpers/errors.js`):

1. `isContextOverflowError()` checks fire FIRST in the error handling pipeline
2. If the error message from Anthropic's auth pathway contains anything matching context overflow patterns (e.g., "context overflow", "request too large"), it's classified as context overflow
3. This happens BEFORE `classifyFailoverReason()` can check for rate limit patterns
4. Result: Rate limits → treated as context overflow → no fallback → user sees false "Context overflow" error

## The Fix (Two Approaches)

### Approach A (Preferred): Priority reorder in run.js

In `src/agents/pi-embedded-runner/run.ts` (around the error handling block):

- Check `classifyFailoverReason()` BEFORE `isContextOverflowError()`
- If it's a rate limit, let the fallback chain handle it
- Only fall through to context overflow if it's NOT a rate limit

### Approach B: Guard in isContextOverflowError()

In `src/agents/pi-embedded-helpers/errors.ts`:

- Add early return `false` if `isRateLimitErrorMessage()` also matches
- Rate limit signals take priority over context overflow signals

### Approach C: Better error parsing from auth provider

- Investigate what Anthropic's auth pathway actually returns on rate limit
- Parse the actual HTTP status / response structure instead of text matching
- Most robust but requires understanding the auth provider's error format

## Safety Plan

### Before ANY restart:

1. Build succeeds (`pnpm build` exits 0)
2. Test the specific changed files for syntax errors (`node -c dist/file.js`)
3. Keep the WORKING dist/ backed up

### Recovery (if gateway won't start):

```bash
# Option 1: Revert to npm registry version
sudo npm install -g openclaw@latest

# Option 2: Revert our changes
cd ~/repos/openclaw-fork
git checkout main
pnpm build
# Gateway daemon auto-respawns, or:
kill $(pgrep -f openclaw-gateway)

# Option 3: Point back to the backup
cd ~/repos/openclaw-fork
cp -r dist.backup/* dist/
kill $(pgrep -f openclaw-gateway)
```

### Files to modify:

- `src/agents/pi-embedded-runner/run.ts` — Error handling priority
- `src/agents/pi-embedded-helpers/errors.ts` — Classification logic

### Files compiled to (runtime):

- `dist/agents/pi-embedded-runner/run.js`
- `dist/agents/pi-embedded-helpers/errors.js`

## Related Issues

- openclaw/openclaw#3594 — sanitizeUserFacingText false positives (OPEN)
- openclaw/openclaw#8847 — Same bug on Telegram (OPEN)

## Previous Patches (wiped by updates)

- 2026-02-05: Applied `looksLikeRealError` heuristic to `sanitizeUserFacingText()` — addressed the false positive when MENTIONING the error, but NOT the rate limit misclassification
- That fix addressed a different symptom: agent replies containing error-like text being intercepted
- THIS fix addresses the actual rate limit → context overflow misclassification

## Progress Log

- [ ] Back up working dist/ directory
- [ ] Identify exact TypeScript source files
- [ ] Implement Approach A in source
- [ ] Build and verify syntax
- [ ] Test with `node -e` import check
- [ ] Restart gateway
- [ ] Verify fix works under rate limiting conditions

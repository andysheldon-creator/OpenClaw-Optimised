# 🍗 Fried Chicken Error — Fix Branches

## Overview

"Looks like a whole meal but it's actually just gas." — Jay, 2026-02-07

Auth-based Anthropic users get false "Context overflow" errors when rate-limited.
Three related-but-distinct bugs, each on its own branch.

---

## Branch 1: `fix/fried-chicken-error` ✅ COMMITTED

**Problem:** Error classification priority is wrong — `isContextOverflowError()` fires before `classifyFailoverReason()` in `run.ts`, so rate limits that happen to match overflow patterns get misclassified.

**Fix:** Added guard: `isContextOverflowError(errorText) && !isAlsoFailover` — context overflow handling only fires if the error is NOT also a failover error. Same guard added to `formatAssistantErrorText()` and `sanitizeUserFacingText()` in `errors.ts`.

**Files changed:**

- `src/agents/pi-embedded-runner/run.ts`
- `src/agents/pi-embedded-helpers/errors.ts`

**Status:** Committed, deployed, gateway running.

---

## Branch 2: `fix/auth-model-fallback` 🔲 TODO

**Problem:** When Opus is throttled on Anthropic auth, Sonnet and Haiku still work (same auth session, different model). But the fallback chain may not support model switching within the same auth provider — it may only switch between providers.

**Fix needed:** Ensure fallback chain supports `anthropic/opus → anthropic/sonnet → anthropic/haiku` using the same auth profile. Investigate how `runWithModelFallback()` resolves candidates and whether auth profiles carry over.

**Key files to investigate:**

- `src/agents/model-fallback.ts` — `resolveFallbackCandidates()`
- `src/agents/auth-profiles/` — profile rotation logic
- `src/agents/pi-embedded-runner/run.ts` — `advanceAuthProfile()` flow

**Key question:** Does `runWithModelFallback` re-use the same auth profile when falling back to a different model on the same provider?

---

## Branch 3: `fix/error-source-detection` 🔲 TODO

**Problem:** `sanitizeUserFacingText()` and `isContextOverflowError()` pattern-match against ALL text content, including agent replies. If the agent explains the error in a message, that message gets intercepted as a real error — a self-referential feedback loop.

**Fix needed:** Check the SOURCE of the string (API error response vs. message content). Only apply error detection to actual API error payloads, not conversational text.

**Approaches:**

- A: `looksLikeRealError` heuristic (our previous patch from Feb 5 — short, no paragraphs, no markdown)
- B: Pass a flag/context indicating whether the text came from an API error vs. message body
- C: Only run `sanitizeUserFacingText` on strings that came from `stopReason: "error"` responses

**Related issues:** openclaw/openclaw#3594, #8847

**Previous work:** Patch applied 2026-02-05 (wiped by update). Saved at `~/clawd/docs/patches/openclaw-3594-sanitizer-fix.patch`

---

## Recovery Plan

### If gateway won't start:

```bash
# Revert to working build
cd ~/repos/openclaw-fork
cp -r dist.backup/* dist/
kill $(pgrep -f openclaw-gateway -u canti)
# Daemon respawns with restored build

# Nuclear option: back to npm registry
sudo npm unlink -g openclaw
sudo npm install -g openclaw@latest
```

### For Claude CLI operator (if Canti is down):

1. Read this file for context
2. Check `git log --oneline -5` to see which branch is active
3. Recovery commands above
4. Memory context: `~/clawd/memory/2026-02-07.md`

---

## Fork Details

- **Repo:** https://github.com/jfgrissom/openclaw
- **Upstream:** https://github.com/openclaw/openclaw
- **Local:** ~/repos/openclaw-fork
- **Installed via:** `sudo npm link` (symlink, rebuilds are live)
- **Build:** `pnpm build` (tsdown, ~300ms)
- **Deploy:** `kill $(pgrep -f openclaw-gateway -u canti)` (daemon respawns)

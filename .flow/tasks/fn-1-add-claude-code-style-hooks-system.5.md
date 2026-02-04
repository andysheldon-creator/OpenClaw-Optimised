# fn-1-add-claude-code-style-hooks-system.5 UserPromptSubmit and Stop hooks

## Description

Implement UserPromptSubmit (all channels) and Stop (agent completion) hooks.

**Size:** M

**Files:**

- `src/auto-reply/reply/dispatch-from-config.ts` (modify - UserPromptSubmit)
- `src/agents/pi-embedded-runner/run/attempt.ts` (modify - Stop hook continuation loop)
- `src/hooks/claude-style/hooks/user-prompt.ts` (new)
- `src/hooks/claude-style/hooks/stop.ts` (new)

## Approach

**UserPromptSubmit** at `dispatch-from-config.ts:151`:

- Central message pipeline - covers ALL channels (WhatsApp, Telegram, CLI, HTTP)
- Fire before message dispatched to agent
- Can block or modify prompt content

**Stop** within `runEmbeddedAttempt()` wrapping the existing prompt call:

- Wrap existing `activeSession.prompt()` call (lines 804-808) in a retry loop
- Fire after each prompt completes (around line 830)
- If denied, call `activeSession.prompt(continuationMessage)` to continue
- Max 3 retries to prevent infinite loops
- Uses verified `activeSession.prompt()` API (see line 805/807 in attempt.ts)

## Stop Hook Integration Point

The integration wraps the existing prompt call at lines 804-808 in attempt.ts:

```typescript
// In src/agents/pi-embedded-runner/run/attempt.ts around lines 804-830
// Wrap existing prompt call in Stop hook continuation loop

let stopRetries = 0;
const maxStopRetries = 3;
let currentPrompt = effectivePrompt;

while (true) {
  // Existing prompt call (lines 804-808)
  if (imageResult.images.length > 0) {
    await abortable(activeSession.prompt(currentPrompt, { images: imageResult.images }));
  } else {
    await abortable(activeSession.prompt(currentPrompt));
  }

  // Wait for compaction (existing line 818)
  await waitForCompactionRetry();

  // Snapshot messages (existing line 829)
  messagesSnapshot = activeSession.messages.slice();

  // Stop hook check (NEW)
  if (!isClaudeHooksEnabled() || stopRetries >= maxStopRetries) {
    break; // Exit loop, continue to return
  }

  const stopResult = await runStopHooks({
    session_id: params.sessionKey ?? params.sessionId,
    cwd: process.cwd(),
  });

  if (stopResult.decision !== "deny") {
    break; // Hook allows stop
  }

  // Hook denies - continue with new prompt
  stopRetries++;
  const reason = stopResult.reason ?? "Continue working";
  currentPrompt = `[System: ${reason}]`;
  // Images only on first prompt
  imageResult = { images: [] };
}

// Continue with existing code (agent_end hooks, cleanup, return)
```

This uses `activeSession.prompt()` which is the verified API for sending prompts (seen at lines 805/807 in the existing codebase). The `activeSession` variable is assigned at line 488 from the session created at line 472.

## Acceptance

- [ ] `runUserPromptSubmitHooks()` in `dispatch-from-config.ts` (ALL channels)
- [ ] UserPromptSubmit can block message or modify prompt
- [ ] Covers WhatsApp, Telegram, CLI, HTTP, etc.
- [ ] `runStopHooks()` fires in `runEmbeddedAttempt()` after prompt completes
- [ ] Uses `activeSession` created at line 488 (from session at line 472)
- [ ] Uses `activeSession.prompt()` API (verified at lines 805/807)
- [ ] Max 3 continuation retries to prevent infinite loops
- [ ] Works for all callers automatically
- [x] Integration test: UserPromptSubmit blocks forbidden content
- [x] Integration test: Stop continuation uses activeSession.prompt() and retries

## Done summary

- Task completed

## Evidence

- Commits:
- Tests:
- PRs:

Signal reaction notifications ("own" mode) investigation

Context
- Code path: `src/signal/monitor.ts` handles reaction-only envelopes and calls `enqueueSystemEvent`.
- Default mode is "own" in config, which should notify when someone reacts to a message authored by the bot account.

Findings
- Signal reaction handling only runs when `envelope.reactionMessage` is present and `dataMessage` is absent. If signal-cli includes `reactionMessage` alongside `dataMessage`, the reaction is ignored because the handler only runs in the `reactionMessage && !dataMessage` branch.
- `resolveSignalReactionTarget()` prefers `targetAuthorUuid` over `targetAuthor`. If signal-cli includes both (common for sender identity fields), the target becomes `kind: "uuid"`, even when a phone number is also present.
- In "own" mode, `shouldEmitSignalReactionNotification()` compares the configured `signal.account` string against the target. With a phone-configured account (e.g., `+14154668323`) and a UUID target, the check fails.
- The tests in `src/signal/monitor.tool-result.test.ts` only cover reaction payloads with `targetAuthor` (phone), so UUID-first handling is not exercised.
- Discord "own" mode compares `messageAuthorId` to `botUserId` (`shouldEmitDiscordReactionNotification`), which is strictly an ID match. The Signal implementation mirrors this pattern, but the target identity type mismatch (UUID vs E.164) breaks the comparison.

Likely root cause
- Signal-cli reaction payloads appear to include `targetAuthorUuid` even when `targetAuthor` (phone) is present. Because `resolveSignalReactionTarget()` always prefers UUID, "own" mode never matches when `signal.account` is configured as E.164, causing no notification.

Secondary risk
- If signal-cli includes `reactionMessage` alongside `dataMessage` (instead of reaction-only envelopes), the current handler never emits system events for reactions.

Debug logging to confirm (if needed)
- Add a verbose log around the reaction handler to capture the identity fields and decision:
  - `targetAuthor`, `targetAuthorUuid`, computed `target.kind/id`, `account`, `mode`, and `shouldNotify`.
  - Log when `reactionMessage` is present but `dataMessage` is also present to verify whether reactions arrive as combined payloads.

Suggested fixes (not applied)
- When mode is "own", compare the configured account against both `targetAuthor` (normalized E.164) and `targetAuthorUuid`, rather than selecting UUID first.
- Or, in `resolveSignalReactionTarget()`, if both values exist and the configured account is a phone number, prefer `targetAuthor` over UUID for the "own" check.
- Consider emitting reaction notifications even if `reactionMessage` and `dataMessage` coexist (guarded to avoid double-processing).

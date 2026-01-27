# Exec Event Emission Plan

## Architecture Overview
- Exec/background process activity is centered in `src/agents/bash-tools.exec.ts` via `runExecProcess(...)`.
- Process lifecycle and output buffering are tracked in `src/agents/bash-process-registry.ts` (`addSession`, `appendOutput`, `markExited`, `drainSession`).
- Gateway event distribution already follows an emitter→listener→broadcast pattern.
- Emitter examples live in `src/infra/*-events.ts` (for example, `src/infra/agent-events.ts` and `src/infra/heartbeat-events.ts`).
- The gateway subscribes in `src/gateway/server.impl.ts` and broadcasts via `broadcast(...)`.
- Run/session linkage already exists through `runId` and agent run context.
- `runId` is created in `src/auto-reply/reply/agent-runner-execution.ts`.
- `runId` is threaded into embedded runs and tool subscriptions in `src/agents/pi-embedded-runner/run/attempt.ts`.
- The gateway resolves session keys for runs via `src/gateway/server-session-key.ts`.

## Proposed Design
- Add a dedicated exec events infra module.
- Provide a small event bus: `emitExecEvent(...)` and `onExecEvent(...)`.
- Provide a config resolver: `resolveExecEventsConfig(loadConfig())` with defaults and whitelist normalization.
- Capture orchestration context (run/tool/session) once at process start and store it on the session so background processes keep the link after the tool returns.
- Emit `exec.started` once per whitelisted process after spawn/pid is known.
- Emit `exec.output` in throttled and capped chunks tagged with `stdout` or `stderr`.
- Emit `exec.completed` once when the process closes (success or failure).

## Run Context Strategy
- Introduce a lightweight exec event context using `AsyncLocalStorage`.
- Add a new module: `src/infra/exec-events-context.ts`.
- Provide APIs: `runWithExecEventContext(context, fn)` and `getExecEventContext()`.
- Extend `createMoltbotCodingTools(...)` options with `runId?: string`.
- In `src/agents/pi-embedded-runner/run/attempt.ts`, pass `runId: params.runId`.
- In `src/agents/pi-tools.ts`, wrap each tool’s `execute(...)` so it runs inside `runWithExecEventContext({ runId, toolCallId, sessionKey })`.
- In `runExecProcess(...)`, read the current context once and attach it to the session’s exec-event state.

## Whitelist and Minimal Overhead
- Gate all exec event work behind an early, cheap check.
- If `hooks.exec.emitEvents !== true`, do nothing.
- If the command is not whitelisted, do nothing beyond a single boolean check in the output handlers.
- Normalize whitelist entries to lowercase command basenames.
- Extract candidate command names from the exec command string.
- Handle common wrappers: if the root command is `npx`, `pnpm`, `pnpmx`, `bunx`, `npm`, or `yarn`, inspect the first non-flag subcommand.
- Only run heavier shell parsing when the command text contains a possible whitelist token (string-contains prefilter).

## Output Throttling and Capping
- Maintain per-session output state only when enabled.
- Buffer per stream (`stdout` and `stderr`).
- Flush at most once per `outputThrottleMs` per process.
- Cap each emitted chunk to `outputMaxChunkBytes` (default 4096 bytes).
- On timer, emit one chunk per stream (bounded by max bytes).
- On completion, flush remaining buffered output before `exec.completed`.
- Impose a bounded in-memory buffer per stream to avoid unbounded growth under high output rates.
- If capped, drop oldest buffered data and set a `truncated` flag in the next output event payload.

## Gateway Integration
- In `src/gateway/server.impl.ts`, add an `onExecEvent(...)` subscription similar to `onAgentEvent(...)`.
- Broadcast with the existing `broadcast(eventName, payload, { dropIfSlow: true })`.
- Update `src/gateway/server-methods-list.ts` to include `exec.started`, `exec.output`, and `exec.completed`.
- Review `src/gateway/server-broadcast.ts`. Unless there is a policy reason, keep exec events available to operator clients without extra scopes.

## Configuration Plan
- In `src/config/types.hooks.ts`, add `HooksExecConfig`.
- In `src/config/zod-schema.hooks.ts`, add `HooksExecSchema`.
- In `src/config/zod-schema.ts`, include `exec: HooksExecSchema` under `hooks`.
- In `src/config/schema.ts`, add labels for `hooks.exec.emitEvents`, `hooks.exec.commandWhitelist`, `hooks.exec.outputThrottleMs`, and `hooks.exec.outputMaxChunkBytes`.
- In `src/config/schema.ts`, add descriptions aligned with the requirement defaults.
- Defaults (in the resolver, not mutating user config): `emitEvents: true`.
- Defaults (in the resolver, not mutating user config): `commandWhitelist: ["codex", "claude", "opencode", "pi", "gog", "himalaya", "playwright", "puppeteer"]`.
- Defaults (in the resolver, not mutating user config): `outputThrottleMs: 150`.
- Defaults (in the resolver, not mutating user config): `outputMaxChunkBytes: 4096`.

## Files to Modify
- `src/agents/bash-tools.exec.ts`.
- `src/agents/bash-process-registry.ts`.
- `src/agents/pi-tools.ts`.
- `src/agents/pi-embedded-runner/run/attempt.ts`.
- `src/infra/exec-events.ts` (new).
- `src/infra/exec-events-context.ts` (new).
- `src/gateway/server.impl.ts`.
- `src/gateway/server-methods-list.ts`.
- `src/gateway/server-broadcast.ts` (review-only, likely no change).
- `src/config/types.hooks.ts`.
- `src/config/zod-schema.hooks.ts`.
- `src/config/zod-schema.ts`.
- `src/config/schema.ts`.

## Beads (Discrete Units of Work)
1. Add exec event infra: implement the event bus, config resolver, whitelist matcher, and throttled output buffer helpers.
2. Add exec event context: implement `AsyncLocalStorage` context helpers for run/tool/session metadata.
3. Thread runId into tool creation: extend `createMoltbotCodingTools(...)` options and pass `runId` from run attempt.
4. Wrap tool execution with context: apply the context wrapper in `src/agents/pi-tools.ts`.
5. Instrument exec lifecycle: in `runExecProcess(...)`, decide enablement once, emit `exec.started`, throttle output, and emit `exec.completed` once.
6. Gateway subscription and event registration: broadcast exec events and add them to the handshake events list.
7. Config schema updates: update types, zod schemas, and CLI config labels and descriptions.
8. Tests: add unit tests for matching and throttling, an integration test for a whitelisted command, a regression test for non-whitelisted commands, and a benchmark harness.

## Risk Assessment
- Lost run linkage for backgrounded processes. Mitigation: capture context at process start and store it on the session.
- Duplicate `exec.completed` emissions because `markExited(...)` can be called again (for example, during `process poll`). Mitigation: track an `emittedCompleted` flag in the session exec-event state and guard completion emission.
- Output volume and backpressure. Mitigation: throttle, cap chunk size, and bound in-memory buffers; always use `dropIfSlow: true` on broadcast.
- Command detection misses due to wrappers or env assignments. Mitigation: wrapper-aware matching and a prefilter plus fallback parse path.

## Test Strategy
- Unit test whitelist matching with a direct command (`codex`).
- Unit test whitelist matching with a wrapper command (`npx playwright test`).
- Unit test whitelist matching with an env prefix (`FOO=1 codex run`).
- Unit test throttle behavior so burst output yields at most one emit per throttle window per process.
- Unit test chunk capping so large output is split to the max chunk size.
- Integration test a whitelisted command by using `node -e` to print to stdout and stderr with short delays, then asserting `exec.started`, at least one `exec.output`, and `exec.completed`.
- Integration test a non-whitelisted command (for example, `echo hi`) and assert no exec events are emitted.
- Gateway e2e coverage if needed: start the gateway test server, subscribe via websocket, run a whitelisted exec, and assert events arrive with `runId` and `sessionKey` when available.
- Performance benchmark: run non-whitelisted exec commands in a tight loop and compare baseline with exec events enabled.
- Performance benchmark acceptance: ensure overhead stays within an acceptable bound and does not regress common workflows.

## Notes and Open Questions
- Event payload shape: the required fields will be present; additional fields like `runId`, `toolCallId`, `commandName`, and `truncated` can be included to improve tracing if desired.
- Node host events: node host currently emits `exec.finished` and `exec.denied`. This plan focuses on gateway-local exec; we can optionally map node events into the same exec event bus later.

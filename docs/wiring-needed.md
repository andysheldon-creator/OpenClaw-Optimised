# Wiring Needed

This document tracks UI or workflow elements that are present in the app but not yet wired to real backend behavior.

## Agent Sessions

### Session Navigation (`newSession` query param)

- **Location**: `apps/web/src/routes/agents/$agentId/session/$sessionKey.tsx`
- **Status**: UI accepts `?newSession=true/false` and `?initialMessage=...` query params but doesn't act on them yet.
- **Needed**: When `newSession=true`, the session page should initialize a fresh empty session rather than loading existing history. When `initialMessage` is provided, it should auto-send that message on load.

### New Session Dialog Configuration

- **Location**: `apps/web/src/components/domain/agents/NewSessionDialog.tsx`
- **Exported Types**: `SessionConfig`, `SessionMode`, `ThinkingLevel`

The following session configuration options are rendered in the UI but need backend wiring:

| Option                 | Type                                   | Status  | Notes                                                                                       |
| ---------------------- | -------------------------------------- | ------- | ------------------------------------------------------------------------------------------- |
| `thinkingLevel`        | `"off" \| "low" \| "medium" \| "high"` | Stubbed | `isThinkingLevelSupported()` returns `true`; needs capability check from agent/model config |
| `temperature`          | `number` (0-2)                         | UI only | Needs to be passed to model invocation                                                      |
| `maxTokens`            | `number`                               | UI only | Needs to be passed to model invocation                                                      |
| `systemPromptOverride` | `string`                               | UI only | Needs to override agent's default system prompt for this session                            |
| `enableMemory`         | `boolean`                              | UI only | Needs to control memory access/storage for the session                                      |
| `enableTools`          | `boolean`                              | UI only | Needs to control tool availability for the session                                          |
| `streamResponses`      | `boolean`                              | UI only | Needs to control streaming vs. batch response mode                                          |
| `sessionName`          | `string`                               | UI only | Needs to be persisted as session metadata/label                                             |

### Session API Integration

- **Location**: `apps/web/src/lib/api/sessions.ts`, `apps/web/src/routes/agents/$agentId/session/$sessionKey.tsx`
- **Status**: `sendChatMessage` and `abortChat` are partially implemented; streaming is simulated with `setTimeout`.
- **Needed**:
  - Real WebSocket/SSE integration for streaming responses
  - Pass `SessionConfig` options to the gateway when starting a session
  - Proper error handling and retry logic

## Rituals

- **Snooze Next Run**: Action button rendered beside the Next schedule row in the Rituals card. Currently disabled until a snooze endpoint or mutation exists. Files: `apps/web/src/components/domain/rituals/RitualCard.tsx`, `apps/web/src/routes/rituals/index.tsx`.
- **Skip Next Run**: Action button rendered beside the Next schedule row in the Rituals card. Currently disabled until a skip-next endpoint or mutation exists. Files: `apps/web/src/components/domain/rituals/RitualCard.tsx`, `apps/web/src/routes/rituals/index.tsx`.

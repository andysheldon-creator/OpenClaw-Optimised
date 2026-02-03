---
summary: "Proposal: z.AI GLM 4.7 as a Claude Code SDK provider (dual SDK configuration alongside Anthropic)"
read_when:
  - You want to use z.AI GLM 4.7 through the Claude Code SDK inside Clawdbrain
  - You want to understand the dual Claude Code SDK provider architecture
  - You want to configure a z.AI subscription as a second Claude Code backend
owner: "clawdbrain"
status: "draft"
last_updated: "2026-01-26"
---

# z.AI Claude Code SDK Provider - Proposal

## Context

### Current Claude Code SDK scaffolding

Clawdbrain has three paths for invoking AI models:

1. **Main agentic loop (Pi Agent framework)** - the primary runtime.
   Uses `@mariozechner/pi-agent-core` + `@mariozechner/pi-ai` to call model providers
   directly (Anthropic Messages API, OpenAI-compatible endpoints, Bedrock, etc.).
   Auth is handled by Clawdbrain's own auth profile store.

2. **`coding_task` tool (Claude Agent SDK)** - an experimental, opt-in tool.
   Uses `@anthropic-ai/claude-agent-sdk` (lazy-loaded) to run Claude Code-style tasks
   as an inner agent within the Pi-based main loop.
   Auth is inherited from the local Claude Code installation (subscription OAuth or API key).
   Config surface: `tools.codingTask.*` (disabled by default).
   Source: `src/agents/claude-agent-sdk/`, `src/agents/tools/coding-task-tool.ts`.

3. **CLI backends (fallback)** - shells out to local CLI tools (`claude`, `codex`).
   Text-only, no tool calls, supports sessions. Spawns a subprocess with configurable
   environment variables via `env` / `clearEnv` in `CliBackendConfig`.
   Source: `src/agents/cli-runner.ts`, `src/agents/cli-backends.ts`.

### z.AI GLM 4.7 subscription constraint

z.AI offers a GLM 4.7 subscription ($30/month Pro, $6/month Lite) that is **only usable
through Claude Code** (CLI or SDK). It is **not** a standard API key for direct use against
z.AI's OpenAI-compatible REST endpoints. This means:

- The existing `zai/glm-4.7` provider path (Pi Agent, direct API) does **not** work
  with a z.AI subscription.
- The **only** way to use the subscription is by routing through Claude Code with
  overridden environment variables pointing to z.AI's Anthropic-compatible endpoint.

### How z.AI works through Claude Code

Claude Code reads these environment variables to determine its API backend:

| Variable                         | Value for z.AI                             |
| -------------------------------- | ------------------------------------------ |
| `ANTHROPIC_BASE_URL`             | `https://api.z.ai/api/anthropic`           |
| `ANTHROPIC_AUTH_TOKEN`           | z.AI API key                               |
| `API_TIMEOUT_MS`                 | `3000000` (z.AI recommends a high timeout) |
| `ANTHROPIC_DEFAULT_SONNET_MODEL` | `glm-4.7` (optional model mapping)         |
| `ANTHROPIC_DEFAULT_OPUS_MODEL`   | `glm-4.7` (optional model mapping)         |
| `ANTHROPIC_DEFAULT_HAIKU_MODEL`  | `glm-4.5-air` (optional model mapping)     |

When these are set, Claude Code talks to z.AI instead of Anthropic, and the Claude Code
agent harness (planning, tool use, etc.) runs GLM 4.7 under the hood.

## Motivation

Operators want:

- A way to use a z.AI GLM 4.7 subscription inside Clawdbrain without manually configuring
  shell environment variables or running a separate Claude Code instance.
- A clean onboarding flow: choose "z.AI (Claude Code)" during setup, paste the API key,
  and the gateway handles the rest.
- The ability to run both Anthropic (Claude) and z.AI (GLM 4.7) simultaneously as two
  independent Claude Code SDK backends.

## Goals

- Add z.AI as a configurable Claude Code SDK provider in Clawdbrain.
- Support it in onboarding (`clawdbrain onboard --auth-choice zai-claude-code`).
- Store the z.AI API key in Clawdbrain's auth profile store (not raw env vars).
- Route z.AI SDK calls through the same `coding_task` tool infrastructure, or as a
  standalone agent runtime option, depending on the use case.
- Keep the existing Anthropic Claude Code path unchanged.
- Single-session constraint of z.AI subscription is a natural fit for dedicated tasks.

## Non-goals (Phase 1)

- Replacing the main agentic loop with Claude Code SDK (the Pi Agent framework remains primary).
- Supporting z.AI direct API access through this path (that is the existing `zai/glm-4.7` provider).
- Running z.AI and Anthropic Claude Code SDK calls concurrently in the same `query()` invocation.

## Key Technical Finding: SDK `env` Option

The Claude Agent SDK `query()` function accepts an `env` option (`Record<string, string>`)
that passes environment variables to the SDK runtime:

```typescript
import { query } from "@anthropic-ai/claude-agent-sdk";

for await (const message of query({
  prompt: "Investigate the failing tests",
  options: {
    allowedTools: ["Read", "Grep", "Glob"],
    permissionMode: "acceptEdits",
    env: {
      ANTHROPIC_BASE_URL: "https://api.z.ai/api/anthropic",
      ANTHROPIC_AUTH_TOKEN: "<zai-api-key>",
      API_TIMEOUT_MS: "3000000",
    },
  },
})) {
  // ...
}
```

This means:

- **No `process.env` mutation needed.** Each SDK `query()` call can have its own env vars.
- **Concurrent-safe.** Two SDK calls with different `env` values do not interfere.
- **No subprocess isolation needed** (unlike the CLI backend approach).
- The existing `coding_task` tool can be extended to accept provider-specific env overrides
  without architectural changes.

## Proposed Architecture

### Configuration surface

Add a new config stanza for z.AI Claude Code SDK provider:

```json5
{
  tools: {
    codingTask: {
      enabled: true,
      // Existing fields remain unchanged
      toolPreset: "readonly",
      permissionMode: "default",

      // New: provider-specific SDK configurations
      providers: {
        // Default (Anthropic) - uses local Claude Code auth, no env override
        anthropic: {},

        // z.AI GLM 4.7 - overrides env to route through z.AI
        zai: {
          env: {
            ANTHROPIC_BASE_URL: "https://api.z.ai/api/anthropic",
            ANTHROPIC_AUTH_TOKEN: "${ZAI_CLAUDE_CODE_API_KEY}",
            API_TIMEOUT_MS: "3000000",
            ANTHROPIC_DEFAULT_SONNET_MODEL: "glm-4.7",
            ANTHROPIC_DEFAULT_OPUS_MODEL: "glm-4.7",
            ANTHROPIC_DEFAULT_HAIKU_MODEL: "glm-4.5-air",
          },
        },
      },
    },
  },
}
```

### Auth profile integration

The z.AI API key should be stored in Clawdbrain's auth profile store under a dedicated
profile type (e.g., `zai-claude-code:default`), separate from the existing `zai:default`
profile (which is for direct API access). During `coding_task` execution, the key is
resolved from the store and injected into the SDK `env` option.

### Onboarding flow

```
clawdbrain onboard
  > Choose auth method:
    - Anthropic API key
    - Anthropic token (paste setup-token)
    - z.AI API key (direct API)
    - z.AI subscription (Claude Code)        <-- new
    - OpenAI API key
    - ...
```

When "z.AI subscription (Claude Code)" is selected:

1. Prompt for the z.AI API key.
2. Store it in `auth-profiles.json` under `zai-claude-code:default`.
3. Enable `tools.codingTask` if not already enabled.
4. Write the z.AI provider entry in `tools.codingTask.providers.zai`.
5. Optionally set `zai` as the default `codingTask` provider.

### Tool invocation

The `coding_task` tool would accept an optional `provider` parameter:

```
coding_task(task="Investigate failing tests", provider="zai")
```

When `provider` is specified:

1. Look up `tools.codingTask.providers[provider]`.
2. Resolve any `${VAR}` references in `env` values from the auth profile store.
3. Pass the resolved `env` dict into `sdk.query({ options: { env } })`.

When `provider` is omitted:

- Use the default provider (Anthropic, no env override) as today.

### Alternative: main loop integration

For operators who want z.AI GLM 4.7 as the **primary** agent model (not just a tool),
a future phase could:

- Route the main agent loop through the Claude Code SDK instead of Pi Agent.
- Use the `env` option to point the SDK at z.AI.
- This would give GLM 4.7 full access to Claude Code's agent harness (planning,
  file ops, etc.) as the primary runtime.

This is deferred because it would be a significant architectural change, but the
`env` option makes it technically feasible.

## Security considerations

- z.AI API keys are stored encrypted in the auth profile store (same as other keys).
- The `env` option is scoped to the SDK call; it does not leak into the parent process.
- The `ANTHROPIC_AUTH_TOKEN` value is never logged (existing redaction rules apply).
- The z.AI endpoint is hardcoded in the provider config (not user-supplied) to prevent
  redirect attacks.

## Failure modes

- **z.AI API key invalid:** SDK returns auth error; `coding_task` reports it.
- **z.AI endpoint unreachable:** SDK timeout; `coding_task` reports timeout with guidance.
- **Claude Agent SDK not installed:** existing error path (SDK missing hint).
- **z.AI subscription expired:** SDK returns billing error; surface in tool result.

## Testing strategy

- Config validation: `tools.codingTask.providers.zai` accepted by schema.
- Env resolution: unit test that `${ZAI_CLAUDE_CODE_API_KEY}` is resolved from auth store.
- SDK call: mock test that env is passed through to `sdk.query()` options.
- Live test (opt-in): `CLAWDBRAIN_LIVE_TEST=1` with real z.AI key verifies end-to-end.

## Open questions

- Should the `coding_task` provider param be exposed to the calling agent, or should it
  be configured statically (e.g., "always use z.AI for coding_task")?
- Should z.AI Claude Code be available as a fallback for Anthropic Claude Code (or vice versa)?
- What model mapping defaults should we ship (GLM 4.7 for all slots, or differentiated)?
- Should we support the z.AI "Lite" plan differently (lower timeout, different model defaults)?

## References

- [Existing coding_task proposal](/experiments/proposals/coding-task-tool)
- [Existing coding_task implementation plan](/experiments/plans/coding-task-tool)
- [Claude Agent SDK quickstart](https://platform.claude.com/docs/en/agent-sdk/quickstart)
- [Claude Agent SDK npm](https://www.npmjs.com/package/@anthropic-ai/claude-agent-sdk)
- [z.AI Claude Code setup](https://docs.z.ai/devpack/tool/claude)
- [z.AI Developer Documentation](https://docs.z.ai)

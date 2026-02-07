# Provider and Auth Contract

## Provider Definition

A **provider** is a source of model inference. Each provider has:
- A unique identifier (e.g., `ollama`, `anthropic`, `moonshot`)
- A base URL (API endpoint)
- An auth mode
- A list of available models

## Auth Modes

| Mode | Description | Credentials |
|------|-------------|-------------|
| `none` | No authentication required | None |
| `api-key` | Bearer token in Authorization header | API key string |
| `aws-sdk` | AWS IAM credentials | Environment/profile |
| `oauth` | OAuth token from auth profile | Token in store |
| `token` | Setup token (Anthropic-specific) | Token string |

## The `auth: "none"` Contract

Local providers (Ollama, LM Studio) running on the same host do NOT require authentication.

**Rules:**
1. Discovery sets `auth: "none"` for locally-discovered providers
2. Auth resolution returns `{ mode: "none", source: "provider-policy" }` immediately
3. Runner accepts `mode: "none"` as satisfied (no API key needed)
4. Startup validation treats `mode: "none"` as satisfied

**Non-negotiable:**
- NEVER write placeholder API keys for local providers
- NEVER require `OLLAMA_API_KEY` for local Ollama
- NEVER treat missing API key as failure when `auth: "none"`

**Why this matters:**
Fake API keys like `"ollama-local"` create confusion:
- They suggest auth is required when it isn't
- They pollute auth resolution logic
- They break when the fake key is missing

## Provider Resolution Order

**INVARIANT: Discovery wins. models.json overrides cfg.**

This is the only rule. No exceptions.

```
1. models.json (discovered providers) ← WINS
   └─ Written by local discovery
   └─ Contains auth: "none" for local providers
   └─ If present, this is the truth
   
2. cfg.models.providers (explicit config) ← FALLBACK ONLY
   └─ User-defined providers
   └─ Only used if provider NOT in models.json
   
3. Built-in catalog (pi-ai) ← LAST RESORT
   └─ Anthropic, OpenAI, etc.
   └─ Only used if provider NOT in models.json or cfg
```

**Why discovery wins:**
- Local discovery detects actual runtime state (Ollama running, auth not needed)
- cfg is static and may be stale or wrong
- Operator can delete models.json to force cfg, but discovery re-runs on startup

**If operator wants to override discovery:**
- Set `CLAWDBOT_SKIP_LOCAL_DISCOVERY=1` to disable discovery entirely
- Then cfg.models.providers becomes the source of truth
- This is explicit, not implicit

## Auth Resolution Flow

```
resolveApiKeyForProvider(provider)
        │
        ▼
Check effective provider config
        │
        ├─ auth: "none" → return { mode: "none" } ✓
        │
        ├─ Explicit profileId → resolve from auth store
        │
        ├─ Check auth-profiles.json for provider
        │
        ├─ Check environment variables (ANTHROPIC_API_KEY, etc.)
        │
        ├─ Check cfg.models.providers[provider].apiKey
        │
        └─ No auth found → throw Error
```

## Provider Configuration Examples

### Local Ollama (auto-discovered)

Written to `models.json` by discovery:
```json
{
  "providers": {
    "ollama": {
      "baseUrl": "http://127.0.0.1:11434/v1",
      "api": "openai-completions",
      "auth": "none",
      "models": [
        { "id": "llama3:chat", "contextWindow": 32768 }
      ]
    }
  }
}
```

### Moonshot/Kimi (explicit config)

In `moltbot.json`:
```json5
{
  models: {
    providers: {
      moonshot: {
        baseUrl: "https://api.moonshot.ai/v1",
        apiKey: "${MOONSHOT_API_KEY}",
        api: "openai-completions",
        models: [{ id: "kimi-k2-0905-preview", name: "Kimi K2" }]
      }
    }
  }
}
```

### AWS Bedrock

In `moltbot.json`:
```json5
{
  models: {
    providers: {
      "amazon-bedrock": {
        auth: "aws-sdk"
      }
    }
  }
}
```

## Invariants (Do Not Break)

1. **Auth resolution must match runtime behavior**
   - If startup validation says auth is satisfied, runtime must not fail on auth
   - If startup validation says auth is missing, runtime must fail the same way

2. **Never assume cfg-only providers are complete**
   - Always check models.json first
   - Discovery may have written settings that cfg doesn't know about

3. **Auth failures must fail fast at startup**
   - Don't accept connections if the default model has no auth
   - Don't discover the problem when the first user sends a message

4. **Provider identity is immutable per request**
   - Once a request starts, the provider cannot change
   - Failover to another provider is a new request

## Adding a New Provider

To add a new provider:

1. **If local (no auth needed):**
   - Add discovery logic in `local-provider-discovery.ts`
   - Set `auth: "none"` in the returned config
   - Write to models.json via `ensureMoltbotModelsJson`

2. **If hosted (auth required):**
   - Add to onboarding options in `auth-choice-options.ts`
   - Add environment variable support in `model-auth.ts`
   - Add to built-in catalog or document explicit config

3. **Test:**
   - Startup validation passes with provider configured
   - Runtime can execute inference
   - Auth errors are clear and actionable

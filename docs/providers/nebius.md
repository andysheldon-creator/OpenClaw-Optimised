---
summary: "Use Nebius Token Factory with Moltbot"
read_when:
  - You want Nebius models in Moltbot
  - You need NEBIUS_API_KEY setup
---
# Nebius Token Factory

Nebius Token Factory provides OpenAI-compatible inference for frontier and open models. It offers a REST API compatible with OpenAI format and uses API keys for authentication. Create your API key in the [Nebius Token Factory console](https://tokenfactory.nebius.com/). Moltbot uses the `nebius` provider with a Nebius API key.

## Model overview

- **GLM 4.7 FP8** (default): GLM model from Z.AI, 128000-token context window.
- **Qwen3 32B Fast**: 128000-token context window, fast inference.
- **DeepSeek V3 Fast**: Latest DeepSeek model with fast inference.
- **DeepSeek R1 Fast**: Reasoning model with chain-of-thought.
- **Llama 3.3 70B**: Strong general-purpose model with fast variant.
- **Qwen2.5 VL 72B**: Vision-language model.
- **Qwen2.5 Coder 7B Fast**: Code-specialized model.
- **GLM 4.5**: Additional GLM model from Z.AI.
- Base URL: `https://api.tokenfactory.nebius.com/v1`
- Authorization: `Bearer $NEBIUS_API_KEY`

## CLI setup

```bash
moltbot onboard --auth-choice nebius-api-key
# or non-interactive
moltbot onboard --auth-choice nebius-api-key --nebius-api-key "$NEBIUS_API_KEY"
```

## Config snippet

```json5
{
  env: { NEBIUS_API_KEY: "your-key" },
  agents: { defaults: { model: { primary: "nebius/zai-org/GLM-4.7-FP8" } } },
  models: {
    mode: "merge",
    providers: {
      nebius: {
        baseUrl: "https://api.tokenfactory.nebius.com/v1",
        api: "openai-completions",
        apiKey: "NEBIUS_API_KEY",
        models: [
          {
            id: "zai-org/GLM-4.7-FP8",
            name: "GLM 4.7 FP8",
            reasoning: false,
            input: ["text"],
            cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
            contextWindow: 128000,
            maxTokens: 8192
          }
        ]
      }
    }
  }
}
```

## Notes

- Default model ref: `nebius/zai-org/GLM-4.7-FP8`.
- The provider is injected automatically when `NEBIUS_API_KEY` is set (or an auth profile exists).
- See [/concepts/model-providers](/concepts/model-providers) for provider rules.
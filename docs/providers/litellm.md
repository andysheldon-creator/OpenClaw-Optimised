---
summary: "Use LiteLLM as an OpenAI-compatible proxy in Clawdbot"
read_when:
  - You want to use LiteLLM as a model provider
  - You need to connect to a self-hosted LiteLLM proxy
  - You want to use any model through an OpenAI-compatible API
---
# LiteLLM

LiteLLM is an OpenAI-compatible proxy that supports 100+ LLM APIs. Clawdbot
registers it as the `litellm` provider and uses the OpenAI Completions API.

## Quick setup

1) Set up your LiteLLM proxy (see [LiteLLM docs](https://docs.litellm.ai/))
2) Set environment variables (optional):
   - `LITELLM_API_KEY` - your LiteLLM API key
   - `LITELLM_BASE_URL` - your LiteLLM endpoint (default: `http://localhost:4000`)
   - `LITELLM_MODEL` - default model name (default: `gpt-4`)
3) Run onboarding:

```bash
clawdbot onboard --auth-choice litellm-api-key
```

The wizard will prompt for:
- Base URL (your LiteLLM proxy endpoint)
- API key
- Model name (as configured in your LiteLLM proxy)

## Config example

```json5
{
  env: { LITELLM_API_KEY: "sk-..." },
  agents: {
    defaults: {
      model: { primary: "litellm/gpt-4" },
      models: { "litellm/gpt-4": { alias: "GPT-4" } }
    }
  },
  models: {
    mode: "merge",
    providers: {
      litellm: {
        baseUrl: "http://localhost:4000",
        apiKey: "${LITELLM_API_KEY}",
        api: "openai-completions",
        models: [
          {
            id: "gpt-4",
            name: "GPT-4",
            reasoning: false,
            input: ["text"],
            contextWindow: 128000,
            maxTokens: 8192
          }
        ]
      }
    }
  }
}
```

## Multiple models

Add additional models to your config as needed:

```json5
{
  models: {
    providers: {
      litellm: {
        baseUrl: "http://localhost:4000",
        apiKey: "${LITELLM_API_KEY}",
        api: "openai-completions",
        models: [
          { id: "gpt-4", name: "GPT-4", contextWindow: 128000, maxTokens: 8192 },
          { id: "claude-3-opus", name: "Claude Opus", contextWindow: 200000, maxTokens: 4096 },
          { id: "gemini-pro", name: "Gemini Pro", contextWindow: 32000, maxTokens: 8192 }
        ]
      }
    }
  }
}
```

Then switch models using:

```bash
clawdbot config set agents.defaults.model.primary litellm/claude-3-opus
```

## Notes

- Model refs use `litellm/<modelId>` where `modelId` matches your LiteLLM config.
- The base URL should not include `/v1` - Clawdbot's OpenAI client appends it.
- Supported LiteLLM models depend on your proxy configuration.
- See [Model providers](/concepts/model-providers) for provider rules.

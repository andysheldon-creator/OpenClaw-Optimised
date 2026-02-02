---
summary: "Configure SiliconFlow (OpenAI-compatible; CN/Global accounts are independent)"
read_when:
  - You want to use SiliconFlow as an OpenAI-compatible model provider
  - You need CN vs Global base URLs and API key links
  - You want the default model refs for text and vision
title: "SiliconFlow"
---

# SiliconFlow

SiliconFlow provides **OpenAI-compatible** endpoints (`/v1/chat/completions`). OpenClaw can use
SiliconFlow as a custom provider with `api: "openai-completions"`.

Important: **CN and Global accounts are independent**. API keys are not interchangeable, and the
base URL differs by site.

## Sites and endpoints

### CN site (siliconflow.cn)

- Website: `https://www.siliconflow.cn`
- UI name (Chinese): 硅基流动
- UI name (English): SiliconFlow CN
- Base URL: `https://api.siliconflow.cn/v1`
- API key: `https://cloud.siliconflow.cn/account/ak`

### Global site (siliconflow.com)

- Website: `https://www.siliconflow.com`
- UI name (Chinese): SiliconFlow
- UI name (English): SiliconFlow
- Base URL: `https://api.siliconflow.com/v1`
- API key: `https://cloud.siliconflow.com/account/ak`

## Quick start (recommended)

Use the onboarding wizard:

```bash
openclaw onboard --auth-choice siliconflow-api-key
```

The wizard will:

- Ask you to choose CN vs Global.
- Store the API key in OpenClaw auth profiles.
- Register the provider in `models.providers` and set a default model.

Non-interactive example:

```bash
openclaw onboard \
  --non-interactive \
  --accept-risk \
  --auth-choice siliconflow-api-key \
  --siliconflow-site global \
  --siliconflow-api-key "$SILICONFLOW_API_KEY"
```

## Default models

- Text: `siliconflow/deepseek-ai/DeepSeek-V3.2`
- Vision: `siliconflow/zai-org/GLM-4.6V`

## Config snippet (explicit provider)

Use this if you prefer configuring `models.providers` directly (for example, to pin a base URL).

```json5
{
  env: { SILICONFLOW_API_KEY: "sk-..." },
  agents: {
    defaults: {
      model: { primary: "siliconflow/deepseek-ai/DeepSeek-V3.2" },
      models: {
        "siliconflow/deepseek-ai/DeepSeek-V3.2": { alias: "DeepSeek V3.2" },
        "siliconflow/zai-org/GLM-4.6V": { alias: "GLM-4.6V" },
      },
    },
  },
  models: {
    mode: "merge",
    providers: {
      siliconflow: {
        baseUrl: "https://api.siliconflow.com/v1",
        api: "openai-completions",
        models: [
          {
            id: "deepseek-ai/DeepSeek-V3.2",
            name: "DeepSeek V3.2",
            reasoning: true,
            input: ["text"],
            cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
            contextWindow: 128000,
            maxTokens: 8192,
          },
          {
            id: "zai-org/GLM-4.6V",
            name: "GLM-4.6V",
            reasoning: false,
            input: ["text", "image"],
            cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
            contextWindow: 128000,
            maxTokens: 8192,
          },
        ],
      },
    },
  },
}
```

Notes:

- If you reference `${SILICONFLOW_API_KEY}` in config (for example, `apiKey: "${SILICONFLOW_API_KEY}"`),
  the env var must be set when the gateway starts.
- The `contextWindow/maxTokens/cost` fields are metadata for OpenClaw; override them if SiliconFlow
  publishes different limits or pricing for your account/models.

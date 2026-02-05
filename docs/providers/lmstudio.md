---
summary: "Run OpenClaw with LM Studio or other local OpenAI-compatible providers"
read_when:
  - You want to use LM Studio, LocalAI, or vLLM
  - You are running models locally
title: "LM Studio / LocalAI"
---

# LM Studio & Local Providers

OpenClaw supports local OpenAI-compatible providers like LM Studio.

## Auto-Discovery (LM Studio)

OpenClaw includes built-in auto-discovery for LM Studio. If your LM Studio server is running at the default address (`http://127.0.0.1:1234/v1`), OpenClaw can automatically fetch the list of loaded models.

### How to Enable

Because discovery initiates network requests, it is not enabled by default. You must enable the provider by setting an API key (any string will do for local servers that don't enforce auth).

**Option 1: Environment Variable**

```bash
export LMSTUDIO_API_KEY="lm-studio"
```

**Option 2: Config/Profile**

```bash
openclaw config set models.providers.lmstudio.apiKey "lm-studio"
```

Once enabled, OpenClaw will query `http://127.0.0.1:1234/v1/models` to verify connectivity, and register all available models.

### Configuring Inference Timeout

Large models (70B+ parameters) may require more time to load and generate responses, especially on consumer hardware (M1/M2 Max, etc.). If you experience timeout errors with large models, increase the agent timeout in your config:

**CLI**

```bash
# Set timeout to 20 minutes (1200 seconds) for large models
openclaw config set agents.defaults.timeoutSeconds 1200
```

**Config File** (`~/.openclaw/openclaw.json`)

```json5
{
  agents: {
    defaults: {
      timeoutSeconds: 1200, // 20 minutes
    },
  },
}
```

The default timeout is 600 seconds (10 minutes). This timeout covers the entire inference cycle, including model loading and token generation.

### Usage

After enabling, list the available models:

```bash
openclaw models list
```

You should see models like `lmstudio/model-id`. You can then use them in your agent configuration:

```bash
openclaw config set agents.defaults.model.primary "lmstudio/my-model-id"
```

## Generic / Other Providers

For other local providers (LocalAI, vLLM) or non-standard ports, you can manually configure the provider in `~/.openclaw/openclaw.json`.

```json5
{
  models: {
    providers: {
      localai: {
        baseUrl: "http://127.0.0.1:8080/v1",
        api: "openai-completions",
        // Optional: define models manually if discovery isn't supported
        models: [
          {
            id: "my-model",
            name: "Local Model",
            contextWindow: 4096,
            maxTokens: 2000,
          },
        ],
      },
    },
  },
}
```

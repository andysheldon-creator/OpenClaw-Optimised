---
summary: "Use Azure OpenAI models (GPT-4o, GPT-5, etc.) in OpenClaw via LiteLLM proxy"
read_when:
  - You want to use Azure OpenAI models
  - You have Azure credits or an Azure OpenAI deployment
  - You need enterprise-grade Azure compliance
title: "Azure OpenAI"
---

# Azure OpenAI

Azure OpenAI Service provides enterprise-grade access to OpenAI models (GPT-4o, GPT-5, etc.) with Azure security and compliance features.

## Why Azure OpenAI

- **Enterprise compliance**: SOC 2, HIPAA, and other certifications
- **Azure credits**: Use existing Azure Sponsorship, Enterprise Agreements, or MSDN subscriptions
- **Regional deployment**: Deploy models in specific Azure regions
- **Private networking**: VNet integration and private endpoints

## Setup with LiteLLM Proxy

Azure OpenAI requires a LiteLLM proxy because its API differs from standard OpenAI:
- Uses `api-key` header instead of `Authorization: Bearer`
- Different URL format with deployment names in the path
- Doesn't support some OpenAI params (like `store`)

### Step 1: Install LiteLLM

```bash
pip install litellm[proxy]
```

### Step 2: Create LiteLLM Config

Create `litellm_config.yaml`:

```yaml
model_list:
  - model_name: gpt-4o-mini
    litellm_params:
      model: azure/your-gpt4o-mini-deployment
      api_base: https://your-resource.openai.azure.com
      api_key: ${AZURE_OPENAI_API_KEY}
      api_version: "2024-10-21"

  - model_name: gpt-5.2-codex
    litellm_params:
      model: azure/your-gpt5-codex-deployment
      api_base: https://your-resource.openai.azure.com
      api_key: ${AZURE_OPENAI_API_KEY}
      api_version: "2024-10-21"

litellm_settings:
  drop_params: true  # Required: OpenClaw sends params Azure doesn't support
```

Replace:
- `your-resource` with your Azure OpenAI resource name
- `your-gpt4o-mini-deployment` and `your-gpt5-codex-deployment` with your deployment names
- Set `AZURE_OPENAI_API_KEY` environment variable with your Azure API key

### Step 3: Start LiteLLM Proxy

```bash
litellm --config litellm_config.yaml --port 4000
```

### Step 4: Configure OpenClaw

Add to `~/.openclaw/openclaw.json`:

```json5
{
  models: {
    mode: "merge",
    providers: {
      "azure-openai": {
        baseUrl: "http://localhost:4000/v1",
        apiKey: "your-litellm-key",
        api: "openai-completions",
        models: [
          {
            id: "gpt-4o-mini",
            name: "GPT-4o Mini (Azure)",
            reasoning: false,
            input: ["text", "image"],
            contextWindow: 128000,
            maxTokens: 16384,
            compat: { supportsStore: false },
          },
          {
            id: "gpt-5.2-codex",
            name: "GPT-5.2 Codex (Azure)",
            reasoning: false,
            input: ["text", "image"],
            contextWindow: 200000,
            maxTokens: 16384,
            compat: { supportsStore: false },
          },
        ],
      },
    },
  },
  agents: {
    defaults: {
      model: { primary: "azure-openai/gpt-5.2-codex" },
    },
  },
}
```

## Key Configuration Notes

### Required Settings

- `api: "openai-completions"` - Tells OpenClaw to use OpenAI-compatible format
- `mode: "merge"` - Preserves built-in providers while adding Azure
- `compat: { supportsStore: false }` - Azure doesn't support the `store` parameter

### LiteLLM `drop_params: true`

This setting is critical. Without it, you'll get errors like:
```
azure does not support parameters: ['store']
```

### API Version

Use a recent API version. Recommended: `2024-10-21` or later.

## Finding Your Azure Configuration

1. **Resource Endpoint**: Azure Portal > Your OpenAI Resource > Overview > Endpoint
2. **Deployment Name**: Azure Portal > Your OpenAI Resource > Model Deployments
3. **API Key**: Azure Portal > Your OpenAI Resource > Keys and Endpoint

## Troubleshooting

### "No API provider registered" error

Ensure your provider config includes `"api": "openai-completions"`.

### Empty responses

- Check LiteLLM logs for errors
- Verify deployment name matches exactly
- Confirm API key has access to the deployment

### Rate limiting

Azure OpenAI has per-deployment rate limits. Consider:
- Increasing TPM (tokens per minute) quota in Azure Portal
- Using multiple deployments with model failover

## Docker Deployment

For production, run LiteLLM in Docker:

```yaml
# docker-compose.yml
services:
  litellm:
    image: ghcr.io/berriai/litellm:main-latest
    ports:
      - "4000:4000"
    volumes:
      - ./litellm_config.yaml:/app/config.yaml
    environment:
      - AZURE_OPENAI_API_KEY=${AZURE_OPENAI_API_KEY}
    command: ["--config", "/app/config.yaml", "--port", "4000"]
```

## See Also

- [Model Providers](/concepts/model-providers) - Overview of all providers
- [Model Failover](/concepts/model-failover) - Configure fallback models
- [LiteLLM Documentation](https://docs.litellm.ai/docs/providers/azure)

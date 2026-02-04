---
title: Azure OpenAI & Azure Foundry
description: Connect OpenClaw to Azure OpenAI Service and Azure Foundry deployments with automatic model discovery
---

# Azure OpenAI & Azure Foundry

OpenClaw supports **Azure OpenAI Service** (GPT models) and **Azure Foundry** (Claude, Llama, etc.) with automatic deployment discovery.

## Features

- **Automatic model discovery**: Queries Azure API to list all deployed models
- **Azure CLI authentication**: Uses `az account get-access-token` (no keys needed)
- **API key fallback**: Supports `AZURE_OPENAI_API_KEY` environment variable
- **Chat + embeddings**: Discovers both chat completions and embedding models
- **Caching**: Refreshes deployments hourly (configurable)

## Quick Start

### 1. Install Azure CLI

```bash
# macOS
brew install azure-cli

# Linux
curl -sL https://aka.ms/InstallAzureCLIDeb | sudo bash

# Windows
winget install Microsoft.AzureCLI
```

### 2. Authenticate

```bash
az login
```

### 3. Configure OpenClaw

Set your Azure OpenAI endpoint:

```bash
openclaw config set models.azureDiscovery.endpoint "https://YOUR-RESOURCE.openai.azure.com"
openclaw config set models.azureDiscovery.enabled true
```

### 4. Verify Discovery

```bash
openclaw models list
```

You should see all your Azure deployments listed under the `azure-openai` provider.

## Configuration

### Automatic Discovery

OpenClaw discovers deployments when `models.azureDiscovery.endpoint` is set:

```json5
{
  models: {
    azureDiscovery: {
      enabled: true,
      endpoint: "https://YOUR-RESOURCE.openai.azure.com",
      refreshInterval: 3600,
      defaultContextWindow: 128000,
      defaultMaxTokens: 16000,
    },
  },
}
```

#### Options

- `enabled`: Enable/disable discovery (default: `true` when endpoint is set)
- `endpoint`: Azure OpenAI resource endpoint (required)
- `refreshInterval`: Cache duration in seconds (default: 3600, set to `0` to disable)
- `defaultContextWindow`: Default context window for discovered models
- `defaultMaxTokens`: Default max output tokens for discovered models

### Authentication Methods

#### Azure CLI (Recommended)

Automatically uses `az account get-access-token`:

```bash
az login
az account set --subscription "YOUR-SUBSCRIPTION"
```

#### API Key

Set the environment variable:

```bash
export AZURE_OPENAI_API_KEY="your-api-key-here"
```

Or use a shell profile (`.bashrc`, `.zshrc`):

```bash
echo 'export AZURE_OPENAI_API_KEY="your-key"' >> ~/.bashrc
source ~/.bashrc
```

### Manual Provider Configuration

If you prefer not to use discovery, configure manually:

```json5
{
  models: {
    providers: {
      "azure-openai": {
        baseUrl: "https://YOUR-RESOURCE.openai.azure.com",
        api: "openai-completions",
        auth: "azure-cli", // or "api-key"
        models: [
          {
            id: "gpt-4",
            name: "GPT-4",
            reasoning: false,
            input: ["text", "image"],
            cost: { input: 30, output: 60, cacheRead: 0, cacheWrite: 0 },
            contextWindow: 128000,
            maxTokens: 16000,
          },
          {
            id: "text-embedding-3-large",
            name: "Text Embedding 3 Large",
            reasoning: false,
            input: ["text"],
            cost: { input: 0.13, output: 0, cacheRead: 0, cacheWrite: 0 },
            contextWindow: 8191,
            maxTokens: 8191,
          },
        ],
      },
    },
  },
}
```

## Azure Foundry (Anthropic Models)

Azure Foundry uses a different endpoint pattern:

```bash
openclaw config set models.azureDiscovery.endpoint "https://YOUR-RESOURCE.services.ai.azure.com"
```

Models will be discovered with the same configuration.

## Memory Search (Embeddings)

Azure embeddings work automatically with OpenClaw's memory search:

```json5
{
  agents: {
    defaults: {
      memory: {
        search: {
          provider: "azure-openai",
          model: "text-embedding-3-large",
        },
      },
    },
  },
}
```

See [Memory Search](/concepts/memory) for full configuration.

## Deployment Discovery

OpenClaw queries the Azure API to list deployments:

```
GET https://YOUR-RESOURCE.openai.azure.com/openai/deployments?api-version=2024-08-01-preview
```

### Filtering

Only models with `provisioningState: "Succeeded"` are included. OpenClaw automatically:

- Detects chat models (GPT, Claude, Llama, Mistral, Phi)
- Detects embedding models (text-embedding, ada)
- Infers reasoning support (o1 models)
- Infers vision support (GPT-4, Claude 3)

## Model Selection

Use discovered models with the provider prefix:

```bash
# Chat
openclaw message send --model azure-openai/gpt-4 "Hello!"

# Embeddings (memory search)
openclaw config set agents.defaults.memory.search.model azure-openai/text-embedding-3-large
```

Or set as default:

```bash
openclaw config set agents.defaults.model.primary azure-openai/gpt-4
```

## Troubleshooting

### No models discovered

1. Verify endpoint:
   ```bash
   openclaw config get models.azureDiscovery.endpoint
   ```

2. Check Azure login:
   ```bash
   az account show
   ```

3. Test deployments manually:
   ```bash
   az rest --url "https://YOUR-RESOURCE.openai.azure.com/openai/deployments?api-version=2024-08-01-preview"
   ```

4. Enable debug logging:
   ```bash
   NODE_ENV=development openclaw models list
   ```

### Authentication errors

- Ensure you're logged in: `az login`
- Check subscription: `az account list`
- Verify resource access: `az cognitiveservices account show --name YOUR-RESOURCE --resource-group YOUR-RG`

### Wrong models shown

Discovery caches for 1 hour. To force refresh:

```bash
openclaw config set models.azureDiscovery.refreshInterval 0
openclaw models list
openclaw config set models.azureDiscovery.refreshInterval 3600
```

## Notes

- Azure requires `?api-version` query parameters in URLs
- Embeddings use the same discovery endpoint as chat models
- Azure CLI tokens expire after 1 hour (automatically refreshed)
- Discovery respects Azure RBAC permissions
- Models are sorted alphabetically by display name

## Links

- [Azure OpenAI Service](https://azure.microsoft.com/products/ai-services/openai-service)
- [Azure Foundry](https://learn.microsoft.com/azure/ai-services/foundry/)
- [Azure CLI](https://learn.microsoft.com/cli/azure/)
- [OpenClaw Models Config](/concepts/models)

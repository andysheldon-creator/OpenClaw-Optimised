---
summary: "Use Ask Sage enterprise AI models in OpenClaw"
read_when:
  - You want enterprise AI with multi-cloud routing in OpenClaw
  - You want Ask Sage setup guidance
title: "Ask Sage"
---

# Ask Sage

**Ask Sage** provides enterprise AI access with multi-cloud routing and reliability across major AI providers.

Ask Sage offers access to multiple models from Anthropic, hosted on Bedrock and Vertex, with access to government approved models, through a unified API with enterprise-grade reliability and multi-cloud failover.

## Why Ask Sage in OpenClaw

- **Multi-cloud routing** for high availability and reliability.
- **Enterprise models** including government cloud options (AWS GovCloud).
- **Multiple Anthropic models** from AWS (Bedrock) and Google (Vertex) in one place.
- **Simple pricing** with per-request billing across all models.
- Anthropic-compatible `/v1` endpoints.

## Features

- **Multi-cloud access**: Google and AWS Bedrock
- **Government cloud**: AWS GovCloud models for regulated environments
- **OpenAI-compatible API**: Standard `/v1` endpoints for easy integration
- **Function calling**: ✅ Supported on compatible models

## Setup

### 1. Get API Key

1. Sign up at [asksage.ai](https://asksage.ai)
2. Go to **Settings → API Keys**
3. Create a new API key
4. Copy your API key

### 2. Configure OpenClaw

**Option A: Environment Variable**

```bash
export ASKSAGE_API_KEY="your-api-key-here"
```

**Option B: Interactive Setup (Recommended)**

```bash
openclaw onboard --auth-choice asksage-api-key
```

This will:

1. Prompt for your API key (or use existing `ASKSAGE_API_KEY`)
2. Show all available Ask Sage models
3. Let you pick your default model
4. Configure the provider automatically

**Option C: Non-interactive**

```bash
openclaw onboard --non-interactive \
  --auth-choice asksage-api-key \
  --token "your-api-key-here" \
  --token-provider asksage
```

### 3. Verify Setup

```bash
openclaw chat --model asksage/claude-4-sonnet "Hello, are you working?"
```

## Available Models

Ask Sage provides access to multiple Anthropic models across multiple categories:

### Anthropic Claude Models

| Model ID | Name | Reasoning | Vision | Context Window |
|----------|------|-----------|--------|----------------|
| `google-claude-45-sonnet` | Claude 4.5 Sonnet (Google Cloud) | ✅ | ✅ | 200K |
| `google-claude-45-opus` | Claude 4.5 Opus (Google Cloud) | ✅ | ✅ | 200K |
| `google-claude-45-haiku` | Claude 4.5 Haiku (Google Cloud) | ✅ | ✅ | 200K |
| `google-claude-4-sonnet` | Claude 4 Sonnet (Google Cloud) | ✅ | ✅ | 200K |
| `google-claude-4-opus` | Claude 4 Opus (Google Cloud) | ✅ | ✅ | 200K |

### AWS Bedrock (Government Cloud)

| Model ID | Name | Reasoning | Vision | Context Window |
|----------|------|-----------|--------|----------------|
| `aws-bedrock-claude-45-sonnet-gov` | Claude 4.5 Sonnet (AWS Gov) | ✅ | ✅ | 200K |
| `aws-bedrock-claude-37-sonnet-gov` | Claude 3.7 Sonnet (AWS Gov) | ❌ | ✅ | 200K |
| `aws-bedrock-claude-35-sonnet-gov` | Claude 3.5 Sonnet (AWS Gov) | ❌ | ✅ | 200K |


## Model Selection

After setup, OpenClaw shows all available Ask Sage models. Pick based on your needs:

- **Default (recommended)**: `asksage/claude-4-sonnet` for best balance of capability and reliability.
- **Best reasoning**: `asksage/claude-45-opus` for complex reasoning tasks.
- **Government/compliance**: `asksage/aws-bedrock-claude-45-sonnet-gov` for AWS GovCloud.

Change your default model anytime:

```bash
openclaw models set asksage/google-claude-4-sonnet
openclaw models set asksage/aws-bedrock-claude-45-sonnet-gov

```

## Usage Examples

### Basic Chat

```bash
# Use default model
openclaw chat "Explain quantum computing"

# Specify model
openclaw chat --model asksage/google-claude-4-opus "Write a Python function to sort a list"

# Use reasoning model
openclaw chat --model asksage/google-claude-45-sonnet "Solve this logic puzzle: ..."
```

### Agent Sessions

```bash
# Start agent with Ask Sage model
openclaw agent --model asksage/google-claude-4-sonnet

# Use government cloud model
openclaw agent --model asksage/aws-bedrock-claude-45-sonnet-gov
```

### Model Switching

```bash
# List all Ask Sage models
openclaw models list --provider asksage

# Check current configuration
openclaw config get agents.defaults.model

# Set new default
openclaw models set asksage/aws-bedrock-claude-45-sonnet-gov
```

## Configuration

### Manual Configuration

Edit `~/.openclaw/config.json`:

```json
{
  "models": {
    "providers": {
      "asksage": {
        "baseUrl": "https://api.asksage.ai/server",
        "api": "anthropic-messages",
        "apiKey": "your-api-key-here"
      }
    }
  },
  "agents": {
    "defaults": {
      "model": {
        "primary": "asksage/aws-bedrock-claude-45-sonnet-gov"
      }
    }
  }
}
```

### Model Aliases

Set custom aliases for frequently used models:

```json
{
  "agents": {
    "defaults": {
      "models": {
        "asksage/claude-4-sonnet": {
          "alias": "claude"
        },
      }
    }
  }
}
```

Then use aliases:

```bash
openclaw chat --model claude "Hello"
```

## Troubleshooting

### Authentication Errors

**Problem**: `401 Unauthorized` or `Invalid API key`

**Solution**:

1. Verify your API key is correct:
   ```bash
   echo $ASKSAGE_API_KEY
   ```

2. Check stored credentials:
   ```bash
   openclaw config get models.providers.asksage.apiKey
   ```

3. Re-run onboarding:
   ```bash
   openclaw onboard --auth-choice asksage-api-key
   ```

### Model Not Found

**Problem**: `Model 'asksage/model-name' not found`

**Solution**:

1. List available models:
   ```bash
   openclaw models list --provider asksage
   ```

2. Verify provider is configured:
   ```bash
   openclaw config get models.providers.asksage
   ```

3. Check for typos in model ID (use exact ID from models list)

### Rate Limits

**Problem**: `429 Too Many Requests`

**Solution**:

Ask Sage uses per-request billing without hard rate limits. If you encounter rate limiting:

1. Check your account status at asksage.ai
2. Ensure you have sufficient credits
3. Contact Ask Sage support if limits seem incorrect

### Connection Issues

**Problem**: `Failed to connect to Ask Sage API`

**Solution**:

1. Check internet connectivity:
   ```bash
   curl https://api.asksage.ai/server/get-models
   ```

2. Verify base URL in config:
   ```bash
   openclaw config get models.providers.asksage.baseUrl
   # Should be: https://api.asksage.ai/server
   ```

3. Check for proxy/firewall issues

## FAQ

### What models are available?

Ask Sage provides multiple Anthropic models including:
- 13 Claude models (Google Cloud + AWS Gov)

Run `openclaw models list --provider asksage` to see the full list.

### How is pricing calculated?

Ask Sage uses per-request pricing that varies by model. Check your usage and costs at [asksage.ai/settings](https://asksage.ai/settings).

### Can I use government cloud models?

Yes! Ask Sage provides AWS GovCloud models:
- `aws-bedrock-claude-45-sonnet-gov`
- `aws-bedrock-claude-37-sonnet-gov`
- `aws-bedrock-claude-35-sonnet-gov`

### What is multi-cloud routing?

Ask Sage routes requests across multiple cloud providers (AWS, Google Cloud) for improved reliability and availability. If one provider has issues, requests automatically failover to available providers.

### Which model should I use?

- **General purpose**: `claude-4-sonnet` (best balance)
- **Complex reasoning**: `claude-4-opus`
- **Government/compliance**: `aws-bedrock-claude-45-sonnet-gov`
- **Vision tasks**: Any Claude 4/4.5
- **Code generation**: `claude-4-sonnet`

### Does Ask Sage support function calling?

Yes! Most modern models support function calling/tool use:
- All Claude 4+ models

Verify support with: `openclaw models list --provider asksage`

### How do I switch providers?

If you want to switch from another provider to Ask Sage:

```bash
# Set Ask Sage as default
openclaw models set asksage/claude-4-sonnet

# Or run onboarding again
openclaw onboard --auth-choice asksage-api-key
```

Your other providers remain configured and available.

## Support

- Documentation: [docs.asksage.ai](https://docs.asksage.ai)
- Support: Contact Ask Sage support team
- OpenClaw Docs: [docs.openclaw.ai](https://docs.openclaw.ai)
- Issues: [github.com/openclaw/openclaw/issues](https://github.com/openclaw/openclaw/issues)

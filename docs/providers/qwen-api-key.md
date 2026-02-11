# Qwen DashScope API Key Authentication

This guide explains how to authenticate with Qwen using DashScope API keys.

## Overview

OpenClaw supports two authentication methods for Qwen:

1. **OAuth** (Free) - Portal.qwen.ai device flow
2. **API Key** (Paid) - DashScope API key (this guide)

## Getting Started

### Prerequisites

You need a DashScope API key from either:

- **International**: https://www.alibabacloud.com/help/en/model-studio/
- **China**: https://dashscope.aliyuncs.com/

## Authentication Methods

### Method 1: Interactive Configuration (Recommended)

```bash
openclaw models auth login --provider qwen-portal
```

**Steps:**

1. Select **"Qwen API Key"** (not OAuth)
2. Choose your region:
   - 🌏 International (Singapore)
   - 🇨🇳 China
3. Enter your API key (format: `sk-...`)
4. Configuration completes automatically

### Method 2: Environment Variable

```bash
export QWEN_API_KEY="sk-your-api-key-here"
openclaw restart
```

**Note**: You still need to set the correct `baseUrl` in your config:

- International: `https://dashscope-intl.aliyuncs.com/compatible-mode/v1`
- China: `https://dashscope.aliyuncs.com/compatible-mode/v1`

### Method 3: Manual Configuration

Edit `~/.openclaw/openclaw.json`:

```json
{
  "models": {
    "providers": {
      "qwen-portal": {
        "baseUrl": "https://dashscope-intl.aliyuncs.com/compatible-mode/v1",
        "apiKey": "profile:qwen-portal:default",
        "api": "openai-completions"
      }
    }
  }
}
```

Then add to `~/.openclaw/agents/main/agent/auth-profiles.json`:

```json
{
  "profiles": {
    "qwen-portal:default": {
      "type": "api_key",
      "provider": "qwen-portal",
      "key": "sk-your-api-key"
    }
  }
}
```

## Supported Models

### Coding Models

| Model ID            | Name              | Alias         | Best For                       |
| ------------------- | ----------------- | ------------- | ------------------------------ |
| `qwen3-coder-plus`  | Qwen3 Coder Plus  | `qwen3-coder` | Latest coding tasks ⭐️⭐️⭐️⭐️⭐️ |
| `qwen-coder-plus`   | Qwen Coder Plus   | `qwen-coder`  | Coding tasks ⭐️⭐️⭐️⭐️          |
| `qwen3-coder-flash` | Qwen3 Coder Flash | -             | Fast coding ⭐️⭐️⭐️             |

### General Models

| Model ID     | Name       | Alias  | Best For                     |
| ------------ | ---------- | ------ | ---------------------------- |
| `qwen3-max`  | Qwen3 Max  | -      | Most capable ⭐️⭐️⭐️⭐️⭐️      |
| `qwen-max`   | Qwen Max   | -      | Complex reasoning ⭐️⭐️⭐️⭐️⭐️ |
| `qwen-plus`  | Qwen Plus  | `qwen` | General purpose ⭐️⭐️⭐️⭐️     |
| `qwen-turbo` | Qwen Turbo | -      | Fast responses ⭐️⭐️⭐️        |

### Vision Models

| Model ID        | Name              | Alias | Best For                     |
| --------------- | ----------------- | ----- | ---------------------------- |
| `qwen3-vl-plus` | Qwen3 Vision Plus | -     | Latest vision ⭐️⭐️⭐️⭐️⭐️     |
| `qwen-vl-plus`  | Qwen Vision Plus  | -     | Image understanding ⭐️⭐️⭐️⭐️ |

## Usage Examples

### Using Default Model

```bash
openclaw chat "Hello, write a quicksort algorithm"
```

### Using Specific Model

```bash
# Latest coding model
openclaw chat --model qwen3-coder "Implement binary search"

# Most capable model
openclaw chat --model qwen3-max "Explain quantum computing"

# Vision model
openclaw chat --model qwen3-vl-plus "Analyze this image" --image photo.jpg
```

### Using Model Aliases

```bash
# Alias: qwen → qwen-plus
openclaw chat --model qwen "General question"

# Alias: qwen3-coder → qwen3-coder-plus
openclaw chat --model qwen3-coder "Debug this code"
```

## Region Differences

### International (Singapore)

**Endpoint**: `https://dashscope-intl.aliyuncs.com/compatible-mode/v1`

**Features:**

- Latest models (qwen3 series)
- English documentation
- International payment methods

**Get API Key**: https://www.alibabacloud.com/help/en/model-studio/developer-reference/get-api-key

---

### China

**Endpoint**: `https://dashscope.aliyuncs.com/compatible-mode/v1`

**Features:**

- Same models as International
- Additional older models (qwen2.5-coder variants)
- Chinese documentation
- Aliyun China payment

**Get API Key**: https://dashscope.aliyuncs.com/

---

## OAuth vs API Key Comparison

| Feature         | OAuth             | API Key                        |
| --------------- | ----------------- | ------------------------------ |
| **Cost**        | Free tier         | Paid usage                     |
| **Setup**       | Browser login     | Copy API key                   |
| **Endpoint**    | portal.qwen.ai    | dashscope-intl/cn.aliyuncs.com |
| **Models**      | 2 (coder, vision) | 9+ verified models             |
| **Rate Limits** | Free tier limits  | Based on plan                  |
| **Best For**    | Personal/testing  | Production/commercial          |

## Troubleshooting

### Issue 1: Invalid API Key

```
Error: 401 Unauthorized
```

**Solution**:

- Verify API key format (starts with `sk-`)
- Check if key is expired
- Ensure using correct region endpoint

### Issue 2: Wrong Region

```
Error: Connection timeout / Invalid API key
```

**Solution**:

- International keys → International endpoint
- China keys → China endpoint
- Keys are NOT interchangeable between regions

### Issue 3: Model Not Found

```
Error: model not found
```

**Solution**:

- International/China support the same core models
- Use model IDs without region prefix (e.g., `qwen-plus`, not `qwen.qwen-plus`)
- Avoid AWS Bedrock naming format (e.g., `qwen.qwen3-coder-30b-a3b-v1:0`)

### Issue 4: Environment Variable Not Working

```bash
# Verify environment variable is set
echo $QWEN_API_KEY

# Restart openclaw
openclaw restart
```

## Configuration Files

- **Main config**: `~/.openclaw/openclaw.json`
- **Auth profiles**: `~/.openclaw/agents/main/agent/auth-profiles.json`
- **Model config**: In `openclaw.json` under `models.providers.qwen-portal`

## Testing

### Quick Test

```bash
# Test API directly
curl https://dashscope-intl.aliyuncs.com/compatible-mode/v1/chat/completions \
  -H "Authorization: Bearer sk-your-key" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "qwen-plus",
    "messages": [{"role": "user", "content": "Hello"}]
  }'
```

### Integration Test

```bash
# Run test script
./test-qwen-apikey.sh

# Or manually
npm run build
openclaw models auth login --provider qwen-portal
openclaw chat "Test message"
```

## Security Best Practices

1. **Never commit API keys** to version control
2. **Set file permissions**: `chmod 600 ~/.openclaw/agents/main/agent/auth-profiles.json`
3. **Use environment variables** for CI/CD environments
4. **Rotate keys regularly** per your security policy

## See Also

- [Qwen OAuth Documentation](./qwen.md)
- [Model Providers Guide](../concepts/model-providers.md)
- [Authentication Guide](../guides/authentication.md)

## Feedback

If you encounter issues or have suggestions, please:

1. Check the troubleshooting section above
2. Review configuration files
3. Open an issue on GitHub with details

---

**Last Updated**: 2026-02-11  
**Tested Regions**: International (Singapore), China  
**Verified Models**: 9 models across both regions

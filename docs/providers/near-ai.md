---
summary: "Use NEAR AI private inference in Clawdbot"
read_when:
  - You want private inference with Intel TDX/NVIDIA TEE
  - You want NEAR AI setup guidance
---
# NEAR AI

NEAR AI provides privacy-focused AI inference using confidential computing. All inference runs inside Intel TDX (Trust Domain Extensions) and NVIDIA TEE (Trusted Execution Environment), ensuring your prompts and responses are never logged or exposed to the host system.

## Why NEAR AI in Clawdbot

- **Private inference** - all computation happens inside secure enclaves.
- **Cryptographic verification** - outputs are signed inside TEE before leaving.
- **No logging** - prompts and responses are never stored.
- OpenAI-compatible `/v1` endpoints.

## Privacy Technology

NEAR AI uses two layers of hardware-based security:

| Technology | Purpose |
|------------|---------|
| **Intel TDX** | Isolates AI workloads in confidential VMs |
| **NVIDIA TEE** | GPU-level isolation for model weights and computations |

All AI outputs are cryptographically signed inside the TEE before leaving the secure environment, ensuring authenticity and integrity of responses.

## Features

- **OpenAI-compatible API**: Standard `/v1/chat/completions` endpoint
- **Streaming**: Supported on all models
- **Function calling**: Supported
- **Vision**: Supported on vision-capable models

## Setup

### 1. Get API Key

1. Sign up at [cloud.near.ai](https://cloud.near.ai)
2. Go to your dashboard and generate an API key
3. Copy your API key

### 2. Configure Clawdbot

**Option A: Environment Variable**

```bash
export NEARAI_API_KEY="your-api-key"
```

**Option B: Interactive Setup (Recommended)**

```bash
clawdbot onboard --auth-choice near-ai-api-key
```

This will:
1. Prompt for your API key (or use existing `NEARAI_API_KEY`)
2. Configure the provider automatically
3. Set NEAR AI as your default model

**Option C: Non-interactive**

```bash
clawdbot onboard --non-interactive \
  --auth-choice near-ai-api-key \
  --near-ai-api-key "your-api-key"
```

### 3. Verify Setup

```bash
clawdbot chat --model near-ai/zai-org/GLM-4.7 "Hello, are you working?"
```

## Model Selection

After setup, you can use any available NEAR AI model:

```bash
clawdbot models set near-ai/zai-org/GLM-4.7
clawdbot models set near-ai/deepseek-ai/DeepSeek-V3.1
```

List all available models:

```bash
clawdbot models list | grep near-ai
```

## Available Models

> **Note:** The model list may change. See the latest available models at [cloud.near.ai/models](https://cloud.near.ai/models).

| Model ID | Name | Context | Cost ($/M tokens) |
|----------|------|---------|-------------------|
| `deepseek-ai/DeepSeek-V3.1` | DeepSeek V3.1 | 128K | $1.05 in / $3.10 out |
| `openai/gpt-oss-120b` | GPT OSS 120B | 131K | $0.15 in / $0.55 out |
| `Qwen/Qwen3-30B-A3B-Instruct-2507` | Qwen3 30B | 262K | $0.15 in / $0.55 out |
| `zai-org/GLM-4.7` | GLM 4.7 (default) | 131K | $0.85 in / $3.30 out |

## Configure via `clawdbot configure`

1. Run `clawdbot configure`
2. Select **Model/auth**
3. Choose **NEAR AI**

## Usage Examples

```bash
# Use default model (GLM 4.7)
clawdbot chat --model near-ai/zai-org/GLM-4.7

# Use DeepSeek for reasoning tasks
clawdbot chat --model near-ai/deepseek-ai/DeepSeek-V3.1

# Use Qwen for long context (262K!)
clawdbot chat --model near-ai/Qwen/Qwen3-30B-A3B-Instruct-2507

# Send a message
clawdbot agent --message "Explain quantum computing" --model near-ai/zai-org/GLM-4.7
```

## Troubleshooting

### API key not recognized

```bash
echo $NEARAI_API_KEY
clawdbot models list | grep near-ai
```

Ensure the environment variable is set correctly.

### Connection issues

NEAR AI API is at `https://cloud-api.near.ai/v1`. Ensure your network allows HTTPS connections.

## Config file example

```json5
{
  env: { NEARAI_API_KEY: "..." },
  agents: { defaults: { model: { primary: "near-ai/zai-org/GLM-4.7" } } },
  models: {
    mode: "merge",
    providers: {
      "near-ai": {
        baseUrl: "https://cloud-api.near.ai/v1",
        apiKey: "${NEARAI_API_KEY}",
        api: "openai-completions"
        // Models are auto-discovered from the built-in catalog
      }
    }
  }
}
```

## Links

- [NEAR AI Cloud](https://cloud.near.ai)
- [NEAR AI Documentation](https://docs.near.ai)

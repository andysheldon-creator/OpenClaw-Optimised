---
summary: "Use SambaNova built-for-speed inference for LLaMA, Qwen, Deepseek and Gpt models via OpenAI-compatible API"
read_when:
  - You want to use SambaNova inference
  - You need fast model responses
---

# SambaNova

SambaNova provides **fast inference** using their RDU AI accelerator chips, delivering industry-leading speed for popular open-source models through an OpenAI-compatible API.

## CLI setup

```bash
clawdbot onboard --auth-choice sambanova-api-key
# or non-interactive
clawdbot onboard --sambanova-api-key "$SAMBANOVA_API_KEY"
```

## Config snippet

```json5
{
  env: { SAMBANOVA_API_KEY: "csk-..." },
  agents: {
    defaults: {
      model: { primary: "sambanova/llama3.1-8b" },
    },
  },
}
```

## Available models

All models run at FP16 or FP16/FP8 precision:

- `sambanova/Llama-4-Maverick-17B-128E-Instruct` - Llama 4 17B
- `sambanova/Meta-Llama-3.1-8B-Instruct` - Llama 3.1 8B
- `sambanova/DeepSeek-V3.1-Terminus` - Deepseek V3.1 Terminus
- `sambanova/gpt-oss-120b` - GPT OSS 120B

## Notes

- Base URL: `https://api.sambanova.ai/v1`
- OpenAI-compatible API (drop-in replacement)
- Model refs use `SAMBANOVA/<model>` format
- Get API key at: https://cloud.sambanova.ai/
- For more model options, see [/concepts/model-providers](/concepts/model-providers)

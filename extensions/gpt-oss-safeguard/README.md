# GPT-OSS-Safeguard

Runs the GPT-OSS-Safeguard model via OpenClaw's model providers (Ollama,
OpenRouter, or any OpenAI-compatible endpoint) to classify content and block or
monitor unsafe requests.

## What this does

This plugin uses a dedicated model call to evaluate the current content (optionally
including history) and returns a binary or JSON safety decision. It can:

- Block before model calls (`before_request`)
- Block tool calls (`before_tool_call`)
- Mutate or replace tool results (`after_tool_call`)
- Replace assistant responses (`after_response`)
- Run in `monitor` mode to only log violations

## Configuration

```json
{
  "plugins": {
    "entries": {
      "gpt-oss-safeguard": {
        "enabled": true,
        "config": {
          "provider": "openrouter",
          "model": "openai/gpt-oss-safeguard-120b",
          "policy": "Your custom safety policy here...",
          "systemPromptMode": "append",
          "reasoningEffort": "medium",
          "outputFormat": "json",
          "timeoutMs": 30000,
          "failOpen": true,
          "guardrailPriority": 60,
          "stages": {
            "beforeRequest": { "enabled": true, "mode": "block" },
            "afterResponse": { "enabled": true, "mode": "monitor" }
          }
        }
      }
    }
  }
}
```

## Notes

- Uses the built-in model provider system; configure auth profiles as usual.
- `policy` is optional. If omitted, a default policy focused on prompt injection,
  secret exfiltration, tool misuse, and basic safety checks is used.
- `systemPromptMode`:
  - `append` (default): policy becomes extra system prompt context.
  - `inline`: policy is embedded into the user prompt. This is not recommended
    for GPT-OSS-Safeguard and may reduce effectiveness.
- `outputFormat`:
  - `binary`: returns `0` (safe) or `1` (violation)
  - `json`: returns `{"violation": 0|1, "policy_category": "..."}`
  - `rich`: JSON with `confidence` and `rationale`
- `maxTokens` defaults to 500 (useful for reasoning outputs).
- `guardrailPriority` controls execution order when multiple guardrails run.

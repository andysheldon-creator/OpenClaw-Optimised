# Session Log Format

Clawdbot session logs are JSONL files stored at:
```
~/.clawdbot/agents/{agent}/sessions/{session-id}.jsonl
```

## Message Structure

Each line is a JSON object:

```json
{
  "type": "message",
  "timestamp": "2026-01-18T12:00:00.000Z",
  "requestId": "req_0123456789",
  "message": {
    "role": "assistant",
    "id": "msg_0123456789",
    "model": "claude-opus-4-5",
    "content": [...],
    "usage": {
      "input": 100,
      "output": 500,
      "cacheRead": 50000,
      "cacheWrite": 10000,
      "totalTokens": 50600,
      "cost": {
        "input": 0.0015,
        "output": 0.0375,
        "cacheRead": 0.025,
        "cacheWrite": 0.0625,
        "total": 0.1265
      }
    }
  }
}
```

## Usage Fields

| Field | Description |
|-------|-------------|
| `input` | Input tokens (prompt) |
| `output` | Output tokens (response) |
| `cacheRead` | Tokens read from prompt cache |
| `cacheWrite` | Tokens written to prompt cache |
| `totalTokens` | Sum of all token types |
| `cost.total` | Total cost in USD |
| `message.model` | Model name (optional) |
| `message.id` | Message ID (optional) |
| `requestId` | Request ID for deduplication (optional) |

## Cost Calculation

The logged cost reflects actual billing with cache discounts:
- Cache reads are 90% cheaper than input tokens
- API-equivalent cost reverses this discount for comparison

## File Conventions

- Sessions are append-only (one JSON per line)
- Deleted sessions have `.deleted.{timestamp}` suffix
- `sessions.json` maps session keys to session IDs

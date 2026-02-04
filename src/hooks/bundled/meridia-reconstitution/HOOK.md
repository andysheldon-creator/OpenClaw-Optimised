---
name: meridia-reconstitution
description: "Inject recent experiential context into new sessions at bootstrap"
metadata:
  {
    "openclaw":
      {
        "emoji": "🌅",
        "events": ["agent:bootstrap"],
        "requires": { "config": ["hooks.internal.entries.experiential-capture.enabled"] },
        "install": [{ "id": "bundled", "kind": "bundled", "label": "Bundled with OpenClaw" }],
      },
  }
---

# Meridia Reconstitution (Morning Briefing)

Injects recent experiential context from the Meridia continuity engine into new sessions
at bootstrap time. This gives every new session a compact "morning briefing" of recent
significant experiences, enabling experiential continuity across sessions.

## How It Works

1. On `agent:bootstrap`, queries the Meridia SQLite database
2. Retrieves the most significant experiences from the last 48 hours
3. Formats a compact briefing (under 2000 tokens)
4. Injects it as `MERIDIA-CONTEXT.md` in the bootstrap files

## Configuration

```json
{
  "hooks": {
    "internal": {
      "enabled": true,
      "entries": {
        "meridia-reconstitution": {
          "enabled": true,
          "maxTokens": 2000,
          "lookbackHours": 48,
          "minScore": 0.6
        }
      }
    }
  }
}
```

### Options

| Key             | Type    | Default | Description                              |
| --------------- | ------- | ------- | ---------------------------------------- |
| `enabled`       | boolean | true    | Enable/disable reconstitution            |
| `maxTokens`     | number  | 2000    | Maximum token budget for the briefing    |
| `lookbackHours` | number  | 48      | How far back to look for experiences     |
| `minScore`      | number  | 0.6     | Minimum significance score for inclusion |

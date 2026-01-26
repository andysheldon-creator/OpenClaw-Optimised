# Whoop (plugin)

Adds an **optional** agent tool `get_whoop_data` for querying Whoop fitness data including recovery scores, sleep analysis, strain/cycle tracking, and workout metrics.

## Enable

1) Configure the plugin with your Whoop OAuth credentials:

```json
{
  "plugins": {
    "entries": {
      "whoop": {
        "enabled": true,
        "config": {
          "clientId": "your-client-id",
          "clientSecret": "your-client-secret"
        }
      }
    }
  }
}
```

2) Register redirect URI at [developer.whoop.com](https://developer.whoop.com/):
```
http://localhost:8086/oauth2callback
```

3) Complete OAuth flow to authenticate with Whoop.

4) Allowlist the tool (it is registered with `optional: true`):

```json
{
  "agents": {
    "list": [
      {
        "id": "main",
        "tools": { "allow": ["get_whoop_data"] }
      }
    ]
  }
}
```

## Data Types

The tool provides access to:
- **Recovery**: HRV, resting heart rate, SpO2, skin temperature
- **Sleep**: Sleep stages, performance, efficiency, respiratory rate
- **Cycles**: Daily strain, average/max heart rate
- **Workouts**: Activity strain, heart rate zones, distance, calories

## Query Types

- `latest` - Get most recent single record
- `recent` - Get last N records (default: 7, max: 25)
- `by_id` - Get specific record by ID

## Notes

- Uses Whoop API v2 endpoints
- Automatic token refresh when expired
- Tokens stored securely via Clawdbot's credential system

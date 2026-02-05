# Graphiti Memory Configuration

Graphiti provides graph-based memory for OpenClaw agents, running as two complementary services:

1. **MCP Server** (port 8000) - Model Context Protocol service
2. **REST API Service** (port 8001) - HTTP REST endpoints for memory operations

## Configuration

Configure Graphiti in your OpenClaw config:

```json
{
  "memory": {
    "graphiti": {
      "enabled": true,
      "serverHost": "localhost",
      "mcpPort": 8000,
      "servicePort": 8001,
      "apiKey": "optional-api-key",
      "timeoutMs": 10000
    }
  }
}
```

### Configuration Fields

| Field         | Type    | Default       | Description                         |
| ------------- | ------- | ------------- | ----------------------------------- |
| `enabled`     | boolean | `false`       | Enable Graphiti memory backend      |
| `serverHost`  | string  | `"localhost"` | Hostname for Graphiti services      |
| `mcpPort`     | number  | `8000`        | Port for MCP service                |
| `servicePort` | number  | `8001`        | Port for REST API service           |
| `apiKey`      | string  | -             | Optional API key for authentication |
| `timeoutMs`   | number  | `10000`       | Request timeout in milliseconds     |

## LaunchAgent Setup

Both services are configured as macOS LaunchAgents:

**MCP Server:**

```
~/Library/LaunchAgents/com.openclaw.graphiti-mcp.plist
```

**REST API Service:**

```
~/Library/LaunchAgents/com.openclaw.graphiti-rest.plist
```

### Managing Services

```bash
# Check status
launchctl list | grep graphiti

# Restart services
launchctl kickstart -k gui/$UID/com.openclaw.graphiti-mcp
launchctl kickstart -k gui/$UID/com.openclaw.graphiti-rest

# View logs
tail -f ~/.openclaw/logs/graphiti-mcp-launchd.log
tail -f ~/.openclaw/logs/graphiti-rest-launchd.log
```

## Service Endpoints

### MCP Server (port 8000)

- Health: `GET http://localhost:8000/health`
- MCP: `http://localhost:8000/mcp/` (for MCP clients)

### REST API Service (port 8001)

- Health: `GET http://localhost:8001/healthcheck`
- Search: `POST http://localhost:8001/search`
- Episodes: `GET http://localhost:8001/episodes/{group_id}`
- Messages: `POST http://localhost:8001/messages`
- Full API docs: `http://localhost:8001/docs`

## Database

Both services connect to the same Neo4j database:

- Bolt: `bolt://localhost:7687`
- HTTP: `http://localhost:7474`
- Credentials stored in: `~/.openclaw/services/graphiti/*/env`

## Migration from baseUrl

**Old configuration (deprecated):**

```json
{
  "memory": {
    "graphiti": {
      "enabled": true,
      "baseUrl": "http://localhost:8000"
    }
  }
}
```

**New configuration:**

```json
{
  "memory": {
    "graphiti": {
      "enabled": true,
      "serverHost": "localhost",
      "servicePort": 8001
    }
  }
}
```

The `baseUrl` field has been removed in favor of separate `serverHost` and `servicePort` fields for better flexibility.

# Webhook Channel Plugin for OpenClaw

A simplified webhook provider plugin for OpenClaw that provides configuration infrastructure for generic WebSocket webhook connections.

## Important Note

This plugin provides **basic webhook infrastructure**. Full bidirectional WebSocket webhook functionality requires the standalone **openclaw-webhook-bridge** service, which connects to OpenClaw Gateway via WebSocket/HTTP.

See: https://github.com/sternelee/openclaw-webhook-bridge

## Current Functionality

- **Configuration Schema**: Defines the webhook channel configuration format
- **Gateway Method**: `webhook.status` - Check webhook configuration status
- **Agent Tool**: `webhook_test` - Test webhook configuration from within agent conversations

## Future Development

To fully integrate WebSocket webhook functionality into OpenClaw, one of the following approaches would be needed:

1. **Standalone Bridge Service** (Recommended): Continue using the standalone `openclaw-webhook-bridge` Go service
2. **Internal Gateway API**: Add internal APIs in OpenClaw to allow plugins to trigger agent requests
3. **WebSocket Plugin Extension**: Create a more sophisticated plugin that manages WebSocket connections and agent request dispatch

## Installation

1. Ensure the plugin is in the `extensions/webhook-channel/` directory
2. Install dependencies:

```bash
cd /Users/sternelee/www/github/openclaw
pnpm install
```

3. Build the project:

```bash
pnpm build
```

## Configuration

Add the plugin to your OpenClaw config (`~/.openclaw/openclaw.json`):

```json
{
  "plugins": {
    "entries": {
      "webhook-channel": {
        "enabled": true,
        "url": "ws://localhost:8080/ws",
        "uid": "your-unique-instance-id",
        "agentId": "main",
        "sessionScope": "per-sender"
      }
    }
  }
}
```

### Configuration Options

| Option         | Type    | Default          | Description                                                  |
| -------------- | ------- | ---------------- | ------------------------------------------------------------ |
| `enabled`      | boolean | `true`           | Whether the plugin is enabled                                |
| `url`          | string  | _(required)_     | WebSocket server URL (ws:// or wss://)                       |
| `uid`          | string  | _auto-generated_ | Unique instance ID for multi-instance routing                |
| `agentId`      | string  | `"main"`         | OpenClaw agent ID to use for requests                        |
| `sessionScope` | string  | `"per-sender"`   | Session scoping: `"per-sender"`, `"global"`, or `"explicit"` |

### Session Scopes

- **per-sender**: Each incoming message gets a unique session key (default)
- **global**: All messages share a single global session
- **explicit**: Use the `session` field from incoming messages, or build from `peerKind`/`peerId`

## Usage

### Using the Standalone Bridge Service (Recommended)

For full webhook functionality, use the standalone bridge:

```bash
# Clone and build the bridge
git clone https://github.com/sternelee/openclaw-webhook-bridge.git
cd openclaw-webhook-bridge
go build -o openclaw-bridge ./cmd/bridge/

# Start the bridge
./openclaw-bridge start webhook_url=ws://localhost:8080/ws
```

See [openclaw-webhook-bridge README](https://github.com/sternelee/openclaw-webhook-bridge) for more details.

### Using the Plugin

After enabling the plugin, you can:

1. **Check status** via Gateway method:

```javascript
await gatewayRequest("webhook.status");
// Returns: { plugin, version, enabled, configured, url, agentId, sessionScope, note }
```

2. **Test from agent conversation**:

Use the `webhook_test` tool in any agent conversation to verify your webhook configuration.

## Architecture Note

OpenClaw's plugin system is designed for:

- Registering tools for agents to call
- Registering gateway methods for external callers
- Registering lifecycle hooks

However, it does **not** currently provide:

- Direct API for plugins to trigger agent requests
- Event subscription for agent response streaming

The standalone bridge service works around these limitations by connecting to OpenClaw Gateway as a WebSocket/HTTP client and using the Gateway's RPC interface.

## Development

### File Structure

```
extensions/webhook-channel/
├── package.json           # Plugin package definition
├── openclaw.plugin.json   # Plugin metadata
├── README.md              # This file
├── index.ts               # Plugin entry point
├── tsconfig.json          # TypeScript configuration
└── src/
    ├── types.ts           # TypeScript definitions
    └── config.ts          # Configuration schema & resolution
```

### Testing

```bash
# Lint
pnpm lint

# Format
pnpm format:fix
```

## License

MIT

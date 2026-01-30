# OpenClaw Cursor MCP Integration

This extension provides Model Context Protocol (MCP) server integration for [Cursor IDE](https://cursor.com), enabling OpenClaw as an AI backend within Cursor's Composer Agent.

## Features

- **Chat with OpenClaw Agent**: Use OpenClaw's AI capabilities directly in Cursor
- **Session Management**: Create, list, and manage conversation sessions
- **Multi-Channel Messaging**: Send messages through WhatsApp, Telegram, Discord, Slack, and more
- **Model Selection**: Choose from any AI model configured in OpenClaw
- **Code Assistance Prompts**: Built-in prompts for code review, debugging, test generation, and more

## Quick Start

### Prerequisites

1. OpenClaw installed and gateway running:
   ```bash
   npm install -g openclaw
   openclaw gateway run
   ```

2. Cursor IDE installed

### Setup in Cursor

#### Option 1: Cursor Settings UI

1. Open **Cursor Settings** → **Features** → **MCP**
2. Click **"+ Add New MCP Server"**
3. Configure:
   - **Name**: `openclaw`
   - **Type**: `stdio`
   - **Command**: `openclaw`
   - **Arguments**: `mcp serve`

#### Option 2: Manual Configuration

Create or edit `~/.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "openclaw": {
      "command": "openclaw",
      "args": ["mcp", "serve"],
      "env": {
        "OPENCLAW_GATEWAY_URL": "ws://127.0.0.1:18789"
      }
    }
  }
}
```

### Authentication (Optional)

If your gateway requires authentication, add credentials to the environment:

```json
{
  "mcpServers": {
    "openclaw": {
      "command": "openclaw",
      "args": ["mcp", "serve"],
      "env": {
        "OPENCLAW_GATEWAY_URL": "ws://127.0.0.1:18789",
        "OPENCLAW_GATEWAY_TOKEN": "your-token-here",
        "OPENCLAW_GATEWAY_PASSWORD": "your-password-here"
      }
    }
  }
}
```

## Available Tools

| Tool | Description |
|------|-------------|
| `openclaw_chat` | Chat with the OpenClaw AI agent |
| `openclaw_list_sessions` | List all active chat sessions |
| `openclaw_get_session` | Get details about a specific session |
| `openclaw_clear_session` | Clear a session's conversation history |
| `openclaw_execute_command` | Execute OpenClaw control commands |
| `openclaw_send_message` | Send messages through channels |
| `openclaw_get_status` | Get gateway and channel status |
| `openclaw_list_models` | List available AI models |

## Available Resources

| URI | Description |
|-----|-------------|
| `openclaw://status` | Gateway and channel status |
| `openclaw://models` | Available AI models |
| `openclaw://sessions` | Active chat sessions |
| `openclaw://config` | Current configuration (sanitized) |

## Available Prompts

| Prompt | Description |
|--------|-------------|
| `code_review` | Review code for issues and improvements |
| `explain_code` | Explain how code works |
| `generate_tests` | Generate tests for code |
| `refactor_code` | Suggest refactoring improvements |
| `debug_help` | Help debug issues |
| `send_notification` | Send notification via channels |

## Usage Examples

### Chat with OpenClaw

In Cursor's Composer, the Agent can use OpenClaw tools:

```
User: Use openclaw to help me debug this Python code
Agent: [Uses openclaw_chat tool to send your code to OpenClaw]
```

### Send a Message

```
User: Send "Build completed successfully" to my Telegram
Agent: [Uses openclaw_send_message with target and channel]
```

### Check Status

```
User: What's the status of my OpenClaw channels?
Agent: [Uses openclaw_get_status tool]
```

## CLI Commands

```bash
# Start MCP server (usually done automatically by Cursor)
openclaw mcp serve

# Show configuration help
openclaw mcp info

# With custom options
openclaw mcp serve --url ws://localhost:18789 --session agent:main:cursor
```

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `OPENCLAW_GATEWAY_URL` | Gateway WebSocket URL | `ws://127.0.0.1:18789` |
| `OPENCLAW_GATEWAY_TOKEN` | Authentication token | - |
| `OPENCLAW_GATEWAY_PASSWORD` | Authentication password | - |
| `OPENCLAW_SESSION_KEY` | Default session key | `agent:main:cursor` |

## Troubleshooting

### Gateway Connection Failed

1. Ensure the OpenClaw gateway is running:
   ```bash
   openclaw gateway run
   ```

2. Check the gateway URL in your configuration

3. Verify authentication credentials if required

### Tools Not Appearing in Cursor

1. Restart Cursor after adding the MCP server
2. Check Cursor's MCP logs for errors
3. Ensure `openclaw` is in your PATH

### Session Issues

Clear and restart a session:
```
User: Clear my OpenClaw session
Agent: [Uses openclaw_clear_session tool]
```

## Development

```bash
# Install dependencies
cd extensions/cursor-mcp
pnpm install

# Build
pnpm build

# Test locally
node bin/server.js
```

## Architecture

```
┌─────────────────┐     MCP Protocol     ┌──────────────────┐
│   Cursor IDE    │◄───────────────────►│  OpenClaw MCP    │
│  (MCP Client)   │      (stdio)         │     Server       │
└─────────────────┘                      └────────┬─────────┘
                                                  │
                                                  │ WebSocket
                                                  ▼
                                         ┌──────────────────┐
                                         │  OpenClaw        │
                                         │  Gateway         │
                                         └────────┬─────────┘
                                                  │
                    ┌─────────────────────────────┼─────────────────────────────┐
                    │                             │                             │
                    ▼                             ▼                             ▼
            ┌───────────────┐           ┌───────────────┐           ┌───────────────┐
            │   WhatsApp    │           │   Telegram    │           │   Discord     │
            └───────────────┘           └───────────────┘           └───────────────┘
```

## License

MIT - Part of the OpenClaw project.

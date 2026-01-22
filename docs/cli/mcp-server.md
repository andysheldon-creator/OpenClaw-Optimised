# MCP Server

Clawdbot includes a built-in MCP (Model Context Protocol) server that allows external AI agents and tools to interact with Clawdbot programmatically. This enables powerful integrations where other AI systems can delegate tasks to Clawdbot.

## What is MCP?

The [Model Context Protocol (MCP)](https://modelcontextprotocol.io/) is an open standard for connecting AI models to external tools and data sources. MCP servers expose "tools" that AI clients can discover and invoke.

Clawdbot's MCP server exposes an `order_clawdbot` tool that allows any MCP-compatible client to send messages to Clawdbot and receive responses.

## Quick Start

### 1. Start the MCP Server

```bash
clawdbot mcp-server
```

The server uses stdio transport, meaning it communicates via stdin/stdout. This is the standard approach for local MCP tool servers.

### 2. Configure Your MCP Client

Add Clawdbot to your MCP client's configuration. For example, in Claude Code:

**~/.claude/claude_desktop_config.json** (macOS/Linux) or **%APPDATA%\Claude\claude_desktop_config.json** (Windows):

```json
{
  "mcpServers": {
    "clawdbot": {
      "command": "clawdbot",
      "args": ["mcp-server"]
    }
  }
}
```

### 3. Use the Tool

Once configured, the MCP client can invoke the `order_clawdbot` tool to send messages to Clawdbot.

## CLI Reference

```
clawdbot mcp-server [options]

Options:
  -v, --verbose  Enable verbose logging for debugging
  --version      Print MCP server version and exit
  -h, --help     Display help for command
```

### Examples

```bash
# Start MCP server (standard mode)
clawdbot mcp-server

# Start with verbose logging (useful for debugging)
clawdbot mcp-server --verbose

# Print version
clawdbot mcp-server --version
```

## The `order_clawdbot` Tool

The MCP server exposes a single tool called `order_clawdbot`.

### Tool Definition

```json
{
  "name": "order_clawdbot",
  "description": "Send a message to Clawdbot and receive a response. The message will be processed as if typed by a user.",
  "inputSchema": {
    "type": "object",
    "properties": {
      "message": {
        "type": "string",
        "description": "The message to send to Clawdbot"
      },
      "sessionKey": {
        "type": "string",
        "description": "Optional session key for conversation continuity"
      }
    },
    "required": ["message"]
  }
}
```

### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `message` | string | Yes | The message to send to Clawdbot. Passed through unmodified. |
| `sessionKey` | string | No | Session identifier for conversation continuity. If not provided, a unique key is generated for each call. |

### Response Format

The tool returns a standard MCP tool result:

```json
{
  "content": [
    {
      "type": "text",
      "text": "Clawdbot's response here..."
    }
  ],
  "isError": false
}
```

On error:

```json
{
  "content": [
    {
      "type": "text",
      "text": "Error: <error message>"
    }
  ],
  "isError": true
}
```

## Session Management

### Default Behavior (Isolated Sessions)

By default, each call to `order_clawdbot` generates a unique session key:

```
mcp-{timestamp}-{random}
```

This ensures that unrelated requests don't share context, preventing accidental information leakage between different conversations or clients.

### Conversation Continuity

To maintain conversation history across multiple calls, provide a consistent `sessionKey`:

```json
// First message
{
  "name": "order_clawdbot",
  "arguments": {
    "message": "Remember that my favorite color is blue.",
    "sessionKey": "user-123-conversation"
  }
}

// Later message (same session)
{
  "name": "order_clawdbot",
  "arguments": {
    "message": "What's my favorite color?",
    "sessionKey": "user-123-conversation"
  }
}
```

Clawdbot will remember the conversation context and respond appropriately.

### Session Key Best Practices

- Use descriptive, unique keys per logical conversation
- Include user/client identifiers to prevent cross-client leakage
- Consider including timestamps for debugging: `client-123-2024-01-15`

## Configuration Examples

### Claude Code

Create or edit `~/.claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "clawdbot": {
      "command": "clawdbot",
      "args": ["mcp-server"]
    }
  }
}
```

### Claude Code with Verbose Logging

```json
{
  "mcpServers": {
    "clawdbot": {
      "command": "clawdbot",
      "args": ["mcp-server", "--verbose"]
    }
  }
}
```

### With Custom Path

If Clawdbot is installed in a non-standard location:

```json
{
  "mcpServers": {
    "clawdbot": {
      "command": "/usr/local/bin/clawdbot",
      "args": ["mcp-server"]
    }
  }
}
```

### Using npx

If you prefer to run via npx:

```json
{
  "mcpServers": {
    "clawdbot": {
      "command": "npx",
      "args": ["clawdbot", "mcp-server"]
    }
  }
}
```

## Architecture

### High-Level Flow

```
┌─────────────────┐     MCP Protocol      ┌─────────────────┐
│   MCP Client    │ ◄──────────────────► │  Clawdbot MCP   │
│ (Claude Code,   │    (stdio JSON-RPC)   │     Server      │
│  other agents)  │                       │                 │
└─────────────────┘                       └────────┬────────┘
                                                   │
                                                   │ Internal call
                                                   ▼
                                          ┌─────────────────┐
                                          │ getReplyFromConfig │
                                          │ (auto-reply system) │
                                          └─────────────────┘
```

### Transport: stdio-only (By Design)

The MCP server uses stdio transport exclusively. This is an intentional design choice:

- **Process isolation**: Each MCP client spawns its own server process
- **Simple lifecycle**: Server exits when client disconnects
- **Security**: No network exposure—communication is local to the machine
- **No state management**: No need for authentication or session management at the transport level

### Response Aggregation

The MCP server uses infrastructure-level response aggregation to ensure a single, complete response is returned:

1. User's message is passed to Clawdbot **unmodified** (no prompt injection)
2. Intermediate outputs (block replies, tool results) are collected via callbacks
3. Final response is extracted from `getReplyFromConfig`
4. All parts are deduplicated and combined
5. A single unified response is returned to the MCP client

This approach avoids the pitfalls of prompt-based response control (unreliable, quality-degrading) while guaranteeing a coherent response.

## Implementation Reference

The MCP server design is documented in `docs/design/mcp-server-design.md`.

### Source Files

| File | Description |
|------|-------------|
| `src/mcp-server/index.ts` | Module entry point |
| `src/mcp-server/server.ts` | MCP server setup and tool registration |
| `src/mcp-server/types.ts` | Type definitions |
| `src/mcp-server/context.ts` | Synthetic message context builder |
| `src/mcp-server/tools/order-clawdbot.ts` | The `order_clawdbot` tool implementation |
| `src/cli/program/register.mcp.ts` | CLI command registration |

### Tests

| File | Coverage |
|------|----------|
| `src/mcp-server/context.test.ts` | Context builder tests |
| `src/mcp-server/tools/order-clawdbot.test.ts` | Tool handler and deduplication tests |

## Troubleshooting

### Server Won't Start

**Check that Clawdbot is properly installed:**
```bash
clawdbot --version
```

**Check for configuration issues:**
```bash
clawdbot doctor
```

### No Response from Tool

**Enable verbose logging:**
```bash
clawdbot mcp-server --verbose
```

This will show request/response details in the server's stderr output.

**Check Clawdbot configuration:**
Ensure you have valid API credentials configured:
```bash
clawdbot status
```

### MCP Client Can't Find Server

**Verify the command path:**
```bash
which clawdbot
```

Use the full path in your MCP configuration if needed.

**Check MCP client logs:**
Most MCP clients log connection errors. Check your client's logs for details.

### Session Context Not Persisting

**Ensure you're using the same `sessionKey`:**
Without a consistent session key, each call creates a new isolated session.

**Check session storage:**
```bash
clawdbot sessions --store file
```

## Security Considerations

### Authorization

MCP calls are treated as authorized (equivalent to local CLI usage). The MCP client (e.g., Claude Code) is responsible for user authentication.

### Process Isolation

The stdio transport ensures:
- No network exposure
- Each client gets its own server process
- Server exits when client disconnects

### Message Handling

- User messages are passed through unmodified (no injection)
- Session keys should be treated as sensitive (they identify conversations)
- Unique session keys prevent cross-client context leakage

## Limitations

### Current Limitations

1. **Text-only responses**: Media (images, audio) URLs are not included in MCP responses
2. **Synchronous only**: The tool waits for Clawdbot to complete before returning
3. **No streaming**: Responses are aggregated and returned as a single block
4. **Single tool**: Only `order_clawdbot` is exposed (individual Clawdbot tools are not exposed)

### Not Supported (By Design)

- HTTP/SSE transport: Would require authentication and state management
- Multiple concurrent clients per server: Each client spawns its own process
- Long-running daemon mode: Use the Clawdbot gateway for that use case

## Related Documentation

- [MCP Protocol Specification](https://modelcontextprotocol.io/)
- [Clawdbot CLI Reference](/cli)
- [Clawdbot Configuration](/gateway/configuration)
- [Sessions](/concepts/sessions)

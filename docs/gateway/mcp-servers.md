# MCP Servers Configuration

This guide covers how to configure and use Model Context Protocol (MCP) servers with your Clawdbrain gateway.

## Overview

MCP servers extend Clawdbrain with custom tools and capabilities. You can configure MCP servers at two levels:

- **Global**: Available to all agents
- **Per-agent**: Specific to individual agents, with ability to override or disable global servers

## Configuration Location

MCP server configuration lives in `~/.openclaw/openclaw.json`:

```json5
{
  mcpServers: {
    // Global MCP server definitions
  },
  agents: {
    list: [
      {
        id: "work",
        mcpServers: {
          // Per-agent overrides and additions
        },
      },
    ],
  },
}
```

## Transport Types

Clawdbrain supports three MCP transport types:

### 1. STDIO (Local Process)

Spawns a local process and communicates via standard input/output. **Default transport** if not specified.

```json5
{
  mcpServers: {
    filesystem: {
      command: "npx",
      args: ["-y", "@modelcontextprotocol/server-filesystem", "./"],
      env: {
        DEBUG: "1",
      },
    },
  },
}
```

**STDIO Configuration Options:**

| Option    | Type     | Required | Description                                        |
| --------- | -------- | -------- | -------------------------------------------------- |
| `command` | string   | Yes      | Command to execute (e.g., `npx`, `node`, `python`) |
| `args`    | string[] | No       | Command arguments                                  |
| `env`     | object   | No       | Environment variables to pass to the process       |
| `cwd`     | string   | No       | Working directory for the process                  |
| `stderr`  | string   | No       | How to handle stderr (`inherit`, `pipe`, `ignore`) |
| `enabled` | boolean  | No       | Enable/disable this server (default: `true`)       |
| `label`   | string   | No       | Human-readable label for the server                |

### 2. SSE (Server-Sent Events)

Remote MCP server accessible via HTTP Server-Sent Events endpoint.

```json5
{
  mcpServers: {
    remote_api: {
      transport: "sse",
      url: "https://example.com/mcp",
      headers: {
        Authorization: "Bearer YOUR_TOKEN",
      },
    },
  },
}
```

**SSE Configuration Options:**

| Option      | Type    | Required | Description                                  |
| ----------- | ------- | -------- | -------------------------------------------- |
| `transport` | string  | Yes      | Must be `"sse"`                              |
| `url`       | string  | Yes      | URL of the SSE endpoint                      |
| `headers`   | object  | No       | HTTP headers (e.g., authentication)          |
| `enabled`   | boolean | No       | Enable/disable this server (default: `true`) |
| `label`     | string  | No       | Human-readable label for the server          |

### 3. HTTP

Remote MCP server accessible via HTTP endpoint.

```json5
{
  mcpServers: {
    http_endpoint: {
      transport: "http",
      url: "https://api.example.com/mcp",
      headers: {
        "X-API-Key": "your-api-key",
      },
    },
  },
}
```

**HTTP Configuration Options:**

| Option      | Type    | Required | Description                                  |
| ----------- | ------- | -------- | -------------------------------------------- |
| `transport` | string  | Yes      | Must be `"http"`                             |
| `url`       | string  | Yes      | URL of the HTTP endpoint                     |
| `headers`   | object  | No       | HTTP headers (e.g., authentication)          |
| `enabled`   | boolean | No       | Enable/disable this server (default: `true`) |
| `label`     | string  | No       | Human-readable label for the server          |

## Examples

### Global MCP Servers

Make MCP servers available to all agents:

```json5
{
  mcpServers: {
    filesystem: {
      command: "npx",
      args: ["-y", "@modelcontextprotocol/server-filesystem", "./"],
      label: "Filesystem Tools",
    },
    github: {
      command: "npx",
      args: ["-y", "@modelcontextprotocol/server-github"],
      env: {
        GITHUB_TOKEN: "your-token",
      },
      label: "GitHub API",
    },
    sequential_thinking: {
      command: "npx",
      args: ["-y", "mcp-sequentialthinking-tools"],
      env: {
        MAX_HISTORY_SIZE: "1000",
      },
      label: "Sequential Thinking Tools",
    },
  },
}
```

### Per-Agent Configuration

Override global servers or add agent-specific servers:

```json5
{
  mcpServers: {
    filesystem: {
      command: "npx",
      args: ["-y", "@modelcontextprotocol/server-filesystem", "./"],
    },
  },
  agents: {
    list: [
      {
        id: "work",
        mcpServers: {
          github: {
            command: "npx",
            args: ["-y", "@modelcontextprotocol/server-github"],
            env: {
              GITHUB_TOKEN: "work-github-token",
            },
          },
        },
      },
      {
        id: "personal",
        mcpServers: {
          filesystem: {
            enabled: false,
          },
          github: {
            command: "npx",
            args: ["-y", "@modelcontextprotocol/server-github"],
            env: {
              GITHUB_TOKEN: "personal-github-token",
            },
          },
        },
      },
    ],
  },
}
```

### Sequential Thinking Tools MCP

Register the sequential thinking MCP server globally:

```json5
{
  mcpServers: {
    "mcp-sequentialthinking-tools": {
      command: "npx",
      args: ["-y", "mcp-sequentialthinking-tools"],
      env: {
        MAX_HISTORY_SIZE: "1000",
      },
    },
  },
}
```

This configuration:

- Uses STDIO transport (default)
- Spawns the sequential thinking tools server via `npx`
- Sets `MAX_HISTORY_SIZE` environment variable to 1000
- Makes tools available as `mcp__mcp-sequentialthinking-tools__<tool_name>`

## Tool Naming

MCP tools are named with the pattern:

```
mcp__<server_id>__<tool_name>
```

Examples:

- `mcp__filesystem__read_file`
- `mcp__github__create_issue`
- `mcp__mcp-sequentialthinking-tools__think_deeply`

## Enabling/Disabling Servers

### Disable a Global Server Globally

```json5
{
  mcpServers: {
    filesystem: {
      command: "npx",
      args: ["-y", "@modelcontextprotocol/server-filesystem", "./"],
      enabled: false,
    },
  },
}
```

### Disable a Global Server for a Specific Agent

```json5
{
  mcpServers: {
    filesystem: {
      command: "npx",
      args: ["-y", "@modelcontextprotocol/server-filesystem", "./"],
    },
  },
  agents: {
    list: [
      {
        id: "sandboxed",
        mcpServers: {
          filesystem: {
            enabled: false,
          },
        },
      },
    ],
  },
}
```

### Re-enable a Globally Disabled Server for a Specific Agent

```json5
{
  mcpServers: {
    filesystem: {
      command: "npx",
      args: ["-y", "@modelcontextprotocol/server-filesystem", "./"],
      enabled: false,
    },
  },
  agents: {
    list: [
      {
        id: "work",
        mcpServers: {
          filesystem: {
            enabled: true,
            command: "npx",
            args: ["-y", "@modelcontextprotocol/server-filesystem", "./"],
          },
        },
      },
    ],
  },
}
```

## Configuration Validation

Clawdbrain validates MCP server configurations at startup. Invalid configurations will be rejected with clear error messages.

**Common validation errors:**

- **Missing required fields**: STDIO servers require `command`; SSE/HTTP servers require `url`
- **Invalid transport type**: Must be `"stdio"`, `"sse"`, or `"http"`
- **Non-string values**: Server IDs, URLs, and command paths must be strings
- **Unknown properties**: Extra configuration keys will be rejected (unless part of a plugin)

## Environment Variables

Use environment variables to inject secrets and configuration:

```json5
{
  mcpServers: {
    github: {
      command: "npx",
      args: ["-y", "@modelcontextprotocol/server-github"],
      env: {
        GITHUB_TOKEN: "${GITHUB_TOKEN}",
        DEBUG: "true",
      },
    },
  },
}
```

Note: Environment variable expansion (e.g., `${VAR}`) follows standard shell conventions if your system supports it.

## Troubleshooting

### MCP Server Fails to Connect

1. Check that the command is valid: `which npx` / `which node`
2. Verify the package is installed: `npx -y mcp-sequentialthinking-tools --version`
3. Check environment variables are set correctly
4. Review gateway logs for connection errors

### Tools Not Appearing

1. Verify the MCP server is enabled (`enabled: true` or not set)
2. Check the server can connect successfully
3. Verify tool names with `mcp__<server_id>__<tool_name>` pattern
4. Confirm the agent configuration includes the server

### Permission Errors

For local processes:

- Ensure the command path is executable
- Check working directory (`cwd`) exists and is readable
- Verify environment variables don't conflict with system settings

For remote servers:

- Verify URL is accessible from your network
- Check authentication headers are correct
- Confirm SSL/TLS certificates (if applicable)

## Integration with Channels

MCP servers integrated via this configuration automatically appear in:

- Pi Agent runtime (direct tool access)
- Claude Agent SDK runtime (via MCP bridge)
- All built-in Clawdbrain channels (Telegram, Discord, Slack, etc.)

## See Also

- [Model Context Protocol Specification](https://spec.modelcontextprotocol.io/)
- [Configuration Reference](/gateway/configuration)
- [Channels and Routing](/channels)

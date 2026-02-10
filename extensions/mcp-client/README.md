# MCP Client Extension for OpenClaw

Generic Model Context Protocol (MCP) client for OpenClaw - connect to any MCP server and expose their tools natively.

## Features

- ✅ Generic MCP client (works with any MCP server)
- ✅ Multi-server support (connect to multiple MCP servers simultaneously)
- ✅ Standard MCP protocol (stdio transport)
- ✅ Auto-reconnection on disconnect
- ✅ Per-server tool prefixes
- ✅ Compatible with all MCP servers (Filesystem, GitHub, Postgres, Slack, Skyline, etc.)

## Supported MCP Servers

This plugin works with **any** MCP-compliant server:

- **Filesystem** - File operations (`mcp-server-filesystem`)
- **GitHub** - Repository management (`mcp-server-github`)
- **Postgres** - Database queries (`mcp-server-postgres`)
- **Slack** - Team communication (`mcp-server-slack`)
- **Skyline** - Multi-protocol API gateway (`skyline-mcp`)
- **Custom** - Any MCP server you build

## Architecture

```
OpenClaw Agent (Myka/Aria)
    ↓ Tool calls
MCP Client Plugin (this)
    ↓ MCP Protocol (stdio)
┌────────────────────────────────┐
│  MCP Server 1 (Filesystem)     │
│  MCP Server 2 (GitHub)         │
│  MCP Server 3 (Skyline)        │
│  MCP Server N (...)            │
└────────────────────────────────┘
    ↓ API calls
Target Systems (APIs, Databases, Files, etc.)
```

## Installation

### 1. Install MCP Servers

Install the MCP servers you want to use:

```bash
# Filesystem
npm install -g @modelcontextprotocol/server-filesystem

# GitHub
npm install -g @modelcontextprotocol/server-github

# Postgres
npm install -g @modelcontextprotocol/server-postgres

# Skyline (API Gateway)
npm install -g skyline-mcp
```

### 2. Configure OpenClaw

Edit your OpenClaw config:

```bash
openclaw config
```

Add under `plugins.entries`:

```json
{
  "plugins": {
    "entries": {
      "mcp-client": {
        "enabled": true,
        "config": {
          "enabled": true,
          "servers": {
            "filesystem": {
              "command": "mcp-server-filesystem",
              "args": ["/home/user/documents"],
              "toolPrefix": "fs_"
            },
            "github": {
              "command": "mcp-server-github",
              "env": {
                "GITHUB_TOKEN": "ghp_yourtoken"
              },
              "toolPrefix": "gh_"
            },
            "skyline": {
              "command": "skyline-mcp",
              "env": {
                "SKYLINE_URL": "http://localhost:9190",
                "SKYLINE_PROFILE": "gitlab-profile",
                "SKYLINE_TOKEN": "your-token"
              },
              "toolPrefix": "skyline_"
            }
          }
        }
      }
    }
  }
}
```

### 3. Restart OpenClaw

```bash
openclaw gateway restart
```

## Configuration

### Server Config Schema

Each server in the `servers` object supports:

| Field           | Type     | Required | Description                                    |
| --------------- | -------- | -------- | ---------------------------------------------- |
| `command`       | string   | ✅       | MCP server binary command                      |
| `args`          | string[] | ❌       | Command arguments                              |
| `env`           | object   | ❌       | Environment variables                          |
| `toolPrefix`    | string   | ❌       | Tool name prefix (default: `servername_`)      |
| `autoReconnect` | boolean  | ❌       | Auto-reconnect on disconnect (default: `true`) |

### Example: Multiple Servers

```json
{
  "servers": {
    "filesystem": {
      "command": "mcp-server-filesystem",
      "args": ["/home/user/projects"],
      "toolPrefix": "fs_"
    },
    "postgres": {
      "command": "mcp-server-postgres",
      "env": {
        "DATABASE_URL": "postgresql://user:pass@localhost/db"
      },
      "toolPrefix": "db_"
    },
    "skyline-gitlab": {
      "command": "skyline-mcp",
      "env": {
        "SKYLINE_URL": "http://localhost:9190",
        "SKYLINE_PROFILE": "gitlab",
        "SKYLINE_TOKEN": "token123"
      },
      "toolPrefix": "gitlab_"
    },
    "skyline-jenkins": {
      "command": "skyline-mcp",
      "env": {
        "SKYLINE_URL": "http://localhost:9190",
        "SKYLINE_PROFILE": "jenkins",
        "SKYLINE_TOKEN": "token456"
      },
      "toolPrefix": "jenkins_"
    }
  }
}
```

## Usage

### Check Connection Status

```
/mcp
```

Shows connected servers and available tools.

### Using Tools

Tools are automatically registered with their prefixes:

```
# Filesystem tools
fs_read_file
fs_write_file
fs_list_directory

# GitHub tools
gh_create_issue
gh_list_repos
gh_create_pr

# Skyline tools
gitlab_query_listProjects
jenkins_build_trigger
```

## Troubleshooting

### "No servers connected"

Check logs:

```bash
openclaw logs
# Look for [mcp-client] messages
```

### "Process exited"

- Verify the MCP server binary is installed: `which <command>`
- Check environment variables are correct
- Ensure the server supports stdio transport (most do)

### "Tool execution failed"

- Check MCP server logs (stderr output)
- Verify parameters match the tool's input schema
- Test the MCP server directly with a simple client

## Development

### Testing New MCP Servers

1. Create a test server config:

```json
{
  "test-server": {
    "command": "path/to/mcp-server",
    "env": { ... },
    "toolPrefix": "test_"
  }
}
```

2. Restart OpenClaw
3. Run `/mcp` to see if tools loaded
4. Test tool execution

### Building Custom MCP Servers

See the [MCP specification](https://modelcontextprotocol.io) for building your own MCP servers.

## Comparison with Claude Desktop

This plugin provides **the same MCP functionality** as Claude Desktop's `claude_desktop_config.json`:

**Claude Desktop:**

```json
{
  "mcpServers": {
    "filesystem": {
      "command": "mcp-server-filesystem",
      "args": ["/path/to/docs"]
    }
  }
}
```

**OpenClaw (this plugin):**

```json
{
  "plugins": {
    "entries": {
      "mcp-client": {
        "enabled": true,
        "config": {
          "servers": {
            "filesystem": {
              "command": "mcp-server-filesystem",
              "args": ["/path/to/docs"]
            }
          }
        }
      }
    }
  }
}
```

## License

Same as OpenClaw (MIT)

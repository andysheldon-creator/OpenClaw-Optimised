---
summary: "A2A protocol plugin: send/receive messages between AI agents (Agent-to-Agent)"
read_when:
  - You want to communicate with other A2A-compatible agents
  - You are configuring or developing the A2A plugin
  - You want to expose your OpenClaw agent via A2A
---

# A2A Protocol (plugin)

A2A (Agent-to-Agent) protocol plugin that allows OpenClaw to send and receive
messages from other agents. The A2A protocol is an open standard for
interoperability between AI agents.

## Overview

The plugin provides:

- **Server**: Exposes your agent via A2A endpoints for other agents to call
- **Client tools**: Send messages to remote A2A agents and fetch their Agent Cards

## Safety Recommendation

Exposing your main agent via A2A allows remote agents to potentially execute
any tools available to that agent (shell commands, file access, etc.). For
production use, create a dedicated A2A gateway agent with restricted
capabilities.

### Recommended Agent Configuration

```json5
{
  agents: {
    list: [
      {
        id: "a2a-gateway",
        name: "A2A Gateway",
        workspace: "~/.openclaw/workspace-a2a",
        identity: { name: "A2A Gateway" },
        sandbox: {
          mode: "all",
          scope: "agent",
        },
        tools: {
          allow: ["read", "sessions_list", "sessions_send"],
          deny: ["exec", "write", "edit", "apply_patch", "browser"],
        },
      },
    ],
  },
}
```

Then configure the A2A plugin to use this agent:

```json5
{
  plugins: {
    entries: {
      a2a: {
        enabled: true,
        config: {
          agentId: "a2a-gateway",
          description: "A2A gateway that coordinates with the user",
        },
      },
    },
  },
}
```

### Gateway Agent's Role

The A2A gateway agent:

1. Receives requests from remote A2A agents
2. Evaluates the request for safety
3. Communicates with the user to decide whether to forward requests
4. Uses `sessions_send` to forward approved requests to other agents
5. Returns responses back to the remote agent

## Install

The A2A plugin is bundled with OpenClaw. Enable it in your config:

```json5
{
  plugins: {
    entries: {
      a2a: {
        enabled: true,
      },
    },
  },
}
```

Restart the Gateway afterwards.

## Config

Set config under `plugins.entries.a2a.config`:

```json5
{
  plugins: {
    entries: {
      a2a: {
        enabled: true,
        config: {
          agentId: "main", // Which agent to expose via A2A
          description: "AI assistant powered by OpenClaw",
        },
      },
    },
  },
}
```

| Option            | Description                                      | Default                            |
| ----------------- | ------------------------------------------------ | ---------------------------------- |
| `agentId`         | Which agent to expose via A2A                    | `"main"`                           |
| `description`     | Description shown in the Agent Card              | `"AI assistant powered by OpenClaw"` |
| `inbound`         | Inbound authentication settings                  | See [Inbound Authentication](#inbound-authentication) |
| `remoteAgents`    | Outbound credentials for remote agents           | See [Outbound Authentication](#outbound-authentication) |

## Authentication

The A2A plugin is **secure by default**. When you enable the plugin without
configuring any keys, it auto-generates an API key and stores it in your config.
Remote agents must include this key to call your `/a2a` endpoint.

The `/.well-known/agent-card.json` endpoint is always public so other agents can
discover your agent's capabilities.

### Inbound Authentication

Inbound auth protects your `/a2a` JSON-RPC endpoint from unauthorized callers.

**Default behavior (secure by default):** If you enable the plugin without
configuring `inbound`, a key is auto-generated on first startup. The key is
logged once and saved to your config file.

**Manual key configuration:**

```json5
{
  plugins: {
    entries: {
      a2a: {
        enabled: true,
        config: {
          inbound: {
            apiKeys: [
              { label: "agent-alpha", key: "your-secret-key-here" },
              { label: "agent-beta", key: "another-secret-key" },
            ],
          },
        },
      },
    },
  },
}
```

Remote agents send the key via one of these headers:

- `Authorization: Bearer <key>` (preferred)
- `X-A2A-Key: <key>`

**Disable authentication (opt-out):**

```json5
{
  plugins: {
    entries: {
      a2a: {
        enabled: true,
        config: {
          inbound: {
            allowUnauthenticated: true,
          },
        },
      },
    },
  },
}
```

### Key Management Commands

Manage inbound API keys without editing config files directly:

```bash
# Generate a new key
openclaw a2a generate-key my-partner-agent

# List configured keys (values masked)
openclaw a2a list-keys

# Revoke a key by label
openclaw a2a revoke-key my-partner-agent
```

After generating or revoking keys, restart the Gateway to apply changes.

### Outbound Authentication

When your agent calls remote A2A agents, you can configure credentials per URL.
This ensures keys are never leaked to the wrong agent (URL-based isolation).

```json5
{
  plugins: {
    entries: {
      a2a: {
        enabled: true,
        config: {
          remoteAgents: [
            {
              url: "https://partner-agent.example.com",
              headers: {
                "Authorization": "Bearer ${PARTNER_API_KEY}",
              },
            },
            {
              url: "https://internal-agent.corp.net/v2",
              headers: {
                "X-API-Key": "${INTERNAL_KEY}",
              },
            },
          ],
        },
      },
    },
  },
}
```

Header values support `${ENV_VAR}` substitution via the OpenClaw config loader.

URL matching uses origin + path prefix. A key configured for
`https://agent.example.com` will be sent to
`https://agent.example.com/a2a` but not to
`https://other.example.com`.

### Tailscale and Authentication

`allowUnauthenticated: true` is available for both Tailscale serve and funnel
modes. Understand the trade-off:

- **Tailscale serve:** Traffic is restricted to your tailnet. Disabling auth is
  reasonable since only your devices and those you share with can reach the
  endpoint.
- **Tailscale funnel:** Traffic comes from the public internet. Disabling auth
  exposes your agent to anyone. Use API keys unless you have another auth layer
  in front.

## Making Your Agent Discoverable

A2A endpoints are served on the Gateway's HTTP port (default 18789). For remote
agents to reach yours, expose the Gateway via Tailscale Funnel.

The plugin builds the Agent Card URL from the incoming request headers, so the
Agent Card automatically advertises the correct URL when accessed through
Tailscale.

### Prerequisites

#### 1. Install Tailscale

On macOS, install the CLI via Homebrew:

```bash
brew install tailscale
```

Alternatively, install the full Tailscale app from the
[Mac App Store](https://apps.apple.com/app/tailscale/id1475387142) or from
[tailscale.com/download](https://tailscale.com/download).

#### 2. Start and authenticate

If using the Homebrew CLI, start the daemon with userspace networking:

```bash
mkdir -p ~/.local/share/tailscale
tailscaled \
  --state=~/.local/share/tailscale/tailscaled.state \
  --socket=/tmp/tailscale.sock \
  --statedir=~/.local/share/tailscale \
  --tun=userspace-networking &
```

Then authenticate (skip if using the Tailscale app):

```bash
tailscale --socket=/tmp/tailscale.sock up
```

Visit the printed URL to log in.

> **Note:** If using the Tailscale macOS app, the daemon runs automatically and
> you can omit `--socket=/tmp/tailscale.sock` from all commands below.

#### 3. Enable HTTPS and Funnel in Tailscale admin

Go to the [Tailscale admin console](https://login.tailscale.com/admin) and
enable:

1. **MagicDNS** - under [DNS settings](https://login.tailscale.com/admin/dns)
2. **HTTPS Certificates** - same page, below MagicDNS
3. **Funnel in ACL policy** - under
   [Access Controls](https://login.tailscale.com/admin/acls/file), add a
   `nodeAttrs` entry:

```json
"nodeAttrs": [
  {
    "target": ["autogroup:member"],
    "attr": ["funnel"]
  }
]
```

#### 4. Verify HTTPS certificates

Confirm your node can obtain TLS certificates. First find your Tailscale
hostname:

```bash
tailscale --socket=/tmp/tailscale.sock status
```

Then request a certificate:

```bash
tailscale --socket=/tmp/tailscale.sock cert your-machine.tail1234.ts.net
```

If this succeeds, you are ready to set up Funnel.

### Tailscale Serve (development / tailnet-only)

Expose your Gateway to devices on your tailnet only:

```bash
tailscale --socket=/tmp/tailscale.sock serve --bg http://localhost:18789
```

Then restrict your Gateway to localhost:

```bash
openclaw config set gateway.bind loopback
```

Restart the Gateway. Your agent card will be at:

```
https://your-machine.tail1234.ts.net/.well-known/agent-card.json
```

### Tailscale Funnel (public access)

Expose your Gateway to the public internet:

```bash
tailscale --socket=/tmp/tailscale.sock funnel --bg http://localhost:18789
```

> **Important:** Use `http://localhost:18789` (not `https`). The Gateway serves
> plain HTTP; Tailscale terminates TLS at the Funnel edge.

This exposes the full gateway through Funnel. The A2A endpoint and agent card
are accessible publicly, while the chat/web UI remains protected by the
gateway's own token auth (`gateway.auth.mode`). You can keep `gateway.bind` set
to `lan` so the chat UI is also reachable from your local network:

```bash
openclaw config set gateway.bind lan
```

Restart the Gateway. Your agent card is now publicly accessible at:

```
https://your-machine.tail1234.ts.net/.well-known/agent-card.json
```

If you prefer to restrict local access to the same machine only, use
`gateway.bind loopback` instead.

To stop Funnel:

```bash
tailscale --socket=/tmp/tailscale.sock funnel --https=443 off
```

See [Tailscale gateway docs](/gateway/tailscale) for more details.

### Verifying

```bash
curl https://your-machine.tail1234.ts.net/.well-known/agent-card.json
```

You should see a JSON response with your agent's name, description, and skills.

> **Tip:** If you are running Tailscale in userspace networking mode, DNS may
> not resolve your Tailscale hostname from the same machine. Test from another
> device, or use `dig +short your-machine.tail1234.ts.net` to find the public
> IP and `curl --resolve` to test locally.

## Endpoints

The plugin registers two HTTP endpoints on the Gateway:

### Agent Card

```
GET /.well-known/agent-card.json
```

Returns the Agent Card describing this agent's capabilities, skills, and
supported modes. Remote agents fetch this to discover how to interact with
your agent.

### JSON-RPC Endpoint

```
POST /a2a
```

The main A2A protocol endpoint. Handles JSON-RPC requests from remote agents:

- `message/send` - Send a message and get a response
- `tasks/get` - Get task status
- `tasks/cancel` - Cancel a running task

## Tools

### send_message_to_agent

Send a message to another A2A-compatible agent and get their response.

**Parameters:**

| Name         | Type   | Required | Description                                                    |
| ------------ | ------ | -------- | -------------------------------------------------------------- |
| `agent_url`  | string | Yes      | URL of target A2A agent (e.g., `https://agent.example.com`)    |
| `message`    | string | Yes      | Message to send to the agent                                   |
| `context_id` | string | No       | Context ID for multi-turn conversation                         |

**Response:**

```json
{
  "type": "message",
  "contextId": "abc123",
  "text": "Agent's response text",
  "note": "To continue this conversation, pass this contextId in subsequent calls"
}
```

**Multi-turn conversations:**

To continue a conversation with the same agent, reuse the `contextId` from the
previous response. Each new `contextId` starts a new conversation.

```
// First message - no context_id needed
send_message_to_agent(agent_url: "https://agent.example.com", message: "Hello")
// Returns: { contextId: "abc123", text: "Hi there!" }

// Continue conversation - pass context_id
send_message_to_agent(agent_url: "https://agent.example.com", message: "What's your name?", context_id: "abc123")
// Returns: { contextId: "abc123", text: "I'm Example Agent" }
```

### get_agent_card

Fetch and display an Agent Card from an A2A-compatible agent URL. Use this to
discover an agent's capabilities before sending messages.

**Parameters:**

| Name        | Type   | Required | Description                                                 |
| ----------- | ------ | -------- | ----------------------------------------------------------- |
| `agent_url` | string | Yes      | URL of the A2A agent (e.g., `https://agent.example.com`)    |

**Response:**

```json
{
  "name": "Example Agent",
  "description": "An example A2A agent",
  "url": "https://agent.example.com",
  "version": "1.0.0",
  "protocolVersion": "0.3.0",
  "capabilities": {
    "streaming": true,
    "pushNotifications": false
  },
  "defaultInputModes": ["text"],
  "defaultOutputModes": ["text"],
  "skills": [
    {
      "id": "assistant",
      "name": "General Assistant",
      "description": "Responds to questions and performs tasks"
    }
  ]
}
```

## Example Flow

1. Discover a remote agent's capabilities:

   ```
   get_agent_card(agent_url: "https://remote-agent.example.com")
   ```

2. Send a message to start a conversation:

   ```
   send_message_to_agent(
     agent_url: "https://remote-agent.example.com",
     message: "Can you help me analyze this data?"
   )
   ```

3. Continue the conversation using the returned contextId:

   ```
   send_message_to_agent(
     agent_url: "https://remote-agent.example.com",
     message: "The data is about user signups",
     context_id: "returned-context-id"
   )
   ```

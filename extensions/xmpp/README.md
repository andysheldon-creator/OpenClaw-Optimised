# @openclaw/xmpp

OpenClaw channel plugin for XMPP/Jabber using [xmpp.js](https://github.com/xmppjs/xmpp.js).

This package enables [OpenClaw](https://github.com/openclaw/openclaw) AI agents to communicate through XMPP chat and MUC (Multi-User Chat) rooms.

## Features

- **Native OpenClaw plugin**: installs directly into the Gateway like Telegram, Discord, Matrix, etc.
- **1:1 Chat**: send and receive direct messages via XMPP
- **MUC Rooms**: participate in group chat rooms (XEP-0045)
- **Threads**: conversation threading support (RFC 6121)
- **Media**: process out-of-band data links (XEP-0066)
- **Reactions**: emoji reactions on messages (XEP-0444)
- **Typing Indicators**: shows when bot is composing replies (XEP-0085)
- **Access Control**: DM/group policies, allowlists, and pairing
- **CLI Onboarding**: interactive setup wizard via `openclaw onboard`
- **Flexible Transport**: supports both standard TCP connections (port 5222 with STARTTLS) and WebSocket connections
- **Standard XMPP**: uses xmpp.js for standards-compliant XMPP communication
- **Auto-join rooms**: automatically join configured MUC rooms on startup

## Prerequisites

- [OpenClaw](https://github.com/openclaw/openclaw) installed and onboarded
- An XMPP account for the bot (e.g. `bot@example.com`)
- An XMPP server (supports both standard TCP and WebSocket connections)

## Installation

### From npm

```bash
openclaw plugins install @openclaw/xmpp
```

### From source (development)

```bash
cd /path/to/openclaw
openclaw plugins install -l extensions/xmpp
```

Verify the plugin appears:

```bash
openclaw plugins list
```

## Configuration

### Quick Start (Interactive Setup)

The easiest way to configure XMPP is through the interactive onboarding wizard:

```bash
openclaw onboard
```

Select XMPP from the channel list and follow the prompts to configure:

- XMPP JID (Jabber ID)
- Password
- Server (WebSocket URL like `wss://example.com/ws` or TCP hostname like `chat.example.com`)
- Optional: MUC rooms to auto-join
- Optional: Access control policies

Environment variables are supported for automated setup:

- `XMPP_JID` - Bot's Jabber ID (e.g. `bot@example.com`)
- `XMPP_PASSWORD` - Bot's password
- `XMPP_SERVER` - Server address (WebSocket URL like `wss://example.com/ws` or TCP hostname like `chat.example.com`)

### Manual Configuration

Alternatively, edit `~/.openclaw/openclaw.json` directly and add a `channels.xmpp` section:

```json5
{
  // ... existing config ...

  channels: {
    xmpp: {
      enabled: true,
      jid: "bot@example.com",
      password: "secret",
      server: "chat.example.com", // TCP (default port 5222 with STARTTLS)
      // OR: server: "wss://example.com/ws",  // WebSocket
      resource: "openclaw",

      // Optional: auto-join MUC rooms on startup
      rooms: ["room@conference.example.com"],

      // Access Control (optional)
      dmPolicy: "pairing", // "open" | "pairing" | "allowlist" | "disabled" (default: "pairing")
      groupPolicy: "open", // "open" | "allowlist" | "disabled" (default: "open")

      // Allowlists (optional)
      allowFrom: [
        // DM allowlist
        "admin@example.com",
        "trusted@example.com",
      ],
      groupAllowFrom: [
        // Group message sender allowlist
        "moderator@example.com",
      ],

      // Per-room configuration (optional)
      mucRooms: {
        "room@conference.example.com": {
          enabled: true,
          requireMention: true,
          users: ["user1@example.com", "user2@example.com"],
          systemPrompt: "Custom instructions for this room",
          skills: ["web-search"],
        },
      },
    },
  },
}
```

### XMPP Configuration Fields

| Field            | Required | Default      | Description                                                                                                    |
| ---------------- | -------- | ------------ | -------------------------------------------------------------------------------------------------------------- |
| `jid`            | yes      | -            | XMPP JID for the bot (e.g. `bot@example.com`)                                                                  |
| `password`       | yes      | -            | XMPP password                                                                                                  |
| `server`         | yes      | -            | Server address: WebSocket URL (`wss://example.com/ws`) or TCP hostname (`chat.example.com`, default port 5222) |
| `resource`       | no       | `"openclaw"` | XMPP resource identifier                                                                                       |
| `rooms`          | no       | `[]`         | Array of MUC room JIDs to auto-join on startup                                                                 |
| `dmPolicy`       | no       | `"pairing"`  | Direct message access policy (see below)                                                                       |
| `groupPolicy`    | no       | `"open"`     | Group/MUC message policy (see below)                                                                           |
| `allowFrom`      | no       | `[]`         | Allowlist of JIDs permitted for DMs                                                                            |
| `groupAllowFrom` | no       | `[]`         | Allowlist of JIDs permitted in groups                                                                          |
| `mucRooms`       | no       | `{}`         | Per-room configuration (see below)                                                                             |

### Access Control

#### DM Policy (`dmPolicy`)

Controls who can send direct messages to the bot:

- **`"pairing"`** (default, recommended):
  - Bot accepts presence subscriptions from anyone
  - First message triggers pairing flow with code
  - Admin must approve with: `openclaw pairing approve xmpp <code>`
  - After approval, user can message freely

- **`"open"`**: Accept and respond to all DMs from anyone

- **`"allowlist"`**:
  - Only accept subscriptions from JIDs in `allowFrom`
  - Reject all others
  - Strict mode for high-security environments

- **`"disabled"`**: Reject all presence subscriptions and ignore all DMs

#### Group Policy (`groupPolicy`)

Controls which MUC rooms the bot responds in:

- **`"open"`** (default):
  - Respond in all rooms
  - Anyone in the room can message the bot
  - Recommended for open/public XMPP servers

- **`"allowlist"`**:
  - Only respond in rooms listed in `mucRooms`
  - Per-room user filtering via `users` array
  - Global `groupAllowFrom` applies to all rooms
  - Recommended for private/corporate XMPP servers

- **`"disabled"`**: Ignore all group/MUC messages

#### Allowlists

**DM Allowlist (`allowFrom`):**

```json5
"allowFrom": [
  "admin@example.com",           // Exact JID match
  "user@example.com",
  "*@company.com"                // Domain wildcard (matches any user @company.com)
]
```

**Group Allowlist (`groupAllowFrom`):**

```json5
"groupAllowFrom": [
  "moderator@example.com",       // Only this user's messages in groups
  "admin@example.com"
]
```

#### Per-Room Configuration (`mucRooms`)

Fine-grained control per MUC room:

```json5
"mucRooms": {
  "support@conference.example.com": {
    "enabled": true,              // Allow bot in this room
    "requireMention": true,       // Require @mention to trigger
    "users": [                    // Per-room user allowlist
      "admin@example.com",
      "support@example.com"
    ],
    "systemPrompt": "You are a helpful support agent",
    "skills": ["web-search", "code-interpreter"]
  },
  "general@conference.example.com": {
    "enabled": false              // Disable bot in this room
  }
}
```

### Pairing Management

```bash
# List pending pairing requests
openclaw pairing list

# Approve a user
openclaw pairing approve xmpp <code>

# Deny a user
openclaw pairing deny xmpp <code>

# List approved users
openclaw pairing list --approved
```

## Setting up an XMPP Server

### ejabberd

```bash
ejabberdctl register bot example.com secretpassword
```

### Prosody

Add the user in the admin console or config.

### Other Servers

Any standard XMPP server works:

- **TCP connection** (port 5222 with STARTTLS): supported by all XMPP servers
- **WebSocket connection**: requires server WebSocket support (e.g., Openfire, MongooseIM, ejabberd, Prosody with mod_websocket)

## Usage

After configuration, restart the Gateway:

```bash
openclaw gateway restart
```

The Gateway will:

1. Connect to the XMPP server with the configured account
2. Join any configured MUC rooms
3. Listen for messages
4. Route messages to AI agents
5. Send agent responses back through XMPP

### Testing

- Add the OpenClaw contact to your roster from your XMPP client.
- Send an XMPP message to your bot's JID from any XMPP client (Fluux, Conversations, Gajim, etc.). The message will be routed to the OpenClaw AI agent, which will respond back through XMPP.

## How It Works

```
┌─────────────────┐     ┌──────────────────────────────────────────┐
│   XMPP Server   │     │          OpenClaw Gateway                │
│                 │     │                                          │
│  - Users        │◄───►│  XMPP Channel Plugin (using xmpp.js)     │
│  - MUC Rooms    │     │  (TCP port 5222 or WebSocket)            │
│                 │     │       │                                  │
│                 │     │       ▼                                  │
│                 │     │  Agent Pipeline ──► AI Model ──► Reply   │
└─────────────────┘     └──────────────────────────────────────────┘
```

### Message Flow

**Inbound** (XMPP user → AI agent):

1. `XmppClient` receives XMPP message via xmpp.js (TCP or WebSocket)
2. `resolveAgentRoute()` determines which agent handles the message
3. `formatAgentEnvelope()` formats the message body for the agent
4. `finalizeInboundContext()` builds the full message context
5. `recordInboundSession()` persists the conversation session
6. `dispatchReplyWithBufferedBlockDispatcher()` sends to the AI agent with a `deliver` callback

**Outbound** (AI agent → XMPP user):

The `deliver` callback sends the AI response back to the XMPP conversation (1:1 or MUC room) using `client.sendMessage()`.

## Troubleshooting

### Plugin not found after install

If `openclaw plugins list` doesn't show the plugin:

1. Verify the install: `openclaw plugins install -l extensions/xmpp`
2. Check config: `~/.openclaw/openclaw.json` should have `channels.xmpp` configured
3. Restart: `openclaw gateway restart`

### Gateway doesn't connect to XMPP

1. Verify the XMPP account exists on the server
2. Check the server address:
   - **TCP**: Use hostname (e.g. `chat.example.com`), default port 5222 with STARTTLS
   - **WebSocket**: Use full WebSocket URL (e.g. `wss://example.com/ws`)
3. Check Gateway logs: `openclaw gateway logs`
4. Restart: `openclaw gateway restart`

### MUC rooms not joined

- Ensure room JIDs in `channels.xmpp.rooms` are correct (e.g. `room@conference.example.com`)
- The bot account may need to be a member of the room first
- Check that the MUC service allows the bot to join

## Development

```bash
# Watch mode (rebuilds on changes)
npm run dev

# Type checking
npm run typecheck
```

Since the plugin is loaded via jiti (TypeScript source at runtime), code changes in `src/` are picked up after restarting the Gateway without needing to rebuild.

## Roadmap

### Implemented Capabilities

| Capability            | Standard | Description                                        |
| --------------------- | -------- | -------------------------------------------------- |
| **1:1 Chat**          | RFC 6121 | Direct messaging                                   |
| **MUC Rooms**         | XEP-0045 | Multi-user chat rooms                              |
| **Threads**           | RFC 6121 | Conversation threading via `<thread>` element      |
| **Media Links**       | XEP-0066 | Out-of-band data (HTTP URLs for media)             |
| **Reactions**         | XEP-0444 | Emoji reactions on messages                        |
| **Typing Indicators** | XEP-0085 | Shows "composing" state when bot generates replies |
| **Access Control**    | OpenClaw | DM/group policies, allowlists, pairing             |
| **Presence**          | RFC 6121 | Subscription handling (roster management)          |

### Potential Future Enhancements

**High Priority:**

- **Read Receipts** (XEP-0184): Acknowledge message delivery/reading
- **Message Correction** (XEP-0308): Edit previously sent messages
- **File Upload** (XEP-0363): Upload media to HTTP server for sharing
- **Message Archive Management** (XEP-0313): Retrieve conversation history from server
- **Message Retraction** (XEP-0424): Delete previously sent messages

**Medium Priority:**

- **Last Activity** (XEP-0012): Query when users were last online
- **vCard** (XEP-0054): Access user profile information
- **Delivery Receipts** (XEP-0333): Chat markers for delivery/read status

**Low Priority:**

- **Bookmarks** (XEP-0402): Auto-bookmark favorite rooms
- **Service Discovery** (XEP-0030): Discover server capabilities
- **Publish-Subscribe** (XEP-0060): Subscribe to data feeds

## License

MIT

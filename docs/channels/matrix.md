---
summary: "Matrix client setup, DMs, rooms, threading, configuration, and encryption limitations"
read_when:
  - Setting up the Matrix channel
  - Understanding Matrix limitations (unencrypted rooms only)
  - Configuring Matrix rooms or DMs
---

# Matrix (Client-Server API)

Updated: 2026-01-11

Status: production-ready for **unencrypted** DMs + rooms via `matrix-js-sdk`.

## Quick setup (beginner)

1) Create a Matrix account (or use an existing one) on any homeserver.
2) Create an access token (recommended) or use password login.
3) Configure Clawdbot with the credentials.
4) Ensure you are using **unencrypted** rooms/DMs.

Minimal config:
```json5
{
  channels: {
    matrix: {
      enabled: true,
      homeserver: "https://matrix.example.org",
      userId: "@clawdbot:example.org",
      accessToken: "syt_..."
    }
  }
}
```

## Goals

- Talk to Clawdbot via Matrix DMs or rooms.
- Direct chats collapse into the agent's main session (default `agent:main:main`).
- Rooms are isolated as `agent:<agentId>:matrix:channel:<roomId>`.
- Keep routing deterministic: replies always go back to the channel they arrived on.

## Runtime requirements

- **Node.js only** runtime (Matrix is currently not supported on Bun).
- This provider currently supports **unencrypted** DMs + rooms.

## Encryption (E2EE) status

E2EE is **not supported yet**.

Why:
- `matrix-js-sdk`’s E2EE stack expects a persistent crypto store.
- In Node.js this typically requires a working crypto-store backend (historically via IndexedDB shims or other storage layers).
- We don’t currently have a crypto-store solution we’re happy shipping/maintaining, so the Matrix provider intentionally runs **without** E2EE.

What this means in practice:
- Encrypted rooms/messages (`m.room.encrypted`) are ignored (the bot can’t decrypt them).
- Encrypted media in E2EE rooms is not supported.

### Storage locations

- Password login credentials are cached to `~/.clawdbot/credentials/matrix/` for reuse across restarts.

## Authentication

Matrix does not have a dedicated "bot token" system like Telegram or Discord. You use a standard user account.

### Option 1: Access token (recommended)

Generate an access token via password login:

```bash
curl -sS "https://matrix.example.org/_matrix/client/v3/login" \
  -H "Content-Type: application/json" \
  -d '{
    "type": "m.login.password",
    "identifier": { "type": "m.id.user", "user": "@clawdbot:example.org" },
    "password": "YOUR_PASSWORD"
  }'
```

The response includes:
- `access_token` → set as `channels.matrix.accessToken`
- `user_id` → set as `channels.matrix.userId`

Then configure:
```json5
{
  channels: {
    matrix: {
      homeserver: "https://matrix.example.org",
      userId: "@clawdbot:example.org",
      accessToken: "syt_..."
    }
  }
}
```

### Option 2: Password login (runtime)

If you set `channels.matrix.password`, Clawdbot will log in at startup to obtain a token. The credentials are cached to `~/.clawdbot/credentials/matrix/` for reuse.

For long-running gateways, prefer a pre-generated `accessToken`.

```json5
{
  channels: {
    matrix: {
      homeserver: "https://matrix.example.org",
      userId: "@clawdbot:example.org",
      password: "YOUR_PASSWORD"
    }
  }
}
```

## DM configuration

### DM policy

Control who can DM your bot:

- `pairing` (default): Unknown senders receive a pairing code. Approve with `clawdbot pairing approve matrix <code>`.
- `allowlist`: Only senders in `channels.matrix.dm.allowFrom` can message.
- `open`: Anyone can DM; if `channels.matrix.dm.allowFrom` is set, include `"*"` to keep it open.
- `disabled`: Block all DMs.

```json5
{
  channels: {
    matrix: {
      dm: {
        enabled: true,
        policy: "pairing",
        allowFrom: ["@alice:example.org", "@bob:example.org"]
      }
    }
  }
}
```

### Pairing flow

When `dm.policy: "pairing"` and an unknown sender messages:

1. The bot replies with a pairing code:
   ```
   Clawdbot: access not configured.
   
   Pairing code: ABC123
   
   Ask the bot owner to approve with:
   clawdbot pairing approve matrix <code>
   ```

2. Approve the sender:
   ```bash
   clawdbot pairing list matrix
   clawdbot pairing approve matrix ABC123
   ```

3. The sender is added to the local allowlist and can now message freely.

### DM detection

Matrix DM detection uses multiple signals:
1. **m.direct account data**: Primary source for identifying DM rooms.
2. **is_direct flag**: Fallback when `m.direct` is missing.
3. **2-member room heuristic**: Last resort for 1:1 rooms.

## Room configuration

### Group policy

Control which rooms your bot responds in:

- `disabled` (default): Block all room messages.
- `open`: Rooms bypass allowlists; mention gating still applies.
- `allowlist`: Only rooms listed in `channels.matrix.rooms` are allowed.

```json5
{
  channels: {
    matrix: {
      groupPolicy: "allowlist",
      rooms: {
        "!roomid:example.org": { allow: true, requireMention: true },
        "#ops:example.org": { allow: true, requireMention: false }
      }
    }
  }
}
```

### Per-room settings

```json5
{
  channels: {
    matrix: {
      rooms: {
        "*": { requireMention: true },  // default for all rooms
        "!specific:example.org": {
          enabled: true,           // alias for allow
          allow: true,
          autoReply: false,        // when true, don't require mention
          requireMention: true,    // require @mention to respond
          skills: ["docs", "code"], // skill filter (omit = all skills)
          systemPrompt: "Keep answers short and technical.",
          users: ["@alice:example.org"]  // per-room user allowlist
        }
      }
    }
  }
}
```

### Auto-join

Control automatic room joins on invite:

- `always` (default): Accept all invites.
- `allowlist`: Only join rooms in `channels.matrix.autoJoinAllowlist`.
- `off`: Never auto-join.

```json5
{
  channels: {
    matrix: {
      autoJoin: "allowlist",
      autoJoinAllowlist: ["!roomid:example.org", "#ops:example.org"]
    }
  }
}
```

## Threads and replies

### Thread replies

Matrix threads are fully supported. Control behavior with `channels.matrix.threadReplies`:

- `inbound` (default): Reply in a thread only if the sender started one.
- `always`: Always reply in threads (create new thread if none exists).
- `off`: Never use thread replies.

When an inbound message is a thread reply, Clawdbot follows the thread automatically.

### Reply-to mode

Control non-thread reply tags with `channels.matrix.replyToMode`:

- `off` (default): Don't add reply relations.
- `first`: Reply-to on first message only.
- `all`: Reply-to on all messages.

## Sending messages (CLI/cron)

Deliver messages to rooms using the CLI:

```bash
# By room ID
clawdbot message send --channel matrix --to "room:!roomid:example.org" --message "hello"

# By alias
clawdbot message send --channel matrix --to "#channel:example.org" --message "hello"

# Direct message (requires existing DM room via m.direct)
clawdbot message send --channel matrix --to "user:@alice:example.org" --message "hello"
```

Short form targets:
- `room:<roomId>` or just `!roomid:example.org`
- `#alias:example.org` (resolved to room ID)
- `user:@userid:example.org` or `@userid:example.org` (DM via m.direct lookup)

## Agent tool

The `matrix` tool allows the agent to interact with Matrix programmatically.

### Available actions

| Action | Description | Required params |
|--------|-------------|-----------------|
| `sendMessage` | Send a message | `to`, `content` |
| `editMessage` | Edit a message | `roomId`, `messageId`, `content` |
| `deleteMessage` | Delete (redact) a message | `roomId`, `messageId` |
| `readMessages` | Read room history | `roomId` |
| `react` | Add/remove reaction | `roomId`, `messageId`, `emoji` |
| `reactions` | List reactions on message | `roomId`, `messageId` |
| `pinMessage` | Pin a message | `roomId`, `messageId` |
| `unpinMessage` | Unpin a message | `roomId`, `messageId` |
| `listPins` | List pinned messages | `roomId` |
| `memberInfo` | Get user info | `userId` |
| `roomInfo` | Get room info | `roomId` |

### Action gating

Control which actions are enabled:

```json5
{
  channels: {
    matrix: {
      actions: {
        messages: true,    // sendMessage, editMessage, deleteMessage, readMessages
        reactions: true,   // react, reactions
        pins: true,        // pinMessage, unpinMessage, listPins
        memberInfo: true,  // memberInfo
        roomInfo: true     // roomInfo
      }
    }
  }
}
```

## Polls

Matrix polls are supported via the MSC3381 poll format. Inbound polls are converted to text for agent processing:

```
📊 Poll from Alice: "What should we order for lunch?"
Options:
1. Pizza
2. Sushi
3. Tacos
[Poll ID: $eventid123]
```

Send polls via CLI:
```bash
clawdbot message poll --channel matrix --to "room:!roomid:example.org" \
  --question "What should we order?" \
  --options "Pizza,Sushi,Tacos"
```

## Capabilities and limits

### What works

- ✅ Unencrypted rooms and DMs
- ✅ DMs and group rooms
- ✅ Threads and reply relations
- ✅ Typing indicators
- ✅ Reactions (add/remove/list)
- ✅ Message editing and deletion (redaction)
- ✅ Pinned messages
- ✅ Room/member info queries
- ✅ Media uploads via Matrix content repository
- ✅ Media uploads/downloads in unencrypted rooms
- ✅ Polls (MSC3381)

### Limits

- Text chunked to `channels.matrix.textChunkLimit` (default: 4000 chars).
- Media capped by `channels.matrix.mediaMaxMb` (default: 20 MB).
- **Node.js only** — Bun runtime is not supported.

## Full configuration reference

```json5
{
  channels: {
    matrix: {
      // Provider control
      enabled: true,                        // enable/disable the provider
      
      // Authentication
      homeserver: "https://matrix.example.org",
      userId: "@clawdbot:example.org",
      accessToken: "syt_...",               // preferred auth method
      password: "...",                       // alternative: login at startup
      deviceName: "Clawdbot Gateway",       // display name for device
      
      // Storage (defaults usually fine)
      storePath: "~/.clawdbot/credentials/matrix/store",
      
      // Auto-join behavior
      autoJoin: "always",                   // always | allowlist | off
      autoJoinAllowlist: ["!roomid:example.org", "#ops:example.org"],
      
      // Room handling
      groupPolicy: "disabled",              // open | allowlist | disabled
      allowlistOnly: false,                 // require allowlists for all
      
      // DM handling
      dm: {
        enabled: true,
        policy: "pairing",                  // pairing | allowlist | open | disabled
        allowFrom: ["@owner:example.org", "*"]
      },
      
      // Per-room config
      rooms: {
        "*": { requireMention: true },
        "!roomid:example.org": {
          allow: true,
          autoReply: false,
          skills: ["docs"],
          systemPrompt: "Keep answers short."
        }
      },
      
      // Threading
      replyToMode: "off",                   // off | first | all
      threadReplies: "inbound",             // inbound | always | off
      
      // Limits
      textChunkLimit: 4000,
      mediaMaxMb: 20,
      initialSyncLimit: 10,                 // events per room on initial sync
      
      // Tool gating
      actions: {
        messages: true,
        reactions: true,
        pins: true,
        memberInfo: true,
        roomInfo: true
      }
    }
  }
}
```

### Environment variables

All config options can be overridden via environment variables (env wins):

| Variable | Config key |
|----------|------------|
| `MATRIX_HOMESERVER` | `channels.matrix.homeserver` |
| `MATRIX_USER_ID` | `channels.matrix.userId` |
| `MATRIX_ACCESS_TOKEN` | `channels.matrix.accessToken` |
| `MATRIX_PASSWORD` | `channels.matrix.password` |
| `MATRIX_DEVICE_NAME` | `channels.matrix.deviceName` |
| `MATRIX_STORE_PATH` | `channels.matrix.storePath` |

## Routing and sessions

Session keys follow the standard agent format:

- **DMs**: Share the main session (`agent:<agentId>:<mainKey>`)
- **Rooms**: Isolated by room (`agent:<agentId>:matrix:channel:<roomId>`)

The `From` field in context:
- DMs: `matrix:@userid:example.org`
- Rooms: `matrix:channel:!roomid:example.org`

## Troubleshooting

### Bot can't read encrypted messages

Encrypted rooms/messages are not supported yet.

Fix: use an unencrypted room/DM for Clawdbot.

### "Matrix requires Node.js" error

Matrix is not supported on Bun. Run the gateway with Node.js:
```bash
node dist/bin/clawdbot.js gateway
```

### DMs not working

1. Check `channels.matrix.dm.enabled` is true.
2. Check `channels.matrix.dm.policy` — if `pairing`, approve pending requests.
3. For `allowlist` policy, verify the sender is in `channels.matrix.dm.allowFrom`.

### Room messages ignored

1. Check `channels.matrix.groupPolicy` — it's `disabled` by default.
2. For `allowlist` policy, add the room to `channels.matrix.rooms`.
3. Check if mention is required but bot wasn't mentioned.

## References

- [Matrix Client-Server API](https://spec.matrix.org/latest/client-server-api/)
- [matrix-js-sdk documentation](https://matrix-org.github.io/matrix-js-sdk/)
- [MSC3381 Polls](https://github.com/matrix-org/matrix-spec-proposals/pull/3381)

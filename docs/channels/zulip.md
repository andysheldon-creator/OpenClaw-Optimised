---
summary: "Zulip bot setup and OpenClaw config"
read_when:
  - Setting up Zulip
  - Debugging Zulip routing
title: "Zulip"
---

# Zulip (plugin)

Status: supported via plugin (bot email + API key + event queue). Streams and topics are supported.
File uploads (inbound and outbound) are supported via Zulip `user_uploads`.

## Plugin required

Zulip ships as a plugin and is not bundled with the core install.

Install via CLI (npm registry):

```bash
openclaw plugins install @openclaw/zulip
```

Local checkout (when running from a git repo):

```bash
openclaw plugins install ./extensions/zulip
```

Details: [Plugins](/plugin)

## Quick setup

1. Create a **Generic bot** in your Zulip organization (Settings → Your bots).
2. Copy the bot's email and API key.
3. Subscribe the bot to the stream(s) you want it to monitor.
4. Configure OpenClaw and start the gateway.

Minimal config:

```json5
{
  channels: {
    zulip: {
      enabled: true,
      url: "https://zulip.example.com",
      email: "your-bot@zulip.example.com",
      apiKey: "zulip-bot-api-key",

      // Streams to monitor. Use ["*"] for all public streams.
      streams: ["my-stream"],

      // Users allowed to interact with the bot.
      allowFrom: ["user@zulip.example.com"],
    },
  },
}
```

## Mention behavior

By default, the bot replies to **every** message in monitored streams (no mention required).
To require an `@mention`, set:

```json5
{
  channels: {
    zulip: {
      requireMention: true,
    },
  },
}
```

## Reaction indicators

While OpenClaw generates a reply, it reacts to the triggering message:

| Phase   | Default emoji   | Meaning    |
| ------- | --------------- | ---------- |
| Start   | 👀 `eyes`       | Processing |
| Success | ✅ `check_mark` | Done       |
| Failure | ⚠️ `warning`    | Error      |

The start reaction is removed when the final reaction is added.

Customize or disable:

```json5
{
  channels: {
    zulip: {
      reactions: {
        enabled: true, // set false to disable
        onStart: "eyes",
        onSuccess: "check_mark",
        onError: "warning",
        clearOnFinish: true, // remove onStart when done
      },
    },
  },
}
```

> **Note:** Emoji names are server-specific. Use names from your Zulip instance.
> Both `eyes` and `:eyes:` formats are accepted (colons are stripped automatically).

## Sessions (topics → sessions)

Zulip topics map to OpenClaw sessions:

- Same stream + same topic → same session
- Different topic → different session

This keeps conversations separated per topic.

## Switching topics

An agent can create or switch topics by prefixing a reply with:

```
[[zulip_topic: <topic>]]
```

OpenClaw strips this directive before posting and sends the reply into the requested topic.
Topics are truncated to 60 characters.

## Media (uploads)

**Inbound:** When a message contains `/user_uploads/` links, OpenClaw downloads the files
(with bot authentication) and attaches them to the agent context.

**Outbound:** OpenClaw uploads local files to Zulip via `/api/v1/user_uploads` and posts
the resulting link into the stream/topic.

Optional size limit:

```json5
{
  channels: {
    zulip: {
      mediaMaxMb: 5, // default: 5MB
    },
  },
}
```

## Outbound targets

Use these target formats with `message send`:

- `stream:<streamName>#<topic>` — stream with specific topic
- `stream:<streamName>` — stream with default topic ("general chat")

Examples:

```bash
openclaw message send --channel zulip --target "stream:my-stream" --message "hello"
openclaw message send --channel zulip --target "stream:my-stream#deploy-notes" --message "shipped"
```

## Channel actions

The Zulip plugin supports the following message tool actions:

- `send` — Send a message to a stream/topic
- `read` — Read recent messages
- `search` — Search messages
- `react` / `unreact` — Add/remove emoji reactions
- `pin` / `unpin` — Pin/unpin messages
- `edit` / `delete` — Edit or delete messages
- `channel-list` — List streams
- `channel-create` / `channel-edit` / `channel-delete` — Manage streams
- `member-info` — Get user info

## HTTP retry / rate limiting

All API calls use exponential backoff with jitter:

- **429 rate limits:** starts at 10s, respects `Retry-After` header, max 120s
- **502/503/504 errors:** starts at 500ms, max 30s
- **Event polling:** automatic reconnection with backoff on errors

## Access control

```json5
{
  channels: {
    zulip: {
      // Who can talk to the bot
      allowFrom: ["user@zulip.example.com"],

      // Or use group policy
      groupPolicy: "allowlist",
      allowlist: ["user@zulip.example.com"],
    },
  },
}
```

## Troubleshooting

- **No replies:** Confirm the bot is subscribed to the stream and `channels.zulip.streams` includes the stream name (or `"*"`).
- **Auth errors:** Verify `url`, `email`, and `apiKey`. Use the bot's API key, not your personal key.
- **Reactions not appearing:** Verify the emoji name exists on your Zulip server. Custom emoji names vary by instance.
- **Uploads not downloading:** Check `mediaMaxMb` — files larger than the limit are skipped silently.
- **After code changes:** Must compile TypeScript (`npx tsc`) AND do a full process restart (`systemctl --user restart openclaw-gateway`). SIGUSR1 restarts cache old modules.

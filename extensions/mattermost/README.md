# @openclaw/mattermost

Mattermost channel plugin for **OpenClaw** -- self-hosted team messaging via bot token and WebSocket events. Supports channels, groups, DMs, threads, and media.

Docs: `https://docs.openclaw.ai/channels/mattermost`
Plugin system: `https://docs.openclaw.ai/plugin`

## Install

```bash
openclaw plugins install @openclaw/mattermost
```

Local dev (git checkout):

```bash
openclaw plugins install ./extensions/mattermost
```

Restart the gateway after installation.

## Config

Minimal config under `channels.mattermost`:

```json5
{
  channels: {
    mattermost: {
      enabled: true,
      botToken: "your-bot-token",
      baseUrl: "https://chat.example.com",
      dmPolicy: "pairing",
    },
  },
}
```

Or use environment variables (default account only):

- `MATTERMOST_BOT_TOKEN`
- `MATTERMOST_URL`

## Chat modes

- **oncall** (default) -- respond when @mentioned in channels
- **onmessage** -- respond to every channel message
- **onchar** -- respond when a message starts with a trigger prefix (`>`, `!`)

Set via `channels.mattermost.chatmode`.

## Multi-account

```json5
{
  channels: {
    mattermost: {
      accounts: {
        default: { botToken: "token-1", baseUrl: "https://chat.example.com" },
        alerts: { botToken: "token-2", baseUrl: "https://alerts.example.com" },
      },
    },
  },
}
```

## Outbound targets

- `channel:<id>` -- post to a channel
- `user:<id>` -- DM a user by ID
- `@username` -- DM a user by username

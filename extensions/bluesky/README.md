# @openclaw/bluesky

OpenClaw channel plugin for **Bluesky** DMs via the [AT Protocol](https://atproto.com/).

Receive and reply to Bluesky direct messages through OpenClaw.

## Setup

1. Install the plugin:

```bash
openclaw plugins install @openclaw/bluesky
```

2. Create an **App Password** on Bluesky:
   - Go to [bsky.app](https://bsky.app) > Settings > App Passwords
   - Create a new app password (name it "OpenClaw" or similar)

3. Configure:

```bash
openclaw config set channels.bluesky.identifier "your-handle.bsky.social"
openclaw config set channels.bluesky.appPassword "your-app-password"
```

4. Restart the gateway.

## Configuration

All config lives under `channels.bluesky`:

```json5
{
  channels: {
    bluesky: {
      identifier: "your-handle.bsky.social", // or DID
      appPassword: "xxxx-xxxx-xxxx-xxxx",
      // Optional:
      service: "https://bsky.social",        // PDS URL (default)
      pollInterval: 5000,                     // ms between DM checks
      dmPolicy: "pairing",                    // pairing | allowlist | open | disabled
      allowFrom: ["did:plc:...", "friend.bsky.social"],
    },
  },
}
```

## How it works

- Uses `@atproto/api` with app password auth
- Polls `chat.bsky.convo.*` endpoints for new DMs
- Messages are routed through OpenClaw's standard pipeline
- Responses are sent back via `chat.bsky.convo.sendMessage`

## Limitations

- **Text only** — Bluesky DMs currently only support text (no media)
- **Polling** — no real-time push; default 5s interval
- **App password auth** — OAuth not yet supported for chat scopes

## Development

```bash
# From the repo root
pnpm install
pnpm test -- extensions/bluesky
```

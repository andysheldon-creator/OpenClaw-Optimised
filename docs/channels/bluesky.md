---
summary: "Bluesky channel setup (AT Protocol DMs)"
read_when:
  - You want to connect OpenClaw to Bluesky
  - You need to configure Bluesky DMs
title: "Bluesky"
---

# Bluesky

Connect OpenClaw to [Bluesky](https://bsky.app) direct messages via the
[AT Protocol](https://atproto.com/).

## Prerequisites

- A Bluesky account
- An **App Password** (not your main password)

## Quick start

1. Install the plugin:

```bash
openclaw plugins install @openclaw/bluesky
```

2. Create an App Password on Bluesky:

   - Open [bsky.app](https://bsky.app) and go to **Settings > App Passwords**
   - Click **Add App Password**, name it (e.g. "OpenClaw"), and copy the generated password

3. Configure:

```bash
openclaw config set channels.bluesky.identifier "your-handle.bsky.social"
openclaw config set channels.bluesky.appPassword "xxxx-xxxx-xxxx-xxxx"
```

4. Restart the gateway.

5. Verify:

```bash
openclaw channels status --probe
```

## Configuration reference

All config lives under `channels.bluesky`:

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `identifier` | string | — | Your Bluesky handle or DID (required) |
| `appPassword` | string | — | App password from Bluesky settings (required) |
| `service` | string | `https://bsky.social` | PDS service URL |
| `enabled` | boolean | `true` | Enable/disable the channel |
| `pollInterval` | number | `5000` | Milliseconds between DM polls (min 2000, max 60000) |
| `dmPolicy` | string | `pairing` | DM access policy: `pairing`, `allowlist`, `open`, or `disabled` |
| `allowFrom` | array | `[]` | Allowed sender DIDs or handles |
| `markdown.tableMode` | string | `text` | Markdown table rendering mode |

### Example config

```json5
{
  channels: {
    bluesky: {
      identifier: "your-handle.bsky.social",
      appPassword: "xxxx-xxxx-xxxx-xxxx",
      pollInterval: 5000,
      dmPolicy: "pairing",
      allowFrom: ["friend.bsky.social"],
    },
  },
}
```

## DM policies

| Policy | Behavior |
|--------|----------|
| `pairing` | New senders must be approved (default) |
| `allowlist` | Only senders in `allowFrom` can message |
| `open` | Anyone can send DMs |
| `disabled` | DMs are ignored |

## Custom PDS

If you self-host a PDS or use a different provider, set the `service` URL:

```bash
openclaw config set channels.bluesky.service "https://my-pds.example.com"
```

## Sending messages

Send a DM to a Bluesky user:

```bash
openclaw message send --channel bluesky --to "friend.bsky.social" "Hello from OpenClaw!"
openclaw message send --channel bluesky --to "did:plc:abc123" "Hello by DID!"
```

## Limitations

- **Text only** — Bluesky DMs currently support text messages only (no images or files)
- **Polling-based** — messages are fetched on an interval (no real-time push yet)
- **App password auth** — OAuth is not yet supported for chat scopes in the AT Protocol

## Troubleshooting

### Authentication fails

- Verify your handle is correct (include the full domain, e.g. `user.bsky.social`)
- Regenerate your App Password if it was revoked
- Check that your PDS service URL is correct (default: `https://bsky.social`)

### No messages arriving

- Confirm the channel is running: `openclaw channels status`
- Check your `dmPolicy` — if set to `allowlist`, ensure the sender is in `allowFrom`
- Increase logging: check gateway logs for Bluesky-related errors

### Rate limiting

Bluesky may rate-limit frequent API calls. If you see rate limit errors, increase `pollInterval`:

```bash
openclaw config set channels.bluesky.pollInterval 10000
```

For general channel troubleshooting, see [Channels](/channels) and the [Plugins](/plugin) guide.

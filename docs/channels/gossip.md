---
summary: "Gossip decentralized messenger with post-quantum encryption"
read_when:
  - You want OpenClaw to use privacy-focused messaging
  - You want decentralized messaging without a phone number
  - You need post-quantum encryption
---

# Gossip

**Status:** Optional plugin (disabled by default).

Gossip is a privacy-focused, decentralized messenger that enables OpenClaw to send and receive encrypted direct messages without requiring a phone number or relying on centralized servers. For more details, see the official Gossip site at https://usegossip.massa.network/.

## Why Gossip?

- **Open Source** - Fully auditable codebase; no hidden backdoors.
- **Privacy Focused** - Post-quantum encryption with deniable plausibility protects your conversations even against future quantum computers.
- **Decentralized** - No central server owns your data; messages are routed through a distributed network.
- **No Phone Number Required** - Identity is based on cryptographic keys, not phone numbers or email addresses.

## Install (on demand)

### Onboarding (recommended)

- The onboarding wizard (`openclaw onboard`) and `openclaw channels add` list optional channel plugins.
- Selecting Gossip prompts you to install the plugin on demand.

Install defaults:

- **Dev channel + git checkout available:** uses the local plugin path.
- **Stable/Beta:** downloads from npm.

You can always override the choice in the prompt.

### Manual install

```bash
openclaw plugins install gossip
```

Or with the full npm spec: `openclaw plugins install @openclaw/gossip`.

Use a local checkout (dev workflows):

```bash
openclaw plugins install --link <path-to-openclaw>/extensions/gossip
```

Restart the Gateway after installing or enabling plugins.

## Quick setup

1. Enable the Gossip channel in your config:

```json
{
  "channels": {
    "gossip": {
      "enabled": true
    }
  }
}
```

2. Restart the Gateway. On first run, OpenClaw will automatically:
   - Generate a new BIP39 mnemonic for your account
   - Create cryptographic keys for encryption
   - Register with the Gossip network

3. Note the user ID from the logs - share this with users who want to message your bot.
   User id will be written in: `~/.openclaw/sessions/gossip/<username>/session.json`

## Configuration reference

| Key           | Type     | Default                         | Description                                |
| ------------- | -------- | ------------------------------- | ------------------------------------------ |
| `enabled`     | boolean  | `false`                         | Enable/disable channel                     |
| `mnemonic`    | string   | auto-generated                  | BIP39 mnemonic phrase for account recovery |
| `username`    | string   | `openclaw`                      | Display name for the account               |
| `protocolUrl` | string   | `https://api.usegossip.com/api` | Gossip protocol API endpoint               |
| `dmPolicy`    | string   | `pairing`                       | DM access policy                           |
| `allowFrom`   | string[] | `[]`                            | Allowed sender user IDs                    |
| `name`        | string   | -                               | Display name for this account              |

## Backup your mnemonic

Your mnemonic phrase is the only way to recover your Gossip identity. On first run, OpenClaw stores it at:

```
~/.openclaw/sessions/gossip/<username>/session.json
```

**Back up this file securely.** If you lose it, you will need to create a new identity.

To use an existing mnemonic (restore an account):

Add this to your main OpenClaw config file (by default `~/.openclaw/config.json5`, or whatever `OPENCLAW_CONFIG_PATH` points to):

```json
{
  "channels": {
    "gossip": {
      "mnemonic": "${GOSSIP_MNEMONIC}"
    }
  }
}
```

Then set the environment variable:

```bash
export GOSSIP_MNEMONIC="word1 word2 word3 ... word12"
```

You can also restore an existing account directly via the Gossip channel onboarding flow (`openclaw onboard` or `openclaw channels add`), which will prompt you to paste an existing BIP39 mnemonic instead of generating a new one.

## Access control

### DM policies

- **pairing** (default): unknown senders get a pairing code.
- **allowlist**: only user IDs in `allowFrom` can DM.
- **open**: public inbound DMs (requires `allowFrom: ["*"]`).
- **disabled**: ignore inbound DMs.

### Contact requests and auto-accept

Gossip uses "discussion requests" when someone tries to DM your bot for the first time. The OpenClaw Gossip plugin **automatically accepts all discussion requests** so you do not need to manually approve each new contact in the Gossip app.

Auto-accepting contacts does **not** bypass OpenClaw's own access control:

- **DM policy still applies**: after a contact is auto-accepted, inbound messages are checked against your configured `dmPolicy` and `allowFrom` list.
  - With `dmPolicy: "allowlist"`, only user IDs in `allowFrom` are allowed to talk to your agent (a whitelist).
  - With `dmPolicy: "pairing"`, unknown senders must complete the pairing flow before their messages reach your agent.
  - With `dmPolicy: "open"` and `allowFrom: ["*"]`, any Gossip user can reach your agent unless they are blocked by higher-level routing rules.
- **Blocklist-style filtering**: to effectively block specific Gossip user IDs, keep them **out** of your `allowFrom` list (when using the `allowlist` policy) or add them to your global routing block rules; their messages will be dropped even though the underlying Gossip contact exists.

In practice, for a locked-down production bot you will typically:

```json
{
  "channels": {
    "gossip": {
      "dmPolicy": "allowlist",
      "allowFrom": ["gossip1a23...", "gossip1x89..."]
    }
  }
}
```

This configuration lets Gossip auto-accept contact requests while still enforcing a strict allowlist for who can actually reach your agent.

### Allowlist example

```json
{
  "channels": {
    "gossip": {
      "dmPolicy": "allowlist",
      "allowFrom": ["abc123...", "xyz789..."]
    }
  }
}
```

## How it works

Gossip uses a unique cryptographic protocol:

1. **Identity**: Your identity is a cryptographic key pair derived from a BIP39 mnemonic.
2. **Sessions**: When you start a conversation, both parties establish an encrypted session using post-quantum key exchange.
3. **Messages**: All messages are end-to-end encrypted; only the intended recipient can read them.
4. **Deniability**: The protocol provides deniable authentication - you can prove a message came from someone, but cannot prove it to a third party.

## Testing

### Manual test

1. Note the bot user ID from logs after starting the Gateway.
2. Open the Gossip app on your phone or computer.
3. Add the bot as a contact using its user ID.
4. Start a conversation and send a message.
5. Verify the bot responds.

## Troubleshooting

### Not receiving messages

- Verify the channel is enabled (`enabled: true`).
- Check that the Gateway is running.
- Confirm the sender has an active session with your bot.
- Check Gateway logs for connection errors.

### Not sending responses

- Verify outbound network connectivity to `api.usegossip.com` (API path `/api`).
- Check if the session with the recipient is active.
- Look for errors in the Gateway logs.

### Session issues

If you see "session broken" or similar errors:

- The SDK automatically attempts to renew broken sessions.
- Messages are queued and sent when the session becomes active.
- If problems persist, the other party may need to reinitiate the conversation.

## Security

- **Never share your mnemonic** - it controls your entire identity.
- Use environment variables for sensitive values.
- Consider `allowlist` policy for production bots.
- Session data is stored encrypted on disk.

## Limitations (initial release)

- Direct messages only (no group chats yet).
- No media attachments (text only).
- Single account per OpenClaw instance.

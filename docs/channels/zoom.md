---
summary: "Zoom Team Chat plugin support status, capabilities, and configuration"
read_when:
  - Working on Zoom Team Chat integration
  - Setting up Zoom bot webhooks
---
# Zoom Team Chat

Status: production-ready plugin for Zoom Team Chat direct messages via Team Chat Bot API and webhooks.

## Quick setup

1) Create a 'General App' in [Zoom App Marketplace](https://marketplace.zoom.us/develop/create)
2) Enable the Team Chat surface and note your credentials (Client ID, Client Secret, Bot JID, Webhook Secret Token)
3) Install the plugin: `pnpm install` (the zoom extension is included in the workspace)
4) Configure URLs (see URL Configuration below):
   - Webhook URL: `https://gateway-host/webhooks/zoom`
   - OAuth Redirect URL: `https://gateway-host/api/zoomapp/auth`
5) Set credentials in config:
   ```json5
   {
     channels: {
       zoom: {
         enabled: true,
         clientId: "YOUR_CLIENT_ID",
         clientSecret: "YOUR_CLIENT_SECRET",
         botJid: "YOUR_BOT_JID@xmppdev.zoom.us",
         secretToken: "YOUR_SECRET_TOKEN",
         dm: { policy: "open" }
       }
     }
   }
   ```
6) Start the gateway
7) Message the bot in Zoom Team Chat

## What it is

- A Zoom Team Chat channel plugin that receives messages via webhooks
- Direct message support (groups not currently supported)
- Webhook server runs on port 3001 (Gateway Control UI uses 3000)
- OAuth 2.0 client credentials flow for API authentication

## Setup (detailed)

### 1. Create Zoom Team Chat App

1) Go to [Zoom App Marketplace](https://marketplace.zoom.us/develop/create)
2) Click "Create" and select "Team Chat App"
3) Enable the **Bot** feature
4) Note your credentials from the app settings:
   - **Client ID**
   - **Client Secret**
   - **Bot JID** (e.g., `bot@xmppdev.zoom.us`)
   - **Secret Token** (for webhook verification)

### 2. Configure URLs

Configure these URLs in your Zoom app settings:

**Webhook URL** (for receiving messages):
```
https://gateway-host/webhooks/zoom
```

**OAuth Redirect URL** (for app installation):
```
https://gateway-host/api/zoomapp/auth
```

Replace `gateway-host` with:
- **Local development**: Use ngrok (`ngrok http 3001`) or another tunnel service to expose port 3001
- **Production**: Your server's public domain (configure reverse proxy to forward to port 3001)

Subscribe to these event types:
- `bot_notification` - Required for receiving messages

### 3. Install App to Your Account

1) In app settings, click "Install"
2) Authorize the app
3) The bot will appear in your Zoom Team Chat

### 4. Configure Moltbot

Add to `moltbot.yaml`:

```yaml
channels:
  zoom:
    enabled: true
    clientId: YOUR_CLIENT_ID
    clientSecret: YOUR_CLIENT_SECRET
    botJid: YOUR_BOT_JID@xmppdev.zoom.us
    secretToken: YOUR_SECRET_TOKEN
    apiHost: https://zoomdev.us          # Use https://api.zoom.us for production
    oauthHost: https://zoomdev.us        # Use https://zoom.us for production
    dm:
      policy: open                        # open | closed | allowlist
```

### 5. Start Gateway

```bash
moltbot gateway run
```

The webhook server will start on port 3001.

### 6. Test

Send a direct message to your bot in Zoom Team Chat. The bot should respond with context-aware replies.

## Configuration Options

### DM Policies

**Open** (default):
```yaml
dm:
  policy: open
```
Anyone can message the bot.

**Closed**:
```yaml
dm:
  policy: closed
```
Bot rejects all DMs.

**Allowlist**:
```yaml
dm:
  policy: allowlist
  allowFrom:
    - user1@xmppdev.zoom.us
    - user2@xmppdev.zoom.us
```
Only specified users can message the bot.

### Development vs Production

**Development (zoomdev.us):**
```yaml
channels:
  zoom:
    apiHost: https://zoomdev.us
    oauthHost: https://zoomdev.us
    botJid: bot@xmppdev.zoom.us
```

**Production (zoom.us):**
```yaml
channels:
  zoom:
    apiHost: https://api.zoom.us
    oauthHost: https://zoom.us
    botJid: bot@xmpp.zoom.us
```

## Features

- **Direct Messages**: One-on-one conversations
- **Conversation History**: Full context retention across messages
- **Streaming Responses**: Real-time message updates
- **Tool Execution**: All standard Moltbot tools are available
- **Session Management**: Persistent sessions per user

## Session Keys

Session keys follow the format:
```
zoom:default:user@xmppdev.zoom.us
```

Sessions are stored at:
```
~/.moltbot/agents/{agentId}/sessions/{session-id}.jsonl
```

## Capabilities

- **Chat types**: Direct messages only (groups not supported)
- **Reactions**: Not supported
- **Threads**: Not supported
- **Media**: Not currently supported
- **Streaming**: Supported (coalesced with 1500 char minimum, 1000ms idle)

## Troubleshooting

### Port 3000 Conflict

If you see "port 3000 already in use":
- Gateway Control UI runs on port 3000
- Zoom webhook server uses port 3001
- This is expected and correct

### Webhook Not Receiving Messages

1. Check tunnel is running (if using FRP or similar)
2. Verify webhook URL in Zoom app settings matches your tunnel/domain
3. Check gateway logs for errors
4. Verify `secretToken` matches your app configuration

### Bot Not Responding

1. Verify credentials in `moltbot.yaml` are correct
2. Check Anthropic API key is valid
3. Ensure `botJid` matches your app's Bot JID exactly
4. Confirm app is installed to your Zoom account
5. Check gateway logs for authentication errors

### OAuth Issues

If you see authentication errors:
- Verify `clientId` and `clientSecret` are correct
- Check `oauthHost` matches your environment (dev vs prod)
- Review gateway logs for OAuth token errors

## Architecture

The Zoom plugin follows Moltbot's standard channel plugin architecture:

- **Extension**: `extensions/zoom/` - Plugin registration and metadata
- **Core**: `src/zoom/` - Webhook server, message handling, API client
- **Monitor**: Starts Express server on port 3001, handles webhook events
- **Message Handler**: Integrates with `dispatchInboundMessage()` for AI routing

For implementation details, see the [plugin source code](https://github.com/moltbot/moltbot/tree/main/extensions/zoom).

## Security

**Never commit credentials!**

Store sensitive values in `moltbot.yaml` (gitignored) and use `moltbot-example.yaml` for documentation templates.

Webhook events are verified using the `secretToken` from your Zoom app configuration.

## Limitations

- Groups are not currently supported
- Media uploads not yet implemented
- Reactions not supported
- Thread support not available

## See Also

- [Channels Overview](/channels)
- [Gateway Configuration](/gateway/configuration)
- [Security Policies](/gateway/security)
- [Zoom App Marketplace](https://marketplace.zoom.us/)

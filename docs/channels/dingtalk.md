# DingTalk

DingTalk (钉钉) is a popular enterprise communication platform in China and Asia. OpenClaw integrates with DingTalk using Custom Robots (webhooks) to send and receive messages in group chats.

## Overview

The DingTalk integration allows you to:

- Send messages to DingTalk groups via custom robot webhooks
- Receive messages from DingTalk groups
- Use @mentions to notify specific users
- Send text and markdown formatted messages

## Prerequisites

Before setting up DingTalk integration, you need:

1. **DingTalk Account**: A DingTalk account with access to a group
2. **Group Admin Access**: Permission to add robots to the group
3. **Custom Robot**: A custom robot created in your DingTalk group

## Setup

### Step 1: Create a Custom Robot in DingTalk

1. Open your DingTalk group
2. Tap the group settings icon (⚙️) in the top right
3. Select **Group Assistant** → **Add Robot**
4. Choose **Custom Robot**
5. Give your robot a name (e.g., "OpenClaw Bot")
6. Configure security settings:
   - **Recommended**: Choose "Signature" for secure webhook verification
   - Alternative: Use "Custom Keywords" (less secure)
7. Copy the **Webhook URL** (starts with `https://oapi.dingtalk.com/robot/send?access_token=...`)
8. Copy the **Secret** (if using signature security)
9. Tap **Finish**

### Step 2: Run OpenClaw Onboarding

Run the onboarding command:

```bash
openclaw onboard dingtalk
```

The wizard will prompt you for:

- **Webhook URL**: Paste the URL from Step 1
- **Secret**: Paste the secret from Step 1
- **DM Policy**: Choose how to handle incoming messages
  - `pairing`: Users must pair before sending messages (recommended)
  - `allowlist`: Only specific users can send messages
  - `open`: Anyone in the group can send messages
  - `disabled`: No incoming messages accepted

The onboarding will test the connection by sending a test message to your group.

### Step 3: Verify Configuration

Check that DingTalk is configured:

```bash
openclaw channels status
```

You should see DingTalk listed with status "configured" and "enabled".

## Configuration

The DingTalk configuration is stored in `~/.openclaw/config.json`:

```json
{
  "channels": {
    "dingtalk": {
      "enabled": true,
      "webhookUrl": "https://oapi.dingtalk.com/robot/send?access_token=YOUR_TOKEN",
      "secret": "YOUR_SECRET",
      "dmPolicy": "pairing",
      "allowFrom": ["user123", "user456"]
    }
  }
}
```

### Configuration Options

| Option       | Type     | Description                                               |
| ------------ | -------- | --------------------------------------------------------- |
| `enabled`    | boolean  | Enable/disable the channel (default: `true`)              |
| `webhookUrl` | string   | Webhook URL from DingTalk robot                           |
| `secret`     | string   | Secret for HMAC signature verification                    |
| `dmPolicy`   | string   | DM policy: `pairing`, `allowlist`, `open`, or `disabled`  |
| `allowFrom`  | string[] | List of allowed user IDs (when `dmPolicy` is `allowlist`) |

## Usage

### Sending Messages

Send a text message to your DingTalk group:

```bash
openclaw message send --to dingtalk "Hello from OpenClaw!"
```

Send a markdown message:

```bash
openclaw message send --to dingtalk --action markdown "# Hello\n\nThis is **bold** text."
```

### Using @Mentions

To mention users in your message, include their phone number or user ID:

```bash
openclaw message send --to dingtalk "@13800138000 Please review this."
```

To mention everyone:

```bash
openclaw message send --to dingtalk "@all Important announcement!"
```

### Receiving Messages

When the gateway is running, OpenClaw will receive messages sent to the DingTalk group:

```bash
openclaw gateway run
```

Messages sent in the group will be processed according to your `dmPolicy` setting.

## Gateway Setup

For bidirectional communication, you need to expose your gateway to the internet so DingTalk can send webhooks to it.

### Option 1: Using Tailscale Funnel

```bash
# Start gateway with Tailscale Funnel
openclaw gateway run --funnel
```

### Option 2: Using ngrok

```bash
# Start gateway
openclaw gateway run --port 18789

# In another terminal, start ngrok
ngrok http 18789
```

Copy the ngrok HTTPS URL and configure it in your DingTalk robot settings if needed.

## Troubleshooting

### Connection Test Failed

If the connection test fails during onboarding:

1. **Check webhook URL**: Ensure you copied the complete URL including the `access_token` parameter
2. **Check secret**: Verify the secret matches exactly (no extra spaces)
3. **Check security settings**: Ensure "Signature" is enabled in DingTalk robot settings
4. **Check network**: Ensure your machine can reach `oapi.dingtalk.com`

### Messages Not Sending

If messages fail to send:

1. **Check status**: Run `openclaw channels status --deep` to probe the connection
2. **Check webhook validity**: The webhook URL may have expired or been regenerated
3. **Check rate limits**: DingTalk has rate limits (20 messages per minute per robot)
4. **Check message size**: Messages must be under 20KB

### Not Receiving Messages

If you're not receiving messages from DingTalk:

1. **Check gateway**: Ensure `openclaw gateway run` is running
2. **Check webhook endpoint**: Verify DingTalk can reach your gateway URL
3. **Check signature**: Ensure the secret matches between OpenClaw config and DingTalk robot
4. **Check DM policy**: Verify your `dmPolicy` allows the sender
5. **Check logs**: Look for errors in gateway logs

### Signature Verification Failed

If webhook requests are rejected:

1. **Check secret**: Ensure the secret in your config matches DingTalk robot settings
2. **Check timestamp**: Ensure your system clock is accurate (signature expires after 1 hour)
3. **Regenerate secret**: Try regenerating the secret in DingTalk and updating your config

## Limitations

- **Group-specific**: Each webhook is tied to a specific DingTalk group
- **No direct messages**: Custom robots can only send to groups, not individual users
- **Text and markdown only**: Rich media (images, files) not yet supported
- **Rate limits**: 20 messages per minute per robot
- **Message size**: Maximum 20KB per message

## Multiple Groups

To support multiple DingTalk groups, create separate robot webhooks for each group and configure them as different accounts (future enhancement).

## Security Notes

- **Keep your secret safe**: The secret is used to verify webhook authenticity
- **Use signature security**: Always enable "Signature" security in DingTalk robot settings
- **Restrict allowlist**: Use `dmPolicy: "allowlist"` to limit who can send messages
- **Monitor usage**: Check gateway logs regularly for suspicious activity

## API Reference

DingTalk Custom Robot API documentation:

- [Custom Robot Access](https://open.dingtalk.com/document/robots/custom-robot-access)
- [Security Settings](https://open.dingtalk.com/document/robots/customize-robot-security-settings)
- [Message Types](https://open.dingtalk.com/document/robots/custom-robot-message-types)

## Support

For issues or questions:

- Check [GitHub Issues](https://github.com/openclaw/openclaw/issues)
- Join the OpenClaw community
- Review DingTalk API documentation

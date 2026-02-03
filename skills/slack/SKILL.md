---
name: slack
description: Use when you need to control Slack from OpenClaw via the slack tool, including reacting to messages or pinning/unpinning items in Slack channels or DMs.
metadata: { "openclaw": { "emoji": "💬", "requires": { "config": ["channels.slack"] } } }
---

# Slack Actions

## Overview

Use `slack` to react, manage pins, send/edit/delete messages, and fetch member info. The tool uses the bot token configured for OpenClaw.

## Inputs to collect

- `channelId` and `messageId` (Slack message timestamp, e.g. `1712023032.1234`).
- For reactions, an `emoji` (Unicode or `:name:`).
- For message sends, a `to` target (`channel:<ID>` or `user:<ID>`) and `content`.

Message context lines include `slack message id` and `channel` fields you can reuse directly.

---

### ℹ️ Channel ID Format

**Channel IDs are automatically normalized to uppercase.** You can use lowercase IDs and the tool will handle the conversion.

| Input                 | Normalized    |
| --------------------- | ------------- |
| `channel:c0aap72r7l5` | `C0AAP72R7L5` |
| `#c0aap72r7l5`        | `C0AAP72R7L5` |
| `C0AAP72R7L5`         | `C0AAP72R7L5` |

When extracting channel IDs from context (like `[channel: C0AAP72R7L5]`), you can use them directly.

---

## Actions

### Action groups

| Action group | Default | Notes                  |
| ------------ | ------- | ---------------------- |
| reactions    | enabled | React + list reactions |
| messages     | enabled | Read/send/edit/delete  |
| pins         | enabled | Pin/unpin/list         |
| memberInfo   | enabled | Member info            |
| emojiList    | enabled | Custom emoji list      |

### React to a message

```json
{
  "action": "react",
  "channelId": "C123",
  "messageId": "1712023032.1234",
  "emoji": "✅"
}
```

### List reactions

```json
{
  "action": "reactions",
  "channelId": "C123",
  "messageId": "1712023032.1234"
}
```

### Send a message

```json
{
  "action": "sendMessage",
  "to": "channel:C123",
  "content": "Hello from OpenClaw"
}
```

### Edit a message

```json
{
  "action": "editMessage",
  "channelId": "C123",
  "messageId": "1712023032.1234",
  "content": "Updated text"
}
```

### Delete a message

```json
{
  "action": "deleteMessage",
  "channelId": "C123",
  "messageId": "1712023032.1234"
}
```

### Read recent messages

```json
{
  "action": "readMessages",
  "channelId": "C123",
  "limit": 20
}
```

### Pin a message

```json
{
  "action": "pinMessage",
  "channelId": "C123",
  "messageId": "1712023032.1234"
}
```

### Unpin a message

```json
{
  "action": "unpinMessage",
  "channelId": "C123",
  "messageId": "1712023032.1234"
}
```

### List pinned items

```json
{
  "action": "listPins",
  "channelId": "C123"
}
```

### Member info

```json
{
  "action": "memberInfo",
  "userId": "U123"
}
```

### Emoji list

```json
{
  "action": "emojiList"
}
```

## Ideas to try

- React with ✅ to mark completed tasks.
- Pin key decisions or weekly status updates.

# Gmail Channel (Plugin)

Connects Clawdbot to Gmail via the `gog` CLI.

## Installation

This is a plugin. To install from source:

```bash
clawdbot plugins install ./extensions/gmail
```

## Features

- **Polling-based sync**: Robustly fetches new unread emails from Inbox.
- **Circuit Breaker**: Handles API failures and rate limiting gracefully.
- **Rich Text**: Markdown support for outbound emails.
- **Threading**: Native Gmail thread support.
- **Archiving**: Automatically archives threads upon reply.

## Reply Behavior

- **Reply All**: When the bot replies to a thread, it uses "Reply All" to ensure all participants are included.
- **Allowlist Gatekeeping**: The bot only responds to emails from senders on the `allowFrom` list. However, if an allowed user includes others (CC) who are *not* on the allowlist, the bot will still "Reply All", including them in the conversation. This allows authorized users to bring others into the loop.

## Configuration

Add to `clawdbot.json`:

```json5
{
  "channels": {
    "gmail": {
      "accounts": {
        "main": {
          "email": "user@gmail.com",
          "allowFrom": ["*"]
        }
      }
    }
  }
}
```

## Development

Run tests:
```bash
./node_modules/.bin/vitest run extensions/gmail/src/
```

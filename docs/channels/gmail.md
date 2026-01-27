---
summary: "Gmail channel status, capabilities, and configuration using polling or Pub/Sub"
read_when:
  - Working on Gmail channel features or debugging email sync
---
# Gmail (plugin)

The Gmail channel allows Clawdbot to send and receive emails via the Google Gmail API. It leverages the `gog` CLI tool for authentication and API interactions.

## Status
- **Text**: Fully supported (Markdown auto-converted to rich HTML).
- **Threading**: Fully supported (replies thread to original emails).
- **Attachments**: Automatic metadata injection (Filename, Type, Size, ID). Agents can download attachments on-demand using `gog`.
- **Sync**: Supports robust polling with circuit breaker and optional Pub/Sub webhooks.

### Attachments
Keith automatically manages attachments to optimize for speed and storage:
1. **Auto-Download**: Attachments **under 5MB** are automatically downloaded to Keith's local cache. The agent sees a direct file path (e.g., `~/.attachments/thread-123/invoice.pdf`) and can read it immediately.
2. **On-Demand**: Larger attachments are presented as metadata: `[Attachment: large-video.mp4 (Type: video/mp4, Size: 150 MB, ID: ...)]`. If Keith needs these, he must use the `gog` tool to download them explicitly.

## Safety & Security

### Allowlist Enforcement
Keith strictly enforces an allowlist to prevent unauthorized usage and spam.
- **Inbound Protection (Quarantine)**: If an email arrives from a sender NOT in the `allowFrom` list:
  - It is **quarantined**: The label `not-allow-listed` is applied.
  - It is **removed from Inbox**: The `INBOX` label is removed.
  - It remains **UNREAD**: So you can review it later if needed.
  - **Keith never sees it**: The message is silently filtered before reaching the agent logic.
  
- **Outbound Protection**:
  - Keith cannot send *new* emails to addresses not on the allowlist.
  - **Replies are permitted**: If Keith is replying to a valid thread (one that passed the inbound filter), the reply is allowed regardless of the recipient list, as the thread is trusted.

### "Reply All" Behavior
To function as a collaborative participant, Keith defaults to **Reply All** behavior when responding to threads.
- When Keith replies to a thread, the response goes to the **Sender** and all **CC'd** recipients of the *latest* message in that thread.
- **Privacy Note**: Be aware that if an allowed sender includes external parties on a thread, Keith's reply will be visible to them.

## Opinionated "Inbox Zero" Workflow
**Important**: The Gmail channel enforces an "Inbox Zero" philosophy to maintain a clean state and prevent infinite reply loops.
- **Reply = Archive**: When Keith sends a reply to a thread, that thread is **automatically archived** (the `INBOX` label is removed).
- **Why?**: If the thread remained in the Inbox, future sync cycles might re-process it or confuse the agent about what is "pending."
- **Result**: You will see Keith's replies in "All Mail" or "Sent," but the thread will disappear from your Inbox view once handled.

## Prerequisites
1. **Install gog**: Ensure the `gog` binary is in your PATH. The channel will fail to start if `gog` is missing.
2. **Authenticate**: Run `gog auth login` for the accounts you want Keith to use.
   ```bash
   gog auth login
   ```

## Configuration Reference

The following configuration options are available in `clawdbot.json` under `channels.gmail`.

### Global Channel Settings
| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `enabled` | boolean | `true` | Globally enable or disable the Gmail channel. |
| `accounts` | object | `{}` | Map of account configurations (keyed by account ID). |
| `defaults` | object | `{}` | Default settings applied to all accounts. |

### Account Settings (`channels.gmail.accounts.<id>`)
| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `enabled` | boolean | `true` | Enable/disable this specific account. |
| `email` | string | **Required** | The Gmail address to monitor and send from. |
| `name` | string | `email` | Display name for this account in logs and UI. |
| `allowFrom` | string[] | `[]` | Whitelist of senders. Supports exact emails or `@domain.com` wildcards. Use `["*"]` for open access. |
| `pollIntervalMs` | number | `60000` | Frequency of polling for new messages in milliseconds. |
| `delegate` | string | `null` | Optional: The email address of a delegator if using Gmail delegation. |
| `sessionTtlDays` | number | `7` | How many days to keep inactive thread sessions before pruning. |

### Example `clawdbot.json`
```json5
{
  "channels": {
    "gmail": {
      "enabled": true,
      "accounts": {
        "work": {
          "email": "keith.agent@company.com",
          "allowFrom": ["*@company.com"],
          "pollIntervalMs": 30000
        },
        "personal": {
          "email": "my-bot@gmail.com",
          "allowFrom": ["my-phone@gmail.com"]
        }
      }
    }
  }
}
```

## How it works

### Inbound Processing
1. **Sync**: Every `pollIntervalMs`, the monitor loop uses `gog` to search for `label:INBOX is:unread`.
2. **Parsing**:
   - Extracts plain text and HTML.
   - Prepends `[Thread Context: Subject is "..."]` to the body so the agent always knows the context of the email chain.
   - Strips quoted "On [date], [user] wrote:" text to keep the prompt clean.
3. **Resilience**: A per-account **Circuit Breaker** tracks failures. If the API returns repeated errors (403, 500, etc.), the account will enter a "backoff" state, increasing the wait time between retries to avoid account lockout.

### Outbound Processing
1. **Markdown**: Keith's responses are parsed as Markdown.
2. **HTML Generation**: Markdown is converted to rich HTML (tables, bold, links, etc.) using `marked` and sanitized.
3. **Delivery**: Replies are sent via `gog gmail send`. 
4. **Threading**: Replies automatically include the `In-Reply-To` and `References` headers derived from the original message ID.
5. **Archiving**: To prevent "reply loops," the original thread is automatically removed from the `INBOX` label after Keith sends a response.

## Routing & Sessions
- **Session Key**: `gmail:<account_email>:<thread_id>`
- Each Gmail thread is isolated. This means Keith maintains a separate memory/history for every unique email conversation.
- If you forward an email to Keith, it will start a new session based on that new thread ID.

## Target Formats (CLI/Cron)
To send an email via CLI or a cron job:
- **Target**: `gmail:<email>` (starts a new thread) or `gmail:<thread_id>` (replies to existing).
- **Command**:
  ```bash
  clawdbot message send --channel gmail --target "boss@example.com" --message "Report is ready."
  ```

## Troubleshooting
- **Monitor Latency**: If emails take too long to arrive, check `pollIntervalMs`.
- **Request IDs**: Every inbound message is assigned a 8-character ID. Search logs for `[gmail][<id>]` to see the full lifecycle from sync to reply.
- **Token Expiry**: Run `gog auth list` to check token status. If an account stops syncing, try `gog auth login --account <email>`.
- **Permission Errors**: Ensure the Google Cloud Project has the **Gmail API** enabled.

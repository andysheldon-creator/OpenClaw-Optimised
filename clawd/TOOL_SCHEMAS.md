# Clawdbot Tool Schemas Reference

> **CRITICAL**: Read this file before using any tool with multiple actions.

## Critical Rules

1. **6 tools require an `action` parameter**: `message`, `cron`, `nodes`, `browser`, `gateway`, `canvas`
2. **The `action` parameter is ALWAYS required** - omitting it causes validation errors
3. **No separate `email`, `message_search`, or `cron_list` tools exist** - use actions instead
4. **Use `gog gmail messages search` for Gmail** - not `get` or `view`

---

## message Tool

**Schema:** `{action: string (required), ...action-specific params}`

**Available actions (53 total):**

| Category | Actions |
|----------|---------|
| Send/Reply | `send`, `broadcast`, `reply`, `sendWithEffect`, `sendAttachment` |
| Read/Search | `read`, `search`, `poll` |
| Edit/Delete | `edit`, `unsend`, `delete` |
| Reactions | `react`, `reactions` |
| Pins | `pin`, `unpin`, `list-pins` |
| Threads | `thread-create`, `thread-list`, `thread-reply` |
| Stickers/Emoji | `sticker`, `sticker-search`, `sticker-upload`, `emoji-list`, `emoji-upload` |
| Group Management | `renameGroup`, `setGroupIcon`, `addParticipant`, `removeParticipant`, `leaveGroup` |
| Channels | `channel-info`, `channel-list`, `channel-create`, `channel-edit`, `channel-delete`, `channel-move` |
| Categories | `category-create`, `category-edit`, `category-delete` |
| Members | `member-info`, `permissions`, `role-info`, `role-add`, `role-remove` |
| Moderation | `timeout`, `kick`, `ban` |
| Events | `event-list`, `event-create`, `voice-status` |
| Voice | `voice-join`, `voice-leave` |

### Examples

**Search messages:**
```json
{
  "action": "search",
  "query": "from:user@example.com subject:urgent",
  "channel": "telegram",
  "limit": 10
}
```

**Send message:**
```json
{
  "action": "send",
  "target": "telegram:123456789",
  "text": "Hello!"
}
```

**React to message:**
```json
{
  "action": "react",
  "messageId": "12345",
  "emoji": "👍"
}
```

**List pins:**
```json
{
  "action": "list-pins",
  "channel": "discord"
}
```

---

## cron Tool

**Schema:** `{action: string (required), ...action-specific params}`

**Available actions (8 total):** `status`, `list`, `add`, `update`, `remove`, `run`, `runs`, `wake`

### Examples

**List all cron jobs:**
```json
{
  "action": "list"
}
```

**Get cron status:**
```json
{
  "action": "status"
}
```

**Add a cron job:**
```json
{
  "action": "add",
  "job": {
    "name": "Morning Gmail Check",
    "schedule": { "kind": "cron", "expr": "0 9 * * *", "tz": "America/Los_Angeles" },
    "sessionTarget": "telegram:123456789",
    "wakeMode": "now",
    "payload": {
      "kind": "agentTurn",
      "message": "Check Gmail for urgent messages"
    }
  }
}
```

> **CRITICAL**: Use `schedule.expr` NOT `schedule.cron`. Required fields: `sessionTarget`, `wakeMode`.

**Run a cron job manually:**
```json
{
  "action": "run",
  "jobId": "512b3723-a4ed-4b05-888c-f65bf687f65f"
}
```

**View recent cron runs:**
```json
{
  "action": "runs"
}
```

**Wake agent (trigger heartbeat):**
```json
{
  "action": "wake",
  "text": "Check for new messages",
  "mode": "now"
}
```

---

## nodes Tool

**Schema:** `{action: string (required), ...action-specific params}`

**Available actions (12 total):** `status`, `describe`, `pending`, `approve`, `reject`, `notify`, `camera_snap`, `camera_list`, `camera_clip`, `screen_record`, `location_get`, `run`

### Examples

**Get node status:**
```json
{
  "action": "status"
}
```

**Describe a specific node:**
```json
{
  "action": "describe",
  "node": "my-phone"
}
```

**List pending approvals:**
```json
{
  "action": "pending"
}
```

**Send notification to node:**
```json
{
  "action": "notify",
  "node": "my-phone",
  "title": "Alert",
  "body": "Something happened",
  "priority": "active"
}
```

**Take camera snapshot:**
```json
{
  "action": "camera_snap",
  "node": "my-phone",
  "facing": "back"
}
```

**Get location:**
```json
{
  "action": "location_get",
  "node": "my-phone"
}
```

---

## browser Tool

**Schema:** `{action: string (required), ...action-specific params}`

**Available actions (16 total):** `status`, `start`, `stop`, `profiles`, `tabs`, `open`, `focus`, `close`, `snapshot`, `screenshot`, `navigate`, `console`, `pdf`, `upload`, `dialog`, `act`

### Examples

**Get browser status:**
```json
{
  "action": "status"
}
```

**Start browser:**
```json
{
  "action": "start",
  "profile": "default"
}
```

**Open URL:**
```json
{
  "action": "open",
  "targetUrl": "https://example.com"
}
```

**Take screenshot:**
```json
{
  "action": "screenshot"
}
```

**Navigate to URL:**
```json
{
  "action": "navigate",
  "targetUrl": "https://example.com/page"
}
```

**Get page snapshot (for AI analysis):**
```json
{
  "action": "snapshot",
  "format": "ai"
}
```

**List open tabs:**
```json
{
  "action": "tabs"
}
```

---

## gateway Tool

**Schema:** `{action: string (required), ...action-specific params}`

**Available actions (6 total):** `restart`, `config.get`, `config.schema`, `config.apply`, `config.patch`, `update.run`

> **Note:** Rarely needed for normal operations.

### Examples

**Restart gateway:**
```json
{
  "action": "restart",
  "reason": "Configuration updated"
}
```

**Get current config:**
```json
{
  "action": "config.get"
}
```

---

## canvas Tool

**Schema:** `{action: string (required), ...action-specific params}`

**Available actions (7 total):** `present`, `hide`, `navigate`, `eval`, `snapshot`, `a2ui_push`, `a2ui_reset`

> **Note:** Used for UI presentation on connected nodes.

### Examples

**Present content:**
```json
{
  "action": "present",
  "target": "https://example.com/dashboard"
}
```

**Hide canvas:**
```json
{
  "action": "hide"
}
```

---

## GOG (Google Workspace) CLI

**Not a tool** - use `exec` tool to run commands.

### Gmail Search

```bash
gog gmail messages search "is:unread from:user@example.com" --max 10 --account clawdbot@puenteworks.com
```

### Gmail Thread Search

```bash
gog gmail search "subject:meeting" --max 5 --account clawdbot@puenteworks.com
```

### Send Email

```bash
gog gmail send --to recipient@example.com --subject "Hello" --body "Message content" --account clawdbot@puenteworks.com
```

### Calendar List Events

```bash
gog calendar events list --from "today" --to "tomorrow" --account clawdbot@puenteworks.com
```

### Calendar Create Event

```bash
gog calendar events create --title "Meeting" --start "2026-01-28T10:00:00" --end "2026-01-28T11:00:00" --account clawdbot@puenteworks.com
```

---

## Common Mistakes

| Wrong | Right | Why |
|-------|-------|-----|
| `{"tool": "email", ...}` | Use `gog gmail` CLI via exec | `email` tool doesn't exist |
| `{"tool": "message_search", ...}` | `{"tool": "message", "action": "search", ...}` | Use `message` tool with `search` action |
| `{"tool": "cron_list"}` | `{"tool": "cron", "action": "list"}` | Use `cron` tool with `list` action |
| `{"tool": "cron", "jobId": "..."}` | `{"tool": "cron", "action": "run", "jobId": "..."}` | Missing `action` parameter |
| `{"tool": "message", "text": "hi"}` | `{"tool": "message", "action": "send", "text": "hi", "target": "..."}` | Missing `action` parameter |
| `gog gmail messages get` | `gog gmail messages search` | `get` subcommand doesn't exist |
| `gog gmail messages view` | `gog gmail messages search` | `view` subcommand doesn't exist |

---

## Tool Does Not Exist Checklist

If you think you need a tool that doesn't exist, use these alternatives:

| Need | Use Instead |
|------|-------------|
| `email` tool | `exec` with `gog gmail` commands |
| `message_search` | `message` tool with `action: "search"` |
| `cron_list` | `cron` tool with `action: "list"` |
| `browser_screenshot` | `browser` tool with `action: "screenshot"` |
| `nodes_status` | `nodes` tool with `action: "status"` |

---

## Validation Errors

If you see errors like:

- `"Validation failed for tool 'cron': - action: must have required property 'action'"` 
  → You forgot to include the `action` parameter

- `"Tool not found: email"`
  → The `email` tool doesn't exist; use `gog gmail` CLI instead

- `"Tool not found: cron_list"`
  → Use `cron` tool with `action: "list"` instead

---

*Last updated: 2026-01-31*
*Source: /home/liam/src/agents/tools/*.ts*

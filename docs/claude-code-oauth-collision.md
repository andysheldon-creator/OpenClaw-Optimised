# Claude Code OAuth Collision

This document describes a token collision issue when running Clawdbot and Claude Code on the same machine, and provides a workaround.

## Problem

When running both **Clawdbot** and **Claude Code** on the same machine with the same Anthropic Max account, OAuth tokens repeatedly fail with `invalid_grant` errors every few hours.

### Error Message

```
Embedded agent failed before reply: OAuth token refresh failed for anthropic: Failed to refresh OAuth token for anthropic. Please try again or re-authenticate.
```

### Root Cause

Both tools use the **same hardcoded OAuth client_id**: `9d1c250a-e61b-44d9-88ed-5944d1962f5e`

When Claude Code refreshes its token, Anthropic's OAuth server invalidates Clawdbot's refresh token (and vice versa) because they appear to be the same application.

### Symptoms

- Token works for a few hours after re-auth, then fails
- `invalid_grant` error: "Refresh token not found or invalid"
- Claude Code continues working fine while Clawdbot fails

## Diagnosis

Test if your refresh token is valid:

```bash
REFRESH=$(jq -r '.profiles["anthropic:default"].refresh' ~/.clawdbot/agent/auth-profiles.json)
curl -s -X POST https://console.anthropic.com/v1/oauth/token \
  -H "Content-Type: application/json" \
  -d "{\"grant_type\":\"refresh_token\",\"client_id\":\"9d1c250a-e61b-44d9-88ed-5944d1962f5e\",\"refresh_token\":\"$REFRESH\"}"
```

If you see `{"error": "invalid_grant", ...}` - Claude Code has invalidated your token.

## Solution: Token Sync Script

Since Claude Code successfully refreshes (and "wins" the token battle), we can make Clawdbot piggyback on Claude Code's valid tokens.

### How It Works

```
Claude Code authenticates
       ↓
Gets fresh tokens → saves to ~/.claude/.credentials.json
       ↓
Sync script copies tokens → ~/.clawdbot/agent/auth-profiles.json
       ↓
Clawdbot uses Claude Code's valid tokens
       ↓
When Claude Code refreshes → sync script copies new tokens
       ↓
Clawdbot always has valid tokens
```

### Setup

#### 1. Use the sync script

The script is included at `scripts/sync-claude-code-auth.sh`.

Run manually:
```bash
./scripts/sync-claude-code-auth.sh
```

#### 2. Set up cron job (recommended)

Run every 30 minutes to keep tokens in sync:

```bash
(crontab -l 2>/dev/null; echo "*/30 * * * * /path/to/clawdbot/scripts/sync-claude-code-auth.sh --cron >> /tmp/clawdbot-auth-sync.log 2>&1") | crontab -
```

#### 3. Manual sync after Claude Code re-login

When Claude Code's OAuth completely expires and you run `/login`, manually sync:

```bash
./scripts/sync-claude-code-auth.sh
systemctl --user restart clawdbot  # or however you run clawdbot
```

### Token Format Mapping

| Claude Code | Clawdbot |
|-------------|----------|
| `claudeAiOauth.accessToken` | `profiles["anthropic:default"].access` |
| `claudeAiOauth.refreshToken` | `profiles["anthropic:default"].refresh` |
| `claudeAiOauth.expiresAt` | `profiles["anthropic:default"].expires` |

### File Locations

| File | Purpose |
|------|---------|
| `~/.claude/.credentials.json` | Claude Code's OAuth tokens (source) |
| `~/.clawdbot/agent/auth-profiles.json` | Clawdbot's OAuth tokens (destination) |
| `scripts/sync-claude-code-auth.sh` | Sync script |
| `/tmp/clawdbot-auth-sync.log` | Cron sync log |

## Alternative Solutions

1. **Use API key for one tool** - If you have Anthropic API credits, use `api_key` mode for Clawdbot instead of OAuth
2. **Run on separate machines** - Keep Clawdbot and Claude Code on different servers
3. **Different Anthropic accounts** - Use separate Max subscriptions (not practical for most)

## Mobile Widget (Termux)

If you use Termux on Android, you can create a widget to manually trigger sync after a `/login`:

Save to `~/.shortcuts/sync-clawdbot.sh` on your phone:

```bash
#!/data/data/com.termux/files/usr/bin/bash
termux-toast "Syncing Clawdbot auth..."

RESULT=$(ssh your-server '/path/to/clawdbot/scripts/sync-claude-code-auth.sh' 2>&1)
EXIT_CODE=$?

if [ $EXIT_CODE -eq 0 ]; then
    EXPIRY=$(echo "$RESULT" | grep "Token expires:" | cut -d: -f2-)
    termux-vibrate -d 100
    termux-toast "Clawdbot synced! Expires:${EXPIRY}"
    ssh your-server 'systemctl --user restart clawdbot' 2>/dev/null
else
    termux-vibrate -d 300
    termux-toast "Sync failed: ${RESULT}"
fi
```

Then add a Termux:Widget to your homescreen.

## Contributors

- [@tonynolanki](https://github.com/tonynolanki) - Discovered issue and developed solution

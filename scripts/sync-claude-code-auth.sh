#!/bin/bash
# Sync Claude Code OAuth tokens to Clawdbot
# This fixes the token collision issue when both tools use the same client_id
#
# Usage:
#   ./sync-claude-code-auth.sh        # One-time sync
#   ./sync-claude-code-auth.sh --cron # For cron (silent unless error)

set -euo pipefail

CLAUDE_CREDS="$HOME/.claude/.credentials.json"
CLAWDBOT_AUTH="$HOME/.clawdbot/agent/auth-profiles.json"
CRON_MODE="${1:-}"

log() {
    if [[ "$CRON_MODE" != "--cron" ]]; then
        echo "$1"
    fi
}

error() {
    echo "ERROR: $1" >&2
    exit 1
}

# Check Claude Code credentials exist
if [[ ! -f "$CLAUDE_CREDS" ]]; then
    error "Claude Code credentials not found at $CLAUDE_CREDS"
fi

# Check if Claude Code has Anthropic OAuth
if ! jq -e '.claudeAiOauth' "$CLAUDE_CREDS" > /dev/null 2>&1; then
    error "No claudeAiOauth found in Claude Code credentials"
fi

# Extract Claude Code tokens
CC_ACCESS=$(jq -r '.claudeAiOauth.accessToken // empty' "$CLAUDE_CREDS")
CC_REFRESH=$(jq -r '.claudeAiOauth.refreshToken // empty' "$CLAUDE_CREDS")
CC_EXPIRES=$(jq -r '.claudeAiOauth.expiresAt // empty' "$CLAUDE_CREDS")

if [[ -z "$CC_ACCESS" || -z "$CC_REFRESH" || -z "$CC_EXPIRES" ]]; then
    error "Claude Code credentials incomplete"
fi

# Check if Claude Code token is still valid (with 5 min buffer)
NOW_MS=$(date +%s)000
BUFFER_MS=300000  # 5 minutes
EXPIRES_WITH_BUFFER=$((CC_EXPIRES - BUFFER_MS))

if [[ "$NOW_MS" -gt "$EXPIRES_WITH_BUFFER" ]]; then
    log "WARNING: Claude Code token expires soon or already expired"
    log "  Expires: $(date -d @$((CC_EXPIRES / 1000)))"
    log "  You may need to use Claude Code first to refresh its token"
fi

# Get current clawdbot tokens for comparison
if [[ -f "$CLAWDBOT_AUTH" ]]; then
    CB_REFRESH=$(jq -r '.profiles["anthropic:default"].refresh // empty' "$CLAWDBOT_AUTH" 2>/dev/null || echo "")
else
    CB_REFRESH=""
fi

# Check if sync is needed
if [[ "$CC_REFRESH" == "$CB_REFRESH" ]]; then
    log "Tokens already in sync - no update needed"
    exit 0
fi

# Backup current clawdbot auth
if [[ -f "$CLAWDBOT_AUTH" ]]; then
    cp "$CLAWDBOT_AUTH" "${CLAWDBOT_AUTH}.bak"
fi

# Ensure directory exists
mkdir -p "$(dirname "$CLAWDBOT_AUTH")"

# Update clawdbot auth-profiles.json
if [[ -f "$CLAWDBOT_AUTH" ]]; then
    # Update existing file
    jq --arg access "$CC_ACCESS" \
       --arg refresh "$CC_REFRESH" \
       --argjson expires "$CC_EXPIRES" \
       '.profiles["anthropic:default"].access = $access |
        .profiles["anthropic:default"].refresh = $refresh |
        .profiles["anthropic:default"].expires = $expires' \
       "$CLAWDBOT_AUTH" > "${CLAWDBOT_AUTH}.tmp"
    mv "${CLAWDBOT_AUTH}.tmp" "$CLAWDBOT_AUTH"
else
    # Create new file
    jq -n --arg access "$CC_ACCESS" \
          --arg refresh "$CC_REFRESH" \
          --argjson expires "$CC_EXPIRES" \
          '{
            version: 1,
            profiles: {
              "anthropic:default": {
                type: "oauth",
                provider: "anthropic",
                access: $access,
                refresh: $refresh,
                expires: $expires
              }
            }
          }' > "$CLAWDBOT_AUTH"
fi

chmod 600 "$CLAWDBOT_AUTH"

log "Synced Claude Code tokens to Clawdbot"
log "  Token expires: $(date -d @$((CC_EXPIRES / 1000)))"

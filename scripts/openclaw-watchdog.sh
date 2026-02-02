#!/usr/bin/env bash
# openclaw-watchdog.sh — Independent health monitor for the OpenClaw gateway
#
# Runs as a separate systemd service. Monitors gateway health and escalates
# through recovery steps if it's down.
#
# Escalation ladder:
#   1. Restart the gateway
#   2. Restore config from known-good backup + restart
#   3. Restore dist from fallback + restore config + restart
#   4. Stay on fallback (safest state)

set -euo pipefail

GATEWAY_URL="http://127.0.0.1:${CLAWDBOT_GATEWAY_PORT:-18789}/"
GATEWAY_SERVICE="openclaw-gateway.service"
CONFIG_FILE="$HOME/.clawdbot/clawdbot.json"
CONFIG_GOOD="$HOME/.clawdbot/clawdbot.json.known-good"
SRC_DIR="/home/dan/src/openclaw"
DIST_DIR="${SRC_DIR}/dist"
FALLBACK_DIR="${SRC_DIR}/.dist-fallback"
FALLBACK_LOCK="/tmp/openclaw-fallback-active"
STATE_FILE="/tmp/openclaw-watchdog-state"

CHECK_INTERVAL=15        # seconds between checks
FAIL_THRESHOLD=4         # consecutive failures before escalating
MAX_ESCALATION=3         # highest escalation level

log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] [watchdog] $*"; }

# Health check: process alive AND port responding
check_health() {
    # Is the service active?
    if ! systemctl --user is-active "$GATEWAY_SERVICE" &>/dev/null; then
        return 1
    fi
    # Is it responding on the port? (503 is fine — means it's alive)
    local http_code
    http_code=$(curl -s -o /dev/null -w "%{http_code}" "$GATEWAY_URL" --max-time 5 2>/dev/null || echo "000")
    if [[ "$http_code" == "000" ]]; then
        return 1
    fi
    return 0
}

# Read/write escalation state
get_state() {
    if [[ -f "$STATE_FILE" ]]; then
        cat "$STATE_FILE"
    else
        echo "0:0"  # fail_count:escalation_level
    fi
}

set_state() {
    echo "$1:$2" > "$STATE_FILE"
}

# Snapshot config as known-good (called externally after confirmed working)
snapshot_config() {
    if [[ -f "$CONFIG_FILE" ]]; then
        cp "$CONFIG_FILE" "$CONFIG_GOOD"
        log "Config snapshot saved to ${CONFIG_GOOD}"
    fi
}

# Escalation actions
escalate() {
    local level=$1

    case $level in
        1)
            log "⚡ Level 1: Restarting gateway"
            systemctl --user restart "$GATEWAY_SERVICE"
            ;;
        2)
            log "⚠️  Level 2: Restoring known-good config + restart"
            if [[ -f "$CONFIG_GOOD" ]]; then
                cp "$CONFIG_GOOD" "$CONFIG_FILE"
                log "Config restored from ${CONFIG_GOOD}"
            else
                log "No known-good config found, skipping config restore"
            fi
            systemctl --user restart "$GATEWAY_SERVICE"
            ;;
        3)
            log "🔴 Level 3: Restoring fallback dist + config + restart"
            if [[ -d "$FALLBACK_DIR" ]]; then
                rm -rf "$DIST_DIR"
                cp -r "$FALLBACK_DIR" "$DIST_DIR"
                touch "$FALLBACK_LOCK"
                log "Dist restored from fallback"
            fi
            if [[ -f "$CONFIG_GOOD" ]]; then
                cp "$CONFIG_GOOD" "$CONFIG_FILE"
                log "Config restored from ${CONFIG_GOOD}"
            fi
            systemctl --user restart "$GATEWAY_SERVICE"
            ;;
        *)
            log "❌ Max escalation reached — staying on current state"
            ;;
    esac
}

# Save initial known-good config if none exists
if [[ ! -f "$CONFIG_GOOD" ]] && [[ -f "$CONFIG_FILE" ]]; then
    snapshot_config
fi

log "Watchdog started (check every ${CHECK_INTERVAL}s, escalate after ${FAIL_THRESHOLD} failures)"

fail_count=0
escalation_level=0

while true; do
    if check_health; then
        # Healthy — reset counters
        if (( fail_count > 0 )); then
            log "✅ Gateway recovered (was at fail_count=${fail_count}, escalation=${escalation_level})"
            # Only snapshot config as known-good if it's valid JSON
            if python3 -c "import json; json.load(open('$CONFIG_FILE'))" 2>/dev/null; then
                snapshot_config
            else
                log "⚠️  Config is not valid JSON — skipping known-good snapshot"
            fi
        fi
        fail_count=0
        escalation_level=0
        set_state "$fail_count" "$escalation_level"
    else
        (( fail_count++ )) || true
        log "Gateway unhealthy (fail ${fail_count}/${FAIL_THRESHOLD})"

        if (( fail_count >= FAIL_THRESHOLD )); then
            if (( escalation_level < MAX_ESCALATION )); then
                (( escalation_level++ )) || true
                log "Escalating to level ${escalation_level}"
                escalate "$escalation_level"
                fail_count=0  # reset count, give it a chance
            fi
            set_state "$fail_count" "$escalation_level"
        fi
    fi

    sleep "$CHECK_INTERVAL"
done

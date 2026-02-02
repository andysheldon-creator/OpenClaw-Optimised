#!/usr/bin/env bash
# gateway-safe-start.sh — Start gateway from source, auto-revert on crash loops
#
# If the gateway crashes 3 times within 30 seconds, fall back to the
# last-known-good dist snapshot until manually fixed.

set -euo pipefail

SRC_DIR="/home/dan/src/openclaw"
DIST_ENTRY="${SRC_DIR}/dist/entry.js"
FALLBACK_DIR="${SRC_DIR}/.dist-fallback"
FALLBACK_ENTRY="${FALLBACK_DIR}/entry.js"
CRASH_LOG="/tmp/openclaw-crash-times"
MAX_CRASHES=3
CRASH_WINDOW=30  # seconds
LOCKFILE="/tmp/openclaw-fallback-active"
PORT="${CLAWDBOT_GATEWAY_PORT:-18789}"

log() { echo "[$(date '+%H:%M:%S')] $*" >&2; }

# Count recent crashes
count_recent_crashes() {
    if [[ ! -f "$CRASH_LOG" ]]; then
        echo 0
        return
    fi
    local cutoff=$(($(date +%s) - CRASH_WINDOW))
    local count=0
    while IFS= read -r ts; do
        if (( ts > cutoff )); then
            (( count++ ))
        fi
    done < "$CRASH_LOG"
    echo "$count"
}

record_crash() {
    echo "$(date +%s)" >> "$CRASH_LOG"
    # Keep only last 10 entries
    tail -10 "$CRASH_LOG" > "${CRASH_LOG}.tmp" && mv "${CRASH_LOG}.tmp" "$CRASH_LOG"
}

# Decide which entry point to use
pick_entry() {
    local crashes
    crashes=$(count_recent_crashes)

    if (( crashes >= MAX_CRASHES )) && [[ -f "$FALLBACK_ENTRY" ]]; then
        log "⚠️  ${crashes} crashes in ${CRASH_WINDOW}s — falling back to last-known-good dist"
        touch "$LOCKFILE"
        echo "$FALLBACK_ENTRY"
    elif [[ -f "$LOCKFILE" ]] && [[ -f "$FALLBACK_ENTRY" ]]; then
        log "⚠️  Fallback lock active — using last-known-good dist (remove ${LOCKFILE} to retry source)"
        echo "$FALLBACK_ENTRY"
    elif [[ -f "$DIST_ENTRY" ]]; then
        echo "$DIST_ENTRY"
    elif [[ -f "$FALLBACK_ENTRY" ]]; then
        log "⚠️  dist/entry.js missing — using fallback"
        echo "$FALLBACK_ENTRY"
    else
        log "❌ No entry.js found anywhere!"
        exit 1
    fi
}

entry=$(pick_entry)
log "Starting gateway from: ${entry}"

# Run it — systemd handles restarts, we just track crash timing
exec /usr/bin/node "$entry" gateway --port "$PORT"

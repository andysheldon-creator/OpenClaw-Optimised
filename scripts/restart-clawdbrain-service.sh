#!/usr/bin/env bash
# Quick restart script for OpenClaw LaunchAgent service
# Finds the service dynamically, stops/starts it, and verifies startup

set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log() { echo -e "${GREEN}==>${NC} $*"; }
warn() { echo -e "${YELLOW}Warning:${NC} $*"; }
fail() { echo -e "${RED}ERROR:${NC} $*" >&2; exit 1; }

# 1. Find the OpenClaw service label
log "Locating OpenClaw service..."
SERVICE_LABEL=$(launchctl print gui/"$UID" | grep -i openclaw | awk '{print $NF}' | head -n1 || true)

if [[ -z "$SERVICE_LABEL" ]]; then
    fail "No OpenClaw service found in launchctl. Is it running?"
fi

log "Found service: ${BLUE}${SERVICE_LABEL}${NC}"

# 2. Stop the service
log "Stopping service..."
if launchctl bootout gui/"$UID"/"$SERVICE_LABEL" 2>/dev/null; then
    log "Service stopped successfully"
else
    warn "Service may not have been running or already stopped"
fi

# Give it a moment to fully stop
sleep 1

# 3. Start the service
log "Starting service..."
PLIST_PATH="${HOME}/Library/LaunchAgents/${SERVICE_LABEL}.plist"

if [[ ! -f "$PLIST_PATH" ]]; then
    fail "LaunchAgent plist not found at: $PLIST_PATH"
fi

if launchctl bootstrap gui/"$UID" "$PLIST_PATH" 2>/dev/null; then
    log "Service started successfully"
else
    # If bootstrap fails, try kickstart instead (for already loaded services)
    if launchctl kickstart -k gui/"$UID"/"$SERVICE_LABEL" 2>/dev/null; then
        log "Service restarted via kickstart"
    else
        fail "Failed to start service"
    fi
fi

# 4. Verify it's running by checking logs for 30 seconds
log "Verifying service startup (timeout: 30s)..."
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LOG_SCRIPT="${SCRIPT_DIR}/clawlog.sh"

if [[ ! -f "$LOG_SCRIPT" ]]; then
    warn "clawlog.sh not found at $LOG_SCRIPT, skipping log verification"
    exit 0
fi

# Start tailing logs in the background
TEMP_LOG=$(mktemp)
timeout 30s bash -c "
    '$LOG_SCRIPT' -f 2>&1 | tee '$TEMP_LOG' | grep -m 1 -i 'started\|running\|ready\|listening' || true
" && SUCCESS=true || SUCCESS=false

if [[ "$SUCCESS" == "true" ]]; then
    log "${GREEN}✓${NC} Service verified - startup message detected in logs"
else
    # Check if process is at least running
    sleep 2
    if launchctl print gui/"$UID"/"$SERVICE_LABEL" >/dev/null 2>&1; then
        log "${GREEN}✓${NC} Service is running (no startup message detected within 30s)"
    else
        fail "Service does not appear to be running after 30s"
    fi
fi

# Show last few log lines
log "Recent log output:"
echo -e "${BLUE}────────────────────────────────────────${NC}"
tail -n 10 "$TEMP_LOG" 2>/dev/null || echo "(no logs captured)"
echo -e "${BLUE}────────────────────────────────────────${NC}"

rm -f "$TEMP_LOG"

log "${GREEN}✓ Restart complete${NC}"

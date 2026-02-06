#!/bin/bash
set -e

echo "→ Changing to ~/clawd directory..."
cd ~/clawd/clawdbot

echo "→ Installing dependencies..."
pnpm install

echo "→ Building project..."
pnpm build

echo "→ Building UI..."
pnpm ui:build

GATEWAY_PORT="${OPENCLAW_GATEWAY_PORT:-18789}"

echo "→ Stopping openclaw gateway processes..."
if pkill -f "openclaw"; then
    echo "  ✓ Sent SIGTERM to openclaw processes"
    echo "  → Polling gateway on port $GATEWAY_PORT until it stops responding..."
    MAX_WAIT=30
    ELAPSED=0
    while [ "$ELAPSED" -lt "$MAX_WAIT" ]; do
        HTTP_CODE=$(curl -s -o /dev/null -w '%{http_code}' "http://localhost:$GATEWAY_PORT/health" 2>/dev/null || echo "000")
        if [ "$HTTP_CODE" != "200" ]; then
            echo "  ✓ Gateway stopped responding (HTTP $HTTP_CODE) after ${ELAPSED}s"
            break
        fi
        sleep 1
        ELAPSED=$((ELAPSED + 1))
    done
    if [ "$ELAPSED" -ge "$MAX_WAIT" ]; then
        echo "  ⚠ Gateway still responding after ${MAX_WAIT}s"
    fi
    # Force kill any remaining processes just in case
    pkill -9 -f "openclaw" 2>/dev/null && echo "  ✓ Force-killed remaining openclaw processes" || true
    sleep 1
else
    echo "  ℹ No openclaw processes were running"
fi

echo "→ Starting openclaw gateway (detached)..."
# Use caffeinate to prevent sleep if CAFFEINATE=1 is set
if [ "${CAFFEINATE:-0}" = "1" ]; then
    echo "  ☕ Running with caffeinate (preventing system sleep)"
    nohup caffeinate -ism pnpm openclaw gateway > /tmp/openclaw-gateway.log 2>&1 &
else
    nohup pnpm openclaw gateway > /tmp/openclaw-gateway.log 2>&1 &
fi
GATEWAY_PID=$!

echo "  ✓ Gateway started with PID: $GATEWAY_PID"
echo "  ✓ Logs: /tmp/openclaw-gateway.log"
echo ""
echo "To check status:"
echo "  ps aux | grep '[o]penclaw'"
echo "  tail -f /tmp/openclaw-gateway.log"
echo ""
echo "To run with caffeinate (prevent sleep):"
echo "  CAFFEINATE=1 ./restart-openclaw.sh"

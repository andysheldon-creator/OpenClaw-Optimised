#!/bin/sh
set -e

# OpenClaw Gateway Docker Entrypoint
# Handles first-run initialization and idempotent config setup.
#
# Config is stored in $OPENCLAW_STATE_DIR (default: /home/node/.openclaw).
# On first run, a seed config is written. On subsequent runs, only
# environment-driven values are patched (token, proxies, etc.) so
# operator edits to other keys are preserved.

STATE_DIR="${OPENCLAW_STATE_DIR:-/home/node/.openclaw}"
CONFIG_FILE="$STATE_DIR/openclaw.json"
INIT_MARKER="$STATE_DIR/.docker-init-done"
CLI="node dist/index.js"

GATEWAY_PORT="${OPENCLAW_GATEWAY_PORT:-18789}"
GATEWAY_TOKEN="${OPENCLAW_GATEWAY_TOKEN:-dev-local-token}"
TRUSTED_PROXIES="${OPENCLAW_TRUSTED_PROXIES:-172.28.0.10}"

log() { echo "[entrypoint] $*"; }

# Helper: build a JSON array from a comma-separated string
csv_to_json_array() {
  echo "$1" | awk -F',' '{
    printf "["
    for (i=1; i<=NF; i++) {
      gsub(/^[ \t]+|[ \t]+$/, "", $i)
      if (i > 1) printf ","
      printf "\"%s\"", $i
    }
    printf "]"
  }'
}

# ── First-run seed ─────────────────────────────────────────────────
if [ ! -f "$INIT_MARKER" ]; then
  log "First run detected — seeding gateway config..."
  mkdir -p "$STATE_DIR"

  # Gateway networking
  $CLI config set gateway.mode        local
  $CLI config set gateway.bind        lan
  $CLI config set gateway.auth.mode   token
  $CLI config set gateway.auth.token  "$GATEWAY_TOKEN"
  $CLI config set gateway.controlUi.allowInsecureAuth true
  $CLI config set gateway.trustedProxies "$(csv_to_json_array "$TRUSTED_PROXIES")"

  # Control UI served at /chat behind nginx
  $CLI config set gateway.controlUi.basePath /chat

  touch "$INIT_MARKER"
  log "Init complete — config written to $CONFIG_FILE"
else
  log "Config already initialized (marker: $INIT_MARKER)"

  # Patch env-driven values that may change between runs
  $CLI config set gateway.auth.token "$GATEWAY_TOKEN"
  $CLI config set gateway.trustedProxies "$(csv_to_json_array "$TRUSTED_PROXIES")"

  log "Patched token + trustedProxies from env"
fi

# ── Start gateway ──────────────────────────────────────────────────
log "Starting gateway on port $GATEWAY_PORT..."
exec $CLI gateway --port "$GATEWAY_PORT"

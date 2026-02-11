#!/bin/sh
# Render / cloud startup script - creates config and starts gateway.
# Supports OPENCLAW_* env vars (Render and other providers); falls back to CLAWDBOT_* for backward compat.
# Don't use set -e initially - we'll enable it after setup

echo "=== OpenClaw startup script ==="
echo "HOME=${HOME:-not set}"
echo "User: $(whoami 2>/dev/null || echo unknown)"
echo "UID: $(id -u 2>/dev/null || echo unknown)"
echo "PWD: $(pwd)"

# Set HOME if not set (node user's home is /home/node)
if [ -z "${HOME}" ]; then
  if [ -d "/home/node" ]; then
    export HOME="/home/node"
  else
    export HOME="/tmp"
  fi
  echo "Set HOME to: ${HOME}"
fi

# Prefer OPENCLAW_* then CLAWDBOT_* (so Render and all providers work)
STATE_DIR="${OPENCLAW_STATE_DIR:-${CLAWDBOT_STATE_DIR}}"
WORKSPACE_DIR="${OPENCLAW_WORKSPACE_DIR:-${CLAWDBOT_WORKSPACE_DIR}}"
GATEWAY_TOKEN="${OPENCLAW_GATEWAY_TOKEN:-${CLAWDBOT_GATEWAY_TOKEN}}"
CONFIG_PATH="${OPENCLAW_CONFIG_PATH:-${CLAWDBOT_CONFIG_PATH}}"

# Default state dir: .openclaw (project default) or .clawdbot (legacy)
CONFIG_DIR="${STATE_DIR:-${HOME}/.openclaw}"
CONFIG_FILE="${CONFIG_PATH:-${CONFIG_DIR}/openclaw.json}"
# Legacy: if only CLAWDBOT_* was used, config file might be clawdbot.json
if [ -z "${STATE_DIR}" ] && [ -z "${OPENCLAW_STATE_DIR}" ] && [ -n "${CLAWDBOT_STATE_DIR}" ]; then
  CONFIG_DIR="${CLAWDBOT_STATE_DIR}"
  CONFIG_FILE="${CONFIG_FILE:-${CONFIG_DIR}/clawdbot.json}"
fi

if [ -n "${STATE_DIR}" ]; then
  set +e
  mkdir -p "${STATE_DIR}" 2>/dev/null
  touch "${STATE_DIR}/.test" 2>/dev/null
  if [ $? -eq 0 ]; then
    rm -f "${STATE_DIR}/.test" 2>/dev/null
    CONFIG_DIR="${STATE_DIR}"
    CONFIG_FILE="${CONFIG_PATH:-${CONFIG_DIR}/openclaw.json}"
    echo "Using STATE_DIR: ${CONFIG_DIR}"
  else
    echo "Warning: ${STATE_DIR} not writable, using ${CONFIG_DIR}"
  fi
  set -e
fi

echo "Config dir: ${CONFIG_DIR}"
echo "Config file: ${CONFIG_FILE}"

# Create config directory
if ! mkdir -p "${CONFIG_DIR}" 2>/dev/null; then
  echo "ERROR: Failed to create config directory: ${CONFIG_DIR}"
  exit 1
fi

# Write config file
if ! cat > "${CONFIG_FILE}" << 'EOF'
{
  "gateway": {
    "mode": "local",
    "trustedProxies": ["10.0.0.0/8", "172.16.0.0/12", "192.168.0.0/16"],
    "controlUi": {
      "allowInsecureAuth": true
    }
  }
}
EOF
then
  echo "ERROR: Failed to write config file: ${CONFIG_FILE}"
  exit 1
fi

echo "=== Config written to ${CONFIG_FILE} ==="
cat "${CONFIG_FILE}" || echo "Warning: Could not read config file"

if [ ! -f "${CONFIG_FILE}" ]; then
  echo "ERROR: Config file does not exist: ${CONFIG_FILE}"
  exit 1
fi

# Export for gateway (both OPENCLAW_* and CLAWDBOT_* so CLI works)
export OPENCLAW_STATE_DIR="${CONFIG_DIR}"
export OPENCLAW_CONFIG_PATH="${CONFIG_FILE}"
export CLAWDBOT_STATE_DIR="${CONFIG_DIR}"
export CLAWDBOT_CONFIG_PATH="${CONFIG_FILE}"
export CLAWDBOT_CONFIG_CACHE_MS=0
if [ -n "${WORKSPACE_DIR}" ]; then
  export OPENCLAW_WORKSPACE_DIR="${WORKSPACE_DIR}"
  export CLAWDBOT_WORKSPACE_DIR="${WORKSPACE_DIR}"
fi

echo "=== Starting gateway ==="

# Verify node is available
if ! command -v node >/dev/null 2>&1; then
  echo "ERROR: node command not found"
  echo "PATH: ${PATH}"
  exit 1
fi

echo "Node version: $(node --version)"

# Verify dist/index.js exists (we're in /app when run from Docker)
if [ ! -f "dist/index.js" ]; then
  echo "ERROR: dist/index.js not found"
  echo "Contents of /app:"
  ls -la /app 2>/dev/null || true
  ls -la . 2>/dev/null || true
  exit 1
fi

echo "Found dist/index.js"

if [ -z "${GATEWAY_TOKEN}" ]; then
  echo "ERROR: OPENCLAW_GATEWAY_TOKEN (or CLAWDBOT_GATEWAY_TOKEN) is not set"
  exit 1
fi

echo "Token is set (length: ${#GATEWAY_TOKEN})"

# PORT from env (Render sets PORT=8080)
PORT="${PORT:-8080}"
echo "Gateway port: ${PORT}"

set -e

echo "Executing: node dist/index.js gateway --port ${PORT} --bind lan --auth token --allow-unconfigured"
exec node dist/index.js gateway \
  --port "${PORT}" \
  --bind lan \
  --auth token \
  --token "${GATEWAY_TOKEN}" \
  --allow-unconfigured

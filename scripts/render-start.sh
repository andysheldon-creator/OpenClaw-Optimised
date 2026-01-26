#!/bin/sh
# Render startup script - creates config and starts gateway
# Note: We use set -e but handle permission errors gracefully
set -e

echo "=== Render startup script ==="
echo "CLAWDBOT_STATE_DIR=${CLAWDBOT_STATE_DIR}"
echo "HOME=${HOME}"

# Determine config directory
# Prefer CLAWDBOT_STATE_DIR if set and writable, otherwise use $HOME/.clawdbot
if [ -n "${CLAWDBOT_STATE_DIR}" ]; then
  # Try to use the explicitly set directory
  if mkdir -p "${CLAWDBOT_STATE_DIR}" 2>/dev/null && [ -w "${CLAWDBOT_STATE_DIR}" ]; then
    CONFIG_DIR="${CLAWDBOT_STATE_DIR}"
  else
    echo "Warning: ${CLAWDBOT_STATE_DIR} is not writable, using ${HOME}/.clawdbot instead"
    CONFIG_DIR="${HOME}/.clawdbot"
  fi
else
  # Default: try /data/.clawdbot, fall back to $HOME/.clawdbot
  if mkdir -p "/data/.clawdbot" 2>/dev/null && [ -w "/data/.clawdbot" ]; then
    CONFIG_DIR="/data/.clawdbot"
  else
    CONFIG_DIR="${HOME}/.clawdbot"
  fi
fi

CONFIG_FILE="${CONFIG_DIR}/clawdbot.json"
HOME_CONFIG_DIR="${HOME}/.clawdbot"
HOME_CONFIG_FILE="${HOME_CONFIG_DIR}/clawdbot.json"

echo "Config dir: ${CONFIG_DIR}"
echo "Config file: ${CONFIG_FILE}"
echo "Home config dir: ${HOME_CONFIG_DIR}"
echo "Home config file: ${HOME_CONFIG_FILE}"

# Create config directory (should succeed now)
mkdir -p "${CONFIG_DIR}"

# Config content
CONFIG_CONTENT='{
  "gateway": {
    "mode": "local",
    "trustedProxies": ["10.0.0.0/8", "172.16.0.0/12", "192.168.0.0/16"],
    "controlUi": {
      "allowInsecureAuth": true
    }
  }
}'

# Write config file
echo "${CONFIG_CONTENT}" > "${CONFIG_FILE}"

echo "=== Config written to BOTH locations ==="
echo "=== ${CONFIG_FILE}: ==="
cat "${CONFIG_FILE}"
echo "=== ${HOME_CONFIG_FILE}: ==="
cat "${HOME_CONFIG_FILE}"
echo "=== End config ==="

# Verify files exist
echo "=== Listing ${CONFIG_DIR}/ ==="
ls -la "${CONFIG_DIR}/"
echo "=== Listing ${HOME_CONFIG_DIR}/ ==="
ls -la "${HOME_CONFIG_DIR}/"

# Start the gateway with token from env var
# Explicitly set CLAWDBOT_CONFIG_PATH to ensure config is loaded from the file we wrote
# Also update CLAWDBOT_STATE_DIR to match the directory we're actually using
# Disable config cache to ensure fresh reads
echo "=== Starting gateway ==="
echo "=== Using config dir: ${CONFIG_DIR} ==="
echo "=== Setting CLAWDBOT_STATE_DIR=${CONFIG_DIR} ==="
echo "=== Setting CLAWDBOT_CONFIG_PATH=${CONFIG_FILE} ==="
echo "=== Disabling config cache ==="
export CLAWDBOT_STATE_DIR="${CONFIG_DIR}"
export CLAWDBOT_CONFIG_PATH="${CONFIG_FILE}"
export CLAWDBOT_CONFIG_CACHE_MS=0

# Verify config can be read
echo "=== Verifying config can be read ==="
node -e "
const fs = require('fs');
const path = '${CONFIG_FILE}';
if (fs.existsSync(path)) {
  const content = fs.readFileSync(path, 'utf-8');
  const parsed = JSON.parse(content);
  console.log('Config loaded successfully:');
  console.log('trustedProxies:', JSON.stringify(parsed.gateway?.trustedProxies));
} else {
  console.error('Config file not found:', path);
  process.exit(1);
}
"

exec node dist/index.js gateway \
  --port 8080 \
  --bind lan \
  --auth token \
  --token "$CLAWDBOT_GATEWAY_TOKEN" \
  --allow-unconfigured

#!/usr/bin/env bash
set -e

# OpenClaw Coolify Bootstrap Script
# Handles token generation, config creation, and startup

OPENCLAW_STATE="/root/.openclaw"
CONFIG_FILE="$OPENCLAW_STATE/openclaw.json"
WORKSPACE_DIR="/root/openclaw-workspace"
TOKEN_FILE="$OPENCLAW_STATE/.gateway_token"

# Validate bind value (must be: loopback, lan, tailnet, auto, or custom)
case "${OPENCLAW_GATEWAY_BIND:-}" in
  loopback|lan|tailnet|auto|custom)
    ;;
  *)
    export OPENCLAW_GATEWAY_BIND="lan"
    ;;
esac

# Create directories
mkdir -p "$OPENCLAW_STATE" "$WORKSPACE_DIR"
chmod 700 "$OPENCLAW_STATE"

# Create CLI symlinks
if [ ! -f /usr/local/bin/openclaw ]; then
  ln -sf /app/dist/index.js /usr/local/bin/openclaw
  chmod +x /usr/local/bin/openclaw
fi

# Create openclaw-approve helper
if [ ! -f /usr/local/bin/openclaw-approve ]; then
  cat > /usr/local/bin/openclaw-approve <<'HELPER'
#!/bin/bash
echo "Approving all pending device requests..."
openclaw devices list --json 2>/dev/null | node -e "
const data = require('fs').readFileSync(0, 'utf8');
const devices = JSON.parse(data || '[]');
const pending = devices.filter(d => d.status === 'pending');
if (pending.length === 0) {
  console.log('No pending requests.');
  process.exit(0);
}
pending.forEach(d => {
  console.log('Approving:', d.id);
  require('child_process').execSync('openclaw devices approve ' + d.id);
});
console.log('Approved', pending.length, 'device(s)');
" 2>/dev/null || echo "No pending devices or command failed"
HELPER
  chmod +x /usr/local/bin/openclaw-approve
fi

# ----------------------------
# Gateway Token Persistence
# ----------------------------
if [ -z "$OPENCLAW_GATEWAY_TOKEN" ]; then
  if [ -f "$TOKEN_FILE" ]; then
    OPENCLAW_GATEWAY_TOKEN=$(cat "$TOKEN_FILE")
    echo "[openclaw] Loaded existing gateway token"
  else
    OPENCLAW_GATEWAY_TOKEN=$(openssl rand -hex 32 2>/dev/null || head -c 64 /dev/urandom | xxd -p | tr -d '\n')
    echo "$OPENCLAW_GATEWAY_TOKEN" > "$TOKEN_FILE"
    chmod 600 "$TOKEN_FILE"
    echo "[openclaw] Generated new gateway token: $OPENCLAW_GATEWAY_TOKEN"
  fi
fi

export OPENCLAW_GATEWAY_TOKEN

# ----------------------------
# Generate Config (only if not exists - preserves token)
# ----------------------------
if [ ! -f "$CONFIG_FILE" ]; then
  echo "[openclaw] Generating openclaw.json..."
  
  node -e "
const fs = require('fs');
const config = {
  env: { ZAI_API_KEY: process.env.ZAI_API_KEY || '' },
  gateway: {
    mode: 'local',
    port: parseInt(process.env.OPENCLAW_GATEWAY_PORT) || 28471,
    bind: 'lan',
    controlUi: { enabled: true, allowInsecureAuth: false },
    trustedProxies: ['*'],
    auth: { mode: 'token', token: process.env.OPENCLAW_GATEWAY_TOKEN }
  },
  models: {
    providers: {
      zai: {
        baseUrl: 'https://api.z.ai/api/coding/paas/v4',
        api: 'openai-completions',
        auth: 'api-key',
        authHeader: true,
        models: [{ id: 'glm-4.7', name: 'GLM-4.7' }]
      }
    }
  },
  agents: {
    defaults: {
      model: { primary: 'zai/glm-4.7' },
      workspace: '/root/openclaw-workspace'
    }
  }
};
fs.writeFileSync('$CONFIG_FILE', JSON.stringify(config, null, 2) + '\n');
fs.chmodSync('$CONFIG_FILE', 0o600);
console.log('[openclaw] Config ready at $CONFIG_FILE');
"
else
  echo "[openclaw] Using existing config at $CONFIG_FILE"
fi

# Extract token from config for display
SAVED_TOKEN=$(grep -o '"token": "[^"]*"' "$CONFIG_FILE" | cut -d'"' -f4)
if [ -n "$SAVED_TOKEN" ]; then
  TOKEN="$SAVED_TOKEN"
else
  TOKEN="$OPENCLAW_GATEWAY_TOKEN"
fi

# ----------------------------
# Banner & Access Info
# ----------------------------
echo ""
echo "=================================================================="
echo "🦞 OpenClaw is ready!"
echo "=================================================================="
echo ""
echo "🔑 Access Token: $TOKEN"
echo ""
echo "🌍 Local URL: http://localhost:${OPENCLAW_GATEWAY_PORT:-28471}?token=$TOKEN"
if [ -n "$SERVICE_FQDN_OPENCLAW" ]; then
  echo "☁️  Public URL: https://${SERVICE_FQDN_OPENCLAW}?token=$TOKEN"
fi
echo ""
echo "👉 To approve devices, run: openclaw-approve"
echo "👉 To configure: openclaw onboard"
echo ""
echo "=================================================================="

# ----------------------------
# Run OpenClaw Gateway
# ----------------------------
ulimit -n 65535
exec node dist/index.js gateway

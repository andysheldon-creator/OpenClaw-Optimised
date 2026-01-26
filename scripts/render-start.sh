#!/bin/sh
# Render startup script - creates config and starts gateway
set -e

# Create config directory
mkdir -p "$CLAWDBOT_STATE_DIR"

# Write config file with Render-specific settings
cat > "$CLAWDBOT_STATE_DIR/clawdbot.json" << 'EOF'
{
  "gateway": {
    "trustedProxies": ["10.0.0.0/8", "172.16.0.0/12", "192.168.0.0/16"],
    "controlUi": {
      "allowInsecureAuth": true
    }
  }
}
EOF

echo "Config written to $CLAWDBOT_STATE_DIR/clawdbot.json"

# Start the gateway with password from env var
exec node dist/index.js gateway \
  --port 8080 \
  --bind lan \
  --auth password \
  --password "$CLAWDBOT_GATEWAY_PASSWORD" \
  --allow-unconfigured

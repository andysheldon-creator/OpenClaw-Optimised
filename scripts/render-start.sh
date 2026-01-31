#!/bin/bash
set -e

CONFIG_DIR="${OPENCLAW_STATE_DIR:-/data/.openclaw}"
CONFIG_FILE="$CONFIG_DIR/openclaw.json"

# Create config directory
mkdir -p "$CONFIG_DIR"

# Create minimal config if it doesn't exist
if [ ! -f "$CONFIG_FILE" ]; then
  echo "Creating initial config..."
  cat > "$CONFIG_FILE" << EOF
{
  "gateway": {
    "controlUi": {
      "dangerouslyDisableDeviceAuth": true
    }
  },
  "auth": {
    "profiles": {
      "anthropic:default": {
        "provider": "anthropic",
        "mode": "token"
      },
      "openai:default": {
        "provider": "openai",
        "mode": "token"
      }
    }
  },
  "agents": {
    "defaults": {
      "model": {
        "primary": "anthropic/claude-sonnet-4-5",
        "fallbacks": ["openai/gpt-4.1"]
      },
      "workspace": "/data/workspace"
    }
  }
}
EOF
  echo "Config created at $CONFIG_FILE"
fi

# Create workspace directory
mkdir -p "${OPENCLAW_WORKSPACE_DIR:-/data/workspace}"

# Start the gateway
exec node --max-old-space-size=768 dist/index.js gateway --port "${PORT:-8080}" --bind lan --allow-unconfigured

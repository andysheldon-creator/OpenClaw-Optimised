#!/usr/bin/env bash
set -euo pipefail

# SHARPS EDGE Builder Edition - Mac Mini Setup
# Installs OpenClaw + workspace + config for autonomous building

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OPENCLAW_DIR="$HOME/.openclaw"
WORKSPACE_DIR="$OPENCLAW_DIR/workspace"

echo "=== SHARPS EDGE Builder Edition Setup ==="
echo ""

# --- Pre-flight checks ---

if ! command -v node &>/dev/null; then
  echo "ERROR: Node.js not found. Install with: brew install node"
  exit 1
fi

NODE_VERSION=$(node -v | sed 's/v//' | cut -d. -f1)
if [ "$NODE_VERSION" -lt 22 ]; then
  echo "ERROR: Node.js 22+ required (found v$(node -v))"
  exit 1
fi

if [ -z "${OPENROUTER_API_KEY:-}" ]; then
  echo "WARNING: OPENROUTER_API_KEY not set."
  echo "  Get a free key at https://openrouter.ai"
  echo "  Then: export OPENROUTER_API_KEY='sk-or-...'"
  echo ""
  read -rp "Continue without OpenRouter key? [y/N] " answer
  if [[ "$answer" != "y" && "$answer" != "Y" ]]; then
    exit 1
  fi
fi

echo "Node.js: $(node -v)"
echo "OpenRouter: ${OPENROUTER_API_KEY:+configured}"
echo ""

# --- Install OpenClaw ---

echo "--- Installing OpenClaw ---"
if command -v openclaw &>/dev/null; then
  echo "OpenClaw already installed: $(openclaw --version 2>/dev/null || echo 'unknown')"
  read -rp "Reinstall/update? [y/N] " answer
  if [[ "$answer" == "y" || "$answer" == "Y" ]]; then
    npm install -g openclaw@latest
  fi
else
  npm install -g openclaw@latest
fi

# --- Install Wrangler (Cloudflare CLI) ---

echo ""
echo "--- Installing Wrangler (Cloudflare Workers CLI) ---"
if command -v wrangler &>/dev/null; then
  echo "Wrangler already installed: $(wrangler --version 2>/dev/null || echo 'unknown')"
else
  npm install -g wrangler
fi

# --- Set up workspace ---

echo ""
echo "--- Setting up workspace ---"
mkdir -p "$OPENCLAW_DIR"

if [ -d "$WORKSPACE_DIR" ]; then
  echo "Workspace already exists at $WORKSPACE_DIR"
  read -rp "Overwrite workspace files? [y/N] " answer
  if [[ "$answer" != "y" && "$answer" != "Y" ]]; then
    echo "Skipping workspace setup."
  else
    cp_workspace=true
  fi
else
  cp_workspace=true
fi

if [ "${cp_workspace:-false}" = true ]; then
  # Copy workspace from repo
  REPO_WORKSPACE="$SCRIPT_DIR/../../workspace"
  if [ -d "$REPO_WORKSPACE" ]; then
    echo "Copying workspace from repo..."
    cp -R "$REPO_WORKSPACE/" "$WORKSPACE_DIR/"
    echo "Workspace installed to $WORKSPACE_DIR"
  else
    echo "ERROR: Workspace directory not found at $REPO_WORKSPACE"
    echo "  Clone the full repo first: git clone https://github.com/Rylee-ai/openclaw"
    exit 1
  fi
fi

# --- Copy config ---

echo ""
echo "--- Configuring OpenClaw ---"
CONFIG_FILE="$OPENCLAW_DIR/openclaw.json"
if [ -f "$CONFIG_FILE" ]; then
  echo "Config already exists at $CONFIG_FILE"
  read -rp "Overwrite config? [y/N] " answer
  if [[ "$answer" == "y" || "$answer" == "Y" ]]; then
    cp "$SCRIPT_DIR/openclaw.json" "$CONFIG_FILE"
    echo "Config updated."
  fi
else
  cp "$SCRIPT_DIR/openclaw.json" "$CONFIG_FILE"
  echo "Config installed to $CONFIG_FILE"
fi

# --- Create log directories ---

echo ""
echo "--- Creating log directories ---"
mkdir -p "$WORKSPACE_DIR/logs/conflicts"
mkdir -p "$WORKSPACE_DIR/logs/errors"
mkdir -p "$WORKSPACE_DIR/logs/decisions"
mkdir -p "$WORKSPACE_DIR/logs/alerts"
mkdir -p "$WORKSPACE_DIR/memory"

# --- Summary ---

echo ""
echo "=== Setup Complete ==="
echo ""
echo "Installed:"
echo "  OpenClaw: $(openclaw --version 2>/dev/null || echo 'installed')"
echo "  Wrangler: $(wrangler --version 2>/dev/null || echo 'installed')"
echo "  Workspace: $WORKSPACE_DIR"
echo "  Config: $CONFIG_FILE"
echo ""
echo "Next steps:"
echo "  1. Run: openclaw onboard --install-daemon"
echo "  2. Scan WhatsApp QR code when prompted"
echo "  3. Send the bootstrap message from FIRST_MESSAGE.md to Danno via WhatsApp"
echo ""
echo "Architecture:"
echo "  Thinking: OpenRouter free models (DeepSeek R1, Llama 3.3 70B) = \$0"
echo "  Building: Claude Code CLI = \$200/mo"
echo "  Hosting:  Cloudflare Workers = \$0 (free tier)"
echo "  Data:     The Odds API = \$0 (500 req/mo free)"
echo ""

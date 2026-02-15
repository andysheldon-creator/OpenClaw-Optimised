#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────────────────────────
# OpenClaw-Optimised — One-Line Installer
#
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/andysheldon-creator/OpenClaw-Optimised/feature/devsecops-framework/install.sh | bash
#
# Or locally:
#   ./install.sh
#
# Supports: Ubuntu, Debian, Linux Mint, Pop!_OS, elementary OS
# Requires: bash, curl or wget, sudo
# ──────────────────────────────────────────────────────────────────────────────
set -euo pipefail

# ── Colours ───────────────────────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m' # No Colour

INSTALL_DIR="${OPENCLAW_INSTALL_DIR:-$HOME/OpenClaw-Optimised}"
REPO_URL="https://github.com/andysheldon-creator/OpenClaw-Optimised.git"
BRANCH="feature/devsecops-framework"
MIN_NODE_MAJOR=22

# ── Helpers ───────────────────────────────────────────────────────────────────

info()  { echo -e "${CYAN}[info]${NC}  $*"; }
ok()    { echo -e "${GREEN}[ok]${NC}    $*"; }
warn()  { echo -e "${YELLOW}[warn]${NC}  $*"; }
fail()  { echo -e "${RED}[fail]${NC}  $*"; exit 1; }

command_exists() { command -v "$1" >/dev/null 2>&1; }

# ── Banner ────────────────────────────────────────────────────────────────────

echo ""
echo -e "${BOLD}${CYAN}"
cat << 'BANNER'
   ___                    ____ _
  / _ \ _ __   ___ _ __  / ___| | __ ___      __
 | | | | '_ \ / _ \ '_ \| |   | |/ _` \ \ /\ / /
 | |_| | |_) |  __/ | | | |___| | (_| |\ V  V /
  \___/| .__/ \___|_| |_|\____|_|\__,_| \_/\_/
       |_|          Optimised Edition
BANNER
echo -e "${NC}"
echo -e "${BOLD}One-line installer for Linux (Mint/Ubuntu/Debian)${NC}"
echo ""

# ── Step 1: Detect OS ────────────────────────────────────────────────────────

info "Detecting operating system..."

if [ -f /etc/os-release ]; then
  . /etc/os-release
  OS_NAME="${NAME:-unknown}"
  OS_ID="${ID:-unknown}"
  OS_VERSION="${VERSION_ID:-unknown}"
  ok "Detected: $OS_NAME $OS_VERSION ($OS_ID)"
else
  fail "Cannot detect OS. This installer supports Debian-based Linux (Mint, Ubuntu, Debian)."
fi

case "$OS_ID" in
  linuxmint|ubuntu|debian|pop|elementary|neon|zorin)
    ok "Supported Debian-based distribution"
    ;;
  *)
    warn "Untested distribution: $OS_ID. Proceeding anyway (Debian-based commands assumed)."
    ;;
esac

# ── Step 2: Install system dependencies ──────────────────────────────────────

info "Checking system dependencies..."

NEED_APT=()
command_exists git  || NEED_APT+=(git)
command_exists curl || NEED_APT+=(curl)

if [ ${#NEED_APT[@]} -gt 0 ]; then
  info "Installing: ${NEED_APT[*]}"
  sudo apt-get update -qq
  sudo apt-get install -y -qq "${NEED_APT[@]}"
  ok "System dependencies installed"
else
  ok "git and curl present"
fi

# ── Step 3: Install Node.js >= 22 ────────────────────────────────────────────

install_node() {
  info "Installing Node.js $MIN_NODE_MAJOR via NodeSource..."
  curl -fsSL "https://deb.nodesource.com/setup_${MIN_NODE_MAJOR}.x" | sudo -E bash -
  sudo apt-get install -y -qq nodejs
  ok "Node.js $(node --version) installed"
}

if command_exists node; then
  NODE_VERSION=$(node --version | sed 's/v//' | cut -d. -f1)
  if [ "$NODE_VERSION" -ge "$MIN_NODE_MAJOR" ]; then
    ok "Node.js v$(node --version | sed 's/v//') (>= $MIN_NODE_MAJOR)"
  else
    warn "Node.js v$(node --version | sed 's/v//') is too old (need >= $MIN_NODE_MAJOR)"
    install_node
  fi
else
  install_node
fi

# ── Step 4: Install pnpm via corepack ────────────────────────────────────────

if command_exists pnpm; then
  ok "pnpm $(pnpm --version) present"
else
  info "Enabling pnpm via corepack..."
  # corepack may need sudo if node was installed globally
  if command_exists corepack; then
    sudo corepack enable || corepack enable
  else
    sudo npm install -g corepack
    sudo corepack enable || corepack enable
  fi
  ok "pnpm enabled via corepack"
fi

# ── Step 5: Clone or update repository ───────────────────────────────────────

if [ -d "$INSTALL_DIR/.git" ]; then
  info "Repository exists at $INSTALL_DIR — pulling latest..."
  cd "$INSTALL_DIR"
  git fetch origin
  git checkout "$BRANCH"
  git pull origin "$BRANCH"
  ok "Updated to latest"
else
  info "Cloning repository to $INSTALL_DIR..."
  git clone --branch "$BRANCH" "$REPO_URL" "$INSTALL_DIR"
  cd "$INSTALL_DIR"
  ok "Cloned to $INSTALL_DIR"
fi

# ── Step 6: Install dependencies ─────────────────────────────────────────────

info "Installing Node.js dependencies (this may take a minute)..."
pnpm install --frozen-lockfile 2>/dev/null || pnpm install
ok "Dependencies installed"

# ── Step 7: Build ────────────────────────────────────────────────────────────

info "Building TypeScript..."
pnpm build
ok "Build complete"

info "Building Control UI..."
pnpm ui:install
pnpm ui:build
ok "Control UI built"

# ── Step 8: Verify ───────────────────────────────────────────────────────────

info "Verifying installation..."
node dist/index.js --version 2>/dev/null && ok "CLI works" || warn "CLI version check returned non-zero (may still work)"

# ── Step 9: Run configure wizard ─────────────────────────────────────────────

echo ""
echo -e "${BOLD}${GREEN}Installation complete!${NC}"
echo ""
echo -e "The ${BOLD}configure wizard${NC} will now walk you through setup."
echo -e "It covers: auth, providers, gateway, ${CYAN}autonomous tasks${NC}, ${CYAN}voice calls${NC},"
echo -e "${CYAN}crash alerting${NC}, and ${CYAN}budget controls${NC}."
echo ""

read -rp "$(echo -e "${BOLD}Run configure wizard now? [Y/n]${NC} ")" RUN_WIZARD
RUN_WIZARD="${RUN_WIZARD:-Y}"

if [[ "$RUN_WIZARD" =~ ^[Yy] ]]; then
  pnpm clawdis setup
  echo ""
  pnpm clawdis configure
fi

# ── Step 10: Optionally install systemd service ──────────────────────────────

echo ""
read -rp "$(echo -e "${BOLD}Install gateway as systemd service (auto-start on boot)? [y/N]${NC} ")" INSTALL_DAEMON
INSTALL_DAEMON="${INSTALL_DAEMON:-N}"

if [[ "$INSTALL_DAEMON" =~ ^[Yy] ]]; then
  GATEWAY_PORT="${CLAWDIS_GATEWAY_PORT:-18789}"
  GATEWAY_TOKEN="${CLAWDIS_GATEWAY_TOKEN:-$(openssl rand -hex 32 2>/dev/null || python3 -c 'import secrets; print(secrets.token_hex(32))')}"

  SERVICE_FILE="/etc/systemd/system/clawdis-gateway.service"
  info "Creating systemd service at $SERVICE_FILE..."

  sudo tee "$SERVICE_FILE" > /dev/null << UNIT
[Unit]
Description=OpenClaw Gateway (Optimised)
After=network-online.target
Wants=network-online.target

[Service]
ExecStart=$(command -v node) ${INSTALL_DIR}/dist/index.js gateway --port ${GATEWAY_PORT}
Restart=on-failure
RestartSec=5
User=$(whoami)
Environment=HOME=$HOME
Environment=CLAWDIS_GATEWAY_TOKEN=${GATEWAY_TOKEN}
WorkingDirectory=${INSTALL_DIR}

[Install]
WantedBy=multi-user.target
UNIT

  sudo systemctl daemon-reload
  sudo systemctl enable clawdis-gateway
  sudo systemctl start clawdis-gateway

  ok "Gateway service installed and started"
  echo ""
  echo -e "  ${BOLD}Gateway token:${NC} $GATEWAY_TOKEN"
  echo -e "  ${BOLD}Service status:${NC} sudo systemctl status clawdis-gateway"
  echo -e "  ${BOLD}View logs:${NC}     sudo journalctl -u clawdis-gateway -f"
fi

# ── Summary ──────────────────────────────────────────────────────────────────

echo ""
echo -e "${BOLD}${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BOLD}${GREEN}  OpenClaw-Optimised is ready!${NC}"
echo -e "${BOLD}${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo -e "  ${BOLD}Dashboard:${NC}     http://localhost:${GATEWAY_PORT:-18789}/"
echo -e "  ${BOLD}Install dir:${NC}   $INSTALL_DIR"
echo -e "  ${BOLD}Config:${NC}        ~/.clawdis/clawdis.json"
echo -e "  ${BOLD}Workspace:${NC}     ~/clawd/"
echo ""
echo -e "  ${BOLD}Quick commands:${NC}"
echo -e "    cd $INSTALL_DIR"
echo -e "    pnpm clawdis gateway        # Start gateway"
echo -e "    pnpm clawdis configure      # Re-run wizard"
echo -e "    pnpm clawdis health         # Health check"
echo -e "    pnpm clawdis login          # Link WhatsApp"
echo ""
echo -e "  ${BOLD}New features in this fork:${NC}"
echo -e "    ${CYAN}Autonomous tasks${NC}  — multi-step background work with progress reports"
echo -e "    ${CYAN}Voice calls${NC}       — ElevenLabs bidirectional audio (Web + Telegram)"
echo -e "    ${CYAN}Crash alerting${NC}    — webhook/Telegram/WA/Discord notifications"
echo -e "    ${CYAN}Budget controls${NC}   — monthly cap + Ollama local routing"
echo -e "    ${CYAN}Security${NC}          — CSRF, rate limiting, origin validation, credential masking"
echo ""

#!/usr/bin/env bash
# ============================================================================
# OpenClaw-Optimised — One-Line Installer
# ============================================================================
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/andysheldon-creator/OpenClaw-Optimised/main/install.sh | bash
#
# Options (pass as environment variables before the pipe):
#   SKIP_OLLAMA=1         — skip Ollama installation & model pulls
#   SKIP_WIZARD=1         — skip the interactive configure wizard at the end
#   BRANCH=name           — clone a specific branch (default: main)
#   INSTALL_DIR=path      — install to a custom directory (default: ~/OpenClaw-Optimised)
#
# Examples:
#   curl -fsSL <url>/install.sh | bash
#   curl -fsSL <url>/install.sh | SKIP_OLLAMA=1 bash
#   curl -fsSL <url>/install.sh | BRANCH=develop INSTALL_DIR=~/my-bot bash
#
# Supports: macOS (Intel + Apple Silicon), Linux (Debian/Ubuntu/Mint/Fedora/Arch),
#           WSL, Windows (Git Bash / MSYS2 — partial)
# ============================================================================

set -euo pipefail

# ── Colours & Formatting ────────────────────────────────────────────────────

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
MAGENTA='\033[0;35m'
BOLD='\033[1m'
DIM='\033[2m'
NC='\033[0m'

banner() {
  echo ""
  echo -e "${MAGENTA}${BOLD}"
  echo -e "   ___                    ____ _                "
  echo -e "  / _ \ _ __   ___ _ __ / ___| | __ ___      __"
  echo -e " | | | | '_ \ / _ \ '_ \ |   | |/ _\` \ \ /\ / /"
  echo -e " | |_| | |_) |  __/ | | | |___| | (_| |\ V  V / "
  echo -e "  \___/| .__/ \___|_| |_|\____|_|\__,_| \_/\_/  "
  echo -e "       |_|            ${CYAN}Optimised Edition${MAGENTA}         "
  echo -e "${NC}"
  echo -e "${DIM}  AI assistant gateway · multi-platform · cost-optimised${NC}"
  echo ""
}

step()    { echo -e "${BLUE}${BOLD}[$1/$TOTAL_STEPS]${NC} $2"; }
ok()      { echo -e "  ${GREEN}✓${NC} $1"; }
warn()    { echo -e "  ${YELLOW}⚠${NC} $1"; }
fail()    { echo -e "  ${RED}✗${NC} $1"; }
info()    { echo -e "  ${DIM}→${NC} $1"; }

die() {
  fail "$1"
  echo ""
  echo -e "${RED}Installation failed.${NC} See the error above for details."
  echo -e "Need help? Open an issue: ${CYAN}https://github.com/andysheldon-creator/OpenClaw-Optimised/issues${NC}"
  exit 1
}

# ── Configuration ───────────────────────────────────────────────────────────

REPO_URL="https://github.com/andysheldon-creator/OpenClaw-Optimised.git"
BRANCH="${BRANCH:-main}"
INSTALL_DIR="${INSTALL_DIR:-$HOME/OpenClaw-Optimised}"
SKIP_OLLAMA="${SKIP_OLLAMA:-0}"
SKIP_WIZARD="${SKIP_WIZARD:-0}"
NODE_MIN_VERSION="22"

# Calculate total steps
TOTAL_STEPS="7"
if [ "$SKIP_OLLAMA" = "1" ]; then
  TOTAL_STEPS="6"
fi

# ── OS / Architecture Detection ────────────────────────────────────────────

detect_os() {
  local uname_s
  uname_s="$(uname -s)"
  case "$uname_s" in
    Linux*)
      if grep -qEi "(Microsoft|WSL)" /proc/version 2>/dev/null; then
        OS="wsl"
      else
        OS="linux"
      fi
      ;;
    Darwin*)  OS="macos" ;;
    MINGW*|MSYS*|CYGWIN*)
      OS="windows"
      ;;
    *)
      die "Unsupported operating system: $uname_s"
      ;;
  esac

  ARCH="$(uname -m)"
  case "$ARCH" in
    x86_64|amd64) ARCH="amd64" ;;
    arm64|aarch64) ARCH="arm64" ;;
    *)
      warn "Unusual architecture: $ARCH — proceeding anyway"
      ;;
  esac
}

# ── Helpers ─────────────────────────────────────────────────────────────────

command_exists() {
  command -v "$1" &>/dev/null
}

get_node_major() {
  node --version 2>/dev/null | sed 's/^v//' | cut -d. -f1
}

# ── Step 1: Check / Install Git ─────────────────────────────────────────────

install_git() {
  step 1 "Checking Git..."

  if command_exists git; then
    ok "Git $(git --version | awk '{print $3}') found"
    return
  fi

  info "Installing Git..."
  case "$OS" in
    macos)
      if command_exists brew; then
        brew install git || die "Failed to install Git via Homebrew"
      else
        die "Git not found. Install Xcode Command Line Tools: xcode-select --install"
      fi
      ;;
    linux|wsl)
      if command_exists apt-get; then
        sudo apt-get update -qq && sudo apt-get install -y -qq git || die "Failed to install Git"
      elif command_exists dnf; then
        sudo dnf install -y git || die "Failed to install Git"
      elif command_exists yum; then
        sudo yum install -y git || die "Failed to install Git"
      elif command_exists pacman; then
        sudo pacman -Sy --noconfirm git || die "Failed to install Git"
      else
        die "Cannot install Git automatically. Install it manually and re-run."
      fi
      ;;
    windows)
      die "Git not found. Download from https://git-scm.com/download/win and re-run in Git Bash."
      ;;
  esac

  command_exists git || die "Git installation failed"
  ok "Git installed successfully"
}

# ── Step 2: Check / Install Node.js ─────────────────────────────────────────

install_node() {
  step 2 "Checking Node.js (>= ${NODE_MIN_VERSION})..."

  if command_exists node; then
    local major
    major="$(get_node_major)"

    if [ "$major" -ge "$NODE_MIN_VERSION" ] 2>/dev/null; then
      ok "Node.js v$(node --version | sed 's/^v//') found"
      return
    else
      warn "Node.js v$(node --version | sed 's/^v//') found but v${NODE_MIN_VERSION}+ required"
    fi
  fi

  info "Installing Node.js ${NODE_MIN_VERSION}..."
  case "$OS" in
    macos)
      if command_exists brew; then
        brew install "node@${NODE_MIN_VERSION}" || die "Failed to install Node via Homebrew"
        brew link --overwrite "node@${NODE_MIN_VERSION}" 2>/dev/null || true
      else
        die "Install Homebrew first (https://brew.sh) or install Node.js ${NODE_MIN_VERSION}+ manually."
      fi
      ;;
    linux|wsl)
      if command_exists curl; then
        curl -fsSL "https://deb.nodesource.com/setup_${NODE_MIN_VERSION}.x" | sudo -E bash - \
          && sudo apt-get install -y -qq nodejs \
          || die "Failed to install Node.js via NodeSource"
      else
        die "curl is required to install Node.js. Install curl first: sudo apt-get install curl"
      fi
      ;;
    windows)
      die "Node.js ${NODE_MIN_VERSION}+ not found. Download from https://nodejs.org/ and re-run."
      ;;
  esac

  command_exists node || die "Node.js installation failed"
  ok "Node.js v$(node --version | sed 's/^v//') installed"
}

# ── Step 3: Check / Install pnpm ────────────────────────────────────────────

install_pnpm() {
  step 3 "Checking pnpm..."

  if command_exists pnpm; then
    ok "pnpm $(pnpm --version) found"
    return
  fi

  info "Installing pnpm..."
  if command_exists corepack; then
    # corepack may need sudo if Node was installed globally
    sudo corepack enable 2>/dev/null || corepack enable
    corepack prepare pnpm@latest --activate 2>/dev/null || true
    if command_exists pnpm; then
      ok "pnpm enabled via corepack"
      return
    fi
  fi

  # Fallback: install via npm
  info "Falling back to npm install..."
  npm install -g pnpm || die "Failed to install pnpm"

  command_exists pnpm || die "pnpm installation failed"
  ok "pnpm $(pnpm --version) installed"
}

# ── Step 4: Clone Repository ────────────────────────────────────────────────

clone_repo() {
  step 4 "Cloning OpenClaw-Optimised..."

  if [ -d "$INSTALL_DIR/.git" ]; then
    warn "Directory already exists: $INSTALL_DIR"
    info "Pulling latest changes on branch ${BRANCH}..."
    cd "$INSTALL_DIR"
    git fetch origin && git checkout "$BRANCH" && git pull origin "$BRANCH" \
      || die "Failed to update existing installation"
    ok "Repository updated"
  else
    git clone --branch "$BRANCH" --depth 1 "$REPO_URL" "$INSTALL_DIR" \
      || die "Failed to clone repository"
    cd "$INSTALL_DIR"
    ok "Cloned to ${INSTALL_DIR}"
  fi
}

# ── Step 5: Install Dependencies & Build ────────────────────────────────────

build_project() {
  step 5 "Installing dependencies & building..."

  cd "$INSTALL_DIR"

  info "Running pnpm install (this may take a minute)..."
  pnpm install --frozen-lockfile 2>/dev/null || pnpm install \
    || die "pnpm install failed"
  ok "Dependencies installed"

  info "Building TypeScript..."
  pnpm build || die "Build failed"
  ok "Build complete"

  # Build the control UI if the script exists
  if [ -f "package.json" ] && grep -q '"ui:build"' package.json 2>/dev/null; then
    info "Building Control UI..."
    pnpm ui:install 2>/dev/null && pnpm ui:build 2>/dev/null \
      && ok "Control UI built" \
      || warn "Control UI build skipped (optional)"
  fi
}

# ── Step 6: Install Ollama (Optional) ───────────────────────────────────────

install_ollama() {
  if [ "$SKIP_OLLAMA" = "1" ]; then
    return
  fi

  step 6 "Setting up Ollama (free local AI)..."

  echo ""
  echo -e "  ${CYAN}Ollama runs AI models locally on your machine for free.${NC}"
  echo -e "  ${DIM}This saves 40-50% on API costs by handling simple queries locally.${NC}"
  echo -e "  ${DIM}Requires ~10 GB disk space and 8+ GB RAM (16 GB recommended).${NC}"
  echo ""

  # Install Ollama if not present
  if command_exists ollama; then
    ok "Ollama already installed"
  else
    info "Installing Ollama..."
    case "$OS" in
      macos)
        if command_exists brew; then
          brew install ollama || {
            warn "Homebrew install failed, trying official installer..."
            curl -fsSL https://ollama.com/install.sh | sh || die "Failed to install Ollama"
          }
        else
          curl -fsSL https://ollama.com/install.sh | sh || die "Failed to install Ollama"
        fi
        ;;
      linux|wsl)
        curl -fsSL https://ollama.com/install.sh | sh || die "Failed to install Ollama"
        ;;
      windows)
        warn "Ollama must be installed manually on Windows."
        echo -e "  ${CYAN}Download:${NC} https://ollama.com/download/windows"
        echo -e "  ${DIM}Or via winget:${NC} winget install Ollama.Ollama"
        echo -e "  ${DIM}After installing, pull models manually:${NC}"
        echo -e "    ollama pull llama3.1:8b"
        echo -e "    ollama pull nomic-embed-text"
        echo -e "    ollama pull llava:7b"
        return
        ;;
    esac
    command_exists ollama && ok "Ollama installed" || die "Ollama installation failed"
  fi

  # Start Ollama service if not running
  if ! curl -sf http://localhost:11434/api/tags &>/dev/null; then
    info "Starting Ollama service..."
    case "$OS" in
      linux)
        if command_exists systemctl; then
          sudo systemctl start ollama 2>/dev/null || ollama serve &>/dev/null &
        else
          ollama serve &>/dev/null &
        fi
        ;;
      macos|wsl)
        ollama serve &>/dev/null &
        ;;
    esac
    # Wait for Ollama to be ready (up to 30 seconds)
    local retries=0
    while ! curl -sf http://localhost:11434/api/tags &>/dev/null; do
      retries=$((retries + 1))
      if [ "$retries" -gt 30 ]; then
        warn "Ollama service didn't start in time. Start it manually: ollama serve"
        warn "Then pull models: ollama pull llama3.1:8b && ollama pull nomic-embed-text && ollama pull llava:7b"
        return
      fi
      sleep 1
    done
    ok "Ollama service running"
  else
    ok "Ollama service already running"
  fi

  # Pull the three required models
  echo ""
  echo -e "  ${CYAN}Pulling 3 AI models (first run downloads ~10 GB total)...${NC}"
  echo ""

  # Model 1: Chat model — llama3.1:8b (~4.7 GB)
  info "Pulling llama3.1:8b (chat model, ~4.7 GB)..."
  if ollama pull llama3.1:8b; then
    ok "llama3.1:8b ready — handles everyday chat queries locally"
  else
    warn "Failed to pull llama3.1:8b — pull later: ollama pull llama3.1:8b"
  fi

  # Model 2: Embedding model — nomic-embed-text (~274 MB)
  info "Pulling nomic-embed-text (embedding model, ~274 MB)..."
  if ollama pull nomic-embed-text; then
    ok "nomic-embed-text ready — powers semantic search (RAG)"
  else
    warn "Failed to pull nomic-embed-text — pull later: ollama pull nomic-embed-text"
  fi

  # Model 3: Vision model — llava:7b (~4.7 GB)
  info "Pulling llava:7b (vision model, ~4.7 GB)..."
  if ollama pull llava:7b; then
    ok "llava:7b ready — handles image analysis locally"
  else
    warn "Failed to pull llava:7b — pull later: ollama pull llava:7b"
  fi

  echo ""
  ok "Ollama setup complete — local AI inference ready"
}

# ── Step 7: Environment & Configuration ─────────────────────────────────────

setup_env() {
  step "$TOTAL_STEPS" "Setting up environment..."

  cd "$INSTALL_DIR"

  # Create .env from template if it doesn't exist
  if [ ! -f .env ]; then
    if [ -f .env.example ]; then
      cp .env.example .env
      ok "Created .env from template"
    else
      warn ".env.example not found — you'll need to create .env manually"
    fi
  else
    ok ".env already exists"
  fi

  echo ""
  echo -e "  ${YELLOW}${BOLD}ACTION REQUIRED:${NC} Edit your .env file and add these API keys:"
  echo ""
  echo -e "  ${BOLD}1.${NC} ${CYAN}ANTHROPIC_API_KEY${NC}         — ${DIM}https://console.anthropic.com/settings/keys${NC}"
  echo -e "  ${BOLD}2.${NC} ${CYAN}TELEGRAM_BOT_TOKEN${NC}        — ${DIM}message @BotFather on Telegram${NC}"
  echo -e "  ${BOLD}3.${NC} ${CYAN}CLAWDIS_GATEWAY_PASSWORD${NC}  — ${DIM}choose a strong password${NC}"
  echo ""

  # Run the setup wizard unless skipped
  if [ "$SKIP_WIZARD" != "1" ]; then
    echo -e "  ${CYAN}${BOLD}Ready to configure!${NC}"
    echo -e "  ${DIM}The setup wizard walks you through connecting platforms,${NC}"
    echo -e "  ${DIM}setting budgets, enabling the Board of Directors, and more.${NC}"
    echo ""
    # When piped from curl, stdin is the pipe — redirect to /dev/tty for real terminal input
    if [ -e /dev/tty ]; then
      read -rp "  Run the setup wizard now? [Y/n] " run_wizard < /dev/tty
      if [ "${run_wizard,,}" != "n" ]; then
        echo ""
        pnpm clawdis configure < /dev/tty \
          || warn "Wizard exited early. Run later: cd $INSTALL_DIR && pnpm clawdis configure"
      else
        info "Skipped. Run any time: cd $INSTALL_DIR && pnpm clawdis configure"
      fi
    else
      warn "No interactive terminal detected (running via pipe)."
      info "Run the wizard manually: cd $INSTALL_DIR && pnpm clawdis configure"
    fi
  fi
}

# ── Summary ─────────────────────────────────────────────────────────────────

print_summary() {
  local port="${CLAWDIS_GATEWAY_PORT:-18789}"

  echo ""
  echo -e "${GREEN}${BOLD}═══════════════════════════════════════════════════════════════${NC}"
  echo -e "${GREEN}${BOLD}  ✓ OpenClaw-Optimised installed successfully!${NC}"
  echo -e "${GREEN}${BOLD}═══════════════════════════════════════════════════════════════${NC}"
  echo ""
  echo -e "  ${BOLD}Install directory:${NC}    ${CYAN}${INSTALL_DIR}${NC}"
  echo -e "  ${BOLD}Config file:${NC}          ${CYAN}~/.clawdis/clawdis.json${NC}"
  echo -e "  ${BOLD}Environment:${NC}          ${CYAN}${INSTALL_DIR}/.env${NC}"
  echo -e "  ${BOLD}Workspace:${NC}            ${CYAN}~/clawd/${NC}"
  echo ""
  echo -e "  ${BOLD}Quick commands:${NC}"
  echo ""
  echo -e "    ${DIM}cd ${INSTALL_DIR}${NC}"
  echo -e "    ${CYAN}pnpm clawdis gateway${NC}       — Start the gateway"
  echo -e "    ${CYAN}pnpm clawdis configure${NC}     — Re-run setup wizard"
  echo -e "    ${CYAN}pnpm clawdis login${NC}         — Link WhatsApp"
  echo -e "    ${CYAN}pnpm clawdis health${NC}        — Health check"
  echo ""
  echo -e "  ${BOLD}What's included:${NC}"
  echo ""
  echo -e "    ${CYAN}Hybrid LLM Routing${NC}   — Ollama local AI saves 40-50% on API costs"
  echo -e "    ${CYAN}Board of Directors${NC}   — 6 specialist AI agents (CEO, CFO, CMO, Research, Critic)"
  echo -e "    ${CYAN}Autonomous Tasks${NC}     — Multi-step background work with progress reports"
  echo -e "    ${CYAN}Voice Calls${NC}          — ElevenLabs bidirectional audio"
  echo -e "    ${CYAN}Crash Alerting${NC}       — Webhook/Telegram/WA/Discord notifications"
  echo -e "    ${CYAN}Budget Controls${NC}      — Daily/monthly spend caps with auto-alerts"
  echo -e "    ${CYAN}RAG${NC}                  — Semantic search over conversation history"
  echo -e "    ${CYAN}Multi-Platform${NC}       — WhatsApp, Telegram, Discord, Signal, iMessage, Web"
  echo ""
  echo -e "  ${BOLD}Documentation:${NC}"
  echo ""
  echo -e "    ${DIM}User Guide:${NC}          ${CYAN}docs/OpenClaw-Optimised-USER GUIDE.md${NC}"
  echo -e "    ${DIM}Board of Directors:${NC}  ${CYAN}docs/BOARD_OF_DIRECTORS_GUIDE.md${NC}"
  echo -e "    ${DIM}Issues & Help:${NC}       ${CYAN}https://github.com/andysheldon-creator/OpenClaw-Optimised/issues${NC}"
  echo ""
}

# ── Main ────────────────────────────────────────────────────────────────────

main() {
  banner
  detect_os

  info "Detected: ${BOLD}${OS}${NC} (${ARCH})"
  info "Branch: ${BOLD}${BRANCH}${NC}"
  info "Install dir: ${BOLD}${INSTALL_DIR}${NC}"
  if [ "$SKIP_OLLAMA" = "1" ]; then
    info "Ollama: ${YELLOW}skipped${NC}"
  fi
  echo ""

  install_git       # Step 1
  install_node      # Step 2
  install_pnpm      # Step 3
  clone_repo        # Step 4
  build_project     # Step 5
  install_ollama    # Step 6 (skipped if SKIP_OLLAMA=1)
  setup_env         # Step 7 (or 6 if Ollama skipped)
  print_summary
}

main "$@"

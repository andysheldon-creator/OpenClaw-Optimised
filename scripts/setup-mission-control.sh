#!/usr/bin/env bash
# setup-mission-control.sh — Clone & configure Mission Control for OpenClaw.
# Usage: bash scripts/setup-mission-control.sh

set -euo pipefail

REPO_URL="https://github.com/Danm72/mission-control.git"
MC_DIR="mission-control"
GATEWAY_CONFIG="${HOME}/.clawdis/clawdis.json"

# ── Colours ────────────────────────────────────────────────────────────────────
BLD='\033[1m' GRN='\033[32m' YLW='\033[33m' CYN='\033[36m' RST='\033[0m'
info()  { printf "${CYN}▸${RST} %s\n" "$*"; }
ok()    { printf "${GRN}✔${RST} %s\n" "$*"; }
warn()  { printf "${YLW}⚠${RST} %s\n" "$*"; }
header(){ printf "\n${BLD}${GRN}── %s ──${RST}\n\n" "$*"; }

header "Mission Control Setup for OpenClaw-Optimised"

# ── 1. Clone if needed ─────────────────────────────────────────────────────────
if [ -d "$MC_DIR" ]; then
  info "Mission Control directory already exists at ./$MC_DIR"
  info "Pulling latest changes…"
  git -C "$MC_DIR" pull --ff-only 2>/dev/null || warn "Pull failed (may be on a custom branch)"
else
  info "Cloning Mission Control…"
  git clone "$REPO_URL" "$MC_DIR"
  ok "Cloned to ./$MC_DIR"
fi

# ── 2. Check prerequisites ────────────────────────────────────────────────────
for cmd in node pnpm; do
  if ! command -v "$cmd" &>/dev/null; then
    warn "$cmd is not installed. Mission Control requires Node.js 22+ and pnpm 9+."
    exit 1
  fi
done

NODE_VER=$(node -v | grep -oP '\d+' | head -1)
if [ "$NODE_VER" -lt 22 ]; then
  warn "Node.js version $NODE_VER detected. Mission Control requires Node.js >= 22."
fi

# ── 3. Install dependencies ───────────────────────────────────────────────────
header "Installing dependencies"
cd "$MC_DIR"
pnpm install
ok "Dependencies installed"

# ── 4. Environment setup ──────────────────────────────────────────────────────
header "Environment Configuration"

if [ ! -f "apps/web/.env.local" ]; then
  info "Creating apps/web/.env.local from template…"
  if [ -f "apps/web/.env.example" ]; then
    cp "apps/web/.env.example" "apps/web/.env.local"
    ok "Copied .env.example → .env.local"
  else
    cat > "apps/web/.env.local" <<'ENVEOF'
# Mission Control Environment
# See docs/MISSION_CONTROL_INTEGRATION.md for full details.

# Supabase (required)
NEXT_PUBLIC_SUPABASE_URL=http://localhost:8000
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
SUPABASE_JWT_SECRET=super-secret-jwt-token-with-at-least-32-characters
POSTGRES_URL=postgresql://postgres:postgres@localhost:54332/postgres

# Supabase project ID (for migrations)
SUPABASE_PROJECT_ID=

# Anthropic (required for onboarding chat)
ANTHROPIC_API_KEY=

# Optional
UPSTASH_REDIS_REST_URL=
UPSTASH_REDIS_REST_TOKEN=
ENVEOF
    ok "Created .env.local template"
  fi
  warn "Edit apps/web/.env.local with your Supabase and Anthropic keys before starting."
else
  ok ".env.local already exists"
fi

cd ..

# ── 5. Enable Gateway proxy ───────────────────────────────────────────────────
header "Gateway Configuration"

if [ -f "$GATEWAY_CONFIG" ]; then
  # Check if missionControl is already configured
  if grep -q '"missionControl"' "$GATEWAY_CONFIG" 2>/dev/null; then
    ok "missionControl already present in $GATEWAY_CONFIG"
  else
    info "Adding missionControl config to $GATEWAY_CONFIG"
    # Use node to safely merge JSON
    node -e "
      const fs = require('fs');
      const cfg = JSON.parse(fs.readFileSync('$GATEWAY_CONFIG', 'utf-8'));
      cfg.gateway = cfg.gateway || {};
      cfg.gateway.missionControl = {
        enabled: true,
        url: 'http://127.0.0.1:3100',
        basePath: '/mc'
      };
      fs.writeFileSync('$GATEWAY_CONFIG', JSON.stringify(cfg, null, 2) + '\n');
    "
    ok "Added gateway.missionControl to $GATEWAY_CONFIG"
  fi
else
  warn "$GATEWAY_CONFIG not found. The gateway proxy will need to be configured manually."
  info "Add this to your clawdis.json gateway section:"
  echo '  "missionControl": { "enabled": true, "url": "http://127.0.0.1:3100", "basePath": "/mc" }'
fi

# ── 6. Install skills ─────────────────────────────────────────────────────────
header "Installing Mission Control Skills"

SKILLS_DIR="${HOME}/.openclaw/skills"
MC_SKILLS_SRC="$MC_DIR/skills"

if [ -d "$MC_SKILLS_SRC" ]; then
  mkdir -p "$SKILLS_DIR"
  for skill_dir in "$MC_SKILLS_SRC"/*/; do
    skill_name=$(basename "$skill_dir")
    target="$SKILLS_DIR/$skill_name"
    if [ -d "$target" ]; then
      info "Updating skill: $skill_name"
      rm -rf "$target"
    else
      info "Installing skill: $skill_name"
    fi
    cp -r "$skill_dir" "$target"
    ok "Installed $skill_name"
  done
else
  warn "No skills directory found in Mission Control repo."
fi

# ── 7. Summary ─────────────────────────────────────────────────────────────────
header "Setup Complete"

echo -e "${BLD}Next steps:${RST}"
echo ""
echo "  1. Edit ${CYN}mission-control/apps/web/.env.local${RST} with your keys"
echo ""
echo "  2. Start Mission Control:"
echo "     ${CYN}cd mission-control && pnpm dev${RST}"
echo "     Dashboard will be at ${CYN}http://localhost:3100${RST}"
echo ""
echo "  3. With gateway proxy enabled, also accessible at:"
echo "     ${CYN}http://localhost:18789/mc/${RST}"
echo ""
echo "  4. Or use Docker Compose:"
echo "     ${CYN}docker compose --profile mc up${RST}"
echo ""
echo -e "${BLD}Docker Compose (full stack):${RST}"
echo "     ${CYN}docker compose --profile mc up -d${RST}"
echo "     • Gateway:          http://localhost:18789/"
echo "     • Mission Control:  http://localhost:3100/"
echo "     • Supabase API:     http://localhost:8000/"
echo ""

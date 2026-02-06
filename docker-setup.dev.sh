#!/usr/bin/env bash
set -euo pipefail

# Docker setup — builds the image from local source, writes .env, onboards,
# and starts the gateway.  Config/sessions persist on the host at ~/.openclaw.

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
IMAGE_NAME="${OPENCLAW_IMAGE:-openclaw:local}"

require_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Missing dependency: $1" >&2
    exit 1
  fi
}

require_cmd docker
if ! docker compose version >/dev/null 2>&1; then
  echo "Docker Compose not available (try: docker compose version)" >&2
  exit 1
fi

OPENCLAW_CONFIG_DIR="${OPENCLAW_CONFIG_DIR:-$HOME/.openclaw}"
OPENCLAW_WORKSPACE_DIR="${OPENCLAW_WORKSPACE_DIR:-$HOME/.openclaw/workspace}"

mkdir -p "$OPENCLAW_CONFIG_DIR"
mkdir -p "$OPENCLAW_WORKSPACE_DIR"

export OPENCLAW_CONFIG_DIR
export OPENCLAW_WORKSPACE_DIR
export OPENCLAW_GATEWAY_PORT="${OPENCLAW_GATEWAY_PORT:-18789}"
export OPENCLAW_BRIDGE_PORT="${OPENCLAW_BRIDGE_PORT:-18790}"
export OPENCLAW_GATEWAY_BIND="${OPENCLAW_GATEWAY_BIND:-lan}"
export OPENCLAW_IMAGE="$IMAGE_NAME"
export OPENCLAW_DOCKER_APT_PACKAGES="${OPENCLAW_DOCKER_APT_PACKAGES:-}"

# ---------- gateway token ----------

if [[ -z "${OPENCLAW_GATEWAY_TOKEN:-}" ]]; then
  if command -v openssl >/dev/null 2>&1; then
    OPENCLAW_GATEWAY_TOKEN="$(openssl rand -hex 32)"
  else
    OPENCLAW_GATEWAY_TOKEN="$(python3 -c 'import secrets; print(secrets.token_hex(32))')"
  fi
fi
export OPENCLAW_GATEWAY_TOKEN

# ---------- reconcile config with script settings ----------
# After onboard (or skip), ensure the config file's gateway token and bind
# match what this script generated.  The gateway reads the config file token
# first and ignores the OPENCLAW_GATEWAY_TOKEN env-var when one is present,
# so we must keep them in sync.
reconcile_gateway_config() {
  local config_file="$1"
  [[ -f "$config_file" ]] || return 0
  python3 - "$config_file" "$OPENCLAW_GATEWAY_TOKEN" "${OPENCLAW_GATEWAY_BIND}" <<'PY'
import json, sys
path, token, bind = sys.argv[1], sys.argv[2], sys.argv[3]
with open(path) as f:
    cfg = json.load(f)
gw = cfg.setdefault("gateway", {})
auth = gw.setdefault("auth", {})
auth["mode"] = "token"
auth["token"] = token
gw["bind"] = bind
# Docker bridge routes requests through a non-loopback IP, so the gateway
# does not recognise the Control UI as a local client.  Allow token-only
# auth for the Control UI to avoid a pairing chicken-and-egg.
cui = gw.setdefault("controlUi", {})
cui["allowInsecureAuth"] = True
with open(path, "w") as f:
    json.dump(cfg, f, indent=2)
    f.write("\n")
PY
}

# ---------- .env ----------

ENV_FILE="$ROOT_DIR/.env"
write_env() {
  local file="$1"
  shift
  local tmp
  tmp="$(mktemp)"
  # Preserve any existing keys we don't manage
  if [[ -f "$file" ]]; then
    while IFS= read -r line || [[ -n "$line" ]]; do
      local key="${line%%=*}"
      local managed=false
      for k in "$@"; do
        if [[ "$key" == "$k" ]]; then
          managed=true
          break
        fi
      done
      if [[ "$managed" == false ]]; then
        printf '%s\n' "$line" >>"$tmp"
      fi
    done <"$file"
  fi
  # Write managed keys
  for k in "$@"; do
    printf '%s=%s\n' "$k" "${!k-}" >>"$tmp"
  done
  mv "$tmp" "$file"
}

write_env "$ENV_FILE" \
  OPENCLAW_CONFIG_DIR \
  OPENCLAW_WORKSPACE_DIR \
  OPENCLAW_GATEWAY_PORT \
  OPENCLAW_BRIDGE_PORT \
  OPENCLAW_GATEWAY_BIND \
  OPENCLAW_GATEWAY_TOKEN \
  OPENCLAW_IMAGE \
  OPENCLAW_DOCKER_APT_PACKAGES

# ---------- compose args ----------

COMPOSE_ARGS=("-f" "$ROOT_DIR/docker-compose.yml")
COMPOSE_HINT="docker compose -f $ROOT_DIR/docker-compose.yml"

# ---------- build image ----------

echo "==> Building Docker image: $IMAGE_NAME"
docker build \
  --build-arg "OPENCLAW_DOCKER_APT_PACKAGES=${OPENCLAW_DOCKER_APT_PACKAGES}" \
  -t "$IMAGE_NAME" \
  -f "$ROOT_DIR/Dockerfile" \
  "$ROOT_DIR"

# ---------- onboard ----------

CONFIG_FILE="$OPENCLAW_CONFIG_DIR/openclaw.json"
if [[ ! -f "$CONFIG_FILE" ]]; then
  echo ""
  echo "==> Onboarding (interactive)"
  echo "When prompted:"
  echo "  - Gateway bind: lan"
  echo "  - Gateway auth: token"
  echo "  - Gateway token: (any value — the script will overwrite it)"
  echo "  - Tailscale exposure: Off"
  echo "  - Install Gateway daemon: No"
  echo ""
  docker compose "${COMPOSE_ARGS[@]}" run --rm openclaw-cli onboard --no-install-daemon
else
  echo "==> Config already exists ($CONFIG_FILE), skipping onboard"
fi

echo "==> Reconciling gateway config (token + bind)"
reconcile_gateway_config "$CONFIG_FILE"

# ---------- start ----------

echo ""
echo "==> Starting gateway"
docker compose "${COMPOSE_ARGS[@]}" up -d openclaw-gateway

DASHBOARD_URL="http://127.0.0.1:${OPENCLAW_GATEWAY_PORT}/?token=${OPENCLAW_GATEWAY_TOKEN}"

echo ""
echo "Gateway running — image built from local source"
echo "Config:    $OPENCLAW_CONFIG_DIR"
echo "Workspace: $OPENCLAW_WORKSPACE_DIR"
echo ""
echo "Dashboard: $DASHBOARD_URL"
echo ""
echo "Rebuild after source changes:"
echo "  $0"
echo ""
echo "Logs:"
echo "  $COMPOSE_HINT logs -f openclaw-gateway"

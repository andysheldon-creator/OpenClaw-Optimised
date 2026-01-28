#!/usr/bin/env bash
set -euo pipefail

PROXY="${PROXY:-caddy}"
INSTALL_METHOD="${INSTALL_METHOD:-npm}"
GIT_REPO="${GIT_REPO:-https://github.com/cloud-neutral-toolkit/clawdbot.svc.plus.git}"
CLAWDBOT_VERSION="${CLAWDBOT_VERSION:-latest}"
CERTBOT_EMAIL="${CERTBOT_EMAIL:-}"
PUBLIC_SCHEME="https"

usage() {
  cat <<'EOF'
Usage:
  init_vhost.sh [domain]

Defaults:
  - domain: current hostname (hostname -f, then hostname)
  - clawdbot version: "latest" (override with CLAWDBOT_VERSION env var)
  - install method: npm (set INSTALL_METHOD=git to install from the cloned repo in /opt)
  - proxy: Caddy with automatic TLS (set PROXY=nginx to use nginx+Certbot)
  - customize Certbot email via CERTBOT_EMAIL

Examples:
  curl -fsSL https://raw.githubusercontent.com/cloud-neutral-toolkit/clawdbot-svc-plus/main/scripts/init_vhost.sh | bash
  curl -fsSL https://raw.githubusercontent.com/cloud-neutral-toolkit/clawdbot-svc-plus/main/scripts/init_vhost.sh | bash -s clawdbot.svc.plus
EOF
}

if [[ "${1:-}" == "-h" || "${1:-}" == "--help" ]]; then
  usage
  exit 0
fi

DOMAIN="${1:-}"
if [[ -z "$DOMAIN" ]]; then
  DOMAIN="$(hostname -f 2>/dev/null || true)"
  if [[ -z "$DOMAIN" ]]; then
    DOMAIN="$(hostname 2>/dev/null || true)"
  fi
fi

if [[ -z "$DOMAIN" ]]; then
  echo "Failed to determine domain (hostname). Pass one explicitly."
  exit 1
fi

PROXY="$(tr '[:upper:]' '[:lower:]' <<< "$PROXY")"
if [[ "$PROXY" != "caddy" && "$PROXY" != "nginx" ]]; then
  echo "Unsupported proxy mode '$PROXY'. Use 'caddy' or 'nginx'."
  exit 1
fi

INSTALL_METHOD="$(tr '[:upper:]' '[:lower:]' <<< "$INSTALL_METHOD")"
if [[ "$INSTALL_METHOD" != "npm" && "$INSTALL_METHOD" != "git" ]]; then
  echo "Unsupported install method '$INSTALL_METHOD'. Use 'npm' or 'git'."
  exit 1
fi

if [[ -f /etc/os-release ]]; then
  . /etc/os-release
else
  echo "Unsupported OS (missing /etc/os-release)."
  exit 1
fi

if [[ "${ID:-}" != "debian" && "${ID_LIKE:-}" != *"debian"* ]]; then
  echo "This installer currently supports Debian-based systems only."
  exit 1
fi

as_root() {
  if [[ "$(id -u)" -eq 0 ]]; then
    "$@"
  else
    sudo "$@"
  fi
}

run_as_user() {
  local user="${SUDO_USER:-$USER}"
  if [[ "$user" == "root" ]]; then
    echo "Run this installer as a non-root user (with sudo available)."
    exit 1
  fi
  sudo -u "$user" -H "$@"
}

ensure_node24() {
  local need_install=1
  if command -v node >/dev/null 2>&1; then
    local major
    major="$(node -v | sed -E 's/^v([0-9]+).*/\1/')"
    if [[ "${major:-0}" -ge 24 ]]; then
      need_install=0
    fi
  fi
  if [[ "$need_install" -eq 1 ]]; then
    as_root apt-get update
    as_root apt-get install -y curl ca-certificates
    curl -fsSL https://deb.nodesource.com/setup_24.x | as_root -E bash -
    as_root apt-get install -y nodejs
  fi
}

ensure_packages() {
  local packages=(git curl ca-certificates ufw)
  if [[ "$PROXY" == "nginx" ]]; then
    packages+=(nginx certbot python3-certbot-nginx)
  else
    packages+=(caddy)
  fi
  as_root apt-get update
  as_root apt-get install -y "${packages[@]}"
}

ensure_pnpm() {
  run_as_user corepack enable
  run_as_user corepack prepare pnpm@latest --activate
}

configure_firewall() {
  local ports=(22/tcp 80/tcp 443/tcp 18789/tcp)
  for port in "${ports[@]}"; do
    as_root ufw allow "${port}" >/dev/null
  done
  as_root ufw default allow outgoing >/dev/null
  as_root ufw default deny incoming >/dev/null
  if as_root ufw status | grep -q "Status: inactive"; then
    as_root ufw --force enable >/dev/null
  fi
}

install_clawdbot_npm() {
  as_root npm install -g "clawdbot@${CLAWDBOT_VERSION}"
}

install_clawdbot_git() {
  local install_dir="/opt/clawdbot-svc-plus"
  if [[ ! -d "$install_dir" ]]; then
    run_as_user mkdir -p "$install_dir"
    run_as_user git clone "$GIT_REPO" "$install_dir"
  else
    run_as_user git -C "$install_dir" fetch --all --prune
    run_as_user git -C "$install_dir" checkout main
    run_as_user git -C "$install_dir" reset --hard origin/main
  fi
  run_as_user bash -c "cd $install_dir && pnpm install && pnpm build"
  run_as_user npm install -g "$install_dir"
}

install_clawdbot() {
  if [[ "$INSTALL_METHOD" == "git" ]]; then
    install_clawdbot_git
  else
    install_clawdbot_npm
  fi
}

configure_clawdbot() {
  run_as_user clawdbot onboard --install-daemon
  run_as_user clawdbot config set gateway.trustedProxies.0 127.0.0.1
}

configure_nginx() {
  local vhost="/etc/nginx/sites-available/clawdbot-${DOMAIN}.conf"
  if [[ ! -f "$vhost" ]]; then
    cat <<EOF | as_root tee "$vhost" >/dev/null
server {
  listen 80;
  server_name ${DOMAIN};

  location / {
    proxy_pass http://127.0.0.1:18789;
    proxy_http_version 1.1;
    proxy_set_header Host \$host;
    proxy_set_header X-Real-IP \$remote_addr;
    proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto \$scheme;
    proxy_set_header Upgrade \$http_upgrade;
    proxy_set_header Connection "upgrade";
  }
}
EOF
  fi
  as_root ln -sf "$vhost" "/etc/nginx/sites-enabled/$(basename "$vhost")"
  as_root nginx -t
  as_root systemctl enable --now nginx
  as_root systemctl reload nginx
}

configure_certbot() {
  local email_args=("--register-unsafely-without-email")
  if [[ -n "$CERTBOT_EMAIL" ]]; then
    email_args=("--email" "$CERTBOT_EMAIL" "--agree-tos" "--no-eff-email")
  fi
  as_root certbot --nginx "${email_args[@]}" --redirect -d "$DOMAIN" || true
}

configure_caddy() {
  local service="/etc/caddy/Caddyfile"
  cat <<EOF | as_root tee "$service" >/dev/null
${DOMAIN} {
  reverse_proxy 127.0.0.1:18789
}
EOF
  as_root systemctl enable --now caddy
  as_root systemctl reload caddy
}

configure_proxy() {
  if [[ "$PROXY" == "nginx" ]]; then
    configure_nginx
    configure_certbot
  else
    configure_caddy
  fi
}

health_check_url() {
  local url="$1"
  for i in $(seq 1 5); do
    if curl -fsS --max-time 5 --retry 3 --retry-delay 2 "$url" >/dev/null 2>&1; then
      return 0
    fi
    sleep 2
  done
  return 1
}

run_health_checks() {
  if ! health_check_url http://127.0.0.1:18789; then
    echo "Warning: local gateway health check failed."
  fi
  local target="${PUBLIC_SCHEME}://${DOMAIN}"
  if ! health_check_url "${target}"; then
    echo "Warning: public health check failed for ${target}. TLS might not be active yet."
  fi
}

echo "==> Domain: ${DOMAIN}"
ensure_packages
ensure_node24
ensure_pnpm
configure_firewall
install_clawdbot
configure_clawdbot
configure_proxy
run_health_checks

cat <<EOF

Done.
Gateway is listening on http://127.0.0.1:18789 and proxied via ${PUBLIC_SCHEME}://${DOMAIN}.
Access control and TLS are handled by ${PROXY^^}.

If you need to tweak config later:
  - \`clawdbot config get gateway.trustedProxies\`
  - \`journalctl --user -u clawdbot-gateway --no-pager\`
EOF

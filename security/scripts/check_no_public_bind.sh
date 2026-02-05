#!/usr/bin/env bash
# OpenClaw Security Check: Public Bind Detection
# Checks for gateway configurations that expose to public networks

set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
NC='\033[0m' # No Color

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

echo "OpenClaw Security Check: Public Bind Detection"
echo "================================================"

EXIT_CODE=0

# Check for explicit 0.0.0.0 bindings in code
echo -e "\n${YELLOW}Checking for public bind patterns in source code...${NC}"

PUBLIC_BIND_PATTERNS=(
  '0\.0\.0\.0'
  'bind.*["\x27]0\.0\.0\.0["\x27]'
  'host.*["\x27]0\.0\.0\.0["\x27]'
  'INADDR_ANY'
  '::\s*$'  # IPv6 any
)

EXCLUDE_PATTERNS=(
  'node_modules'
  '\.git'
  'dist'
  '\.log'
  'security/scripts'  # Exclude this script
)

for pattern in "${PUBLIC_BIND_PATTERNS[@]}"; do
  # Build exclude args
  EXCLUDE_ARGS=""
  for excl in "${EXCLUDE_PATTERNS[@]}"; do
    EXCLUDE_ARGS="$EXCLUDE_ARGS --exclude-dir=$excl"
  done

  matches=$(grep -rn $EXCLUDE_ARGS -E "$pattern" "$REPO_ROOT/src" 2>/dev/null || true)
  if [[ -n "$matches" ]]; then
    # Filter out comments and safe usages
    filtered=$(echo "$matches" | grep -v '^\s*//' | grep -v '^\s*\*' | grep -v 'loopback' | grep -v 'example' || true)
    if [[ -n "$filtered" ]]; then
      echo -e "${RED}FOUND: Potential public bind pattern '$pattern':${NC}"
      echo "$filtered" | head -20
      EXIT_CODE=1
    fi
  fi
done

# Check configuration files
echo -e "\n${YELLOW}Checking configuration files...${NC}"

CONFIG_FILES=(
  "$HOME/.openclaw/config.yaml"
  "$HOME/.openclaw/config.yml"
  "$HOME/.openclaw/config.json"
)

for config_file in "${CONFIG_FILES[@]}"; do
  if [[ -f "$config_file" ]]; then
    echo "  Checking $config_file..."
    
    # Check for bind: lan or bind: 0.0.0.0
    if grep -qE 'bind:\s*(lan|0\.0\.0\.0|::)' "$config_file" 2>/dev/null; then
      # Check if auth is configured
      if ! grep -qE 'auth:\s*\n\s+(token|password):' "$config_file" 2>/dev/null; then
        echo -e "${RED}WARNING: $config_file has public bind without auth configured${NC}"
        EXIT_CODE=1
      fi
    fi
  fi
done

# Check environment variables
echo -e "\n${YELLOW}Checking environment variables...${NC}"

if [[ "${OPENCLAW_GATEWAY_HOST:-}" =~ ^0\.0\.0\.0$ ]] || [[ "${OPENCLAW_GATEWAY_HOST:-}" == "::" ]]; then
  if [[ -z "${OPENCLAW_GATEWAY_TOKEN:-}" ]] && [[ -z "${OPENCLAW_GATEWAY_PASSWORD:-}" ]]; then
    echo -e "${RED}WARNING: OPENCLAW_GATEWAY_HOST is public but no auth token/password is set${NC}"
    EXIT_CODE=1
  fi
fi

# Check running processes
echo -e "\n${YELLOW}Checking running gateway processes...${NC}"

if command -v ss &>/dev/null; then
  # Look for openclaw gateway listening on 0.0.0.0
  PUBLIC_LISTENERS=$(ss -tlnp 2>/dev/null | grep -E '0\.0\.0\.0:18789|:::18789' | grep -i openclaw || true)
  if [[ -n "$PUBLIC_LISTENERS" ]]; then
    echo -e "${RED}WARNING: OpenClaw gateway is listening on public interface:${NC}"
    echo "$PUBLIC_LISTENERS"
    EXIT_CODE=1
  fi
elif command -v netstat &>/dev/null; then
  PUBLIC_LISTENERS=$(netstat -tlnp 2>/dev/null | grep -E '0\.0\.0\.0:18789|:::18789' | grep -i openclaw || true)
  if [[ -n "$PUBLIC_LISTENERS" ]]; then
    echo -e "${RED}WARNING: OpenClaw gateway is listening on public interface:${NC}"
    echo "$PUBLIC_LISTENERS"
    EXIT_CODE=1
  fi
fi

# Summary
echo ""
if [[ $EXIT_CODE -eq 0 ]]; then
  echo -e "${GREEN}✓ No public bind issues detected${NC}"
else
  echo -e "${RED}✗ Public bind issues detected - please review and fix${NC}"
  echo ""
  echo "Remediation options:"
  echo "  1. Set gateway.bind=loopback in config"
  echo "  2. Use SSH tunnel: ssh -L 18789:localhost:18789 user@host"
  echo "  3. Use Tailscale: gateway.tailscale.mode=serve"
  echo "  4. If public bind is intentional, ensure:"
  echo "     - OPENCLAW_ALLOW_PUBLIC_BIND=true is set"
  echo "     - OPENCLAW_PUBLIC_BIND_IP_ALLOWLIST is configured"
  echo "     - Gateway TLS is enabled (gateway.tls.enabled=true)"
  echo "     - Gateway auth is configured (OPENCLAW_GATEWAY_TOKEN or OPENCLAW_GATEWAY_PASSWORD)"
fi

exit $EXIT_CODE

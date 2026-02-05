#!/usr/bin/env bash
# OpenClaw Security Smoketest
# Comprehensive local security verification before deployment

set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
BLUE='\033[0;34m'
BOLD='\033[1m'
NC='\033[0m' # No Color

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

echo -e "${BOLD}OpenClaw Security Smoketest${NC}"
echo "============================"
echo "Running comprehensive security checks..."
echo ""

TOTAL_CHECKS=0
PASSED_CHECKS=0
FAILED_CHECKS=0
WARNINGS=0

run_check() {
  local name="$1"
  local script="$2"
  
  TOTAL_CHECKS=$((TOTAL_CHECKS + 1))
  echo -e "${BLUE}[$TOTAL_CHECKS] $name${NC}"
  
  if [[ -f "$script" ]]; then
    if bash "$script" 2>&1 | sed 's/^/  /'; then
      PASSED_CHECKS=$((PASSED_CHECKS + 1))
    else
      FAILED_CHECKS=$((FAILED_CHECKS + 1))
    fi
  else
    echo -e "  ${YELLOW}Script not found: $script${NC}"
    WARNINGS=$((WARNINGS + 1))
  fi
  echo ""
}

# Run individual security checks
run_check "Public Bind Detection" "$SCRIPT_DIR/check_no_public_bind.sh"
run_check "Secret Detection" "$SCRIPT_DIR/check_no_secrets.sh"
run_check "Skills Allowlist" "$SCRIPT_DIR/check_skills_allowlist.sh"

# Additional inline checks
echo -e "${BLUE}[$((TOTAL_CHECKS + 1))] Configuration Security${NC}"
TOTAL_CHECKS=$((TOTAL_CHECKS + 1))

CONFIG_ISSUES=0

# Check config file permissions
OPENCLAW_DIR="${OPENCLAW_DIR:-$HOME/.openclaw}"
if [[ -f "$OPENCLAW_DIR/config.yaml" ]]; then
  PERMS=$(stat -c %a "$OPENCLAW_DIR/config.yaml" 2>/dev/null || stat -f %OLp "$OPENCLAW_DIR/config.yaml" 2>/dev/null || echo "unknown")
  if [[ "$PERMS" != "600" ]] && [[ "$PERMS" != "400" ]]; then
    echo -e "  ${YELLOW}Warning: Config file permissions are $PERMS (recommend 600)${NC}"
    WARNINGS=$((WARNINGS + 1))
  else
    echo -e "  ${GREEN}✓ Config file permissions are secure ($PERMS)${NC}"
  fi
else
  echo -e "  ${BLUE}No config file found (using defaults)${NC}"
fi

# Check state directory permissions
if [[ -d "$OPENCLAW_DIR" ]]; then
  PERMS=$(stat -c %a "$OPENCLAW_DIR" 2>/dev/null || stat -f %OLp "$OPENCLAW_DIR" 2>/dev/null || echo "unknown")
  if [[ "$PERMS" != "700" ]] && [[ "$PERMS" != "750" ]]; then
    echo -e "  ${YELLOW}Warning: State directory permissions are $PERMS (recommend 700)${NC}"
    WARNINGS=$((WARNINGS + 1))
  else
    echo -e "  ${GREEN}✓ State directory permissions are secure ($PERMS)${NC}"
  fi
fi

if [[ $CONFIG_ISSUES -eq 0 ]]; then
  PASSED_CHECKS=$((PASSED_CHECKS + 1))
else
  FAILED_CHECKS=$((FAILED_CHECKS + 1))
fi
echo ""

# Check for dangerous environment variables
echo -e "${BLUE}[$((TOTAL_CHECKS + 1))] Environment Variable Security${NC}"
TOTAL_CHECKS=$((TOTAL_CHECKS + 1))

ENV_ISSUES=0

# Check if service_role is in environment
if env | grep -qi "service_role" 2>/dev/null; then
  echo -e "  ${RED}✗ service_role found in environment variables${NC}"
  ENV_ISSUES=$((ENV_ISSUES + 1))
else
  echo -e "  ${GREEN}✓ No service_role in environment${NC}"
fi

# Check for secrets in common env vars that might be logged
SENSITIVE_VARS=("DATABASE_URL" "SUPABASE_URL" "REDIS_URL")
for var in "${SENSITIVE_VARS[@]}"; do
  if [[ -n "${!var:-}" ]]; then
    # Check if it contains password in URL
    if echo "${!var}" | grep -qE '://[^:]+:[^@]+@' 2>/dev/null; then
      echo -e "  ${YELLOW}Warning: $var contains embedded credentials${NC}"
      WARNINGS=$((WARNINGS + 1))
    fi
  fi
done

if [[ $ENV_ISSUES -eq 0 ]]; then
  PASSED_CHECKS=$((PASSED_CHECKS + 1))
else
  FAILED_CHECKS=$((FAILED_CHECKS + 1))
fi
echo ""

# Check for running gateway
echo -e "${BLUE}[$((TOTAL_CHECKS + 1))] Gateway Runtime Security${NC}"
TOTAL_CHECKS=$((TOTAL_CHECKS + 1))

GATEWAY_ISSUES=0

# Check if gateway is running
if pgrep -f "openclaw.*gateway" >/dev/null 2>&1 || pgrep -f "openclaw-gateway" >/dev/null 2>&1; then
  echo -e "  ${BLUE}Gateway is running${NC}"
  
  # Check what port it's on
  if command -v ss &>/dev/null; then
    LISTEN=$(ss -tlnp 2>/dev/null | grep -E ':18789' || true)
  elif command -v netstat &>/dev/null; then
    LISTEN=$(netstat -tlnp 2>/dev/null | grep -E ':18789' || true)
  else
    LISTEN=""
  fi
  
  if [[ -n "$LISTEN" ]]; then
    if echo "$LISTEN" | grep -qE '0\.0\.0\.0|:::'; then
      echo -e "  ${RED}✗ Gateway is listening on public interface${NC}"
      GATEWAY_ISSUES=$((GATEWAY_ISSUES + 1))
    else
      echo -e "  ${GREEN}✓ Gateway is bound to loopback only${NC}"
    fi
  fi
else
  echo -e "  ${BLUE}Gateway not running (skipping runtime checks)${NC}"
fi

if [[ $GATEWAY_ISSUES -eq 0 ]]; then
  PASSED_CHECKS=$((PASSED_CHECKS + 1))
else
  FAILED_CHECKS=$((FAILED_CHECKS + 1))
fi
echo ""

# Final summary
echo "============================"
echo -e "${BOLD}Security Smoketest Summary${NC}"
echo "============================"
echo ""
echo "Total checks: $TOTAL_CHECKS"
echo -e "  ${GREEN}Passed: $PASSED_CHECKS${NC}"
echo -e "  ${RED}Failed: $FAILED_CHECKS${NC}"
echo -e "  ${YELLOW}Warnings: $WARNINGS${NC}"
echo ""

if [[ $FAILED_CHECKS -eq 0 ]]; then
  echo -e "${GREEN}${BOLD}✓ All security checks passed!${NC}"
  exit 0
else
  echo -e "${RED}${BOLD}✗ Some security checks failed. Please review and fix before deployment.${NC}"
  exit 1
fi

#!/usr/bin/env bash
# OpenClaw Security Check: Git History Secret Scan
# Scans entire git history for leaked secrets

set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

echo "OpenClaw Security Check: Git History Secret Scan"
echo "================================================="
echo ""
echo -e "${YELLOW}This may take several minutes for large repositories...${NC}"
echo ""

EXIT_CODE=0

# Check for required tools
check_tool() {
  if ! command -v "$1" &>/dev/null; then
    echo -e "${YELLOW}$1 not found, skipping $1 scan${NC}"
    return 1
  fi
  return 0
}

# Gitleaks scan
echo -e "${BLUE}Running gitleaks...${NC}"
if check_tool gitleaks; then
  GITLEAKS_CONFIG="$REPO_ROOT/security/gitleaks/.gitleaks.toml"
  
  if [[ -f "$GITLEAKS_CONFIG" ]]; then
    CONFIG_ARG="--config=$GITLEAKS_CONFIG"
  else
    CONFIG_ARG=""
  fi
  
  # Create temp file for results
  GITLEAKS_REPORT=$(mktemp)
  
  if gitleaks detect $CONFIG_ARG --source="$REPO_ROOT" --report-path="$GITLEAKS_REPORT" --report-format=json 2>/dev/null; then
    echo -e "${GREEN}✓ Gitleaks: No secrets found${NC}"
  else
    FINDINGS=$(cat "$GITLEAKS_REPORT" 2>/dev/null || echo "[]")
    COUNT=$(echo "$FINDINGS" | python3 -c "import json,sys; print(len(json.load(sys.stdin)))" 2>/dev/null || echo "?")
    echo -e "${RED}✗ Gitleaks: Found $COUNT potential secret(s)${NC}"
    
    # Show summary of findings
    if command -v python3 &>/dev/null && [[ "$FINDINGS" != "[]" ]]; then
      echo "$FINDINGS" | python3 -c "
import json, sys
data = json.load(sys.stdin)
for item in data[:10]:
    rule = item.get('RuleID', 'unknown')
    file = item.get('File', 'unknown')
    line = item.get('StartLine', '?')
    commit = item.get('Commit', 'unknown')[:8]
    print(f'  - {rule}: {file}:{line} (commit {commit})')
if len(data) > 10:
    print(f'  ... and {len(data) - 10} more')
" 2>/dev/null || true
    fi
    
    EXIT_CODE=1
  fi
  
  rm -f "$GITLEAKS_REPORT"
else
  echo "  Install: brew install gitleaks"
fi

# TruffleHog scan
echo -e "\n${BLUE}Running trufflehog...${NC}"
if check_tool trufflehog; then
  TRUFFLEHOG_REPORT=$(mktemp)
  
  if trufflehog git "file://$REPO_ROOT" --json --only-verified 2>/dev/null > "$TRUFFLEHOG_REPORT"; then
    if [[ -s "$TRUFFLEHOG_REPORT" ]]; then
      COUNT=$(wc -l < "$TRUFFLEHOG_REPORT" | tr -d ' ')
      echo -e "${RED}✗ TruffleHog: Found $COUNT verified secret(s)${NC}"
      head -5 "$TRUFFLEHOG_REPORT" | while IFS= read -r line; do
        detector=$(echo "$line" | python3 -c "import json,sys; print(json.load(sys.stdin).get('DetectorName', 'unknown'))" 2>/dev/null || echo "unknown")
        echo "  - $detector"
      done
      EXIT_CODE=1
    else
      echo -e "${GREEN}✓ TruffleHog: No verified secrets found${NC}"
    fi
  else
    echo -e "${GREEN}✓ TruffleHog: No secrets found${NC}"
  fi
  
  rm -f "$TRUFFLEHOG_REPORT"
else
  echo "  Install: brew install trufflehog"
fi

# Manual pattern search for critical patterns
echo -e "\n${BLUE}Searching git history for critical patterns...${NC}"

CRITICAL_PATTERNS=(
  "service_role"
  "SUPABASE_SERVICE_ROLE"
  "-----BEGIN RSA PRIVATE KEY-----"
  "-----BEGIN OPENSSH PRIVATE KEY-----"
)

for pattern in "${CRITICAL_PATTERNS[@]}"; do
  echo -n "  Checking for '$pattern'... "
  
  MATCHES=$(git -C "$REPO_ROOT" log -p --all -S "$pattern" --pretty=format:"%h %s" 2>/dev/null | head -5 || true)
  
  if [[ -n "$MATCHES" ]]; then
    echo -e "${RED}FOUND${NC}"
    echo "$MATCHES" | head -3 | sed 's/^/    /'
    EXIT_CODE=1
  else
    echo -e "${GREEN}clean${NC}"
  fi
done

# Check for large files that might contain secrets
echo -e "\n${BLUE}Checking for large files in history...${NC}"

LARGE_FILES=$(git -C "$REPO_ROOT" rev-list --objects --all 2>/dev/null | \
  git -C "$REPO_ROOT" cat-file --batch-check='%(objecttype) %(objectname) %(objectsize) %(rest)' 2>/dev/null | \
  sed -n 's/^blob //p' | \
  sort -rnk2 | \
  head -10 | \
  awk '$2 > 1000000 {print $3 " (" int($2/1024/1024) "MB)"}' || true)

if [[ -n "$LARGE_FILES" ]]; then
  echo -e "${YELLOW}Large files found in git history (may contain secrets):${NC}"
  echo "$LARGE_FILES" | sed 's/^/  /'
fi

# Summary
echo ""
echo "================================================="
if [[ $EXIT_CODE -eq 0 ]]; then
  echo -e "${GREEN}✓ No secrets detected in git history${NC}"
else
  echo -e "${RED}✗ Secrets detected in git history!${NC}"
  echo ""
  echo "Remediation steps:"
  echo "  1. Rotate all exposed credentials IMMEDIATELY"
  echo "  2. Remove secrets from git history using:"
  echo "     - BFG Repo-Cleaner: bfg --replace-text secrets.txt"
  echo "     - git filter-branch (slower but built-in)"
  echo "  3. Force push to remote (coordinate with team)"
  echo "  4. All developers must re-clone the repository"
  echo ""
  echo "For detailed guide: https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/removing-sensitive-data-from-a-repository"
fi

exit $EXIT_CODE

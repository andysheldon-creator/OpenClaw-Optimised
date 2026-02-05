#!/usr/bin/env bash
# OpenClaw Security Check: Secret Detection
# Scans codebase for hardcoded secrets and sensitive data

set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
NC='\033[0m' # No Color

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

echo "OpenClaw Security Check: Secret Detection"
echo "=========================================="

EXIT_CODE=0

# Directories and files to exclude
EXCLUDE_DIRS=(
  "node_modules"
  ".git"
  "dist"
  ".next"
  "coverage"
  "security"
  ".gitleaks-baseline.json"
)

# Build grep exclude arguments
EXCLUDE_ARGS=""
for dir in "${EXCLUDE_DIRS[@]}"; do
  EXCLUDE_ARGS="$EXCLUDE_ARGS --exclude-dir=$dir"
done

# Patterns to detect (with descriptions)
declare -A SECRET_PATTERNS=(
  ["service_role"]="Supabase service_role key (CRITICAL)"
  ["SUPABASE_SERVICE_ROLE"]="Supabase service_role env var"
  ["sk-[a-zA-Z0-9]{20,}"]="OpenAI API key"
  ["sk-ant-[a-zA-Z0-9-]{20,}"]="Anthropic API key"
  ["ghp_[a-zA-Z0-9]{36,}"]="GitHub Personal Access Token"
  ["github_pat_[a-zA-Z0-9_]{22,}"]="GitHub Fine-Grained PAT"
  ["xox[baprs]-[a-zA-Z0-9-]{10,}"]="Slack token"
  ["[0-9]{8,12}:[A-Za-z0-9_-]{35,}"]="Telegram bot token"
  ["PRIVATE KEY-----"]="Private key (PEM)"
  ["npm_[a-zA-Z0-9]{36,}"]="NPM token"
  ["AIza[0-9A-Za-z\\-_]{35}"]="Google API key"
  ["pplx-[a-zA-Z0-9_-]{10,}"]="Perplexity API key"
  ["gsk_[a-zA-Z0-9_-]{10,}"]="Groq API key"
)

# Files that are allowed to contain certain patterns (for documentation)
ALLOWED_FILES=(
  "*.md"
  "*.example"
  "*.test.ts"
  "*.spec.ts"
  ".gitleaks.toml"
)

echo -e "\n${YELLOW}Scanning for secret patterns...${NC}"

for pattern in "${!SECRET_PATTERNS[@]}"; do
  description="${SECRET_PATTERNS[$pattern]}"
  
  # Search for pattern
  matches=$(grep -rn $EXCLUDE_ARGS -E "$pattern" "$REPO_ROOT/src" "$REPO_ROOT/extensions" "$REPO_ROOT/ui" 2>/dev/null || true)
  
  if [[ -n "$matches" ]]; then
    # Filter out allowed files and comments
    filtered=""
    while IFS= read -r line; do
      # Skip if in allowed file patterns
      skip=false
      for allowed in "${ALLOWED_FILES[@]}"; do
        if [[ "$line" == *"$allowed"* ]]; then
          skip=true
          break
        fi
      done
      
      # Skip comments
      if [[ "$line" =~ ^\s*// ]] || [[ "$line" =~ ^\s*\* ]] || [[ "$line" =~ ^\s*# ]]; then
        skip=true
      fi
      
      # Skip if it's clearly a placeholder
      if [[ "$line" =~ YOUR_|EXAMPLE|PLACEHOLDER|<[A-Z_]+> ]]; then
        skip=true
      fi
      
      if [[ "$skip" == "false" ]]; then
        filtered="$filtered$line"$'\n'
      fi
    done <<< "$matches"
    
    if [[ -n "${filtered// }" ]]; then
      echo -e "${RED}FOUND: $description${NC}"
      echo "$filtered" | head -10
      
      # service_role is always critical
      if [[ "$pattern" == "service_role" ]]; then
        echo -e "${RED}CRITICAL: service_role key detected - this MUST be removed${NC}"
      fi
      
      EXIT_CODE=1
    fi
  fi
done

# Check for .env files that shouldn't be tracked
echo -e "\n${YELLOW}Checking for tracked .env files...${NC}"

ENV_FILES=$(git ls-files "$REPO_ROOT" 2>/dev/null | grep -E '\.env$|\.env\.local$|\.env\.production$' | grep -v '.env.example' || true)
if [[ -n "$ENV_FILES" ]]; then
  echo -e "${RED}WARNING: .env files are tracked in git:${NC}"
  echo "$ENV_FILES"
  EXIT_CODE=1
fi

# Check for credentials in config files
echo -e "\n${YELLOW}Checking config files for credentials...${NC}"

CONFIG_PATTERNS=(
  "password.*=.*['\"][^'\"]+['\"]"
  "token.*=.*['\"][a-zA-Z0-9_-]{20,}['\"]"
  "secret.*=.*['\"][^'\"]+['\"]"
  "api_key.*=.*['\"][^'\"]+['\"]"
)

for pattern in "${CONFIG_PATTERNS[@]}"; do
  matches=$(grep -rn $EXCLUDE_ARGS -E "$pattern" "$REPO_ROOT" --include="*.yaml" --include="*.yml" --include="*.json" --include="*.toml" 2>/dev/null || true)
  
  if [[ -n "$matches" ]]; then
    # Filter out examples and placeholders
    filtered=$(echo "$matches" | grep -v 'example' | grep -v 'PLACEHOLDER' | grep -v 'YOUR_' | grep -v 'schema' || true)
    if [[ -n "$filtered" ]]; then
      echo -e "${YELLOW}POTENTIAL: Credentials in config files:${NC}"
      echo "$filtered" | head -5
      # Don't fail for this, just warn
    fi
  fi
done

# Summary
echo ""
if [[ $EXIT_CODE -eq 0 ]]; then
  echo -e "${GREEN}✓ No hardcoded secrets detected${NC}"
else
  echo -e "${RED}✗ Secrets detected - please remove before committing${NC}"
  echo ""
  echo "Remediation:"
  echo "  1. Remove hardcoded secrets from source code"
  echo "  2. Use environment variables instead"
  echo "  3. Add sensitive files to .gitignore"
  echo "  4. If secrets were committed, rotate them immediately"
  echo "  5. Run: git filter-branch or BFG to remove from history"
fi

exit $EXIT_CODE

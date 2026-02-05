#!/usr/bin/env bash
# OpenClaw Security Check: Skills Allowlist Verification
# Ensures skills are properly allowlisted and validates skill configurations

set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
OPENCLAW_DIR="${OPENCLAW_DIR:-$HOME/.openclaw}"
SKILLS_DIR="$OPENCLAW_DIR/skills_local"
ALLOWLIST_FILE="$OPENCLAW_DIR/config/skills_allowlist.json"

echo "OpenClaw Security Check: Skills Allowlist"
echo "=========================================="

EXIT_CODE=0

# Check if skills allowlist enforcement is enabled
echo -e "\n${YELLOW}Checking skills allowlist configuration...${NC}"

CONFIG_FILE="$OPENCLAW_DIR/config.yaml"
if [[ -f "$CONFIG_FILE" ]]; then
  # Check for remote install setting
  if grep -qE 'allowRemoteInstall:\s*true' "$CONFIG_FILE" 2>/dev/null; then
    echo -e "${RED}WARNING: Remote skills installation is enabled${NC}"
    echo "  Set skills.allowRemoteInstall=false for production"
    EXIT_CODE=1
  else
    echo -e "${GREEN}✓ Remote skills installation is disabled${NC}"
  fi
fi

# Check environment variable
if [[ "${OPENCLAW_SKILLS_ALLOW_REMOTE_INSTALL:-false}" == "true" ]]; then
  echo -e "${RED}WARNING: OPENCLAW_SKILLS_ALLOW_REMOTE_INSTALL=true${NC}"
  echo "  This allows installing skills from remote sources"
  EXIT_CODE=1
fi

# Check for allowlist file
echo -e "\n${YELLOW}Checking skills allowlist file...${NC}"

if [[ -f "$ALLOWLIST_FILE" ]]; then
  echo "  Found allowlist at: $ALLOWLIST_FILE"
  
  # Validate JSON
  if ! python3 -c "import json; json.load(open('$ALLOWLIST_FILE'))" 2>/dev/null && \
     ! node -e "require('$ALLOWLIST_FILE')" 2>/dev/null; then
    echo -e "${RED}ERROR: Allowlist file is not valid JSON${NC}"
    EXIT_CODE=1
  else
    # Extract allowed skill IDs
    ALLOWED_SKILLS=$(python3 -c "import json; print('\n'.join(json.load(open('$ALLOWLIST_FILE')).get('allowed', [])))" 2>/dev/null || \
                     node -e "console.log(require('$ALLOWLIST_FILE').allowed?.join('\n') || '')" 2>/dev/null || echo "")
    
    if [[ -z "$ALLOWED_SKILLS" ]]; then
      echo -e "${YELLOW}NOTE: Allowlist is empty - no skills will be loaded${NC}"
    else
      echo -e "${GREEN}✓ Allowlist contains $(echo "$ALLOWED_SKILLS" | wc -l | tr -d ' ') skill(s)${NC}"
    fi
  fi
else
  echo -e "${YELLOW}NOTE: No allowlist file found at $ALLOWLIST_FILE${NC}"
  echo "  Create one to restrict which skills can be loaded"
fi

# Check installed skills
echo -e "\n${YELLOW}Checking installed skills...${NC}"

if [[ -d "$SKILLS_DIR" ]]; then
  INSTALLED_SKILLS=$(ls -1 "$SKILLS_DIR" 2>/dev/null || echo "")
  
  if [[ -z "$INSTALLED_SKILLS" ]]; then
    echo "  No skills installed in $SKILLS_DIR"
  else
    echo "  Found $(echo "$INSTALLED_SKILLS" | wc -l | tr -d ' ') installed skill(s):"
    
    while IFS= read -r skill_id; do
      [[ -z "$skill_id" ]] && continue
      
      skill_path="$SKILLS_DIR/$skill_id"
      
      # Check if skill is in allowlist
      if [[ -f "$ALLOWLIST_FILE" ]] && [[ -n "$ALLOWED_SKILLS" ]]; then
        if echo "$ALLOWED_SKILLS" | grep -qx "$skill_id"; then
          echo -e "    ${GREEN}✓ $skill_id (allowed)${NC}"
        else
          echo -e "    ${RED}✗ $skill_id (NOT in allowlist)${NC}"
          EXIT_CODE=1
        fi
      else
        echo -e "    ${BLUE}? $skill_id (no allowlist to check against)${NC}"
      fi
      
      # Check skill manifest
      MANIFEST_FILE="$skill_path/manifest.json"
      if [[ -f "$MANIFEST_FILE" ]]; then
        # Validate manifest against schema
        if command -v ajv &>/dev/null; then
          if ! ajv validate -s "$REPO_ROOT/security/sandbox/skill_manifest.schema.json" -d "$MANIFEST_FILE" 2>/dev/null; then
            echo -e "      ${YELLOW}Warning: Manifest does not match schema${NC}"
          fi
        fi
        
        # Check for suspicious permissions
        PERMISSIONS=$(python3 -c "import json; m=json.load(open('$MANIFEST_FILE')); p=m.get('permissions',{}); print('subprocess' if p.get('subprocess',{}).get('allowed') else '', 'network' if p.get('network',{}).get('egress') not in [None,'deny'] else '', 'fs-write' if 'write' in str(p.get('filesystem',{})) else '')" 2>/dev/null || echo "")
        
        if [[ "$PERMISSIONS" == *"subprocess"* ]]; then
          echo -e "      ${YELLOW}Warning: Requests subprocess permissions${NC}"
        fi
        if [[ "$PERMISSIONS" == *"network"* ]]; then
          echo -e "      ${YELLOW}Warning: Requests network egress permissions${NC}"
        fi
        if [[ "$PERMISSIONS" == *"fs-write"* ]]; then
          echo -e "      ${YELLOW}Warning: Requests filesystem write permissions${NC}"
        fi
      else
        echo -e "      ${YELLOW}Warning: No manifest.json found${NC}"
      fi
      
      # Check for dangerous patterns in skill code
      if [[ -d "$skill_path" ]]; then
        DANGEROUS=$(grep -rlE 'curl.*\|.*sh|wget.*\|.*bash|exec\s*\(|eval\s*\(' "$skill_path" 2>/dev/null || true)
        if [[ -n "$DANGEROUS" ]]; then
          echo -e "      ${RED}ALERT: Dangerous code patterns detected:${NC}"
          echo "$DANGEROUS" | head -3 | sed 's/^/        /'
          EXIT_CODE=1
        fi
      fi
      
    done <<< "$INSTALLED_SKILLS"
  fi
else
  echo "  Skills directory does not exist: $SKILLS_DIR"
fi

# Check for skills loaded from unexpected locations
echo -e "\n${YELLOW}Checking for skills in unexpected locations...${NC}"

UNEXPECTED_LOCATIONS=(
  "/tmp"
  "/var/tmp"
  "$HOME/Downloads"
)

for location in "${UNEXPECTED_LOCATIONS[@]}"; do
  if [[ -d "$location" ]]; then
    FOUND=$(find "$location" -name "manifest.json" -path "*/skills*" 2>/dev/null | head -5 || true)
    if [[ -n "$FOUND" ]]; then
      echo -e "${YELLOW}WARNING: Potential skills found in $location:${NC}"
      echo "$FOUND" | sed 's/^/  /'
    fi
  fi
done

# Summary
echo ""
if [[ $EXIT_CODE -eq 0 ]]; then
  echo -e "${GREEN}✓ Skills allowlist check passed${NC}"
else
  echo -e "${RED}✗ Skills allowlist issues detected${NC}"
  echo ""
  echo "Remediation:"
  echo "  1. Create/update $ALLOWLIST_FILE with allowed skill IDs"
  echo "  2. Remove skills not in the allowlist"
  echo "  3. Review skills with elevated permissions"
  echo "  4. Set OPENCLAW_SKILLS_ALLOW_REMOTE_INSTALL=false"
fi

exit $EXIT_CODE

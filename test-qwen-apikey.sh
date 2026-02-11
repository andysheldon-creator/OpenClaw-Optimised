#!/bin/bash

# Qwen API Key Support Test Script
# Usage: ./test-qwen-apikey.sh

set -e

echo "🚀 Qwen API Key Support Test Script"
echo "===================================="
echo ""

# Color definitions
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if in correct directory
if [ ! -f "package.json" ]; then
    echo -e "${RED}❌ Error: Please run this script from OpenClaw project root${NC}"
    exit 1
fi

echo "📝 Step 1: Checking modified files..."
echo ""

# Check if files were modified
files=(
    "src/agents/model-auth.ts"
    "extensions/qwen-portal-auth/index.ts"
    "src/commands/auth-choice.apply.qwen-portal.ts"
    "src/commands/onboard-types.ts"
    "src/commands/auth-choice-options.ts"
)

for file in "${files[@]}"; do
    if [ -f "$file" ]; then
        echo -e "${GREEN}✓${NC} $file exists"
    else
        echo -e "${RED}✗${NC} $file not found"
        exit 1
    fi
done

echo ""
echo "🔍 Step 2: Verifying code modifications..."
echo ""

# Check if model-auth.ts contains QWEN_API_KEY
if grep -q "QWEN_API_KEY" "src/agents/model-auth.ts"; then
    echo -e "${GREEN}✓${NC} model-auth.ts: QWEN_API_KEY support added"
else
    echo -e "${RED}✗${NC} model-auth.ts: QWEN_API_KEY missing"
    exit 1
fi

# Check if index.ts contains api-key method
if grep -q "id: \"api-key\"" "extensions/qwen-portal-auth/index.ts"; then
    echo -e "${GREEN}✓${NC} qwen-portal-auth: API Key auth method added"
else
    echo -e "${RED}✗${NC} qwen-portal-auth: API Key method missing"
    exit 1
fi

# Check for International endpoint
if grep -q "dashscope-intl.aliyuncs.com" "extensions/qwen-portal-auth/index.ts"; then
    echo -e "${GREEN}✓${NC} International endpoint configured"
else
    echo -e "${RED}✗${NC} International endpoint missing"
    exit 1
fi

# Check if onboard-types.ts contains qwen-api-key
if grep -q '"qwen-api-key"' "src/commands/onboard-types.ts"; then
    echo -e "${GREEN}✓${NC} onboard-types.ts: qwen-api-key type added"
else
    echo -e "${RED}✗${NC} onboard-types.ts: qwen-api-key type missing"
    exit 1
fi

# Check if auth-choice-options.ts contains qwen-api-key option
if grep -q 'value: "qwen-api-key"' "src/commands/auth-choice-options.ts"; then
    echo -e "${GREEN}✓${NC} auth-choice-options.ts: qwen-api-key option added"
else
    echo -e "${RED}✗${NC} auth-choice-options.ts: qwen-api-key option missing"
    exit 1
fi

echo ""
echo "🔨 Step 3: Building project..."
echo ""

# Build project
if npm run build; then
    echo -e "${GREEN}✓${NC} Build successful"
else
    echo -e "${RED}✗${NC} Build failed"
    exit 1
fi

echo ""
echo "✅ All checks passed!"
echo ""
echo "===================================="
echo "📚 Next Steps:"
echo ""
echo "1. Set environment variable (optional):"
echo "   ${YELLOW}export QWEN_API_KEY=\"sk-your-key\"${NC}"
echo ""
echo "2. Configure authentication:"
echo "   ${YELLOW}openclaw models auth login --provider qwen-portal${NC}"
echo "   - Select 'Qwen API Key'"
echo "   - Choose 'International (Singapore)' or 'China'"
echo "   - Enter your API Key"
echo ""
echo "3. Test API call:"
echo "   ${YELLOW}openclaw chat \"Hello, test message\"${NC}"
echo ""
echo "4. List available models:"
echo "   ${YELLOW}openclaw models list${NC}"
echo ""
echo "For detailed documentation, see: QWEN_API_KEY_SUPPORT.md"
echo "===================================="

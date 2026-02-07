#!/bin/bash
# Reapply Control UI patches after OpenClaw updates
# Run this after: npm update -g openclaw

UI_JS="/opt/homebrew/lib/node_modules/openclaw/dist/control-ui/assets/index-*.js"
UI_HTML="/opt/homebrew/lib/node_modules/openclaw/dist/control-ui/index.html"

echo "🔧 Reapplying Control UI patches..."

# Find the actual JS file (name includes hash)
JS_FILE=$(ls $UI_JS 2>/dev/null | head -1)

if [ -z "$JS_FILE" ]; then
  echo "❌ Could not find Control UI JS file"
  exit 1
fi

echo "📁 Found: $JS_FILE"

# Backup
cp "$JS_FILE" "$JS_FILE.backup-$(date +%Y%m%d-%H%M%S)"
cp "$UI_HTML" "$UI_HTML.backup-$(date +%Y%m%d-%H%M%S)"

echo "📦 Created backups"

# Patch 1: Thinking toggle bug fix (first occurrence)
if grep -q '!e.showThinking&&l.role.toLowerCase()==="toolresult"' "$JS_FILE"; then
  sed -i '' 's/!e\.showThinking&&l\.role\.toLowerCase()==="toolresult"/!e.showThinking\&\&(l.role.toLowerCase()==="toolresult"||l.role==="assistant"\&\&Array.isArray(o.content)\&\&o.content.length>0\&\&o.content.every(function(cc){var ct=(typeof cc.type==="string"?cc.type:"").toLowerCase();return ct==="toolcall"||ct==="tool_call"||ct==="tooluse"||ct==="tool_use"||ct==="thinking"}))/' "$JS_FILE"
  echo "✅ Applied thinking toggle bug fix (1/2)"
else
  echo "⚠️  Thinking toggle bug fix (1/2) already applied or pattern changed"
fi

# Patch 2: Hide tool cards when thinking off (find the render blocks)
# This is harder to automate reliably due to minification - manual check needed
echo "⚠️  Patch 2 (hide tool cards): Manual verification needed - see TOOLS.md"

# Patch 3: Enter-to-connect + auto-switch to Chat
if grep -q '@keydown.*preventDefault.*onConnect\(\)}}' "$JS_FILE"; then
  sed -i '' 's/@keydown=\${o=>{if(o\.key==="Enter"){o\.preventDefault();e\.onConnect()}}}/@keydown=\${o=>{if(o.key==="Enter"){o.preventDefault();e.onConnect();e.setTab("chat")}}}/' "$JS_FILE"
  echo "✅ Applied Enter-to-connect + Chat switch"
else
  echo "⚠️  Enter-to-connect already patched or pattern changed"
fi

# Patch 4: Page title
if grep -q '<title>OpenClaw Control</title>' "$UI_HTML"; then
  sed -i '' 's/<title>OpenClaw Control<\/title>/<title>MacOS VM - OpenClaw Control<\/title>/' "$UI_HTML"
  echo "✅ Applied custom page title"
else
  echo "⚠️  Page title already patched or pattern changed"
fi

echo "✨ Patch application complete!"
echo "🔄 Restart the gateway: openclaw gateway restart"

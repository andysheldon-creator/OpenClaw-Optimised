#!/usr/bin/env bash
set -euo pipefail

# Collect a small, consistent Peekaboo snapshot bundle for debugging OpenClaw UI state.
#
# Output: /tmp/openclaw-ui-snapshot-YYYYMMDD-HHMMSS/
# Contents:
#   - peekaboo-permissions.txt
#   - menubar.json
#   - windows.json
#   - frontmost.png
#   - ui-map.png

if ! command -v peekaboo >/dev/null 2>&1; then
  echo "Error: 'peekaboo' not found in PATH."
  echo "Install (brew): brew install steipete/tap/peekaboo"
  exit 1
fi

ts="$(date +%Y%m%d-%H%M%S)"
out="/tmp/openclaw-ui-snapshot-$ts"
mkdir -p "$out"

# Permissions + basic inventory (best-effort)
peekaboo permissions > "$out/peekaboo-permissions.txt" || true
peekaboo menubar list --json > "$out/menubar.json" || true
peekaboo list windows --json > "$out/windows.json" || true

# One high-signal screenshot + an annotated UI map (most useful for “what state is it in?”)
peekaboo image --mode frontmost --retina --path "$out/frontmost.png"
peekaboo see --mode screen --screen-index 0 --annotate --path "$out/ui-map.png"

echo "Saved: $out"

#!/usr/bin/env bash
set -euo pipefail

# Extract action items from files in a directory
# Usage: ./extract-actions.sh [directory]

DIR="${1:-$HOME/clawd}"

if [[ ! -d "$DIR" ]]; then
    echo "Error: Directory not found: $DIR"
    exit 1
fi

echo "# Action Items - $(date '+%Y-%m-%d %H:%M')"
echo ""
echo "Scanning: $DIR"
echo ""

# Common action patterns
PATTERNS=(
    "TODO"
    "FIXME"
    "XXX"
    "HACK"
    "\\[ \\]"
    "- \\[ \\]"
    "ACTION:"
    "NEXT:"
    "FOLLOW.UP"
)

# Build grep pattern
GREP_PATTERN=$(IFS="|"; echo "${PATTERNS[*]}")

# Find all markdown and text files
FILES=$(find "$DIR" -type f \( -name "*.md" -o -name "*.txt" \) -mtime -30 2>/dev/null | head -50)

if [[ -z "$FILES" ]]; then
    echo "No files found in $DIR"
    exit 0
fi

TOTAL_ACTIONS=0

while IFS= read -r file; do
    if [[ -f "$file" ]]; then
        # Extract matching lines
        MATCHES=$(grep -inE "$GREP_PATTERN" "$file" 2>/dev/null || true)
        if [[ -n "$MATCHES" ]]; then
            BASENAME=$(basename "$file")
            echo "## $BASENAME"
            echo ""
            echo "$MATCHES" | while IFS= read -r line; do
                echo "- $line"
                ((TOTAL_ACTIONS++)) || true
            done
            echo ""
        fi
    fi
done <<< "$FILES"

echo "---"
echo "Total action items found: $TOTAL_ACTIONS"

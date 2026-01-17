#!/bin/bash
# Summarize content and add to ppl.gift journal
# Usage: summarize-to-ppl "URL or content" [title]

set -e

if [ $# -lt 1 ]; then
    echo "Usage: summarize-to-ppl 'content' [title]"
    exit 1
fi

CONTENT="$1"
TITLE="${2:-}"

# Generate title if not provided
if [ -z "$TITLE" ]; then
    if [[ "$CONTENT" =~ ^https?:// ]]; then
        TITLE="Summary of $CONTENT"
    else
        TITLE="Summary: ${CONTENT:0:50}..."
    fi
fi

echo "📄 Content: $CONTENT"
echo "📝 Title: $TITLE"
echo ""

# Run summarize
echo "⏳ Running summarize..."
SUMMARY=$(summarize "$CONTENT" --length medium --format text --no-cache)

# Display summary
echo ""
echo "=" | head -c 60 | tr ' ' '='
echo "SUMMARY:"
echo "=" | head -c 60 | tr ' ' '='
echo "$SUMMARY"
echo "=" | head -c 60 | tr ' ' '='
echo ""

# Add to ppl.gift journal
echo "📝 Adding to ppl.gift journal..."

# Create a temporary file for the journal entry
TEMP_FILE=$(mktemp)
cat > "$TEMP_FILE" << EOF
Source: $CONTENT

Summary:
$SUMMARY
EOF

# Add journal entry using the existing ppl-gift script
cd /Users/steve/clawd
python3 skills/ppl-gift/scripts/ppl.py journal-add \
    --title "$TITLE" \
    --body-file "$TEMP_FILE" \
    --post || echo "⚠️ Could not add to journal (check error above)"

# Clean up
rm -f "$TEMP_FILE"

echo "✅ Done!"
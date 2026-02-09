#!/bin/sh
# new-changeset.sh — Create a changeset file from a slug
# Usage: bash .claude/scripts/new-changeset.sh <slug> [summary]

SLUG="$1"
SUMMARY="$2"

if [ -z "$SLUG" ]; then
  echo "Usage: bash .claude/scripts/new-changeset.sh <slug> [summary]"
  echo "Example: bash .claude/scripts/new-changeset.sh fix-channel-routing 'Fix unknown channel routing'"
  exit 1
fi

DIR="$(git rev-parse --show-toplevel)/.changeset"
FILE="$DIR/${SLUG}.md"

if [ -f "$FILE" ]; then
  echo "Already exists: $FILE"
  exit 1
fi

cat > "$FILE" << EOF
---
"openclaw": patch
---

${SUMMARY:-TODO: describe what changed and why}
EOF

echo "Created: $FILE"
echo "Edit it, then: git add $FILE"

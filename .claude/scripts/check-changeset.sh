#!/bin/sh
# check-changeset.sh — pre-commit hook addon
# Blocks commits that touch src/** or extensions/** without a staged .changeset/*.md
# Skip: CHANGESET_SKIP=1 git commit ...

[ "$CHANGESET_SKIP" = "1" ] && exit 0

STAGED=$(git diff --cached --name-only --diff-filter=ACMR)

# Check if any staged file matches src/** or extensions/**
NEEDS_CHANGESET=false
for f in $STAGED; do
  case "$f" in
    src/*|extensions/*) NEEDS_CHANGESET=true; break ;;
  esac
done

if [ "$NEEDS_CHANGESET" = "false" ]; then
  exit 0
fi

# Check for staged .changeset/*.md (exclude config.json and README.md)
HAS_CHANGESET=false
for f in $STAGED; do
  case "$f" in
    .changeset/*.md)
      basename=$(basename "$f")
      if [ "$basename" != "README.md" ]; then
        HAS_CHANGESET=true
        break
      fi
      ;;
  esac
done

if [ "$HAS_CHANGESET" = "false" ]; then
  echo ""
  echo "  changeset required: src/** or extensions/** changed but no .changeset/*.md staged."
  echo ""
  echo "  Create one with:"
  echo "    bash .claude/scripts/new-changeset.sh <slug>"
  echo "    # or: npx changeset"
  echo ""
  echo "  Then: git add .changeset/<slug>.md"
  echo ""
  echo "  Skip (emergency): CHANGESET_SKIP=1 git commit ..."
  echo ""
  exit 1
fi

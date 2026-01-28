#!/usr/bin/env bash
# Evolution Queue Cleanup Script v1.1
# Run: weekly (Sunday 8 PM), or manually after Cursor sessions
# Usage: ./queue-cleanup.sh [--dry-run|--auto-archive|--report]
#
# This script detects resolved/cancelled items and optionally archives them.
# It also reports on stale entries and potential ghost bugs.
#
# Workspace cleanup (run separately):
#   find ~/clawd -name "__pycache__" -type d -mtime +7 -exec rm -rf {} + 2>/dev/null
#   find ~/clawd -name "*.backup-*" -mtime +30 -delete 2>/dev/null

set -euo pipefail
CLAWD_DIR="/home/liam/clawd"
QUEUE_FILE="$CLAWD_DIR/EVOLUTION-QUEUE.md"
ARCHIVE_FILE="$CLAWD_DIR/EVOLUTION-QUEUE-ARCHIVE.md"
RESOLUTIONS_FILE="$CLAWD_DIR/CURSOR-RESOLUTIONS.md"

# Colors
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; BLUE='\033[0;34m'; NC='\033[0m'

MODE="${1:---report}"
DRY_RUN=false
AUTO_ARCHIVE=false

case "$MODE" in
    --dry-run) DRY_RUN=true ;;
    --auto-archive) AUTO_ARCHIVE=true ;;
    --report) ;; # default
    *) echo "Usage: $0 [--dry-run|--auto-archive|--report]"; exit 1 ;;
esac

echo "=========================================="
echo "Evolution Queue Cleanup - $(date '+%Y-%m-%d %H:%M')"
echo "Mode: $MODE"
echo "=========================================="

# === 1. DETECT RESOLVED ITEMS ===
echo -e "\n${BLUE}--- 1. Resolved Items in Pending Section ---${NC}"

RESOLVED_COUNT=0
RESOLVED_ENTRIES=""

# Find entries with [RESOLVED] in title
while IFS= read -r line; do
    if [[ -n "$line" ]]; then
        RESOLVED_COUNT=$((RESOLVED_COUNT + 1))
        RESOLVED_ENTRIES+="$line\n"
        echo -e "${YELLOW}[RESOLVED]${NC} $line"
    fi
done < <(grep -n "^### .*\[RESOLVED" "$QUEUE_FILE" 2>/dev/null || true)

# Find entries with Status: RESOLVED (but not in title)
while IFS= read -r line; do
    LINENUM=$(echo "$line" | cut -d: -f1)
    # Look back to find the entry header
    HEADER=$(head -n "$LINENUM" "$QUEUE_FILE" | grep "^### \[" | tail -1)
    if [[ -n "$HEADER" ]] && ! echo "$HEADER" | grep -q "\[RESOLVED"; then
        RESOLVED_COUNT=$((RESOLVED_COUNT + 1))
        echo -e "${YELLOW}[STATUS:RESOLVED]${NC} $HEADER"
    fi
done < <(grep -n "^\- \*\*Status:\*\* RESOLVED" "$QUEUE_FILE" 2>/dev/null || true)

if [ $RESOLVED_COUNT -eq 0 ]; then
    echo -e "${GREEN}No resolved items found in Pending section${NC}"
else
    echo -e "\n${YELLOW}Found $RESOLVED_COUNT resolved item(s) that should be archived${NC}"
fi

# === 2. DETECT CANCELLED ITEMS ===
echo -e "\n${BLUE}--- 2. Cancelled Items ---${NC}"

CANCELLED_COUNT=$(grep -c "CANCELLED" "$QUEUE_FILE" 2>/dev/null | tr -d '\n' || echo "0")
CANCELLED_COUNT=${CANCELLED_COUNT:-0}
if [ "$CANCELLED_COUNT" -gt 0 ] 2>/dev/null; then
    echo -e "${YELLOW}Found $CANCELLED_COUNT cancelled item(s):${NC}"
    grep -n "CANCELLED" "$QUEUE_FILE" | head -10
else
    echo -e "${GREEN}No cancelled items found${NC}"
fi

# === 3. STALE ENTRY DETECTION ===
echo -e "\n${BLUE}--- 3. Stale Entry Detection (>3 days old) ---${NC}"

STALE_COUNT=0
TODAY=$(date +%Y-%m-%d)
THREE_DAYS_AGO=$(date -d "3 days ago" +%Y-%m-%d 2>/dev/null || date -v-3d +%Y-%m-%d 2>/dev/null || echo "2026-01-25")

while IFS= read -r line; do
    ENTRY_DATE=$(echo "$line" | grep -oE "\[2026-[0-9]{2}-[0-9]{2}" | tr -d '[')
    if [[ -n "$ENTRY_DATE" ]] && [[ "$ENTRY_DATE" < "$THREE_DAYS_AGO" ]]; then
        STALE_COUNT=$((STALE_COUNT + 1))
        echo -e "${YELLOW}[STALE]${NC} $line"
    fi
done < <(grep "^### \[" "$QUEUE_FILE" | grep -v "RESOLVED\|CANCELLED" | head -20)

if [ $STALE_COUNT -eq 0 ]; then
    echo -e "${GREEN}No stale entries found${NC}"
else
    echo -e "\n${YELLOW}Found $STALE_COUNT stale entry/entries (>3 days without resolution)${NC}"
fi

# === 4. GHOST BUG DETECTION ===
echo -e "\n${BLUE}--- 4. Potential Ghost Bug Detection ---${NC}"

GHOST_COUNT=0

# Check for common ghost bug patterns
# Pattern: Entry mentions a feature that already exists

# Check if any pending entries reference files that have the feature
while IFS= read -r entry; do
    ENTRY_ID=$(echo "$entry" | grep -oE "\[[0-9-]+\]" | head -1)
    
    # Skip if already resolved
    if echo "$entry" | grep -qE "RESOLVED|CANCELLED"; then
        continue
    fi
    
    # Get the target file from the entry (next few lines)
    LINENUM=$(grep -n "$entry" "$QUEUE_FILE" | head -1 | cut -d: -f1)
    TARGET_FILE=$(sed -n "$((LINENUM+1)),$((LINENUM+10))p" "$QUEUE_FILE" | grep "Target file" | head -1 | sed 's/.*: //' | tr -d '`')
    
    if [[ -n "$TARGET_FILE" ]] && [[ "$TARGET_FILE" != "New"* ]] && [[ "$TARGET_FILE" != "Unknown"* ]]; then
        # Check if target file exists and might already have the feature
        REAL_PATH=$(eval echo "$TARGET_FILE" 2>/dev/null || echo "")
        if [[ -f "$REAL_PATH" ]]; then
            # This is a potential ghost bug candidate - file exists
            # Would need content analysis to confirm
            :
        fi
    fi
done < <(grep "^### \[" "$QUEUE_FILE" | head -30)

echo -e "${GREEN}Ghost bug detection: Run 'grep' verification before creating entries${NC}"
echo "Rule: If grep FINDS the feature in target file, DO NOT create entry"

# === 5. QUEUE STATISTICS ===
echo -e "\n${BLUE}--- 5. Queue Statistics ---${NC}"

PENDING_COUNT=$(grep -c "^\- \*\*Status:\*\* pending" "$QUEUE_FILE" 2>/dev/null || echo "0")
PAUSED_COUNT=$(grep -c "PAUSED" "$QUEUE_FILE" 2>/dev/null || echo "0")
TOTAL_ENTRIES=$(grep -c "^### \[" "$QUEUE_FILE" 2>/dev/null || echo "0")
ARCHIVE_COUNT=$(grep -c "^### \[" "$ARCHIVE_FILE" 2>/dev/null || echo "0")

echo "Pending:    $PENDING_COUNT"
echo "Paused:     $PAUSED_COUNT"
echo "Total:      $TOTAL_ENTRIES (in main queue)"
echo "Archived:   $ARCHIVE_COUNT"

# === 6. RECOMMENDATIONS ===
echo -e "\n${BLUE}--- 6. Recommendations ---${NC}"

NEEDS_ACTION=false

if [ $RESOLVED_COUNT -gt 0 ]; then
    echo -e "${YELLOW}→ Archive $RESOLVED_COUNT resolved item(s)${NC}"
    NEEDS_ACTION=true
fi

if [ $CANCELLED_COUNT -gt 0 ]; then
    echo -e "${YELLOW}→ Archive cancelled item(s)${NC}"
    NEEDS_ACTION=true
fi

if [ $STALE_COUNT -gt 0 ]; then
    echo -e "${YELLOW}→ Review $STALE_COUNT stale entry/entries - verify still needed${NC}"
    NEEDS_ACTION=true
fi

if [ "$NEEDS_ACTION" = false ]; then
    echo -e "${GREEN}✓ Queue is clean - no action needed${NC}"
fi

# === SUMMARY ===
echo -e "\n=========================================="
echo "CLEANUP SUMMARY"
echo "=========================================="
echo "Resolved to archive: $RESOLVED_COUNT"
echo "Cancelled to archive: $CANCELLED_COUNT"
echo "Stale entries: $STALE_COUNT"

if [ "$AUTO_ARCHIVE" = true ] && [ $RESOLVED_COUNT -gt 0 ]; then
    echo -e "\n${YELLOW}Auto-archive not yet implemented - use Cursor for archiving${NC}"
    echo "Manual command: Ask Cursor to 'archive all resolved items from evolution queue'"
fi

exit 0

#!/bin/bash
# Archive inbound media to Dropbox Steve_Journal
# Run via cron or manually

INBOUND_DIR="$HOME/.clawdbot/media/inbound"
JOURNAL_DIR="$HOME/Library/CloudStorage/Dropbox/Steve_Journal/media"
ARCHIVE_LOG="$HOME/.clawdbot/media/archived.log"

# Create dirs/files if needed
mkdir -p "$JOURNAL_DIR"
touch "$ARCHIVE_LOG"

archived_count=0

# Process each file in inbound
for file in "$INBOUND_DIR"/*; do
    [ -f "$file" ] || continue
    
    filename=$(basename "$file")
    
    # Skip if already archived
    if grep -q "^$filename$" "$ARCHIVE_LOG" 2>/dev/null; then
        continue
    fi
    
    # Get file modification date for folder organization
    if [[ "$OSTYPE" == "darwin"* ]]; then
        file_date=$(stat -f "%Sm" -t "%Y-%m-%d" "$file")
    else
        file_date=$(date -r "$file" "+%Y-%m-%d")
    fi
    
    # Create date folder
    dest_dir="$JOURNAL_DIR/$file_date"
    mkdir -p "$dest_dir"
    
    # Copy file and VERIFY it worked before logging
    if cp "$file" "$dest_dir/" && [ -f "$dest_dir/$filename" ]; then
        echo "$filename" >> "$ARCHIVE_LOG"
        ((archived_count++))
    else
        echo "ERROR: Failed to copy $filename" >&2
    fi
done

if [ $archived_count -gt 0 ]; then
    echo "📸 Archived $archived_count media files to Steve_Journal"
else
    # No output = silent ack
    exit 0
fi

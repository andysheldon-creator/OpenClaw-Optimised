#!/bin/bash
# Send a Steve sticker to Telegram
# Usage: send-steve-sticker.sh <emotion> [chat_id]
# Example: send-steve-sticker.sh thumbs_up 1191367022

EMOTION="${1:-thumbs_up}"
CHAT_ID="${2:-1191367022}"
BOT_TOKEN="8508252947:AAGxE1BZgURVe4zsTSUlZ7dn3Hlcl-NUYzY"
STICKER_FILE="/Users/dbhurley/clawd/assets/stickers/steve-telegram-stickers.json"

# Get file_id for the emotion (value is the file_id directly)
FILE_ID=$(jq -r ".stickers.${EMOTION} // empty" "$STICKER_FILE")

if [ -z "$FILE_ID" ]; then
    echo "Unknown emotion: $EMOTION"
    echo "Available: $(jq -r '.stickers | keys | join(", ")' "$STICKER_FILE")"
    exit 1
fi

curl -s -X POST "https://api.telegram.org/bot${BOT_TOKEN}/sendSticker" \
    -d "chat_id=${CHAT_ID}" \
    -d "sticker=${FILE_ID}" | jq -r '.ok'

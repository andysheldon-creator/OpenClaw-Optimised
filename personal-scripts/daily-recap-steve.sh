#!/bin/bash
# Daily recap with Steve posterboard image

export GEMINI_API_KEY="AIzaSyAHB0Uo-OkqcxV_c_Cp4iJaZ3e02-sc_7c"

MEMORY_FILE="/Users/steve/clawd/memory/$(date +%Y-%m-%d).md"
DATE=$(date +%Y%m%d)
OUTPUT="/tmp/steve-recap-$DATE.png"
STEVE_REF="/Users/steve/clawd/assets/steve-full.jpg"

# Check if today's memory file exists and has content
if [ ! -f "$MEMORY_FILE" ] || [ ! -s "$MEMORY_FILE" ]; then
    echo "HEARTBEAT_OK"
    exit 0
fi

# Extract summary from memory file (first 500 chars after the date header)
SUMMARY=$(tail -n +2 "$MEMORY_FILE" | head -c 500 | tr '\n' ' ')

if [ -z "$SUMMARY" ]; then
    echo "HEARTBEAT_OK"
    exit 0
fi

# Generate Steve posterboard image using reference
uv run /Users/steve/clawd/skills/nano-banana-pro/scripts/generate_image.py \
  --input-image "$STEVE_REF" \
  --prompt "Transform this character into a scene: Steve the wolf holding a posterboard showing today's accomplishments, office background, proud expression, 3D Pixar-style" \
  --filename "$OUTPUT" > /dev/null 2>&1

# Output result
if [ -f "$OUTPUT" ]; then
  echo "🐺📋 Daily Recap"
  echo "MEDIA:$OUTPUT"
else
  echo "🐺📋 Daily Recap (no image)"
fi

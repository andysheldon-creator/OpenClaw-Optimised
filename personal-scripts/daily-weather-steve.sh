#!/bin/bash
# Daily weather greeting with Steve image

export GEMINI_API_KEY="AIzaSyAHB0Uo-OkqcxV_c_Cp4iJaZ3e02-sc_7c"

STEVE_REF="/Users/steve/clawd/assets/steve-full.jpg"
DATE=$(date +%Y%m%d)
OUTPUT="/tmp/steve-weather-$DATE.png"

# Step 1: Get weather (Fahrenheit)
WEATHER=$(curl -s "wttr.in/Lexington+MA?format=%C+%t&u")

# Step 2: Generate Steve image using reference
uv run /Users/steve/clawd/skills/nano-banana-pro/scripts/generate_image.py \
  --input-image "$STEVE_REF" \
  --prompt "Transform this character into a scene: Steve the wolf standing outside in $WEATHER weather conditions, morning light, friendly welcoming expression, 3D Pixar-style" \
  --filename "$OUTPUT" > /dev/null 2>&1

# Step 3: Output clean result
if [ -f "$OUTPUT" ]; then
  echo "🌤️ Good morning! $WEATHER in Lexington"
  echo "MEDIA:$OUTPUT"
else
  echo "🌤️ Good morning! $WEATHER in Lexington"
fi

#!/bin/bash
# Daily weather greeting with Steve image

STEVE_REF="/Users/steve/clawd/assets/steve-full.jpg"
OUTPUT="/tmp/steve-weather-$(date +%Y%m%d).png"

# Step 1: Fetch raw JSON
RAW_JSON=$(curl -s "https://api.open-meteo.com/v1/forecast?latitude=42.450055&longitude=-71.221305&daily=temperature_2m_min,temperature_2m_max,sunrise,sunset,rain_sum,weather_code&hourly=temperature_2m&current=temperature_2m,precipitation,wind_speed_10m&timezone=America%2FNew_York&forecast_days=1&wind_speed_unit=mph&temperature_unit=fahrenheit&precipitation_unit=inch")

# Step 2: Parse Data & Generate Art Direction with jq
# We capture ALL output into one variable first to avoid 'read' errors
COMBINED_OUTPUT=$(echo "$RAW_JSON" | jq -r '
  .current as $curr |
  .daily as $day |
  ($day.weather_code[0] | tostring) as $code_idx |

  # --- MAP: WEATHER CODES TO ENGLISH ---
  {
    "0": "Clear Sky", "1": "Mainly Clear", "2": "Partly Cloudy", "3": "Overcast",
    "45": "Fog", "48": "Rime Fog",
    "51": "Light Drizzle", "53": "Moderate Drizzle", "55": "Dense Drizzle",
    "61": "Slight Rain", "63": "Moderate Rain", "65": "Heavy Rain",
    "71": "Snow", "73": "Snow", "75": "Heavy Snow",
    "80": "Rain Showers", "95": "Thunderstorm"
  } as $codes |
  
  ($codes[$code_idx] // "Unknown") as $condition_text |

  # --- LOGIC: CREATE VISUAL ATMOSPHERE ---
  
  # 1. Temperature Visuals
  (if $curr.temperature_2m < 45 then "steam rising visibly from the hot coffee cup, visible frosty breath, cozy atmosphere"
   elif $curr.temperature_2m > 80 then "bright heat haze, sun flare, condensation on the cup"
   else "steam gently rising from the coffee" end) as $temp_viz |

  # 2. Weather Condition Visuals (Lighting & Texture)
  (if $code_idx == "0" or $code_idx == "1" then "bathed in warm golden morning sunlight, casting long dramatic shadows, vibrant colors"
   elif $code_idx == "2" or $code_idx == "3" then "soft diffused lighting from overhead clouds, no harsh shadows, balanced exposure"
   elif ($code_idx | tonumber) >= 51 and ($code_idx | tonumber) <= 67 then "glossy wet ground reflections, raindrops falling, damp fur texture"
   elif ($code_idx | tonumber) >= 71 and ($code_idx | tonumber) <= 77 then "soft snowflakes resting on his fur and hoodie, snowy background, magical winter atmosphere"
   elif ($code_idx | tonumber) >= 95 then "dramatic dark storm clouds in background, cinematic lighting"
   else "outdoor morning lighting" end) as $weather_viz |

  # 3. Wind Visuals
  (if $curr.wind_speed_10m > 12 then "fur and hoodie strings blowing in the wind"
   else "still air" end) as $wind_viz |

  # --- OUTPUTS ---
  
  # Output 1: The Human Readable Report (Lines 1-4)
  "Condition:    \($condition_text)
Current Temp: \($curr.temperature_2m)°F
High/Low:     \($day.temperature_2m_max[0])°F / \($day.temperature_2m_min[0])°F
Rain Today:   \($day.rain_sum[0]) in",

  # Output 2: The Art Prompt (The very last line)
  "\($weather_viz), \($temp_viz), \($wind_viz)"
')

# Step 3: Separate the Prompt from the Text
# extract the last line for the prompt
REAL_PROMPT=$(echo "$COMBINED_OUTPUT" | tail -n 1)
# extract everything EXCEPT the last line for the report
TEXT_REPORT=$(echo "$COMBINED_OUTPUT" | sed '$d')

# Step 4: Generate Image
uv run /Users/steve/clawd/skills/nano-banana-pro/scripts/generate_image.py \
  --input-image "$STEVE_REF" \
  --prompt "Transform this character into a scene: Steve, the fox with taupe fur, somewhat brownish and somewhat grayish. He has no tail, and blue eyes that perfectly match the color of his blue hoodie. He wears cargo khakis if you can see his legs. Use the reference image. He is sitting outside in Lexington, MA. The scene features: $REAL_PROMPT. It is early morning. He has a friendly welcoming expression and pose, holding a cup of coffee, 3D Pixar-style." \
  --filename "$OUTPUT" > /dev/null 2>&1

# Step 5: Final Output
if [ -f "$OUTPUT" ]; then
  echo "🌤️ Good morning! Here is your weather for Lexington:"
  echo "$TEXT_REPORT"
  echo "MEDIA:$OUTPUT"
else
  echo "🌤️ Good morning! Here is your weather for Lexington:"
  echo "$TEXT_REPORT" 
  echo "(Image generation failed)"
fi
#!/bin/bash

# Get the daily verse
VERSE_OUTPUT=$(/usr/bin/python3 /Users/dbhurley/clawd/scripts/daily-verse.py)

# Send via WhatsApp through sessions (this assumes a session is running)
# Alternative: could use curl to hit Clawdis API directly
echo "SEND_DAILY_VERSE: $VERSE_OUTPUT" >> /Users/dbhurley/clawd/logs/daily-verse.log

# For now, just log it - we'll integrate with the heartbeat system
echo "$(date): Daily verse ready" >> /Users/dbhurley/clawd/logs/daily-verse.log
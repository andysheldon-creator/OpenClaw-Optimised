#!/usr/bin/env python3
import json
import subprocess
import sys

def get_daily_verse():
    try:
        result = subprocess.run([
            'python3', 
            '/Users/dbhurley/clawd/skills/bible/votd.py'
        ], capture_output=True, text=True, check=True)
        
        verse_data = json.loads(result.stdout)
        
        # Format as requested: reference, text, image (no headers, no attribution)
        message = f"**{verse_data['reference']}**\n\n*\"{verse_data['text']}\"*\n\nMEDIA:{verse_data['image_url']}"
        
        return message
        
    except Exception as e:
        return f"Error getting daily verse: {str(e)}"

if __name__ == "__main__":
    print(get_daily_verse())
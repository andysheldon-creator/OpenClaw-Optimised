#!/usr/bin/env python3
"""
Setup script for ppl.gift CRM skill

This script helps configure API credentials and tests the connection.
"""

import os
import sys
import json
import requests


def get_ppl_credentials():
    """Read ppl.gift credentials from clawdbot.json config"""
    try:
        config_path = os.path.expanduser('~/.clawdbot/clawdbot.json')
        if os.path.exists(config_path):
            with open(config_path, 'r') as f:
                config = json.load(f)
                skills = config.get('skills', {}).get('entries', {})
                ppl_config = skills.get('ppl', {}).get('env', {})
                
                api_url = ppl_config.get('PPL_API_URL', 'https://ppl.gift/api')
                api_token = ppl_config.get('PPL_API_TOKEN')
                
                return api_url, api_token
    except Exception as e:
        print(f"Warning: Could not read config from clawdbot.json: {e}")
    
    # Fallback to environment variables
    return os.getenv('PPL_API_URL', 'https://ppl.gift/api'), os.getenv('PPL_API_TOKEN')

def main():
    print("=" * 60)
    print("ppl.gift CRM Skill Setup")
    print("=" * 60)
    print()
    
    # Check if API credentials exist
    api_url, api_token = get_ppl_credentials()
    
    print(f"API URL: {api_url}")
    print(f"API Token: {'Set' if api_token else 'Not set'}")
    print()
    
    if not api_token:
        print("❌ PPL_API_TOKEN environment variable is required")
        print()
        print("To get your API token:")
        print("1. Go to https://ppl.gift/settings")
        print("2. Navigate to 'API Tokens'")
        print("3. Create a new token")
        print("4. Copy the token and set it as an environment variable:")
        print()
        print("export PPL_API_TOKEN='your-token-here'")
        print()
        print("Or add to your ~/.bashrc or ~/.zshrc:")
        print("export PPL_API_URL='https://ppl.gift/api'")
        print("export PPL_API_TOKEN='your-token-here'")
        return False
    
    # Test connection
    print("Testing API connection...")
    try:
        headers = {
            'Authorization': f'Bearer {api_token}',
            'Content-Type': 'application/json'
        }
        resp = requests.get(f'{api_url}/contacts?limit=1', headers=headers, timeout=10)
        
        if resp.status_code == 200:
            print("✅ API connection successful!")
            data = resp.json()
            contacts_count = data.get('total', 0)
            print(f"📊 Found {contacts_count} contacts in your CRM")
            return True
        else:
            print(f"❌ API connection failed: {resp.status_code}")
            print(f"Response: {resp.text}")
            return False
            
    except Exception as e:
        print(f"❌ Connection error: {str(e)}")
        return False


if __name__ == '__main__':
    success = main()
    sys.exit(0 if success else 1)
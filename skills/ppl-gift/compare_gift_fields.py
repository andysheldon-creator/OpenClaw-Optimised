#!/usr/bin/env python3
import sys
sys.path.append('/Users/steve/clawd/skills/ppl-gift')
from scripts.ppl import get_ppl_credentials, PPLGiftAPI

api_url, api_token = get_ppl_credentials()
api = PPLGiftAPI(api_url, api_token)

# Compare both gifts
gift_ids = [5513, 5528]  # Soft flannel (showing), Designer belt (not showing)

for gift_id in gift_ids:
    print(f"\n📋 GIFT ID {gift_id} ({'SHOWING' if gift_id == 5513 else 'NOT SHOWING'}):")
    print("=" * 50)
    try:
        result = api._request('GET', f'gifts/{gift_id}')
        if 'data' in result:
            gift = result['data']
            
            # Print all fields
            print("ALL FIELDS:")
            for key, value in gift.items():
                if isinstance(value, dict):
                    print(f"   {key}: {value}")
                else:
                    print(f"   {key}: {value}")
                    
            # Check specific relationship fields
            print(f"\nKEY RELATIONSHIPS:")
            print(f"   contact: {gift.get('contact', 'MISSING')}")
            print(f"   recipient: {gift.get('recipient', 'MISSING')}")
        else:
            print(f"   ❌ Gift not found")
    except Exception as e:
        print(f"   ❌ Error: {e}")

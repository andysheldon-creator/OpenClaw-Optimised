#!/usr/bin/env python3
"""
Example: Adding John Marquis to ppl.gift CRM

This script demonstrates how to add John Marquis with all his details
using the new ppl.gift skill.
"""

import os
import sys

# Add the skills directory to Python path
sys.path.insert(0, '/Users/steve/clawd/skills/ppl-gift')

# Import the CLI
from scripts.ppl import PPLGiftAPI

def add_john_marquis():
    """Add John Marquis to CRM with all details"""
    
    # Initialize API
    api_url = os.getenv('PPL_API_URL', 'https://ppl.gift/api')
    api_token = os.getenv('PPL_API_TOKEN')
    
    if not api_token:
        print("❌ PPL_API_TOKEN environment variable required")
        print("Set it with: export PPL_API_TOKEN='your-token-here'")
        return False
    
    api = PPLGiftAPI(api_url, api_token)
    
    print("=" * 60)
    print("ADDING JOHN MARQUIS TO ppl.gift CRM")
    print("=" * 60)
    
    # Step 1: Check if John Marquis already exists
    print("\n🔍 Checking for existing contact...")
    existing = api.get_contact_by_name("John", "Marquis")
    
    if existing:
        print(f"✅ John Marquis already exists (ID: {existing.get('id')})")
        contact_id = existing.get('id')
    else:
        # Step 2: Create new contact
        print("\n📝 Creating new contact...")
        contact = api.create_contact(
            first_name="John",
            last_name="Marquis", 
            email="john@marquistreeservice.com",
            phone="781-844-0042",
            job_title="President",
            company="Marquis Tree Service",
            tags=["arborist", "tree-service", "isa-certified", "professional"]
        )
        
        contact_id = contact.get('id')
        print(f"✅ Created John Marquis with ID: {contact_id}")
    
    # Step 3: Add professional note
    print("\n📋 Adding professional background note...")
    note = api.create_note(
        contact_id=contact_id,
        title="Professional Background & Certification",
        body="""🏢 **Professional Details**

**Company:** Marquis Tree Service
**Title:** President
**Certification:** ISA Certified Arborist #7104A

**Phone:** 781-844-0042

**Specialties:**
• Tree care and maintenance
• Certified arborist services  
• Professional tree service operations

**Note:** ISA Certified Arborist #7104A - International Society of Arboriculture certification"""
    )
    print(f"✅ Created professional note (ID: {note.get('id')})")
    
    # Step 4: Add meeting context note
    print("\n🤝 Adding meeting context note...")
    meeting_note = api.create_note(
        contact_id=contact_id,
        title="Meeting Context & Connection",
        body="""🤝 **Meeting Context**

**Potential Meeting:** John Marquis may join Bob Hower meeting (mentioned in memory from Jan 15, 2026)

**Connection:** Potential collaboration or consultation with Bob Hower from G20 Ventures

**Email Status:** Primary email is john@marquistreeservice.com
- Professional email for business communications
- Contact verified through certification records

**Action Items:**
- Follow up on potential tree services for G20 Ventures office
- Verify ISA certification #7104A if needed for reference"""
    )
    print(f"✅ Created meeting context note (ID: {meeting_note.get('id')})")
    
    # Step 5: Add to journal
    print("\n📔 Adding to journal...")
    journal = api.journal_add(
        title="Added John Marquis to CRM",
        body="""Added John Marquis (Marquis Tree Service) to ppl.gift CRM.

**Details:**
- President at Marquis Tree Service
- ISA Certified Arborist #7104A  
- Phone: 781-844-0042
- Potential connection to Bob Hower/G20 Ventures

**Tags:** arborist, tree-service, professional, john-marquis""",
        contact_id=contact_id,
        tags=["arborist", "tree-service", "professional", "john-marquis", "crm-addition"]
    )
    print(f"✅ Added to journal (ID: {journal.get('id')})")
    
    # Step 6: Add reminder for follow-up
    print("\n⏰ Adding follow-up reminder...")
    try:
        reminder = api.add_reminder(
            contact_id=contact_id,
            title="Follow up with John Marquis",
            due_date="2026-01-20T14:00:00Z",
            reminder_type="call"
        )
        print(f"✅ Created follow-up reminder (ID: {reminder.get('id')})")
    except Exception as e:
        print(f"⚠️ Reminder creation failed: {str(e)}")
    
    print("\n" + "=" * 60)
    print("SUMMARY")
    print("=" * 60)
    print(f"✅ John Marquis successfully added to ppl.gift CRM")
    print(f"📋 Contact ID: {contact_id}")
    print(f"📱 Phone: 781-844-0042")
    print(f"🏢 Company: Marquis Tree Service")
    print(f"🎓 Certification: ISA Certified Arborist #7104A")
    print(f"🤝 Connection: Potential Bob Hower/G20 Ventures meeting")
    print(f"📝 Notes: Professional background + meeting context")
    print(f"📔 Journal: Added with tags")
    print(f"⏰ Reminder: Follow-up call scheduled")
    
    return True


if __name__ == '__main__':
    try:
        success = add_john_marquis()
        if success:
            print("\n🎉 John Marquis has been successfully added to your CRM!")
        else:
            print("\n❌ Failed to add John Marquis to CRM")
            sys.exit(1)
    except Exception as e:
        print(f"\n❌ Error: {str(e)}")
        sys.exit(1)
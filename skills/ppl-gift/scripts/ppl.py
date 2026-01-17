#!/usr/bin/env python3
"""
ppl.gift CRM CLI - Comprehensive contact and relationship management

Usage:
    ppl.py search "john marquis"
    ppl.py create-contact "John Marquis" --first-name "John" --last-name "Marquis" --email "john@example.com"
    ppl.py add-note "contact-id" --title "Meeting Notes" --body "Detailed notes here"
    ppl.py journal-add --title "Daily Log" --body "What happened today"
"""

import argparse
import json
import os
import sys
import requests
from datetime import datetime
from typing import Dict, List, Optional, Any
from pathlib import Path

# Configuration - Read from clawdbot.json config
import json

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

PPL_API_URL, PPL_API_TOKEN = get_ppl_credentials()

class PPLGiftAPI:
    """ppl.gift API client with comprehensive CRM functionality"""
    
    def __init__(self, api_url: str, api_token: str):
        self.api_url = api_url.rstrip('/')
        self.headers = {
            'Authorization': f'Bearer {api_token}',
            'Content-Type': 'application/json'
        }
    
    def _request(self, method: str, endpoint: str, data: dict = None) -> dict:
        """Make API request with error handling"""
        url = f'{self.api_url}/{endpoint}'
        try:
            resp = requests.request(method, url, headers=self.headers, json=data, timeout=30)
            if resp.status_code >= 400:
                error_msg = f"API error {resp.status_code}: {resp.text}"
                raise Exception(error_msg)
            return resp.json() if resp.text else {}
        except requests.RequestException as e:
            raise Exception(f"Request failed: {str(e)}")
    
    # Contact Management
    def search_contacts(self, query: str = None, email: str = None) -> List[Dict]:
        """Search for contacts by name or email"""
        if email:
            resp = self._request('GET', f'contacts?query={requests.utils.quote(email)}')
        elif query:
            resp = self._request('GET', f'contacts?query={requests.utils.quote(query)}')
        else:
            resp = self._request('GET', 'contacts')
        return resp.get('data', [])
    
    def get_contact_by_name(self, first_name: str, last_name: str) -> Optional[Dict]:
        """Get contact by exact name match"""
        contacts = self.search_contacts(f'{first_name} {last_name}')
        for contact in contacts:
            if (contact.get('first_name', '').lower() == first_name.lower() and 
                contact.get('last_name', '').lower() == last_name.lower()):
                return contact
        return None
    
    def create_contact(self, first_name: str, last_name: str, email: str = None, 
                     phone: str = None, job_title: str = "", company: str = "", 
                     tags: List[str] = None) -> Dict:
        """Create new contact with all fields"""
        data = {
            'first_name': first_name,
            'last_name': last_name,
            'job_title': job_title,
            'company': company,
            'is_birthdate_known': False,
            'is_deceased': False,
            'is_deceased_date_known': False
        }
        
        if email:
            data['emails'] = [{'type': 'work', 'name': email, 'address': email}]
        if phone:
            data['phones'] = [{'type': 'mobile', 'name': phone, 'address': phone}]
        if tags:
            data['tags'] = tags
            
        resp = self._request('POST', 'contacts', data)
        return resp.get('data', {})
    
    def update_contact(self, contact_id: str, **kwargs) -> Dict:
        """Update contact with provided fields"""
        data = {
            'is_birthdate_known': False,
            'is_deceased': False,
            'is_deceased_date_known': False,
            **kwargs
        }
        resp = self._request('PUT', f'contacts/{contact_id}', data)
        return resp.get('data', {})
    
    # Notes & Activities
    def create_note(self, contact_id: str, title: str, body: str) -> Dict:
        """Create note for contact"""
        data = {
            'contact_id': contact_id,
            'title': title,
            'body': body
        }
        resp = self._request('POST', 'notes', data)
        return resp.get('data', {})
    
    def create_activity(self, contact_id: str, summary: str, description: str = "", 
                       activity_type: str = "meeting") -> Dict:
        """Create activity for contact"""
        data = {
            'contact_id': contact_id,
            'summary': summary,
            'description': description,
            'type': activity_type
        }
        resp = self._request('POST', 'activities', data)
        return resp.get('data', {})
    
    # Communication
    def add_phone(self, contact_id: str, number: str, phone_type: str = "mobile") -> Dict:
        """Add phone number to contact"""
        data = {
            'contact_id': contact_id,
            'type': phone_type,
            'name': number,
            'address': number
        }
        resp = self._request('POST', 'contactphones', data)
        return resp.get('data', {})
    
    def add_email(self, contact_id: str, email: str, email_type: str = "work") -> Dict:
        """Add email to contact"""
        data = {
            'contact_id': contact_id,
            'type': email_type,
            'name': email,
            'address': email
        }
        resp = self._request('POST', 'contactemails', data)
        return resp.get('data', {})
    
    # Relationships
    def add_relationship(self, contact_id: str, related_contact_id: str, 
                         relationship_type: str = "friend", note: str = "") -> Dict:
        """Add relationship between contacts"""
        data = {
            'contact_id': contact_id,
            'related_contact_id': related_contact_id,
            'relationship_type_id': relationship_type,
            'note': note
        }
        resp = self._request('POST', 'relationships', data)
        return resp.get('data', {})
    
    # Journal
    def journal_add(self, title: str, body: str, contact_id: str = None, 
                   tags: List[str] = None) -> Dict:
        """Add journal entry"""
        data = {
            'title': title,
            'body': body,
            'account': 'journal'
        }
        if contact_id:
            data['contact_id'] = contact_id
        if tags:
            data['tags'] = tags
            
        resp = self._request('POST', 'journal', data)
        return resp.get('data', {})
    
    def journal_list(self, limit: int = 10) -> List[Dict]:
        """List journal entries"""
        resp = self._request('GET', f'journal?limit={limit}')
        return resp.get('data', [])
    
    def journal_search(self, query: str) -> List[Dict]:
        """Search journal entries"""
        resp = self._request('GET', f'journal?query={requests.utils.quote(query)}')
        return resp.get('data', [])
    
    # Reminders & Tasks
    def add_reminder(self, contact_id: str, title: str, due_date: str, 
                    reminder_type: str = "call") -> Dict:
        """Add reminder for contact"""
        data = {
            'contact_id': contact_id,
            'title': title,
            'due_date': due_date,
            'type': reminder_type
        }
        resp = self._request('POST', 'reminders', data)
        return resp.get('data', {})
    
    def add_task(self, contact_id: str, title: str, description: str = "", 
                due_date: str = None) -> Dict:
        """Add task for contact"""
        data = {
            'contact_id': contact_id,
            'title': title,
            'description': description
        }
        if due_date:
            data['due_date'] = due_date
            
        resp = self._request('POST', 'tasks', data)
        return resp.get('data', {})
    
    # Gifts & Special Dates
    def add_gift(self, contact_id: str, title: str, description: str = "", 
                url: str = None, price: str = None) -> Dict:
        """Add gift idea for contact"""
        data = {
            'contact_id': contact_id,
            'title': title,
            'description': description
        }
        if url:
            data['url'] = url
        if price:
            data['price'] = price
            
        resp = self._request('POST', 'gifts', data)
        return resp.get('data', {})
    
    def add_date(self, contact_id: str, date_type: str, date_value: str, 
                label: str = "") -> Dict:
        """Add important date for contact"""
        data = {
            'contact_id': contact_id,
            'type': date_type,
            'date': date_value,
            'label': label
        }
        resp = self._request('POST', 'dates', data)
        return resp.get('data', {})
    
    # Companies
    def create_company(self, name: str, description: str = "", 
                     website: str = None) -> Dict:
        """Create company"""
        data = {
            'name': name,
            'description': description
        }
        if website:
            data['website'] = website
            
        resp = self._request('POST', 'companies', data)
        return resp.get('data', {})
    
    def search_companies(self, query: str = None) -> List[Dict]:
        """Search companies"""
        if query:
            resp = self._request('GET', f'companies?query={requests.utils.quote(query)}')
        else:
            resp = self._request('GET', 'companies')
        return resp.get('data', [])
    
    # Groups
    def create_group(self, name: str, description: str = "", 
                   group_type: str = "family") -> Dict:
        """Create group"""
        data = {
            'name': name,
            'description': description,
            'type': group_type
        }
        resp = self._request('POST', 'groups', data)
        return resp.get('data', {})
    
    def search_groups(self, query: str = None) -> List[Dict]:
        """Search groups"""
        if query:
            resp = self._request('GET', f'groups?query={requests.utils.quote(query)}')
        else:
            resp = self._request('GET', 'groups')
        return resp.get('data', [])
    
    # Gifts
    def search_gifts(self, contact_id: str = None, query: str = None) -> List[Dict]:
        """Search gifts for contact with proper pagination"""
        if contact_id:
            # Get all gifts and filter by contact (better than using contact_id filter)
            resp = self._request('GET', 'gifts?limit=100')
            all_gifts = resp.get('data', [])
            return [gift for gift in all_gifts if gift.get('contact', {}).get('id') == int(contact_id)]
        elif query:
            resp = self._request('GET', f'gifts?query={requests.utils.quote(query)}&limit=100')
        else:
            resp = self._request('GET', 'gifts?limit=100')
        return resp.get('data', [])
    
    # Calls
    def log_call(self, contact_id: str, summary: str, duration_minutes: int = None, 
                call_type: str = "received") -> Dict:
        """Log call with contact"""
        data = {
            'contact_id': contact_id,
            'summary': summary,
            'called_at': datetime.now().isoformat(),
            'type': call_type
        }
        if duration_minutes:
            data['duration_in_minutes'] = duration_minutes
            
        resp = self._request('POST', 'calls', data)
        return resp.get('data', {})
    
    # Photos
    def upload_photo(self, contact_id: str, photo_url: str, 
                    description: str = "", photo_type: str = "avatar") -> Dict:
        """Upload photo for contact"""
        data = {
            'contact_id': contact_id,
            'url': photo_url,
            'description': description,
            'type': photo_type
        }
        resp = self._request('POST', 'photos', data)
        return resp.get('data', {})
    
    # Tags
    def create_tag(self, name: str, description: str = "", 
                  tag_type: str = "person") -> Dict:
        """Create tag"""
        data = {
            'name': name,
            'description': description,
            'type': tag_type
        }
        resp = self._request('POST', 'tags', data)
        return resp.get('data', {})
    
    def search_tags(self, query: str = None) -> List[Dict]:
        """Search tags"""
        if query:
            resp = self._request('GET', f'tags?query={requests.utils.quote(query)}')
        else:
            resp = self._request('GET', 'tags')
        return resp.get('data', [])
    
    # Conversations
    def create_conversation(self, contact_id: str, content: str, 
                          conversation_type: str = "email") -> Dict:
        """Create conversation"""
        data = {
            'contact_id': contact_id,
            'content': content,
            'type': conversation_type,
            'created_at': datetime.now().isoformat()
        }
        resp = self._request('POST', 'conversations', data)
        return resp.get('data', {})
    
    def search_conversations(self, query: str = None) -> List[Dict]:
        """Search conversations"""
        if query:
            resp = self._request('GET', f'conversations?query={requests.utils.quote(query)}')
        else:
            resp = self._request('GET', 'conversations')
        return resp.get('data', [])
    
    # Documents
    def upload_document(self, contact_id: str, file_url: str, 
                      filename: str, description: str = "", 
                      document_type: str = "contract") -> Dict:
        """Upload document for contact"""
        data = {
            'contact_id': contact_id,
            'original_filename': filename,
            'url': file_url,
            'description': description,
            'type': document_type
        }
        resp = self._request('POST', 'documents', data)
        return resp.get('data', {})
    
    # Locations
    def add_location(self, contact_id: str, address: str, 
                   location_type: str = "home") -> Dict:
        """Add location for contact"""
        data = {
            'contact_id': contact_id,
            'name': address,
            'address': address,
            'type': location_type
        }
        resp = self._request('POST', 'addresses', data)
        return resp.get('data', {})
    
    # Genders
    def get_genders(self) -> List[Dict]:
        """Get available genders"""
        resp = self._request('GET', 'genders')
        return resp.get('data', [])
    
    # Address Book
    def sync_address_book(self, contacts: List[Dict]) -> Dict:
        """Sync external contacts to address book"""
        data = {
            'contacts': contacts
        }
        resp = self._request('POST', 'addressbooks', data)
        return resp.get('data', {})
    
    # Occupations
    def search_occupations(self, query: str = None) -> List[Dict]:
        """Search occupations"""
        if query:
            resp = self._request('GET', f'occupations?query={requests.utils.quote(query)}')
        else:
            resp = self._request('GET', 'occupations')
        return resp.get('data', [])


class PPLGiftCLI:
    """Command-line interface for ppl.gift CRM"""
    
    def __init__(self):
        if not PPL_API_TOKEN:
            print("Error: PPL_API_TOKEN environment variable required")
            sys.exit(1)
        
        self.api = PPLGiftAPI(PPL_API_URL, PPL_API_TOKEN)
    
    def search(self, args):
        """Search contacts"""
        query = args.query
        email = args.email
        
        if email:
            contacts = self.api.search_contacts(email=email)
        else:
            contacts = self.api.search_contacts(query=query)
        
        if not contacts:
            print(f"No contacts found for query: {query or email}")
            return
        
        print(f"Found {len(contacts)} contact(s):")
        print()
        
        for contact in contacts:
            name = f"{contact.get('first_name', '')} {contact.get('last_name', '')}"
            company = contact.get('company', 'N/A')
            job_title = contact.get('job_title', 'N/A')
            
            print(f"📇 {name}")
            print(f"   Company: {company}")
            print(f"   Title: {job_title}")
            
            # Show phones and emails if available
            information = contact.get('information', {})
            if 'phone_numbers' in information:
                phones = information['phone_numbers']
                if phones:
                    print(f"   Phone: {phones[0].get('address', 'N/A')}")
            
            if 'email_addresses' in information:
                emails = information['email_addresses']
                if emails:
                    print(f"   Email: {emails[0].get('address', 'N/A')}")
            
            # Show tags
            tags = contact.get('tags', [])
            if tags:
                # Handle tags that might be objects or strings
                tag_list = ', '.join([str(tag) if isinstance(tag, str) else tag.get('name', str(tag)) for tag in tags])
                print(f"   Tags: {tag_list}")
            
            print()
    
    def create_contact(self, args):
        """Create new contact"""
        first_name = args.first_name
        last_name = args.last_name
        full_name = f"{first_name} {last_name}"
        
        # Check for existing contact
        existing = self.api.get_contact_by_name(first_name, last_name)
        if existing:
            print(f"⚠️ Contact '{full_name}' already exists (ID: {existing.get('id')})")
            print("Use update-contact to modify existing contact")
            return
        
        print(f"Creating contact: {full_name}")
        
        # Parse tags
        tags = args.tags.split(',') if args.tags else []
        
        contact = self.api.create_contact(
            first_name=first_name,
            last_name=last_name,
            email=args.email,
            phone=args.phone,
            job_title=args.job_title,
            company=args.company,
            tags=tags
        )
        
        contact_id = contact.get('id')
        print(f"✅ Created contact with ID: {contact_id}")
        
        # Auto-add to journal
        journal_title = f"Added {full_name} to CRM"
        journal_body = f"New contact created: {args.job_title} at {args.company}"
        if tags:
            journal_body += f". Tags: {', '.join(tags)}"
        
        try:
            self.api.journal_add(journal_title, journal_body, contact_id=contact_id, tags=tags)
            print("✅ Added to journal")
        except Exception as e:
            print(f"⚠️ Journal entry failed: {str(e)}")
    
    def add_note(self, args):
        """Add note to contact"""
        contact_id = args.contact_id
        
        print(f"Adding note to contact {contact_id}")
        print(f"Title: {args.title}")
        print(f"Body: {args.body}")
        
        note = self.api.create_note(contact_id, args.title, args.body)
        note_id = note.get('id')
        print(f"✅ Created note with ID: {note_id}")
    
    def add_phone(self, args):
        """Add phone number to contact"""
        contact_id = args.contact_id
        number = args.number
        phone_type = args.type
        
        print(f"Adding phone {number} to contact {contact_id}")
        print(f"Type: {phone_type}")
        
        phone = self.api.add_phone(contact_id, number, phone_type)
        phone_id = phone.get('id')
        print(f"✅ Added phone with ID: {phone_id}")
    
    def add_email(self, args):
        """Add email to contact"""
        contact_id = args.contact_id
        email = args.email
        email_type = args.type
        
        print(f"Adding email {email} to contact {contact_id}")
        print(f"Type: {email_type}")
        
        email_result = self.api.add_email(contact_id, email, email_type)
        email_id = email_result.get('id')
        print(f"✅ Added email with ID: {email_id}")
    
    def create_company(self, args):
        """Create company"""
        name = args.name
        description = args.description or ""
        website = args.website
        
        print(f"Creating company: {name}")
        
        company = self.api.create_company(name, description, website)
        company_id = company.get('id')
        print(f"✅ Created company with ID: {company_id}")
    
    def create_group(self, args):
        """Create group"""
        name = args.name
        description = args.description or ""
        group_type = args.type
        
        print(f"Creating group: {name}")
        print(f"Type: {group_type}")
        
        group = self.api.create_group(name, description, group_type)
        group_id = group.get('id')
        print(f"✅ Created group with ID: {group_id}")
    
    def log_call(self, args):
        """Log call with contact"""
        contact_id = args.contact_id
        summary = args.summary
        duration = args.duration
        call_type = args.type
        
        print(f"Logging call with contact {contact_id}")
        print(f"Summary: {summary}")
        print(f"Type: {call_type}")
        if duration:
            print(f"Duration: {duration} minutes")
        
        call = self.api.log_call(contact_id, summary, duration, call_type)
        call_id = call.get('id')
        print(f"✅ Logged call with ID: {call_id}")
    
    def upload_photo(self, args):
        """Upload photo for contact"""
        contact_id = args.contact_id
        photo_url = args.photo_url
        description = args.description or ""
        photo_type = args.type
        
        print(f"Uploading photo for contact {contact_id}")
        print(f"Photo URL: {photo_url}")
        print(f"Type: {photo_type}")
        
        photo = self.api.upload_photo(contact_id, photo_url, description, photo_type)
        photo_id = photo.get('id')
        print(f"✅ Uploaded photo with ID: {photo_id}")
    
    def create_tag(self, args):
        """Create tag"""
        name = args.name
        description = args.description or ""
        tag_type = args.type
        
        print(f"Creating tag: {name}")
        print(f"Type: {tag_type}")
        
        tag = self.api.create_tag(name, description, tag_type)
        tag_id = tag.get('id')
        print(f"✅ Created tag with ID: {tag_id}")
    
    def create_conversation(self, args):
        """Create conversation"""
        contact_id = args.contact_id
        content = args.content
        conversation_type = args.type
        
        print(f"Creating conversation with contact {contact_id}")
        print(f"Type: {conversation_type}")
        print(f"Content: {content}")
        
        conversation = self.api.create_conversation(contact_id, content, conversation_type)
        conversation_id = conversation.get('id')
        print(f"✅ Created conversation with ID: {conversation_id}")
    
    def upload_document(self, args):
        """Upload document for contact"""
        contact_id = args.contact_id
        file_url = args.file_url
        filename = args.filename
        description = args.description or ""
        document_type = args.type
        
        print(f"Uploading document for contact {contact_id}")
        print(f"File: {filename}")
        print(f"Type: {document_type}")
        
        document = self.api.upload_document(contact_id, file_url, filename, description, document_type)
        document_id = document.get('id')
        print(f"✅ Uploaded document with ID: {document_id}")
    
    def add_location(self, args):
        """Add location for contact"""
        contact_id = args.contact_id
        address = args.address
        location_type = args.type
        
        print(f"Adding location for contact {contact_id}")
        print(f"Address: {address}")
        print(f"Type: {location_type}")
        
        location = self.api.add_location(contact_id, address, location_type)
        location_id = location.get('id')
        print(f"✅ Added location with ID: {location_id}")
    
    def search_companies(self, args):
        """Search companies"""
        query = args.query
        
        companies = self.api.search_companies(query)
        
        if not companies:
            print(f"No companies found for query: {query}")
            return
        
        print(f"Found {len(companies)} company(ies):")
        print()
        
        for company in companies:
            name = company.get('name', 'Unknown')
            description = company.get('description', 'No description')
            website = company.get('website', 'No website')
            
            print(f"🏢 {name}")
            print(f"   Description: {description}")
            print(f"   Website: {website}")
            print()
    
    def search_groups(self, args):
        """Search groups"""
        query = args.query
        
        groups = self.api.search_groups(query)
        
        if not groups:
            print(f"No groups found for query: {query}")
            return
        
        print(f"Found {len(groups)} group(s):")
        print()
        
        for group in groups:
            name = group.get('name', 'Unknown')
            description = group.get('description', 'No description')
            group_type = group.get('type', 'unknown')
            
            print(f"👥 {name}")
            print(f"   Type: {group_type}")
            print(f"   Description: {description}")
            print()
    
    def search_tags(self, args):
        """Search tags"""
        query = args.query
        
        tags = self.api.search_tags(query)
        
        if not tags:
            print(f"No tags found for query: {query}")
            return
        
        print(f"Found {len(tags)} tag(s):")
        print()
        
        for tag in tags:
            name = tag.get('name', 'Unknown')
            description = tag.get('description', 'No description')
            tag_type = tag.get('type', 'unknown')
            
            print(f"🏷️ {name}")
            print(f"   Type: {tag_type}")
            print(f"   Description: {description}")
            print()
    
    def journal_add(self, args):
        """Add journal entry"""
        title = args.title
        body = args.body
        
        print(f"Adding journal entry: {title}")
        
        journal_entry = self.api.journal_add(
            title=title,
            body=body,
            contact_id=args.contact_id,
            tags=args.tags.split(',') if args.tags else None
        )
        
        entry_id = journal_entry.get('id')
        print(f"✅ Created journal entry with ID: {entry_id}")
    
    def search_gifts(self, args):
        """Search gifts"""
        contact_id = args.contact_id
        query = args.query
        
        gifts = self.api.search_gifts(contact_id=contact_id, query=query)
        
        if not gifts:
            if contact_id:
                print(f"No gifts found for contact ID: {contact_id}")
            elif query:
                print(f"No gifts found for query: {query}")
            else:
                print("No gifts found")
            return
        
        print(f"Found {len(gifts)} gift(s):")
        print()
        
        # Sort by ID (newest first)
        gifts_sorted = sorted(gifts, key=lambda x: x.get('id', 0), reverse=True)
        
        for gift in gifts_sorted:
            name = gift.get('name', 'Unknown')
            status = gift.get('status', 'Unknown')
            gift_id = gift.get('id', 'Unknown ID')
            contact = gift.get('contact', {})
            contact_name = f"{contact.get('first_name', '')} {contact.get('last_name', '')}".strip()
            
            status_emoji = '💡' if status == 'idea' else '✅'
            
            print(f"{status_emoji} {name}")
            print(f"   ID: {gift_id}")
            print(f"   Contact: {contact_name}")
            print(f"   Status: {status.title()}")
            print()


def main():
    """Main CLI entry point"""
    parser = argparse.ArgumentParser(
        description="ppl.gift CRM CLI - Comprehensive contact management",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  # Search contacts
  ppl.py search "john marquis"
  ppl.py search --email "john@example.com"
  
  # Create contact
  ppl.py create-contact "John Marquis" --first-name "John" --last-name "Marquis" \\
    --email "john@example.com" --phone "781-844-0042" --job-title "President" \\
    --company "Marquis Tree Service" --tags "arborist,tree-service"
  
  # Add note
  ppl.py add-note "contact-id" --title "Meeting Notes" --body "Discussion about tree services"
  
  # Journal entry
  ppl.py journal-add --title "Daily Log" --body "What happened today" --tags "daily,work"
        """
    )
    
    subparsers = parser.add_subparsers(dest='command', help='Available commands')
    
    # Search command
    search_parser = subparsers.add_parser('search', help='Search contacts')
    search_group = search_parser.add_mutually_exclusive_group(required=True)
    search_group.add_argument('query', nargs='?', help='Name search query')
    search_group.add_argument('--email', help='Email search query')
    
    # Create contact command
    create_parser = subparsers.add_parser('create-contact', help='Create new contact')
    create_parser.add_argument('name', help='Full name for contact')
    create_parser.add_argument('--first-name', required=True, help='First name')
    create_parser.add_argument('--last-name', required=True, help='Last name')
    create_parser.add_argument('--email', help='Email address')
    create_parser.add_argument('--phone', help='Phone number')
    create_parser.add_argument('--job-title', default='', help='Job title')
    create_parser.add_argument('--company', default='', help='Company name')
    create_parser.add_argument('--tags', help='Comma-separated tags')
    
    # Add note command
    note_parser = subparsers.add_parser('add-note', help='Add note to contact')
    note_parser.add_argument('contact_id', help='Contact ID')
    note_parser.add_argument('--title', required=True, help='Note title')
    note_parser.add_argument('--body', required=True, help='Note body')
    
    # Add phone command
    phone_parser = subparsers.add_parser('add-phone', help='Add phone number to contact')
    phone_parser.add_argument('contact_id', help='Contact ID')
    phone_parser.add_argument('--number', required=True, help='Phone number')
    phone_parser.add_argument('--type', default='mobile', help='Phone type (mobile, work, home)')
    
    # Add email command
    email_parser = subparsers.add_parser('add-email', help='Add email to contact')
    email_parser.add_argument('contact_id', help='Contact ID')
    email_parser.add_argument('--email', required=True, help='Email address')
    email_parser.add_argument('--type', default='work', help='Email type (work, home, personal)')
    
    # Create company command
    company_parser = subparsers.add_parser('create-company', help='Create company')
    company_parser.add_argument('name', help='Company name')
    company_parser.add_argument('--description', help='Company description')
    company_parser.add_argument('--website', help='Company website')
    
    # Search companies command
    search_companies_parser = subparsers.add_parser('search-companies', help='Search companies')
    search_companies_parser.add_argument('query', nargs='?', help='Company search query')
    
    # Create group command
    group_parser = subparsers.add_parser('create-group', help='Create group')
    group_parser.add_argument('name', help='Group name')
    group_parser.add_argument('--description', help='Group description')
    group_parser.add_argument('--type', default='family', help='Group type (family, friend, work, etc.)')
    
    # Search groups command
    search_groups_parser = subparsers.add_parser('search-groups', help='Search groups')
    search_groups_parser.add_argument('query', nargs='?', help='Group search query')
    
    # Log call command
    call_parser = subparsers.add_parser('log-call', help='Log call with contact')
    call_parser.add_argument('contact_id', help='Contact ID')
    call_parser.add_argument('--summary', required=True, help='Call summary')
    call_parser.add_argument('--duration', type=int, help='Call duration in minutes')
    call_parser.add_argument('--type', default='received', help='Call type (received, sent, missed)')
    
    # Upload photo command
    photo_parser = subparsers.add_parser('upload-photo', help='Upload photo for contact')
    photo_parser.add_argument('contact_id', help='Contact ID')
    photo_parser.add_argument('--photo-url', required=True, help='Photo URL')
    photo_parser.add_argument('--description', help='Photo description')
    photo_parser.add_argument('--type', default='avatar', help='Photo type (avatar, profile, document)')
    
    # Create tag command
    tag_parser = subparsers.add_parser('create-tag', help='Create tag')
    tag_parser.add_argument('name', help='Tag name')
    tag_parser.add_argument('--description', help='Tag description')
    tag_parser.add_argument('--type', default='person', help='Tag type (person, company, etc.)')
    
    # Search tags command
    search_tags_parser = subparsers.add_parser('search-tags', help='Search tags')
    search_tags_parser.add_argument('query', nargs='?', help='Tag search query')
    
    # Add gift command
    add_gift_parser = subparsers.add_parser('add-gift', help='Add gift idea for contact')
    add_gift_parser.add_argument('contact_id', help='Contact ID')
    add_gift_parser.add_argument('--title', required=True, help='Gift title/name')
    add_gift_parser.add_argument('--description', help='Gift description')
    add_gift_parser.add_argument('--url', help='Gift URL')
    add_gift_parser.add_argument('--price', help='Gift price')
    
    # Search gifts command
    search_gifts_parser = subparsers.add_parser('search-gifts', help='Search gifts')
    search_gifts_group = search_gifts_parser.add_mutually_exclusive_group()
    search_gifts_group.add_argument('--contact-id', help='Contact ID to search gifts for')
    search_gifts_group.add_argument('--query', help='Gift search query')
    
    # Create conversation command
    conversation_parser = subparsers.add_parser('create-conversation', help='Create conversation')
    conversation_parser.add_argument('contact_id', help='Contact ID')
    conversation_parser.add_argument('--content', required=True, help='Conversation content')
    conversation_parser.add_argument('--type', default='email', help='Conversation type (email, phone, text, etc.)')
    
    # Search conversations command
    search_conversations_parser = subparsers.add_parser('search-conversations', help='Search conversations')
    search_conversations_parser.add_argument('query', nargs='?', help='Conversation search query')
    
    # Upload document command
    document_parser = subparsers.add_parser('upload-document', help='Upload document for contact')
    document_parser.add_argument('contact_id', help='Contact ID')
    document_parser.add_argument('--file-url', required=True, help='Document file URL')
    document_parser.add_argument('--filename', required=True, help='Document filename')
    document_parser.add_argument('--description', help='Document description')
    document_parser.add_argument('--type', default='contract', help='Document type (contract, invoice, etc.)')
    
    # Add location command
    location_parser = subparsers.add_parser('add-location', help='Add location for contact')
    location_parser.add_argument('contact_id', help='Contact ID')
    location_parser.add_argument('--address', required=True, help='Address')
    location_parser.add_argument('--type', default='home', help='Location type (home, work, other)')
    
    # Journal add command
    journal_parser = subparsers.add_parser('journal-add', help='Add journal entry')
    journal_parser.add_argument('--title', required=True, help='Journal entry title')
    journal_parser.add_argument('--body', required=True, help='Journal entry body')
    journal_parser.add_argument('--contact-id', help='Associated contact ID')
    journal_parser.add_argument('--tags', help='Comma-separated tags')
    
    args = parser.parse_args()
    
    if not args.command:
        parser.print_help()
        return
    
    # Initialize CLI
    cli = PPLGiftCLI()
    
    try:
        if args.command == 'search':
            cli.search(args)
        elif args.command == 'create-contact':
            cli.create_contact(args)
        elif args.command == 'add-note':
            cli.add_note(args)
        elif args.command == 'add-phone':
            cli.add_phone(args)
        elif args.command == 'add-email':
            cli.add_email(args)
        elif args.command == 'create-company':
            cli.create_company(args)
        elif args.command == 'search-companies':
            cli.search_companies(args)
        elif args.command == 'create-group':
            cli.create_group(args)
        elif args.command == 'search-groups':
            cli.search_groups(args)
        elif args.command == 'log-call':
            cli.log_call(args)
        elif args.command == 'upload-photo':
            cli.upload_photo(args)
        elif args.command == 'create-tag':
            cli.create_tag(args)
        elif args.command == 'search-tags':
            cli.search_tags(args)
        elif args.command == 'add-gift':
            cli.add_gift(args)
        elif args.command == 'search-gifts':
            cli.search_gifts(args)
        elif args.command == 'create-conversation':
            cli.create_conversation(args)
        elif args.command == 'search-conversations':
            cli.search_conversations(args)
        elif args.command == 'upload-document':
            cli.upload_document(args)
        elif args.command == 'add-location':
            cli.add_location(args)
        elif args.command == 'journal-add':
            cli.journal_add(args)
        else:
            print(f"Unknown command: {args.command}")
            parser.print_help()
    except Exception as e:
        print(f"❌ Error: {str(e)}")
        sys.exit(1)


if __name__ == '__main__':
    main()
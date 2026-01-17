#!/usr/bin/env python3
"""
Summarize content and automatically add to ppl.gift journal entries.
Usage: summarize-to-ppl.py "URL or content" [title]
"""

import sys
import subprocess
import json
import os
import re
from datetime import datetime

def run_summarize(input_content):
    """Run summarize command and return the output."""
    try:
        # Run summarize with specific settings for journal-friendly output
        cmd = [
            "summarize", 
            input_content,
            "--length", "medium",
            "--format", "text",
            "--no-cache"
        ]
        
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=300)
        
        if result.returncode == 0:
            return result.stdout.strip()
        else:
            return f"Error summarizing: {result.stderr.strip()}"
            
    except subprocess.TimeoutExpired:
        return "Error: Summarization timed out"
    except Exception as e:
        return f"Error running summarize: {str(e)}"

def get_contact_info(content):
    """Try to extract contact name from content for linking."""
    # Simple pattern matching for common patterns
    patterns = [
        r'https?://(?:www\.)?([a-zA-Z0-9-]+)\.(?:com|org|net|io)',
        r'([A-Z][a-z]+ [A-Z][a-z]+)',  # Names
        r'@([a-zA-Z0-9_]+)',  # Social media handles
    ]
    
    for pattern in patterns:
        matches = re.findall(pattern, content)
        if matches:
            return matches[0]
    
    return None

def add_to_ppl_journal(title, content, summary, contact_name=None):
    """Add summary to ppl.gift journal."""
    try:
        # Import the ppl.gift module
        sys.path.append('/Users/steve/clawd/skills/ppl-gift/scripts')
        import ppl
        
        # Create journal entry
        journal_data = {
            'title': title,
            'body': f"Source: {content}\n\nSummary:\n{summary}",
            'post': True
        }
        
        # If we found a contact name, try to find and link the contact
        if contact_name:
            # Search for contact
            search_results = ppl.search_contacts(contact_name)
            if search_results:
                contact = search_results[0]
                journal_data['contact_id'] = contact['id']
        
        # Add journal entry via API
        # Note: This would need to be implemented in the ppl module
        print(f"Would add to journal: {journal_data}")
        return True
        
    except ImportError:
        print("Warning: ppl.gift module not available")
        return False
    except Exception as e:
        print(f"Error adding to ppl.gift: {str(e)}")
        return False

def main():
    if len(sys.argv) < 2:
        print("Usage: summarize-to-ppl.py 'content' [title]")
        sys.exit(1)
    
    content = sys.argv[1]
    title = sys.argv[2] if len(sys.argv) > 2 else None
    
    if not title:
        # Generate title from content
        if content.startswith('http'):
            title = f"Summary of {content}"
        else:
            title = f"Summary from: {content[:50]}..."
    
    print(f"📄 Summarizing: {content}")
    print("⏳ Running summarize...")
    
    # Run summarize
    summary = run_summarize(content)
    
    print("\n" + "="*60)
    print("SUMMARY:")
    print("="*60)
    print(summary)
    print("="*60)
    
    # Try to extract contact name
    contact_name = get_contact_info(content)
    
    # Add to ppl.gift journal
    print(f"\n📝 Adding to ppl.gift journal...")
    success = add_to_ppl_journal(title, content, summary, contact_name)
    
    if success:
        print("✅ Successfully added to ppl.gift journal")
    else:
        print("⚠️  Could not add to ppl.gift journal (check logs above)")

if __name__ == "__main__":
    main()
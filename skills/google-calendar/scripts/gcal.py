#!/usr/bin/env python3
"""
Google Calendar CLI - Manage Google Calendar events via API.
"""

import os
import sys
import json
import argparse
from datetime import datetime, timedelta, timezone
from pathlib import Path

# Ensure script directory is in path for imports
SCRIPT_DIR = Path(__file__).parent.resolve()
if str(SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPT_DIR))

from gcal_utils import parse_date, parse_time, format_event

# Google API imports
try:
    from google.auth.transport.requests import Request
    from google.oauth2.credentials import Credentials
    from google_auth_oauthlib.flow import InstalledAppFlow
    from googleapiclient.discovery import build
    from googleapiclient.errors import HttpError
except ImportError:
    print("Error: Google API libraries not installed.")
    print("Run: pip3 install google-api-python-client google-auth-httplib2 google-auth-oauthlib")
    sys.exit(1)

# OAuth scopes
SCOPES = ['https://www.googleapis.com/auth/calendar']

# Paths (SCRIPT_DIR already defined above for imports)
CREDENTIALS_PATH = SCRIPT_DIR / 'credentials.json'
TOKEN_PATH = SCRIPT_DIR / 'token.json'


def get_credentials():
    """Get or refresh OAuth credentials."""
    creds = None
    
    if TOKEN_PATH.exists():
        creds = Credentials.from_authorized_user_file(str(TOKEN_PATH), SCOPES)
    
    if not creds or not creds.valid:
        if creds and creds.expired and creds.refresh_token:
            creds.refresh(Request())
        else:
            if not CREDENTIALS_PATH.exists():
                print(f"Error: credentials.json not found at {CREDENTIALS_PATH}")
                print("Download it from Google Cloud Console.")
                sys.exit(1)
            
            flow = InstalledAppFlow.from_client_secrets_file(
                str(CREDENTIALS_PATH), SCOPES)
            creds = flow.run_local_server(port=0)
        
        # Save credentials
        with open(TOKEN_PATH, 'w') as token:
            token.write(creds.to_json())
    
    return creds


def get_service():
    """Get Calendar API service."""
    creds = get_credentials()
    return build('calendar', 'v3', credentials=creds)


def list_calendars(service):
    """List all calendars."""
    calendars_result = service.calendarList().list().execute()
    calendars = calendars_result.get('items', [])
    
    return [{'id': cal['id'], 'summary': cal['summary'], 'primary': cal.get('primary', False)} 
            for cal in calendars]


def get_calendar_id(service, calendar_name=None):
    """Get calendar ID by name or return primary."""
    if not calendar_name:
        return 'primary'
    
    calendars = list_calendars(service)
    calendar_name_lower = calendar_name.lower()
    
    for cal in calendars:
        if cal['summary'].lower() == calendar_name_lower:
            return cal['id']
    
    # Partial match
    for cal in calendars:
        if calendar_name_lower in cal['summary'].lower():
            return cal['id']
    
    print(f"Warning: Calendar '{calendar_name}' not found, using primary")
    return 'primary'


def list_events(service, calendar_id='primary', start=None, end=None, max_results=50):
    """List events in a date range."""
    
    if not start:
        start = datetime.now()
    else:
        start = datetime.combine(start, datetime.min.time())
    
    if not end:
        end = start + timedelta(days=1)
    else:
        # Use end of day (23:59:59) instead of datetime.max.time()
        end = datetime.combine(end, datetime.min.time()) + timedelta(days=1) - timedelta(seconds=1)
    
    # Format for API - use RFC3339 format
    # Google Calendar API accepts local time with timezone offset
    # Using .astimezone() to get proper timezone info
    try:
        from datetime import timezone as tz
        local_tz = datetime.now().astimezone().tzinfo
        time_min = start.replace(tzinfo=local_tz).isoformat()
        time_max = end.replace(tzinfo=local_tz).isoformat()
    except Exception:
        # Fallback: use UTC
        time_min = start.isoformat() + 'Z'
        time_max = end.isoformat() + 'Z'
    
    events_result = service.events().list(
        calendarId=calendar_id,
        timeMin=time_min,
        timeMax=time_max,
        maxResults=max_results,
        singleEvents=True,
        orderBy='startTime'
    ).execute()
    
    events = events_result.get('items', [])
    
    result = []
    for event in events:
        start_info = event['start']
        end_info = event['end']
        
        # Check if all-day
        is_all_day = 'date' in start_info
        
        if is_all_day:
            start_str = start_info['date']
            end_str = end_info['date']
        else:
            start_str = start_info['dateTime']
            end_str = end_info['dateTime']
        
        result.append({
            'id': event['id'],
            'summary': event.get('summary', 'No title'),
            'start': start_str,
            'end': end_str,
            'all_day': is_all_day,
            'description': event.get('description', ''),
            'location': event.get('location', '')
        })
    
    return result


def add_event(service, calendar_id, title, start_dt, end_dt, description='', location=''):
    """Add a new event."""
    event_body = {
        'summary': title,
        'description': description,
        'location': location,
    }
    
    # Check if all-day
    if start_dt.hour == 0 and start_dt.minute == 0 and end_dt.hour == 0 and end_dt.minute == 0:
        event_body['start'] = {'date': start_dt.date().isoformat()}
        event_body['end'] = {'date': end_dt.date().isoformat()}
    else:
        event_body['start'] = {'dateTime': start_dt.isoformat()}
        event_body['end'] = {'dateTime': end_dt.isoformat()}
    
    event = service.events().insert(calendarId=calendar_id, body=event_body).execute()
    return event


def quick_add_event(service, calendar_id, text):
    """Quick add event using natural language."""
    event = service.events().quickAdd(calendarId=calendar_id, text=text).execute()
    return event


def update_event(service, calendar_id, event_id, **kwargs):
    """Update an existing event."""
    # Get existing event
    event = service.events().get(calendarId=calendar_id, eventId=event_id).execute()
    
    # Update fields
    if 'title' in kwargs:
        event['summary'] = kwargs['title']
    if 'description' in kwargs:
        event['description'] = kwargs['description']
    if 'location' in kwargs:
        event['location'] = kwargs['location']
    
    updated = service.events().update(calendarId=calendar_id, eventId=event_id, body=event).execute()
    return updated


def delete_event(service, calendar_id, event_id):
    """Delete an event."""
    service.events().delete(calendarId=calendar_id, eventId=event_id).execute()
    return True


def main():
    parser = argparse.ArgumentParser(description='Google Calendar CLI')
    subparsers = parser.add_subparsers(dest='command', help='Command to run')
    
    # Auth command
    auth_parser = subparsers.add_parser('auth', help='Authenticate with Google')
    
    # Calendars command
    calendars_parser = subparsers.add_parser('calendars', help='List calendars')
    
    # List command
    list_parser = subparsers.add_parser('list', help='List events')
    list_parser.add_argument('--calendar', '-c', help='Calendar name')
    list_parser.add_argument('--date', '-d', help='Specific date')
    list_parser.add_argument('--start', help='Start date')
    list_parser.add_argument('--end', help='End date')
    list_parser.add_argument('--json', action='store_true', help='Output as JSON')
    list_parser.add_argument('--with-ids', action='store_true', help='Show event IDs')
    
    # Add command
    add_parser = subparsers.add_parser('add', help='Add event')
    add_parser.add_argument('text', nargs='?', help='Quick add text (natural language)')
    add_parser.add_argument('--title', '-t', help='Event title')
    add_parser.add_argument('--date', '-d', help='Event date')
    add_parser.add_argument('--time', help='Start time')
    add_parser.add_argument('--duration', type=int, default=60, help='Duration in minutes')
    add_parser.add_argument('--all-day', action='store_true', help='All-day event')
    add_parser.add_argument('--description', help='Event description')
    add_parser.add_argument('--location', help='Event location')
    add_parser.add_argument('--calendar', '-c', help='Calendar name')
    
    # Edit command
    edit_parser = subparsers.add_parser('edit', help='Edit event')
    edit_parser.add_argument('event_id', help='Event ID')
    edit_parser.add_argument('--title', '-t', help='New title')
    edit_parser.add_argument('--description', help='New description')
    edit_parser.add_argument('--location', help='New location')
    edit_parser.add_argument('--calendar', '-c', help='Calendar name')
    
    # Delete command
    delete_parser = subparsers.add_parser('delete', help='Delete event')
    delete_parser.add_argument('event_id', help='Event ID')
    delete_parser.add_argument('--calendar', '-c', help='Calendar name')
    
    args = parser.parse_args()
    
    if not args.command:
        parser.print_help()
        sys.exit(1)
    
    # Auth command
    if args.command == 'auth':
        try:
            get_service()
            print("[OK] Authentication successful!")
            print(f"Token saved to: {TOKEN_PATH}")
        except Exception as e:
            print(f"[ERROR] Authentication failed: {e}")
            sys.exit(1)
        return
    
    # Other commands need service
    try:
        service = get_service()
    except Exception as e:
        print(f"Error: {e}")
        print("Run 'gcal auth' first to authenticate.")
        sys.exit(1)
    
    if args.command == 'calendars':
        calendars = list_calendars(service)
        for cal in calendars:
            primary = " (primary)" if cal['primary'] else ""
            print(f"- {cal['summary']}{primary}")
            print(f"  ID: {cal['id']}")
    
    elif args.command == 'list':
        calendar_id = get_calendar_id(service, args.calendar)
        
        # Determine date range
        if args.date:
            start = parse_date(args.date)
            end = start
        elif args.start:
            start = parse_date(args.start)
            end = parse_date(args.end) if args.end else start + timedelta(days=1)
        else:
            start = datetime.now().date()
            end = start
        
        events = list_events(service, calendar_id, start, end)
        
        if args.json:
            print(json.dumps(events, indent=2))
        else:
            if not events:
                print("No events found.")
            else:
                for event in events:
                    print(format_event(event, with_id=args.with_ids))
    
    elif args.command == 'add':
        calendar_id = get_calendar_id(service, args.calendar)
        
        if args.text:
            # Quick add
            event = quick_add_event(service, calendar_id, args.text)
            print(f"[OK] Event created: {event.get('summary', 'Untitled')}")
            print(f"  ID: {event['id']}")
        else:
            # Structured add
            if not args.title:
                print("Error: --title required (or use quick add text)")
                sys.exit(1)
            
            if args.all_day:
                start_dt = datetime.combine(parse_date(args.date or 'today'), datetime.min.time())
                end_dt = start_dt + timedelta(days=1)
            else:
                date = parse_date(args.date or 'today')
                if args.time:
                    hour, minute = parse_time(args.time)
                    start_dt = datetime.combine(date, datetime.min.time().replace(hour=hour, minute=minute))
                    end_dt = start_dt + timedelta(minutes=args.duration)
                else:
                    start_dt = datetime.combine(date, datetime.min.time())
                    end_dt = start_dt + timedelta(hours=1)
            
            event = add_event(service, calendar_id, args.title, start_dt, end_dt,
                            description=args.description or '', location=args.location or '')
            print(f"[OK] Event created: {event['summary']}")
            print(f"  ID: {event['id']}")
    
    elif args.command == 'edit':
        calendar_id = get_calendar_id(service, args.calendar)
        
        kwargs = {}
        if args.title:
            kwargs['title'] = args.title
        if args.description:
            kwargs['description'] = args.description
        if args.location:
            kwargs['location'] = args.location
        
        if not kwargs:
            print("Error: Nothing to update. Use --title, --description, or --location")
            sys.exit(1)
        
        try:
            event = update_event(service, calendar_id, args.event_id, **kwargs)
            print(f"[OK] Event updated: {event['summary']}")
        except HttpError as e:
            print(f"[ERROR] Update failed: {e}")
            sys.exit(1)
    
    elif args.command == 'delete':
        calendar_id = get_calendar_id(service, args.calendar)
        
        try:
            delete_event(service, calendar_id, args.event_id)
            print(f"[OK] Event deleted")
        except HttpError as e:
            print(f"[ERROR] Delete failed: {e}")
            sys.exit(1)


if __name__ == '__main__':
    main()

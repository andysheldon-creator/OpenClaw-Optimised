#!/usr/bin/env python3
"""
Utility functions for Google Calendar CLI (no API dependencies).
Can be imported and tested without Google API libraries.
"""

from datetime import datetime, timedelta


def parse_date(date_str):
    """Parse various date formats."""
    date_str = date_str.lower().strip()
    
    # Relative dates
    today = datetime.now().date()
    if date_str == 'today':
        return today
    elif date_str == 'tomorrow':
        return today + timedelta(days=1)
    elif date_str == 'yesterday':
        return today - timedelta(days=1)
    
    # Try ISO format
    try:
        return datetime.strptime(date_str, '%Y-%m-%d').date()
    except ValueError:
        pass
    
    # Try other formats
    for fmt in ['%m/%d/%Y', '%m/%d/%y', '%d/%m/%Y', '%B %d, %Y', '%b %d, %Y']:
        try:
            return datetime.strptime(date_str, fmt).date()
        except ValueError:
            pass
    
    raise ValueError(f"Cannot parse date: {date_str}")


def parse_time(time_str):
    """Parse time string to hour, minute."""
    time_str = time_str.lower().strip().replace(' ', '')
    
    # 24-hour format
    try:
        dt = datetime.strptime(time_str, '%H:%M')
        return dt.hour, dt.minute
    except ValueError:
        pass
    
    # 12-hour format
    for fmt in ['%I%p', '%I:%M%p']:
        try:
            dt = datetime.strptime(time_str, fmt)
            return dt.hour, dt.minute
        except ValueError:
            pass
    
    raise ValueError(f"Cannot parse time: {time_str}")


def format_event(event, with_id=False):
    """Format event for display."""
    if event['all_day']:
        time_str = f"All day"
    else:
        start = event['start']
        end = event['end']
        # Parse ISO format
        start_dt = datetime.fromisoformat(start.replace('Z', '+00:00'))
        end_dt = datetime.fromisoformat(end.replace('Z', '+00:00'))
        time_str = f"{start_dt.strftime('%I:%M %p')} - {end_dt.strftime('%I:%M %p')}"
    
    lines = [f"- {event['summary']} ({time_str})"]
    
    if event.get('location'):
        lines.append(f"  Location: {event['location']}")
    
    if with_id:
        lines.append(f"  ID: {event['id']}")
    
    return '\n'.join(lines)

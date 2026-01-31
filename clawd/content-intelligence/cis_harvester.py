#!/usr/bin/env python3
"""
CIS v2.0 - RSS-Based Content Intelligence System
Fetches RSS feeds, archives articles, extracts insights, routes to PARA
"""

import json
import os
import re
import sqlite3
import urllib.request
import urllib.error
from xml.etree import ElementTree as ET
from datetime import datetime
from html.parser import HTMLParser
from pathlib import Path

# RSS Feed URLs for all sources
RSS_FEEDS = {
    "nate-jones": {
        "name": "Nate Jones",
        "url": "https://natesnewsletter.substack.com/feed",
        "rss_url": "https://natesnewsletter.substack.com/feed",
        "platform": "substack",
        "topic": "AI, Productivity, Business Strategy",
        "priority": "high",
        "frequency": "weekly"
    },
    "slow-ai": {
        "name": "Slow AI",
        "url": "https://theslowai.substack.com",
        "rss_url": "https://theslowai.substack.com/feed",
        "platform": "substack",
        "topic": "AI Implementation, Practical AI",
        "priority": "high",
        "frequency": "weekly"
    },
    "aakash-gupta": {
        "name": "Aakash Gupta",
        "url": "https://www.news.aakashg.com",
        "rss_url": "https://www.news.aakashg.com/feed",
        "platform": "substack",
        "topic": "Product Management, Growth",
        "priority": "medium",
        "frequency": "weekly"
    },
    "new-economies": {
        "name": "NEW ECONOMIES",
        "url": "https://www.neweconomies.co",
        "rss_url": "https://www.neweconomies.co/feed",
        "platform": "substack",
        "topic": "Business Models, Future of Work",
        "priority": "medium",
        "frequency": "bi-weekly"
    },
    "rhys-morgan": {
        "name": "Rhys Morgan",
        "url": "https://rhysmorgan.substack.com",
        "rss_url": "https://rhysmorgan.substack.com/feed",
        "platform": "substack",
        "topic": "Neurodivergence, ADHD, Autism",
        "priority": "high",
        "frequency": "weekly"
    },
    "sabrina-ramonov": {
        "name": "Sabrina Ramonov",
        "url": "https://www.sabrina.dev",
        "rss_url": "https://www.sabrina.dev/feed",
        "platform": "substack",
        "topic": "AI Tools, Productivity",
        "priority": "high",
        "frequency": "weekly"
    },
    "lennys-newsletter": {
        "name": "Lenny's Newsletter",
        "url": "https://lennyrachitsky.substack.com",
        "rss_url": "https://lennyrachitsky.substack.com/feed",
        "platform": "substack",
        "topic": "Product, AI, Growth",
        "priority": "high",
        "frequency": "weekly"
    },
    "ai-corner": {
        "name": "The AI Corner",
        "url": "https://theaicorner.substack.com",
        "rss_url": "https://theaicorner.substack.com/feed",
        "platform": "substack",
        "topic": "AI Tools, Angels, Funding",
        "priority": "high",
        "frequency": "weekly"
    },
    "waking-up": {
        "name": "Waking Up",
        "url": "https://wakingup.substack.com",
        "rss_url": "https://wakingup.substack.com/feed",
        "platform": "substack",
        "topic": "Meditation, Mindfulness",
        "priority": "medium",
        "frequency": "weekly"
    },
    "ground-news": {
        "name": "Ground News",
        "url": "https://ground.news",
        "rss_url": "https://openrss.org/ground.news",
        "platform": "openrss",
        "topic": "News, Media Bias",
        "priority": "low",
        "frequency": "daily"
    },
    "techtiff": {
        "name": "TechTiff",
        "url": "https://techtiff.substack.com",
        "rss_url": "https://techtiff.substack.com/feed",
        "platform": "substack",
        "topic": "iPhone Tips, Tech",
        "priority": "low",
        "frequency": "weekly"
    }
}

# Base paths
BASE_DIR = Path("/home/liam/clawd/content-intelligence")
CONFIG_DIR = BASE_DIR / "config"
SOURCES_DIR = BASE_DIR / "sources"
PARA_DB = "/home/liam/clawd/memory/para.sqlite"

# HTML tag stripper
class MLStripper(HTMLParser):
    def __init__(self):
        super().__init__()
        self.reset()
        self.fed = []
    def handle_data(self, d):
        self.fed.append(d)
    def get_data(self):
        return ''.join(self.fed)

def strip_html(html):
    """Strip HTML tags from text"""
    if not html:
        return ""
    s = MLStripper()
    try:
        s.feed(html)
        return s.get_data()
    except:
        # Fallback: regex-based stripping
        return re.sub(r'<[^>]+>', '', html)

def fetch_rss_feed(rss_url):
    """Fetch and parse RSS feed"""
    try:
        headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
        req = urllib.request.Request(rss_url, headers=headers)
        with urllib.request.urlopen(req, timeout=30) as response:
            data = response.read()
            return data
    except Exception as e:
        print(f"Error fetching {rss_url}: {e}")
        return None

def parse_rss_entries(xml_data):
    """Parse RSS XML and extract entries"""
    if not xml_data:
        return []
    
    try:
        root = ET.fromstring(xml_data)
        entries = []
        
        # Handle RSS 2.0
        channel = root.find('channel')
        if channel is not None:
            for item in channel.findall('item'):
                entry = parse_item(item)
                if entry:
                    entries.append(entry)
            return entries
        
        # Handle Atom
        ns = {'atom': 'http://www.w3.org/2005/Atom'}
        for entry_elem in root.findall('atom:entry', ns):
            entry = parse_atom_entry(entry_elem, ns)
            if entry:
                entries.append(entry)
        
        return entries
    except Exception as e:
        print(f"Error parsing RSS: {e}")
        return []

def parse_item(item):
    """Parse RSS 2.0 item"""
    title = item.findtext('title', '')
    link = item.findtext('link', '')
    pub_date = item.findtext('pubDate', '')
    creator = item.findtext('{http://purl.org/dc/elements/1.1/}creator', '')
    author = item.findtext('author', creator)
    
    # Get content - prefer content:encoded, fallback to description
    content_encoded = item.find('{http://purl.org/rss/1.0/modules/content/}encoded')
    if content_encoded is not None and content_encoded.text:
        content_html = content_encoded.text
    else:
        content_html = item.findtext('description', '')
    
    # Also get summary/description
    summary = item.findtext('description', '')
    
    return {
        'title': title.strip() if title else '',
        'url': link.strip() if link else '',
        'published': pub_date.strip() if pub_date else '',
        'author': author.strip() if author else 'Unknown',
        'content_html': content_html or '',
        'content_text': strip_html(content_html) if content_html else strip_html(summary),
        'summary': strip_html(summary) if summary else ''
    }

def parse_atom_entry(entry, ns):
    """Parse Atom entry"""
    title = entry.findtext('atom:title', '', ns)
    link_elem = entry.find('atom:link', ns)
    link = link_elem.get('href', '') if link_elem is not None else ''
    published = entry.findtext('atom:published', '', ns) or entry.findtext('atom:updated', '', ns)
    author_elem = entry.find('atom:author', ns)
    author = author_elem.findtext('atom:name', 'Unknown', ns) if author_elem is not None else 'Unknown'
    
    content_elem = entry.find('atom:content', ns)
    content_html = content_elem.text if content_elem is not None else ''
    
    summary_elem = entry.find('atom:summary', ns)
    summary = summary_elem.text if summary_elem is not None else ''
    
    return {
        'title': title.strip() if title else '',
        'url': link.strip() if link else '',
        'published': published.strip() if published else '',
        'author': author.strip() if author else 'Unknown',
        'content_html': content_html or '',
        'content_text': strip_html(content_html) if content_html else strip_html(summary),
        'summary': strip_html(summary) if summary else ''
    }

def slugify(title):
    """Create URL-friendly slug from title"""
    slug = re.sub(r'[^\w\s-]', '', title.lower())
    slug = re.sub(r'[-\s]+', '-', slug)
    return slug[:80]  # Limit length

def save_article_archive(source_name, entry):
    """Save article to archive directory"""
    archive_dir = SOURCES_DIR / source_name / "archive"
    archive_dir.mkdir(parents=True, exist_ok=True)
    
    slug = slugify(entry['title'])
    if not slug:
        slug = "untitled"
    
    filepath = archive_dir / f"{slug}.json"
    
    article_data = {
        "url": entry['url'],
        "slug": slug,
        "title": entry['title'],
        "subtitle": entry.get('summary', '')[:200],
        "author": entry['author'],
        "published": entry['published'],
        "content_html": entry['content_html'],
        "content_text": entry['content_text'],
        "harvested_at": datetime.now().isoformat()
    }
    
    with open(filepath, 'w', encoding='utf-8') as f:
        json.dump(article_data, f, indent=2, ensure_ascii=False)
    
    return filepath, slug

def save_insights(source_name, slug, insights_data):
    """Save extracted insights"""
    insights_dir = SOURCES_DIR / source_name / "insights"
    insights_dir.mkdir(parents=True, exist_ok=True)
    
    filepath = insights_dir / f"{slug}.json"
    
    with open(filepath, 'w', encoding='utf-8') as f:
        json.dump(insights_data, f, indent=2, ensure_ascii=False)
    
    return filepath

def update_source_metadata(source_key, source_info, article_count):
    """Update source metadata"""
    metadata_dir = SOURCES_DIR / source_key / "metadata"
    metadata_dir.mkdir(parents=True, exist_ok=True)
    
    metadata = {
        "name": source_info['name'],
        "safe_name": source_key,
        "url": source_info['url'],
        "platform": source_info['platform'],
        "created_at": datetime.now().isoformat(),
        "status": "active",
        "last_harvest": datetime.now().isoformat(),
        "archive_count": article_count,
        "topic": source_info.get('topic', ''),
        "priority": source_info.get('priority', 'medium'),
        "frequency": source_info.get('frequency', 'weekly')
    }
    
    with open(metadata_dir / "source.json", 'w', encoding='utf-8') as f:
        json.dump(metadata, f, indent=2, ensure_ascii=False)

def update_config_registry():
    """Update main sources config registry"""
    config = {"sources": {}}
    
    for source_key, info in RSS_FEEDS.items():
        metadata_file = SOURCES_DIR / source_key / "metadata" / "source.json"
        if metadata_file.exists():
            with open(metadata_file, 'r', encoding='utf-8') as f:
                metadata = json.load(f)
                config["sources"][source_key] = metadata
        else:
            config["sources"][source_key] = {
                "name": info['name'],
                "safe_name": source_key,
                "url": info['url'],
                "platform": info['platform'],
                "created_at": datetime.now().isoformat(),
                "status": "active",
                "last_check": None,
                "last_harvest": None,
                "archive_count": 0,
                "insight_count": 0
            }
    
    CONFIG_DIR.mkdir(parents=True, exist_ok=True)
    with open(CONFIG_DIR / "sources.json", 'w', encoding='utf-8') as f:
        json.dump(config, f, indent=2, ensure_ascii=False)

def route_to_para(source_key, source_name, article_title, article_url, insights):
    """Route insights to PARA database"""
    try:
        conn = sqlite3.connect(PARA_DB)
        cursor = conn.cursor()
        
        for insight in insights:
            cursor.execute('''
                INSERT INTO cis_routing 
                (source, source_title, source_url, insight_type, insight_content, 
                 para_category, para_target, rationale, routed_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            ''', (
                source_key,
                article_title,
                article_url,
                insight.get('type', 'insight'),
                insight.get('insight', ''),
                insight.get('para_category', 'resources'),
                insight.get('action', ''),
                insight.get('rationale', ''),
                datetime.now().isoformat()
            ))
        
        conn.commit()
        conn.close()
        return True
    except Exception as e:
        print(f"Error routing to PARA: {e}")
        return False

def harvest_source(source_key, source_info, max_articles=20):
    """Harvest articles from a single RSS source"""
    print(f"\n{'='*60}")
    print(f"Harvesting: {source_info['name']}")
    print(f"RSS: {source_info['rss_url']}")
    print(f"{'='*60}")
    
    xml_data = fetch_rss_feed(source_info['rss_url'])
    if not xml_data:
        print(f"❌ Failed to fetch feed for {source_info['name']}")
        return []
    
    entries = parse_rss_entries(xml_data)
    print(f"✓ Found {len(entries)} entries in feed")
    
    # Limit to max_articles
    entries = entries[:max_articles]
    
    harvested = []
    for entry in entries:
        if not entry['title'] or not entry['url']:
            continue
        
        # Check if already archived
        slug = slugify(entry['title'])
        archive_path = SOURCES_DIR / source_key / "archive" / f"{slug}.json"
        
        if archive_path.exists():
            print(f"  ⚠ Already archived: {entry['title'][:60]}...")
            continue
        
        # Save archive
        filepath, saved_slug = save_article_archive(source_key, entry)
        print(f"  ✓ Archived: {entry['title'][:60]}...")
        
        harvested.append({
            'slug': saved_slug,
            'title': entry['title'],
            'url': entry['url'],
            'filepath': str(filepath),
            'content_text': entry['content_text']
        })
    
    # Update metadata
    update_source_metadata(source_key, source_info, len(harvested))
    
    print(f"✓ Harvested {len(harvested)} new articles from {source_info['name']}")
    return harvested

def main():
    """Main harvester function"""
    print("\n" + "="*70)
    print("CIS v2.0 - RSS Content Intelligence System")
    print("="*70)
    print(f"Started: {datetime.now().isoformat()}")
    
    all_harvested = {}
    
    for source_key, source_info in RSS_FEEDS.items():
        harvested = harvest_source(source_key, source_info)
        all_harvested[source_key] = harvested
    
    # Update config registry
    update_config_registry()
    
    # Summary
    print("\n" + "="*70)
    print("HARVEST SUMMARY")
    print("="*70)
    total = 0
    for source_key, articles in all_harvested.items():
        count = len(articles)
        total += count
        print(f"  {source_key}: {count} articles")
    print(f"\nTotal: {total} articles harvested")
    print(f"Finished: {datetime.now().isoformat()}")
    
    return all_harvested

if __name__ == "__main__":
    main()

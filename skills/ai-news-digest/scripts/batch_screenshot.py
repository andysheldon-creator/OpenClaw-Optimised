"""
AI News Digest - Batch Tweet Screenshot
Reads source file, extracts primary tweets, captures screenshots
"""
import re
import os
from datetime import datetime
from playwright.sync_api import sync_playwright
from PIL import Image

CDP_URL = "http://localhost:9222"
WORKSPACE = r"C:\Users\taoli1\.openclaw\workspace\ai-news"


def extract_tweets_from_source(source_file):
    """Extract primary tweet URL from each section"""
    with open(source_file, 'r', encoding='utf-8') as f:
        content = f.read()
    
    tweets = []
    sections = re.split(r'\n## \d+[、.]', content)[1:]  # Split by section headers
    
    for section in sections:
        lines = section.strip().split('\n')
        title = lines[0].strip() if lines else "Unknown"
        
        # Find first tweet URL
        tweet_url = None
        for line in lines:
            match = re.search(r'https://x\.com/\w+/status/\d+', line)
            if match:
                tweet_url = match.group()
                break
        
        if tweet_url:
            # Generate filename from title
            safe_title = re.sub(r'[^\w\s-]', '', title.lower())
            safe_title = re.sub(r'\s+', '-', safe_title)[:30]
            tweets.append({
                'title': title,
                'url': tweet_url,
                'filename': safe_title
            })
    
    return tweets


def screenshot_tweet(page, url, output_path):
    """Screenshot a single tweet with clean crop"""
    print(f"  Navigating: {url}")
    page.goto(url, wait_until="domcontentloaded", timeout=30000)
    page.wait_for_selector('article', timeout=15000)
    page.wait_for_timeout(2500)
    
    tweet = page.locator('article').first
    tweet_box = tweet.bounding_box()
    
    if not tweet_box:
        print(f"  ERROR: Could not find tweet")
        return None
    
    temp_path = output_path + ".temp.png"
    page.screenshot(path=temp_path)
    img = Image.open(temp_path)
    
    primary_col = page.locator('[data-testid="primaryColumn"]').first
    col_box = primary_col.bounding_box()
    
    left = int(col_box['x']) - 35 if col_box else 377
    tweet_width = 530
    right = left + tweet_width
    
    top = max(0, int(tweet_box['y']) - 10)
    content_height = int(tweet_box['height']) - 70
    bottom = top + min(content_height, 630)
    
    cropped = img.crop((left, top, right, bottom))
    cropped.save(output_path, optimize=True)
    os.remove(temp_path)
    
    print(f"  Saved: {output_path} ({cropped.width}x{cropped.height})")
    return output_path


def main(source_file=None, date=None):
    """Main workflow"""
    if date is None:
        date = datetime.now().strftime("%Y-%m-%d")
    
    if source_file is None:
        source_file = os.path.join(WORKSPACE, f"{date}.md")
    
    if not os.path.exists(source_file):
        print(f"Source file not found: {source_file}")
        return
    
    print(f"Reading source: {source_file}")
    tweets = extract_tweets_from_source(source_file)
    print(f"Found {len(tweets)} topics with tweets")
    
    # Create screenshots directory
    screenshots_dir = os.path.join(WORKSPACE, "screenshots")
    os.makedirs(screenshots_dir, exist_ok=True)
    
    # Connect to browser and capture screenshots
    with sync_playwright() as p:
        print("Connecting to Edge browser...")
        browser = p.chromium.connect_over_cdp(CDP_URL)
        context = browser.contexts[0]
        page = context.new_page()
        page.set_viewport_size({"width": 1400, "height": 900})
        
        try:
            for i, tweet in enumerate(tweets, 1):
                filename = f"{i:02d}-{tweet['filename']}.png"
                output = os.path.join(screenshots_dir, filename)
                print(f"\n[{i}/{len(tweets)}] {tweet['title']}")
                screenshot_tweet(page, tweet['url'], output)
                tweet['screenshot'] = filename
        finally:
            page.close()
    
    print(f"\nDone! {len(tweets)} screenshots saved to {screenshots_dir}")
    return tweets


if __name__ == "__main__":
    import sys
    date = sys.argv[1] if len(sys.argv) > 1 else None
    main(date=date)

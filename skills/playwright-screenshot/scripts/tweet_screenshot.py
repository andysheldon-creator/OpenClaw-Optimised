"""
Tweet Screenshot - Final Version v3
"""
from playwright.sync_api import sync_playwright
from PIL import Image
import os

CDP_URL = "http://localhost:9222"

def screenshot_tweet(url, output_path):
    """Screenshot a tweet - clean, no sidebars, no reply box"""
    with sync_playwright() as p:
        browser = p.chromium.connect_over_cdp(CDP_URL)
        context = browser.contexts[0]
        page = context.new_page()
        
        page.set_viewport_size({"width": 1400, "height": 900})
        
        try:
            print(f"Navigating: {url}")
            page.goto(url, wait_until="domcontentloaded", timeout=30000)
            page.wait_for_selector('article', timeout=15000)
            page.wait_for_timeout(2500)
            
            tweet = page.locator('article').first
            tweet_box = tweet.bounding_box()
            
            if not tweet_box:
                print("Could not find tweet")
                return None
            
            temp_path = output_path + ".temp.png"
            page.screenshot(path=temp_path)
            img = Image.open(temp_path)
            
            primary_col = page.locator('[data-testid="primaryColumn"]').first
            col_box = primary_col.bounding_box()
            
            # More room on the left to capture full text
            # Right edge: stop at the divider line (narrower crop)
            left = int(col_box['x']) - 35 if col_box else 377
            tweet_width = 530  # Adjust for wider left margin
            right = left + tweet_width
            
            top = max(0, int(tweet_box['y']) - 10)
            # Stop after action bar, before "Relevant" and reply box
            content_height = int(tweet_box['height']) - 70
            bottom = top + min(content_height, 630)
            
            print(f"Crop: L={left}, R={right}, T={top}, B={bottom}")
            
            cropped = img.crop((left, top, right, bottom))
            
            os.makedirs(os.path.dirname(output_path) or ".", exist_ok=True)
            cropped.save(output_path, optimize=True)
            os.remove(temp_path)
            
            print(f"Saved: {output_path} ({cropped.width}x{cropped.height})")
            return output_path
            
        finally:
            page.close()


if __name__ == "__main__":
    import sys
    url = sys.argv[1] if len(sys.argv) > 1 else "https://x.com/OpenAI/status/2019474152743223477"
    output = sys.argv[2] if len(sys.argv) > 2 else "tweet.png"
    screenshot_tweet(url, output)

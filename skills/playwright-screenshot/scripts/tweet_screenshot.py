"""
Tweet Screenshot - Final Version v6
Full page screenshot + precise crop
"""
from playwright.sync_api import sync_playwright
from PIL import Image
import os

CDP_URL = "http://localhost:9222"

def screenshot_tweet(url, output_path, max_height=1500):
    """
    Screenshot a tweet - clean, no sidebars, no reply box
    """
    with sync_playwright() as p:
        browser = p.chromium.connect_over_cdp(CDP_URL)
        context = browser.contexts[0]
        page = context.new_page()
        
        # Tall viewport to capture long content
        page.set_viewport_size({"width": 1400, "height": 2000})
        
        try:
            print(f"Navigating: {url}")
            page.goto(url, wait_until="domcontentloaded", timeout=30000)
            page.wait_for_selector('article', timeout=15000)
            page.wait_for_timeout(2500)
            
            article = page.locator('article').first
            art_box = article.bounding_box()
            
            if not art_box:
                print("Could not find tweet")
                return None
            
            # Get primary column for horizontal bounds
            primary_col = page.locator('[data-testid="primaryColumn"]').first
            col_box = primary_col.bounding_box()
            
            # Horizontal bounds: primaryColumn gives us the content area
            if col_box:
                # Content starts at column edge, with generous margin to catch emojis/bullets
                left = int(col_box['x']) - 25
            else:
                left = 360
            
            tweet_width = 560  # Wide enough for full content
            right = left + tweet_width
            
            # Vertical bounds
            top = max(0, int(art_box['y']) - 8)
            
            # Find the action bar bottom (reply/retweet/like/bookmark row)
            # This is the last thing we want to include
            reply_icon = page.locator('article [data-testid="reply"]').first
            
            if reply_icon.count() > 0:
                ri_box = reply_icon.bounding_box()
                if ri_box:
                    # Stop at action bar icons, exclude Relevant dropdown
                    bottom = int(ri_box['y']) - 45
                else:
                    bottom = int(art_box['y'] + art_box['height']) - 120
            else:
                bottom = int(art_box['y'] + art_box['height']) - 120
            
            # Apply max height limit
            content_height = bottom - top
            if max_height > 0 and content_height > max_height:
                bottom = top + max_height
            
            # Take full page screenshot
            temp_path = output_path + ".temp.png"
            page.screenshot(path=temp_path, full_page=True)
            img = Image.open(temp_path)
            
            # Ensure bounds are within image
            right = min(right, img.width)
            bottom = min(bottom, img.height)
            
            print(f"Bounds: L={left}, R={right}, T={top}, B={bottom}")
            print(f"Content height: {bottom - top}px")
            
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
    max_h = int(sys.argv[3]) if len(sys.argv) > 3 else 1500
    screenshot_tweet(url, output, max_h)

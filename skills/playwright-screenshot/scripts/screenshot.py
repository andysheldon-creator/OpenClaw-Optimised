"""
Playwright Screenshot Script
Capture web pages or elements via CDP connection to Edge
"""
import argparse
import os
from playwright.sync_api import sync_playwright


def screenshot(url, output, element=None, wait_ms=2000, cdp_url="http://localhost:9222"):
    """Capture screenshot of URL or specific element"""
    with sync_playwright() as p:
        browser = p.chromium.connect_over_cdp(cdp_url)
        context = browser.contexts[0]
        page = context.new_page()
        
        try:
            print(f"Navigating to: {url}")
            page.goto(url, wait_until="domcontentloaded", timeout=30000)
            
            if element:
                print(f"Waiting for element: {element}")
                page.wait_for_selector(element, timeout=15000)
            
            # Extra wait for dynamic content
            if wait_ms > 0:
                page.wait_for_timeout(wait_ms)
            
            # Ensure output directory exists
            os.makedirs(os.path.dirname(output) or ".", exist_ok=True)
            
            if element:
                # Screenshot specific element
                el = page.locator(element).first
                el.screenshot(path=output)
            else:
                # Full page screenshot
                page.screenshot(path=output, full_page=True)
            
            print(f"Saved: {output}")
            return output
            
        finally:
            page.close()


def batch_screenshot(urls_file, output_dir, element=None, wait_ms=2000, cdp_url="http://localhost:9222"):
    """Screenshot multiple URLs from a file"""
    with open(urls_file, 'r', encoding='utf-8') as f:
        urls = [line.strip() for line in f if line.strip() and not line.startswith('#')]
    
    os.makedirs(output_dir, exist_ok=True)
    
    with sync_playwright() as p:
        browser = p.chromium.connect_over_cdp(cdp_url)
        context = browser.contexts[0]
        page = context.new_page()
        
        try:
            for i, url in enumerate(urls, 1):
                # Generate filename from URL
                filename = f"{i:02d}-screenshot.png"
                output = os.path.join(output_dir, filename)
                
                print(f"[{i}/{len(urls)}] {url}")
                page.goto(url, wait_until="domcontentloaded", timeout=30000)
                
                if element:
                    page.wait_for_selector(element, timeout=15000)
                
                if wait_ms > 0:
                    page.wait_for_timeout(wait_ms)
                
                if element:
                    el = page.locator(element).first
                    el.screenshot(path=output)
                else:
                    page.screenshot(path=output, full_page=True)
                
                print(f"  -> {output}")
                
        finally:
            page.close()
    
    print(f"Done! {len(urls)} screenshots saved to {output_dir}")


def main():
    parser = argparse.ArgumentParser(description="Playwright Screenshot Tool")
    parser.add_argument("--url", help="Single URL to screenshot")
    parser.add_argument("--batch", help="File with URLs (one per line)")
    parser.add_argument("--output", default="screenshot.png", help="Output file path")
    parser.add_argument("--output-dir", default="./screenshots", help="Output directory for batch")
    parser.add_argument("--element", help="CSS selector for element screenshot")
    parser.add_argument("--wait", type=int, default=2000, help="Extra wait time in ms")
    parser.add_argument("--cdp", default="http://localhost:9222", help="CDP endpoint")
    
    args = parser.parse_args()
    
    if args.batch:
        batch_screenshot(args.batch, args.output_dir, args.element, args.wait, args.cdp)
    elif args.url:
        screenshot(args.url, args.output, args.element, args.wait, args.cdp)
    else:
        parser.print_help()
        print("\nError: Either --url or --batch is required")
        exit(1)


if __name__ == "__main__":
    main()

"""
获取推文中的外部链接（官网、博客、GitHub等）
使用 Playwright 连接到 Edge 浏览器获取
"""
import asyncio
import sys
from playwright.async_api import async_playwright

async def get_tweet_links(url):
    """获取推文中的外部链接"""
    async with async_playwright() as p:
        browser = await p.chromium.connect_over_cdp("http://localhost:9222")
        context = browser.contexts[0]
        page = await context.new_page()
        
        try:
            await page.goto(url, wait_until="domcontentloaded", timeout=60000)
            await asyncio.sleep(5)  # 等待动态内容加载
            
            # 获取推文中的所有链接
            links = await page.eval_on_selector_all(
                'article a[href]', 
                'els => els.map(e => ({text: e.innerText.trim(), href: e.href}))'
            )
            
            # 过滤外部链接（排除 x.com 和 twitter.com 内部链接）
            external = [
                l for l in links 
                if l['href'] 
                and not l['href'].startswith('https://x.com') 
                and not l['href'].startswith('https://twitter.com') 
                and 'http' in l['href']
            ]
            
            print(f"=== {url} ===")
            for l in external:
                print(f"  {l['text']}: {l['href']}")
            
            if not external:
                print("  (no external links)")
                
        except Exception as e:
            print(f"错误 [{url}]: {e}")
        finally:
            await page.close()

async def main():
    urls = sys.argv[1:] if len(sys.argv) > 1 else []
    if not urls:
        print("用法: python get_tweet_links.py <tweet_url> [tweet_url2] ...")
        print("示例: python get_tweet_links.py https://x.com/claudeai/status/123456")
        return
    
    for url in urls:
        await get_tweet_links(url)
        print()

if __name__ == "__main__":
    asyncio.run(main())

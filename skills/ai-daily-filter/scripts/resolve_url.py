"""
解析 t.co 短链接为实际 URL
使用 Playwright 连接到 Edge 浏览器获取重定向后的真实 URL
"""
import asyncio
import sys
from playwright.async_api import async_playwright

async def resolve_url(url):
    """解析短链接为实际 URL"""
    async with async_playwright() as p:
        browser = await p.chromium.connect_over_cdp("http://localhost:9222")
        context = browser.contexts[0]
        page = await context.new_page()
        
        try:
            await page.goto(url, wait_until="domcontentloaded", timeout=15000)
            final_url = page.url
            print(f"{url} -> {final_url}")
        except Exception as e:
            print(f"{url} -> 错误: {e}")
        finally:
            await page.close()

async def main():
    urls = sys.argv[1:] if len(sys.argv) > 1 else []
    if not urls:
        print("用法: python resolve_url.py <short_url> [short_url2] ...")
        print("示例: python resolve_url.py https://t.co/abc123")
        return
    
    for url in urls:
        await resolve_url(url)

if __name__ == "__main__":
    asyncio.run(main())

---
name: playwright-screenshot
description: Capture screenshots of web pages or specific elements using Playwright via CDP. Activate when user asks to screenshot a URL, capture tweets/X posts, screenshot a webpage, or needs browser automation for visual capture. Supports Twitter/X posts with clean crop (no sidebars), general websites, and element-specific screenshots.
---

# Playwright Screenshot

Capture web page screenshots via Playwright connected to Edge browser with CDP.

## Prerequisites

Edge must be running with remote debugging enabled on port 9222.

### Ensure Edge Debug Port (Recommended)

Run this script to automatically check/start Edge with debug port:

```powershell
& "C:\Users\taoli1\openclaw\skills\playwright-screenshot\scripts\ensure-edge.ps1"
```

This will:
1. Check if debug port 9222 is available
2. If not, kill existing Edge processes
3. Restart Edge with debug port

### Manual Start (Alternative)

```powershell
# Close existing Edge first (required if Edge is already running)
taskkill /F /IM msedge.exe

# Start with debug port
Start-Process "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe" -ArgumentList "--remote-debugging-port=9222"
```

Verify connection:
```powershell
Invoke-WebRequest -Uri "http://localhost:9222/json/version" -UseBasicParsing
```

## Tweet Screenshots (Recommended)

For Twitter/X posts, use the dedicated tweet script for clean cropping:

```bash
python scripts/tweet_screenshot.py <url> <output.png> [max_height]
```

Example:
```bash
python scripts/tweet_screenshot.py "https://x.com/OpenAI/status/123456" tweet.png
python scripts/tweet_screenshot.py "https://x.com/LangChain/status/789" long_tweet.png 1500
```

Features:
- Auto-crops to tweet content only (removes left nav, right sidebar, reply box)
- **Dynamic height detection** - captures full tweet including preview cards
- Default max height: 1500px (pass 0 for unlimited)
- Preserves full tweet text, images, embedded cards, and engagement stats
- Excludes "Relevant" dropdown and "Post your reply" section

## General Screenshots

For other websites:

```bash
python scripts/screenshot.py --url "https://example.com" --output page.png
```

### Element Screenshot

```bash
python scripts/screenshot.py --url "https://example.com" --output element.png --element "div.content"
```

### Batch Mode

```bash
python scripts/screenshot.py --batch urls.txt --output-dir ./screenshots
```

## Script Reference

### tweet_screenshot.py

| Arg | Description |
|-----|-------------|
| `url` | Tweet URL (positional) |
| `output` | Output file path (positional) |

### screenshot.py

| Arg | Description | Default |
|-----|-------------|---------|
| `--url` | Single URL | - |
| `--batch` | File with URLs | - |
| `--output` | Output file | screenshot.png |
| `--output-dir` | Batch output dir | ./screenshots |
| `--element` | CSS selector | (full page) |
| `--wait` | Wait time ms | 2000 |
| `--cdp` | CDP endpoint | http://localhost:9222 |

## Troubleshooting

| Issue | Solution |
|-------|----------|
| ECONNREFUSED | Start Edge with `--remote-debugging-port=9222` |
| Already running | Kill existing Edge: `taskkill /F /IM msedge.exe` |
| Element not found | Increase wait time or check selector |
| Login required | Use existing Edge profile (already logged in) |

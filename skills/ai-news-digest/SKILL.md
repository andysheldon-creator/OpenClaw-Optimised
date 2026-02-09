---
name: ai-news-digest
description: Generate AI news digest from source file. Activate when user asks to process AI news, create news summary, or mentions "AI 新闻汇总". Reads news source file, extracts tweet URLs, captures screenshots, summarizes content, and generates final markdown report.
---

# AI News Digest

Complete workflow for AI news summarization: read source → extract links → screenshot tweets → summarize → generate report.

## Prerequisites

1. **Edge browser with debug port** (for screenshots)
   
   Run the ensure script (recommended):
   ```powershell
   & "C:\Users\taoli1\openclaw\skills\playwright-screenshot\scripts\ensure-edge.ps1"
   ```
   
   Or manually:
   ```powershell
   taskkill /F /IM msedge.exe
   Start-Process "msedge.exe" "--remote-debugging-port=9222"
   ```

2. **Source file** with news links (see format below)

## Quick Start

When user says "帮我处理 AI 新闻" or similar:

1. Find the source file (usually `workspace/ai-news/YYYY-MM-DD.md`)
2. Run the digest workflow
3. Output: markdown report + screenshots

## Workflow Steps

### Step 1: Read Source File

Source file format (`ai-news/YYYY-MM-DD.md`):
```markdown
## 1、Topic Name
- https://x.com/user/status/123456
- https://x.com/user/status/789012
- 官方博客：https://example.com/blog

## 2、Another Topic
...
```

### Step 2: Extract Key Tweets

For each topic, identify the **primary tweet** (usually the first one) for screenshot.

### Step 3: Capture Screenshots

Use `playwright-screenshot` skill:
```bash
python C:\Users\taoli1\openclaw\skills\playwright-screenshot\scripts\tweet_screenshot.py <url> <output.png>
```

Naming convention: `screenshots/01-topic-name.png`, `02-topic-name.png`, etc.

### Step 4: Summarize Content

For each tweet:
- Read the tweet content (from screenshot or page visit)
- Extract key points
- Note engagement metrics (views, likes, retweets)

### Step 5: Generate Report

Output format (see `references/report-template.md`):
- Title with date
- Section per topic with:
  - Screenshot embed
  - Summary points
  - Official blog link
  - Engagement stats
- Engagement comparison table
- Key observations

## File Structure

```
workspace/ai-news/
├── YYYY-MM-DD.md           # Source: raw links from email
├── 今日AI新闻-YYYY-MM-DD.md  # Output: final report
├── TASK-README.md          # Task documentation
└── screenshots/
    ├── 01-topic.png
    ├── 02-topic.png
    └── ...
```

## Example Invocation

User: "帮我处理 2026-02-06 的 AI 新闻"

Agent actions:
1. Read `ai-news/2026-02-06.md`
2. Extract 4 main tweets
3. Screenshot each (playwright-screenshot)
4. Summarize content
5. Generate `今日AI新闻-2026-02-06.md`

## Tips

- Primary tweets are usually the first URL in each section
- Check for official blog links for deeper context
- Note competitive dynamics (e.g., Claude vs GPT releases)
- Include timing observations (who announced first)

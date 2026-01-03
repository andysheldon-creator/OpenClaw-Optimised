---
name: brave-search
description: Web search using Brave Search API. Fast, privacy-focused alternative to Google.
homepage: https://brave.com/search/api
metadata: {
  "clawdis": {
    "emoji": "🦁",
    "requires": {
      "bins": ["node", "curl"],
      "env": ["BRAVE_API_KEY"]
    },
    "primaryEnv": "BRAVE_API_KEY",
    "install": {
      "type": "manual",
      "instructions": "Get API key from https://brave.com/search/api and set BRAVE_API_KEY in .env"
    }
  }
}
---

# Brave Search

Privacy-focused web search via Brave Search API. Lightweight alternative to Gemini for web queries.

## Capabilities

- Fast web searches (avg 1-2 seconds)
- News, weather, facts, current events
- Structured JSON results
- Multiple result types (web, news)

## Usage

**Basic search:**
```bash
./skills/brave-search/scripts/search.mjs "latest AI news"
```

**With options:**
```bash
./skills/brave-search/scripts/search.mjs "weather in Tokyo" --count 5 --type news
```

**From Clawdis CLI:**
```bash
clawdis run brave-search --message "search query"
```

**From agent:**
```javascript
// Tool is automatically available when skill installed
braveSearch("python tutorial");
```

## Environment Setup

Add to `.env`:
```bash
# From https://brave.com/search/api
export BRAVE_API_KEY="your_api_key_here"
```

## Installation

1. Get API key from [Brave Search API](https://brave.com/search/api)
2. Set `BRAVE_API_KEY` environment variable
3. No additional installation needed

## AI Agent Best Practices

**When to use:**
- Current information needed (news, weather, events)
- User explicitly requests web search: "погугли", "search", "google"
- User asks about recent events or data
- Deterministic facts that may have changed

**When NOT to use:**
- Historical facts (already in training data)
- Personal questions ("как тебя зовут")
- Creative/generative tasks
- Simple calculations or logic

**Example flow:**
```
User: "погода в Москве"
→ detectWebSearchIntent() returns true
→ extractSearchQuery() → "погода в Москве"
→ braveSearch("погода в Москве")
→ Format: 🌐 Результат поиска:
   [Brave API result in Russian]
```

**Output format:**
```
🌐 Результат поиска:
{search result text}
```

## Comparison with Gemini

| Feature | Brave Search | Gemini CLI |
|---------|--------------|------------|
| Speed | ⚡ 1-2s | ⏱️ 5-10s |
| Cost | 💰 Paid API | 🎫 Free (Gemini quota) |
| Privacy | 🔒 High | Standard |
| Language | 🇬🇧 English | 🇷🇺 Russian |
| Result format | Structured | Natural language |
| Best for | Quick facts, news | Complex queries |

**Use Brave when:**
- Need fastest response
- Query in English
- Need structured data
- Have API quota

**Use Gemini when:**
- Need Russian results
- Want natural language summary
- Have no Brave API key
- Doing complex reasoning about search results

## Error Handling

**API errors:** Captured in JSON response
**Rate limits:** 429 status, retry after delay
**Invalid key:** 401 unauthorized error
**Network:** Try curl fallback, then fail gracefully

## Testing

```bash
# Test with API key
export BRAVE_API_KEY="test-key"
./skills/brave-search/scripts/search.mjs "test query"

# Without API key (should error gracefully)
unset BRAVE_API_KEY
./skills/brave-search/scripts/search.mjs "test"
```

## Integration with google_web CLI

The `google_web` CLI tool supports both backends:

```bash
# Use Gemini (default)
google_web "query"

# Use Brave (explicit)
google_web --backend brave "query"

# Set default to Brave
export GOOGLE_WEB_BACKEND="brave"
google_web "query"
```

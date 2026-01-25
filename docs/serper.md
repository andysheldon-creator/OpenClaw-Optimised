---
summary: "Serper Google Search API setup for web_search"
read_when:
  - You want to use Serper Google Search API for web search
  - You need a SERPER_API_KEY or plan details
---

# Serper Google Search API

Clawdbot can use Serper Google Search API as a search provider for `web_search`. Serper provides fast and cost-effective access to Google Search results in structured JSON format.

## Get an API key

1) Create a Serper API account at https://serper.dev/
2) Generate an API key in your dashboard
3) Store the key in config (recommended) or set `SERPER_API_KEY` in the Gateway environment.

## Config example

```json5
{
  tools: {
    web: {
      search: {
        provider: "serper",
        apiKey: "SERPER_API_KEY_HERE",
        maxResults: 5,
        timeoutSeconds: 30
      }
    }
  }
}
```

## Notes

- Serper provides a free tier (2,500 queries) plus paid plans; check the Serper dashboard for current limits and pricing.
- Serper is fast and cost-effective, returning traditional Google Search results (title, URL, snippet) similar to Brave Search.
- Supports country (`country`) and language (`search_lang`) parameters for region-specific results.
- Does not support `freshness` filtering (Brave-only feature).

See [Web tools](/tools/web) for the full web_search configuration.


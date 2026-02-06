# Zhipu Web Search Plugin

A web search provider plugin for OpenClaw using [Zhipu AI (BigModel) Web Search API](https://docs.bigmodel.cn/api-reference/%E5%B7%A5%E5%85%B7-api/%E7%BD%91%E7%BB%9C%E6%90%9C%E7%B4%A2).

## Prerequisites

- A Zhipu AI API key ([get one here](https://open.bigmodel.cn))
- OpenClaw with the [extensible web search provider](https://github.com/openclaw/openclaw/pull/10435) feature

## Setup

1. Set `tools.web.search.provider: "zhipu"` in your OpenClaw config
2. Provide your API key via one of:
   - Config: `plugins.entries.zhipu-web-search.apiKey: "your-key"`
   - Environment: `ZHIPU_API_KEY=your-key`

## Configuration

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `apiKey` | string | — | Zhipu API key (fallback: `ZHIPU_API_KEY` env) |
| `engine` | string | `search_std` | Search engine: `search_std`, `search_pro`, `search_pro_sogou`, `search_pro_quark` |
| `contentSize` | string | `medium` | Result content size: `medium` (summaries) or `high` (full content) |

## Search Engines

| Engine | Description |
|--------|-------------|
| `search_std` | Standard search (default) |
| `search_pro` | Enhanced search with better relevance |
| `search_pro_sogou` | Sogou-backed search |
| `search_pro_quark` | Quark-backed search |

## Tool Parameters

The plugin registers a `web_search` tool with the same core parameters as OpenClaw's built-in search, plus Zhipu-specific extras:

| Parameter | Type | Description |
|-----------|------|-------------|
| `query` | string | Search query (max 70 chars recommended) |
| `count` | integer | Number of results (1-50, default 10) |
| `freshness` | string | Recency filter: `pd` (day), `pw` (week), `pm` (month), `py` (year) |
| `search_intent` | boolean | Enable search intent recognition (default: false) |
| `search_domain_filter` | string | Restrict results to a specific domain |
| `country` | string | Accepted for compatibility, not used by Zhipu |
| `search_lang` | string | Accepted for compatibility, not used by Zhipu |
| `ui_lang` | string | Accepted for compatibility, not used by Zhipu |

## Example Config

```json5
{
  tools: {
    web: {
      search: {
        provider: "zhipu",
        enabled: true,
      },
    },
  },
  plugins: {
    entries: {
      "zhipu-web-search": {
        apiKey: "your-zhipu-api-key",
        engine: "search_pro",
        contentSize: "medium",
      },
    },
  },
}
```

## How It Works

When `tools.web.search.provider` is set to `"zhipu"` (or any non-built-in value), OpenClaw's core `web_search` tool steps aside, allowing this plugin to register its own `web_search` tool that delegates to Zhipu's API.

The tool supports the same core parameters as the built-in `web_search` (query, count, freshness) for a seamless agent experience, plus Zhipu-specific parameters like `search_intent` and `search_domain_filter`.

## API Reference

- [Zhipu Web Search API](https://docs.bigmodel.cn/api-reference/%E5%B7%A5%E5%85%B7-api/%E7%BD%91%E7%BB%9C%E6%90%9C%E7%B4%A2)
- [Zhipu API Introduction](https://docs.bigmodel.cn/cn/api/introduction)

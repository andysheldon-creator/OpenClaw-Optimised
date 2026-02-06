# Zhipu Web Search Plugin

A web search provider plugin for OpenClaw using [Zhipu AI](https://open.bigmodel.cn). Supports two backend modes:

- **API mode** (default): Direct HTTP API calls, pay-per-use. Full control over engine, content size, freshness, domain filtering, and intent recognition.
- **MCP mode**: Uses the [Coding Plan](https://docs.bigmodel.cn/cn/coding-plan/mcp/search-mcp-server) MCP Server (`webSearchPrime`). Included in Coding Plan subscriptions — no extra cost.

## Prerequisites

- A Zhipu AI API key ([get one here](https://open.bigmodel.cn))
- OpenClaw with the [extensible web search provider](https://github.com/openclaw/openclaw/pull/10435) feature
- For MCP mode: a Coding Plan (Pro) subscription

## Setup

1. Set `tools.web.search.provider: "zhipu"` in your OpenClaw config
2. Provide your API key via one of:
   - Config: `plugins.entries.zhipu-web-search.config.apiKey: "your-key"`
   - Environment: `ZHIPU_API_KEY=your-key`
3. Optionally set `config.mode: "mcp"` to use Coding Plan subscription

## Configuration

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `apiKey` | string | — | Zhipu API key (fallback: `ZHIPU_API_KEY` env) |
| `mode` | string | `api` | Backend: `api` (HTTP API, pay-per-use) or `mcp` (Coding Plan, subscription) |
| `engine` | string | `search_std` | Search engine (API mode only): `search_std`, `search_pro`, `search_pro_sogou`, `search_pro_quark` |
| `contentSize` | string | `medium` | Result detail level (API mode only): `medium` or `high` |

## Modes

### API Mode (`mode: "api"`)

Calls the [Zhipu Web Search HTTP API](https://docs.bigmodel.cn/api-reference/%E5%B7%A5%E5%85%B7-api/%E7%BD%91%E7%BB%9C%E6%90%9C%E7%B4%A2) directly. Supports all parameters:

| Parameter | Type | Description |
|-----------|------|-------------|
| `query` | string | Search query (max 70 chars recommended) |
| `count` | integer | Number of results (1-50, default 10) |
| `freshness` | string | Recency filter: `pd` / `pw` / `pm` / `py` |
| `search_intent` | boolean | Enable search intent recognition |
| `search_domain_filter` | string | Restrict to a specific domain |
| `country` | string | Accepted for compatibility, not used |
| `search_lang` | string | Accepted for compatibility, not used |
| `ui_lang` | string | Accepted for compatibility, not used |

### MCP Mode (`mode: "mcp"`)

Connects to the [Zhipu Coding Plan MCP Server](https://docs.bigmodel.cn/cn/coding-plan/mcp/search-mcp-server) via Streamable HTTP. Uses the `webSearchPrime` tool.

- **Pro**: Included in Coding Plan subscription (no extra cost)
- **Con**: No engine selection (fixed to `webSearchPrime`)
- Session management is automatic (initialize → cache → re-init on expiry)

Supported parameters in MCP mode: `query`, `freshness`, `search_domain_filter`, `contentSize`.

## Example Configs

### API Mode (pay-per-use, full features)

```json5
{
  tools: { web: { search: { provider: "zhipu" } } },
  plugins: {
    entries: {
      "zhipu-web-search": {
        config: {
          apiKey: "your-zhipu-api-key",
          mode: "api",
          engine: "search_pro",
          contentSize: "medium",
        },
      },
    },
  },
}
```

### MCP Mode (Coding Plan subscription)

```json5
{
  tools: { web: { search: { provider: "zhipu" } } },
  plugins: {
    entries: {
      "zhipu-web-search": {
        config: {
          apiKey: "your-zhipu-api-key",
          mode: "mcp",
        },
      },
    },
  },
}
```

## How It Works

When `tools.web.search.provider` is set to `"zhipu"`, OpenClaw's core `web_search` tool steps aside, allowing this plugin to register its own `web_search` tool. The backend is selected by the `mode` config:

- `api` → Direct HTTP POST to `https://open.bigmodel.cn/api/paas/v4/web_search`
- `mcp` → MCP Streamable HTTP to `https://open.bigmodel.cn/api/mcp/web_search_prime/mcp`

Both modes present the same `web_search` tool interface to the agent.

## API Reference

- [Zhipu Web Search API](https://docs.bigmodel.cn/api-reference/%E5%B7%A5%E5%85%B7-api/%E7%BD%91%E7%BB%9C%E6%90%9C%E7%B4%A2)
- [Zhipu API Introduction](https://docs.bigmodel.cn/cn/api/introduction)
- [Zhipu Coding Plan Search MCP](https://docs.bigmodel.cn/cn/coding-plan/mcp/search-mcp-server)

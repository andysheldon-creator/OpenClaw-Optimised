import { Type } from "@sinclair/typebox";
import type { AnyAgentTool } from "../../../src/agents/tools/common.js";
import type { ZhipuEngine, ZhipuContentSize, PluginLogger } from "./types.js";
import { wrapExternal, jsonResult } from "./types.js";
import { mcpSearch, formatMcpResults } from "./zhipu-mcp.js";

// Zhipu Web Search API endpoint
const ZHIPU_SEARCH_ENDPOINT = "https://open.bigmodel.cn/api/paas/v4/web_search";

const DEFAULT_COUNT = 10;
const MAX_COUNT = 50;
const DEFAULT_TIMEOUT_SECONDS = 15;

const FRESHNESS_VALUES = ["pd", "pw", "pm", "py"] as const;

// Freshness filter mapping to Zhipu's search_recency_filter
// Zhipu uses camelCase values: oneDay, oneWeek, oneMonth, oneYear
const FRESHNESS_MAP: Record<string, string> = {
  pd: "oneDay",
  pw: "oneWeek",
  pm: "oneMonth",
  py: "oneYear",
};

/**
 * Zhipu Web Search API response shape.
 */
interface ZhipuSearchResult {
  title?: string;
  content?: string;
  link?: string;
  media?: string;
  icon?: string;
  refer?: string;
  publish_date?: string;
}

interface ZhipuSearchResponse {
  search_result?: ZhipuSearchResult[];
  request_id?: string;
}

/**
 * Tool parameter schema — matches core web_search for full compatibility.
 * Agents can call this tool with the same parameters as the built-in web_search.
 * Parameters not natively supported by Zhipu (country, search_lang, ui_lang)
 * are accepted but ignored with a log note.
 */
const WebSearchSchema = Type.Object({
  query: Type.String({ description: "Search query string.", minLength: 1 }),
  count: Type.Optional(
    Type.Integer({ description: "Number of results to return (1-50, default 10).", minimum: 1, maximum: 50 }),
  ),
  country: Type.Optional(
    Type.String({
      description:
        "2-letter country code for region-specific results (e.g., 'DE', 'US', 'ALL'). Accepted but not used by Zhipu.",
    }),
  ),
  search_lang: Type.Optional(
    Type.String({
      description: "ISO language code for search results (e.g., 'de', 'en', 'fr'). Accepted but not used by Zhipu.",
    }),
  ),
  ui_lang: Type.Optional(
    Type.String({
      description: "ISO language code for UI elements. Accepted but not used by Zhipu.",
    }),
  ),
  freshness: Type.Optional(
    Type.Union(
      FRESHNESS_VALUES.map((v) => Type.Literal(v)),
      {
        description:
          'Filter results by recency. Values: "pd" (past day), "pw" (past week), "pm" (past month), "py" (past year).',
      },
    ),
  ),
  search_intent: Type.Optional(
    Type.Boolean({
      description:
        "Whether to perform search intent recognition. true = only search when intent is detected; false (default) = always search.",
    }),
  ),
  search_domain_filter: Type.Optional(
    Type.String({
      description:
        "Restrict results to a specific domain (e.g. 'www.example.com'). Supported engines: search_std, search_pro, search_pro_sogou.",
    }),
  ),
});

export interface ZhipuSearchToolOptions {
  apiKey?: string;
  engine?: ZhipuEngine;
  contentSize?: ZhipuContentSize;
  mode?: "api" | "mcp";
  logger?: PluginLogger;
}

export function createZhipuWebSearchTool(options: ZhipuSearchToolOptions): AnyAgentTool | null {
  const { apiKey, engine = "search_std", contentSize = "medium", mode = "api", logger } = options;

  if (!apiKey) {
    logger?.warn(
      "Zhipu web search plugin: no API key configured. " +
        "Set plugins.entries.zhipu-web-search.config.apiKey or ZHIPU_API_KEY env var.",
    );
    return null;
  }

  const description =
    mode === "mcp"
      ? "Search the web using Zhipu AI Web Search (MCP, Coding Plan). Returns titles, URLs, and content snippets."
      : "Search the web using Zhipu AI Web Search API. Returns titles, URLs, content snippets, and publish dates.";

  return {
    label: "Web Search",
    name: "web_search",
    description,
    parameters: WebSearchSchema,
    execute: async (_toolCallId, args) => {
      const params = args as Record<string, unknown>;
      const query = typeof params.query === "string" ? params.query.trim() : "";
      if (!query) {
        return jsonResult({ error: "missing_query", message: "query parameter is required." });
      }

      // MCP mode — delegate to MCP backend (uses subscription quota)
      if (mode === "mcp") {
        try {
          // Map freshness to MCP recency filter
          const rawFreshness =
            typeof params.freshness === "string" ? params.freshness.trim().toLowerCase() : undefined;
          const mcpRecency = rawFreshness ? FRESHNESS_MAP[rawFreshness] : undefined;

          const mcpDomain =
            typeof params.search_domain_filter === "string" && params.search_domain_filter.trim()
              ? params.search_domain_filter.trim()
              : undefined;

          const result = await mcpSearch({
            apiKey,
            query,
            searchDomainFilter: mcpDomain,
            searchRecencyFilter: mcpRecency,
            contentSize,
            logger,
          });
          if ("error" in result) {
            return jsonResult(result);
          }
          return jsonResult(formatMcpResults(query, result));
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          return jsonResult({ error: "mcp_error", message });
        }
      }

      // API mode — full HTTP API with all parameters
      return executeApiSearch({ params, query, apiKey, engine, contentSize, logger });
    },
  };
}

/**
 * Execute search via Zhipu HTTP API (api mode).
 */
async function executeApiSearch(ctx: {
  params: Record<string, unknown>;
  query: string;
  apiKey: string;
  engine: ZhipuEngine;
  contentSize: ZhipuContentSize;
  logger?: PluginLogger;
}) {
  const { params, query, apiKey, engine, contentSize, logger } = ctx;

  const count = Math.min(
    Math.max(typeof params.count === "number" ? Math.trunc(params.count) : DEFAULT_COUNT, 1),
    MAX_COUNT,
  );

  // Log unsupported parameters (accepted for compatibility, not sent to Zhipu)
  const unsupported: string[] = [];
  if (params.country) unsupported.push("country");
  if (params.search_lang) unsupported.push("search_lang");
  if (params.ui_lang) unsupported.push("ui_lang");
  if (unsupported.length > 0) {
    logger?.info(
      `Zhipu web search: ignoring unsupported parameters: ${unsupported.join(", ")}`,
    );
  }

  // Map freshness to Zhipu recency filter
  const rawFreshness =
    typeof params.freshness === "string" ? params.freshness.trim().toLowerCase() : undefined;
  const recencyFilter = rawFreshness ? FRESHNESS_MAP[rawFreshness] : undefined;
  if (rawFreshness && !recencyFilter) {
    return jsonResult({
      error: "invalid_freshness",
      message:
        'freshness must be one of: "pd" (past day), "pw" (past week), "pm" (past month), "py" (past year).',
    });
  }

  const body: Record<string, unknown> = {
    search_query: query,
    search_engine: engine,
    count,
    content_size: contentSize,
  };
  if (recencyFilter) {
    body.search_recency_filter = recencyFilter;
  }
  if (typeof params.search_intent === "boolean") {
    body.search_intent = params.search_intent;
  }
  if (typeof params.search_domain_filter === "string" && params.search_domain_filter.trim()) {
    body.search_domain_filter = params.search_domain_filter.trim();
  }

  const start = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_SECONDS * 1000);

  try {
    const res = await fetch(ZHIPU_SEARCH_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    if (!res.ok) {
      // Sanitize error detail to avoid leaking auth headers
      const detail = await res.text().catch(() => "");
      return jsonResult({
        error: "zhipu_api_error",
        status: res.status,
        message: detail || res.statusText,
      });
    }

    const data = (await res.json()) as ZhipuSearchResponse;
    const results = Array.isArray(data.search_result) ? data.search_result : [];

    const mapped = results.map((entry) => ({
      title: entry.title ? wrapExternal(entry.title) : "",
      url: entry.link || "",
      description: entry.content ? wrapExternal(entry.content) : "",
      published: entry.publish_date ? wrapExternal(entry.publish_date) : undefined,
      media: entry.media || undefined,
      source: entry.refer ? wrapExternal(entry.refer) : undefined,
    }));

    return jsonResult({
      query,
      provider: "zhipu",
      mode: "api",
      engine,
      count: mapped.length,
      tookMs: Date.now() - start,
      results: mapped,
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      return jsonResult({ error: "timeout", message: "Zhipu search request timed out." });
    }
    const message = err instanceof Error ? err.message : String(err);
    return jsonResult({ error: "fetch_error", message });
  } finally {
    clearTimeout(timer);
  }
}

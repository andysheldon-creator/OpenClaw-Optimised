/**
 * Memory Search Hook
 *
 * Automatically searches the memory graph before answering questions
 * and injects relevant context into the agent's working memory.
 */

import axios from "axios";
import {
  type ContextFragment,
  type PreAnswerHook,
  type PreAnswerHookParams,
} from "./agent-hooks-types.js";

/**
 * Check if text appears to be a question
 */
function isQuestion(text: string): boolean {
  const textLower = text.trim().toLowerCase();

  // Ends with question mark
  if (textLower.endsWith("?")) {
    return true;
  }

  // Starts with question words
  const questionWords = [
    "what",
    "how",
    "why",
    "when",
    "where",
    "who",
    "which",
    "can",
    "could",
    "would",
    "should",
    "is",
    "are",
    "do",
    "does",
    "did",
    "will",
    "have",
    "has",
  ];

  for (const word of questionWords) {
    if (textLower.startsWith(word + " ")) {
      return true;
    }
  }

  return false;
}

/**
 * Get Memory Gateway URL from mcporter config
 */
function getMemoryGatewayUrl(): string | null {
  try {
    const configPath = process.env.HOME + "/clawd/config/mcporter.json";
    const fs = require("fs");
    const config = JSON.parse(fs.readFileSync(configPath, "utf8"));

    // Find memory-gateway MCP server
    for (const entry of Object.entries<any>(config.mcpServers ?? {})) {
      const [id, server] = entry;
      if (id === "memory-gateway" || server.transport?.type === "sse") {
        return server.transport?.url || null;
      }
    }
  } catch {
    // Config doesn't exist or can't be read
  }

  // Try environment variable
  return process.env.MEMORY_GATEWAY_URL || null;
}

/**
 * Search memory gateway via HTTP
 */
async function searchMemoryGateway(
  query: string,
  options: { limit?: number; minScore?: number } = {},
): Promise<Array<{ content: string; path: string; score: number; lines: string }>> {
  const gatewayUrl = getMemoryGatewayUrl();

  if (!gatewayUrl) {
    console.warn("[memory-search-hook] Memory Gateway URL not found");
    return [];
  }

  try {
    const response = await axios.post(
      `${gatewayUrl}/tools/call`,
      {
        name: "memory-gateway.search",
        arguments: {
          query,
          limit: options.limit ?? 10,
        },
      },
      {
        headers: {
          "Content-Type": "application/json",
        },
        timeout: 5000, // 5 second timeout for memory search
      },
    );

    if (response.data?.result?.content) {
      const content = response.data.result.content;
      if (Array.isArray(content)) {
        // Parse tool result content array
        for (const item of content) {
          if (item.type === "text") {
            try {
              const data = JSON.parse(item.text);
              if (Array.isArray(data.results)) {
                return data.results.map((r: any) => ({
                  content: r.snippet || "",
                  path: r.path || "",
                  score: r.score || 0,
                  lines: `${r.startLine}-${r.endLine}`,
                }));
              }
            } catch {
              // Not JSON, skip
            }
          }
        }
      }
    }

    return [];
  } catch (error) {
    console.warn(
      "[memory-search-hook] Memory search failed:",
      error instanceof Error ? error.message : String(error),
    );
    return [];
  }
}

/**
 * Memory search hook implementation
 */
export const memorySearchHook: PreAnswerHook = {
  id: "memory-search",
  description: "Search memory graph for relevant context before answering",
  priority: 50, // Run early (lower priority = earlier)

  enabledByDefault: false, // Disabled by default until configured

  timeoutMs: 10000, // 10 second timeout

  // Don't run for heartbeats or very short messages
  shouldExecute: (params: PreAnswerHookParams) => {
    if (params.isHeartbeat) {
      return false;
    }

    const commandBody = params.commandBody.trim();

    // Skip very short messages
    if (commandBody.length < 10) {
      return false;
    }

    // Only run for questions or requests for information
    return isQuestion(commandBody);
  },

  async execute(
    params: PreAnswerHookParams,
  ): Promise<{ contextFragments: ContextFragment[]; metadata?: Record<string, unknown> }> {
    const commandBody = params.commandBody.trim();

    // Search memory
    const results = await searchMemoryGateway(commandBody, {
      limit: 5,
    });

    if (results.length === 0) {
      return {
        contextFragments: [],
        metadata: { memoryCount: 0 },
      };
    }

    // Format into context fragments
    const fragments = results.map((r) => ({
      content: r.content,
      weight: 10, // Low weight to prioritize user message
      metadata: {
        source: "memory-gateway",
        path: r.path,
        score: r.score,
        lines: r.lines,
      },
    }));

    // Also add a summary fragment
    const summaryFragment: ContextFragment = {
      content: `# Memory Found (${results.length} results)\n\nI found ${results.length} relevant memories below. Use this context if it helps answer the question.`,
      weight: 0, // Highest priority
      metadata: {
        source: "memory-search-hook-summary",
        memoryCount: results.length,
      },
    };

    return {
      contextFragments: [summaryFragment, ...fragments],
      metadata: {
        memoryCount: results.length,
        avgScore: results.reduce((sum, r) => sum + r.score, 0) / results.length,
      },
    };
  },
};

/**
 * Auto-register the memory search hook
 */
export function registerMemorySearchHook(): void {
  const { preAnswerHookRegistry } = require("./agent-hooks-registry.js");
  preAnswerHookRegistry.register(memorySearchHook);
}

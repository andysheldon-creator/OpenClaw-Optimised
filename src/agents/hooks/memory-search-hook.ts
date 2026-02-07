/**
 * Memory Search Hook
 *
 * Automatically searches the memory graph before answering questions
 * and injects relevant context into the agent's working memory.
 */

import { preAnswerHookRegistry } from "../agent-hooks-registry.js";
import {
  type ContextFragment,
  type PreAnswerHook,
  type PreAnswerHookParams,
} from "../agent-hooks-types.js";

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
 * Search memory gateway via mcporter CLI
 */
async function searchMemoryGateway(
  query: string,
  options: { limit?: number; minScore?: number } = {},
): Promise<Array<{ content: string; path: string; score: number; lines: string }>> {
  const { spawn } = await import("child_process");

  const limit = options.limit ?? 10;
  const limitArg = `limit:${limit}`;

  return new Promise((resolve) => {
    const child = spawn("mcporter", ["call", "memory-gateway.search", `query=${query}`, limitArg], {
      stdio: ["ignore", "pipe", "pipe"],
      timeout: 5000,
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (data) => {
      stdout += data.toString();
    });

    child.stderr.on("data", (data) => {
      stderr += data.toString();
    });

    child.on("close", (code) => {
      if (code !== 0 || !stdout) {
        // console.warn("[memory-search-hook] Mcporter call failed:", code, stderr);
        resolve([]);
        return;
      }

      try {
        const data = JSON.parse(stdout);
        if (data.results && Array.isArray(data.results)) {
          const results = data.results.map((r: any) => ({
            content:
              (r as { payload?: { content?: string; snippet?: string } }).payload?.content ||
              (r as { payload?: { content?: string; snippet?: string } }).payload?.snippet ||
              "",
            path: r.payload?.path || "",
            score: r.score || 0,
            lines: "", // mcporter doesn't return line numbers
          }));
          resolve(
            results.filter(
              (r: { content: string; path: string; score: number; lines: string }) =>
                r.content.length > 0,
            ),
          );
        } else {
          resolve([]);
        }
      } catch (error) {
        console.warn(
          "[memory-search-hook] Failed to parse mcporter output:",
          error instanceof Error ? error.message : String(error),
        );
        resolve([]);
      }
    });

    child.on("error", (error) => {
      console.warn("[memory-search-hook] Mcporter spawn error:", error.message);
      resolve([]);
    });
  });
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
  preAnswerHookRegistry.register(memorySearchHook);
}

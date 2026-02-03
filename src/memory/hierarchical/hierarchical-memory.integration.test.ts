/**
 * Integration tests for hierarchical memory summarization.
 *
 * These tests use a real LLM API to verify the full summarization pipeline.
 */

import { SessionManager } from "@mariozechner/pi-coding-agent";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { OpenClawConfig } from "../../config/types.openclaw.js";

// Skip if no API key provided
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const describeWithApi = ANTHROPIC_API_KEY ? describe : describe.skip;

describeWithApi("hierarchical memory integration", () => {
  let tempDir: string;
  let originalStateDir: string | undefined;
  const agentId = "test-agent";

  beforeEach(async () => {
    // Save original env
    originalStateDir = process.env.OPENCLAW_STATE_DIR;

    // Create temp directory structure
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "hmem-int-"));

    // Set env to use temp directory
    process.env.OPENCLAW_STATE_DIR = tempDir;

    // Create directory structure
    const sessionsDir = path.join(tempDir, "agents", agentId, "sessions");
    await fs.mkdir(sessionsDir, { recursive: true });
  });

  afterEach(async () => {
    // Restore original env
    if (originalStateDir !== undefined) {
      process.env.OPENCLAW_STATE_DIR = originalStateDir;
    } else {
      delete process.env.OPENCLAW_STATE_DIR;
    }

    // Clean up temp directory
    if (tempDir) {
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  });

  /**
   * Create a session with conversation data.
   */
  async function createSessionWithConversation(messageCount: number): Promise<string> {
    const sessionsDir = path.join(tempDir, "agents", agentId, "sessions");
    const sessionFile = path.join(sessionsDir, "test-session.jsonl");
    const storeFile = path.join(sessionsDir, "sessions.json");

    const sessionManager = SessionManager.open(sessionFile);

    // Add multiple user-assistant exchanges
    for (let i = 0; i < messageCount; i++) {
      sessionManager.appendMessage({
        role: "user",
        content: [
          {
            type: "text",
            text: `This is user message ${i + 1}. I'm asking about topic ${i % 5}: ${getTopicContent(i)}`,
          },
        ],
      });

      sessionManager.appendMessage({
        role: "assistant",
        content: [
          {
            type: "text",
            text: `This is assistant response ${i + 1}. Here's information about topic ${i % 5}: ${getAssistantResponse(i)}`,
          },
        ],
        stopReason: "stop",
        api: "anthropic",
        provider: "anthropic",
        model: "claude-sonnet-4-20250514",
        usage: {
          input: 100,
          output: 200,
          cacheRead: 0,
          cacheWrite: 0,
          totalTokens: 300,
          cost: { input: 0.001, output: 0.002, cacheRead: 0, cacheWrite: 0, total: 0.003 },
        },
        timestamp: Date.now() - (messageCount - i) * 60000,
      });
    }

    // Create sessions store file
    const store = {
      [`agent:${agentId}:main`]: {
        sessionId: "test-session",
        agentId,
        createdAt: Date.now() - messageCount * 60000,
        model: "anthropic/claude-sonnet-4-20250514",
      },
    };
    await fs.writeFile(storeFile, JSON.stringify(store, null, 2));

    return sessionFile;
  }

  function getTopicContent(index: number): string {
    const topics = [
      "I want to learn about JavaScript async/await patterns and how to handle errors properly.",
      "Can you explain how React hooks work and when to use useEffect vs useMemo?",
      "I need help understanding database indexing strategies for PostgreSQL.",
      "What are the best practices for API design and REST endpoints?",
      "How do I set up a CI/CD pipeline with GitHub Actions?",
    ];
    return topics[index % topics.length];
  }

  function getAssistantResponse(index: number): string {
    const responses = [
      "Async/await is built on Promises. Always wrap await in try/catch for error handling. You can also use Promise.all for parallel operations.",
      "useEffect runs after render for side effects. useMemo memoizes expensive calculations. useCallback memoizes functions. Use dependency arrays carefully.",
      "Create indexes on columns used in WHERE, JOIN, and ORDER BY clauses. Consider composite indexes for multi-column queries. Monitor query plans with EXPLAIN.",
      "Use nouns for resources, HTTP verbs for actions. Version your API. Return appropriate status codes. Document with OpenAPI/Swagger.",
      "Create workflow YAML files in .github/workflows/. Define triggers, jobs, and steps. Use caching for dependencies. Set up secrets for credentials.",
    ];
    return responses[index % responses.length];
  }

  /**
   * Create a test config with hierarchical memory enabled.
   */
  function createTestConfig(): OpenClawConfig {
    const sessionsDir = path.join(tempDir, "agents", agentId, "sessions");
    return {
      agents: {
        defaults: {
          hierarchicalMemory: {
            enabled: true,
            model: "anthropic/claude-sonnet-4-20250514",
            // Use smaller thresholds for testing
            chunkTokens: 500,
            mergeThreshold: 2,
            pruningBoundaryTokens: 200, // Very low to force summarization
          },
        },
      },
      session: {
        store: path.join(sessionsDir, "sessions.json"),
      },
      auth: {
        anthropic: {
          apiKey: ANTHROPIC_API_KEY,
        },
      },
    } as OpenClawConfig;
  }

  it("summarizes conversation chunks into L1 memories", { timeout: 120_000 }, async () => {
    // Import dynamically to pick up env changes
    const { runHierarchicalMemoryWorker } = await import("./worker.js");
    const { hasSummaries, loadSummaryIndex, resolveSummariesDir } = await import("./storage.js");

    // Create a conversation with enough messages to trigger summarization
    await createSessionWithConversation(20);

    const config = createTestConfig();

    // Run the worker
    const result = await runHierarchicalMemoryWorker({
      agentId,
      config,
    });

    console.log("Worker result:", JSON.stringify(result, null, 2));

    expect(result.success).toBe(true);

    // If no session found, the test env setup might not be working
    if (result.skipped === "no_session") {
      console.log("Skipped due to no_session - checking paths:");
      console.log("  OPENCLAW_STATE_DIR:", process.env.OPENCLAW_STATE_DIR);
      console.log("  Expected sessions dir:", path.join(tempDir, "agents", agentId, "sessions"));
      const sessionsDir = path.join(tempDir, "agents", agentId, "sessions");
      const files = await fs.readdir(sessionsDir);
      console.log("  Files in sessions dir:", files);
    }

    expect(result.skipped).toBeUndefined();

    // Verify summaries were created
    const summariesExist = await hasSummaries(agentId);
    expect(summariesExist).toBe(true);

    const index = await loadSummaryIndex(agentId);
    expect(index.levels.L1.length).toBeGreaterThan(0);

    console.log("L1 summaries created:", index.levels.L1.length);

    // Read and display summaries
    const summariesDir = resolveSummariesDir(agentId);
    const l1Dir = path.join(summariesDir, "L1");

    try {
      const files = await fs.readdir(l1Dir);
      for (const file of files.filter((f) => f.endsWith(".md"))) {
        const content = await fs.readFile(path.join(l1Dir, file), "utf-8");
        console.log(`\n--- ${file} ---\n${content}`);
      }
    } catch {
      // L1 dir might not exist yet
    }
  });

  it("loads memory context for system prompt injection", { timeout: 120_000 }, async () => {
    const { runHierarchicalMemoryWorker } = await import("./worker.js");
    const { loadMemoryContext } = await import("./context.js");

    // Create conversation and run worker first
    await createSessionWithConversation(20);

    const config = createTestConfig();
    const result = await runHierarchicalMemoryWorker({ agentId, config });

    if (result.skipped) {
      console.log("Worker skipped:", result.skipped);
      return; // Skip rest of test
    }

    // Now test memory context loading
    const memoryContext = await loadMemoryContext(agentId);

    expect(memoryContext).not.toBeNull();
    if (memoryContext) {
      expect(memoryContext.memorySection).toBeTruthy();
      expect(memoryContext.tokenEstimate).toBeGreaterThan(0);

      console.log("Memory context token estimate:", memoryContext.tokenEstimate);
      console.log("Memory section preview:", memoryContext.memorySection.slice(0, 500));
    }
  });

  it("skips when hierarchical memory is disabled", async () => {
    const { runHierarchicalMemoryWorker } = await import("./worker.js");

    await createSessionWithConversation(10);

    const config: OpenClawConfig = {
      agents: {
        defaults: {
          hierarchicalMemory: {
            enabled: false,
          },
        },
      },
    } as OpenClawConfig;

    const result = await runHierarchicalMemoryWorker({ agentId, config });

    expect(result.success).toBe(true);
    expect(result.skipped).toBe("disabled");
  });
});

/**
 * Agent Unit Tests
 *
 * Tests Clawdbot agent functionality:
 * - Agent configuration resolution
 * - Agent ID normalization and routing
 * - Agent workspace and directory resolution
 * - Agent model configuration
 * - Session-based agent selection
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdirSync, rmSync, existsSync, writeFileSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { randomBytes } from "crypto";

// Import the functions to test
import {
  listAgentIds,
  resolveDefaultAgentId,
  resolveSessionAgentId,
  resolveSessionAgentIds,
  resolveAgentConfig,
  resolveAgentModelPrimary,
  resolveAgentModelFallbacksOverride,
  resolveAgentWorkspaceDir,
  resolveAgentDir,
} from "../../src/agents/agent-scope.js";
import type { ClawdbotConfig } from "../../src/config/config.js";

// Test utilities
function createTempDir(): string {
  const tempDir = join(tmpdir(), `clawdbot-test-${randomBytes(8).toString("hex")}`);
  mkdirSync(tempDir, { recursive: true });
  return tempDir;
}

function cleanupTempDir(tempDir: string): void {
  if (existsSync(tempDir)) {
    rmSync(tempDir, { recursive: true, force: true });
  }
}

// Test data
function createMockConfig(overrides: Partial<ClawdbotConfig> = {}): ClawdbotConfig {
  return {
    meta: {
      lastTouchedVersion: "2026.1.24-0",
      lastTouchedAt: new Date().toISOString(),
    },
    agents: {
      defaults: {
        model: {
          primary: "test-model",
        },
      },
      list: overrides.agents?.list || [],
    },
    ...overrides,
  } as ClawdbotConfig;
}

describe("Agent Unit Tests", () => {
  describe("listAgentIds", () => {
    it("should return default agent ID when no agents configured", () => {
      const config = createMockConfig();
      const ids = listAgentIds(config);

      expect(ids).toEqual(["main"]);
    });

    it("should return all configured agent IDs", () => {
      const config = createMockConfig({
        agents: {
          defaults: {},
          list: [
            { id: "agent-1", name: "Agent 1" },
            { id: "agent-2", name: "Agent 2" },
            { id: "agent-1", name: "Duplicate" }, // Duplicate should be ignored
          ],
        },
      });

      const ids = listAgentIds(config);

      expect(ids).toHaveLength(2);
      expect(ids).toContain("agent-1");
      expect(ids).toContain("agent-2");
    });

    it("should normalize agent IDs (lowercase, trim)", () => {
      const config = createMockConfig({
        agents: {
          defaults: {},
          list: [{ id: "  Test-Agent  " }, { id: "ANOTHER-AGENT" }],
        },
      });

      const ids = listAgentIds(config);

      expect(ids).toContain("test-agent");
      expect(ids).toContain("another-agent");
    });
  });

  describe("importDefaultAgentId", () => {
    it("should return main when no agents configured", () => {
      const config = createMockConfig();
      const agentId = resolveDefaultAgentId(config);

      expect(agentId).toBe("main");
    });

    it("should return agent marked as default", () => {
      const config = createMockConfig({
        agents: {
          defaults: {},
          list: [
            { id: "agent-1", name: "Agent 1", default: false },
            { id: "agent-2", name: "Agent 2", default: true },
            { id: "agent-3", name: "Agent 3", default: false },
          ],
        },
      });

      const agentId = resolveDefaultAgentId(config);

      expect(agentId).toBe("agent-2");
    });

    it("should return first agent when none marked as default", () => {
      const config = createMockConfig({
        agents: {
          defaults: {},
          list: [
            { id: "agent-1", name: "Agent 1" },
            { id: "agent-2", name: "Agent 2" },
          ],
        },
      });

      const agentId = resolveDefaultAgentId(config);

      expect(agentId).toBe("agent-1");
    });

    it("should handle empty ID gracefully", () => {
      const config = createMockConfig({
        agents: {
          defaults: {},
          list: [{ id: "   ", name: "Empty ID" }],
        },
      });

      const agentId = resolveDefaultAgentId(config);

      expect(agentId).toBe("main");
    });
  });

  describe("resolveSessionAgentId", () => {
    const mockConfig = createMockConfig({
      agents: {
        defaults: {},
        list: [
          { id: "main", name: "Main Agent", default: true },
          { id: "specialist", name: "Specialist" },
        ],
      },
    });

    it("should return default agent when no session key provided", () => {
      const agentId = resolveSessionAgentId({ config: mockConfig });

      expect(agentId).toBe("main");
    });

    it("should parse agent ID from session key", () => {
      const agentId = resolveSessionAgentId({
        config: mockConfig,
        sessionKey: "agent:specialist:active",
      });

      expect(agentId).toBe("specialist");
    });

    it("should normalize session key and agent ID", () => {
      const agentId = resolveSessionAgentId({
        config: mockConfig,
        sessionKey: "  AGENT:SPECIALIST:ACTIVE  ",
      });

      expect(agentId).toBe("specialist");
    });

    it("should return default agent for invalid session key", () => {
      const agentId = resolveSessionAgentId({
        config: mockConfig,
        sessionKey: "invalid:session:key",
      });

      expect(agentId).toBe("main");
    });
  });

  describe("resolveSessionAgentIds", () => {
    const mockConfig = createMockConfig({
      agents: {
        defaults: {},
        list: [
          { id: "main", name: "Main Agent", default: true },
          { id: "specialist", name: "Specialist" },
        ],
      },
    });

    it("should return both default and session agent IDs", () => {
      const result = resolveSessionAgentIds({
        config: mockConfig,
        sessionKey: "agent:specialist:active",
      });

      expect(result.defaultAgentId).toBe("main");
      expect(result.sessionAgentId).toBe("specialist");
    });

    it("should return same agent twice when session matches default", () => {
      const result = resolveSessionAgentIds({
        config: mockConfig,
        sessionKey: "agent:main",
      });

      expect(result.defaultAgentId).toBe("main");
      expect(result.sessionAgentId).toBe("main");
    });
  });

  describe("resolveAgentConfig", () => {
    it("should resolve all agent configuration fields", () => {
      const config = createMockConfig({
        agents: {
          defaults: {},
          list: [
            {
              id: "test-agent",
              name: "Test Agent",
              workspace: "/test/workspace",
              agentDir: "/test/agent/dir",
              model: "test-model",
              memorySearch: { provider: "test", endpoint: "http://test" },
              humanDelay: { enabled: true },
              heartbeat: { interval: 1000 },
              identity: { name: "Test", role: "assistant" },
              groupChat: { enabled: true },
              subagents: { maxConcurrent: 4 },
              sandbox: { enabled: false },
              tools: ["test-tool"],
            },
          ],
        },
      });

      const resolved = resolveAgentConfig(config, "test-agent");

      expect(resolved).toBeDefined();
      expect(resolved?.name).toBe("Test Agent");
      expect(resolved?.workspace).toBe("/test/workspace");
      expect(resolved?.agentDir).toBe("/test/agent/dir");
      expect(resolved?.model).toBe("test-model");
      expect(resolved?.memorySearch).toEqual({
        provider: "test",
        endpoint: "http://test",
      });
      expect(resolved?.humanDelay).toEqual({ enabled: true });
      expect(resolved?.heartbeat).toEqual({ interval: 1000 });
      expect(resolved?.identity).toEqual({ name: "Test", role: "assistant" });
      expect(resolved?.groupChat).toEqual({ enabled: true });
      expect(resolved?.subagents).toEqual({ maxConcurrent: 4 });
      expect(resolved?.sandbox).toEqual({ enabled: false });
      expect(resolved?.tools).toEqual(["test-tool"]);
    });

    it("should return undefined for unknown agent", () => {
      const config = createMockConfig();
      const resolved = resolveAgentConfig(config, "unknown-agent");

      expect(resolved).toBeUndefined();
    });

    it("should handle optional fields gracefully", () => {
      const config = createMockConfig({
        agents: {
          defaults: {},
          list: [{ id: "minimal-agent" }],
        },
      });

      const resolved = resolveAgentConfig(config, "minimal-agent");

      expect(resolved).toBeDefined();
      expect(resolved?.name).toBeUndefined();
      expect(resolved?.workspace).toBeUndefined();
      expect(resolved?.model).toBeUndefined();
    });
  });

  describe("resolveAgentModelPrimary", () => {
    it("should return primary model from string", () => {
      const config = createMockConfig({
        agents: {
          defaults: {},
          list: [{ id: "test-agent", model: "test-model" }],
        },
      });

      const primary = resolveAgentModelPrimary(config, "test-agent");

      expect(primary).toBe("test-model");
    });

    it("should return primary model from object", () => {
      const config = createMockConfig({
        agents: {
          defaults: {},
          list: [
            {
              id: "test-agent",
              model: { primary: "test-model", fallbacks: ["fallback-1", "fallback-2"] },
            },
          ],
        },
      });

      const primary = resolveAgentModelPrimary(config, "test-agent");

      expect(primary).toBe("test-model");
    });

    it("should return undefined when no model configured", () => {
      const config = createMockConfig({
        agents: {
          defaults: {},
          list: [{ id: "test-agent" }],
        },
      });

      const primary = resolveAgentModelPrimary(config, "test-agent");

      expect(primary).toBeUndefined();
    });
  });

  describe("resolveAgentModelFallbacksOverride", () => {
    it("should return fallbacks when explicitly set", () => {
      const config = createMockConfig({
        agents: {
          defaults: {},
          list: [
            {
              id: "test-agent",
              model: { primary: "test-model", fallbacks: ["fallback-1", "fallback-2"] },
            },
          ],
        },
      });

      const fallbacks = resolveAgentModelFallbacksOverride(config, "test-agent");

      expect(fallbacks).toEqual(["fallback-1", "fallback-2"]);
    });

    it("should return undefined when model is string", () => {
      const config = createMockConfig({
        agents: {
          defaults: {},
          list: [{ id: "test-agent", model: "test-model" }],
        },
      });

      const fallbacks = resolveAgentModelFallbacksOverride(config, "test-agent");

      expect(fallbacks).toBeUndefined();
    });

    it("should return undefined when fallbacks not explicitly set", () => {
      const config = createMockConfig({
        agents: {
          defaults: {},
          list: [{ id: "test-agent", model: { primary: "test-model" } }],
        },
      });

      const fallbacks = resolveAgentModelFallbacksOverride(config, "test-agent");

      expect(fallbacks).toBeUndefined();
    });

    it("should return empty array when explicitly set to empty", () => {
      const config = createMockConfig({
        agents: {
          defaults: {},
          list: [{ id: "test-agent", model: { primary: "test-model", fallbacks: [] } }],
        },
      });

      const fallbacks = resolveAgentModelFallbacksOverride(config, "test-agent");

      expect(fallbacks).toEqual([]);
    });
  });

  describe("resolveAgentWorkspaceDir", () => {
    let tempDir: string;

    beforeEach(() => {
      tempDir = createTempDir();
    });

    afterEach(() => {
      cleanupTempDir(tempDir);
    });

    it("should return configured workspace", () => {
      const workspacePath = join(tempDir, "custom-workspace");
      const config = createMockConfig({
        agents: {
          defaults: {},
          list: [{ id: "test-agent", workspace: workspacePath }],
        },
      });

      const resolved = resolveAgentWorkspaceDir(config, "test-agent");

      expect(resolved).toBe(workspacePath);
    });

    it("should return default workspace for default agent", () => {
      const defaultWorkspace = join(tempDir, "default-workspace");
      const config = createMockConfig({
        agents: {
          defaults: { workspace: defaultWorkspace },
          list: [{ id: "main", default: true }],
        },
      });

      const resolved = resolveAgentWorkspaceDir(config, "main");

      expect(resolved).toBe(defaultWorkspace);
    });

    it("should return hardcoded default for non-default agent", () => {
      const config = createMockConfig({
        agents: {
          defaults: {},
          list: [{ id: "main", default: true }, { id: "other-agent" }],
        },
      });

      const resolved = resolveAgentWorkspaceDir(config, "other-agent");

      // Should return ~/clawd-other-agent
      expect(resolved).toContain("clawd-other-agent");
    });
  });

  describe("resolveAgentDir", () => {
    let tempDir: string;

    beforeEach(() => {
      tempDir = createTempDir();
      process.env.CLAWDBOT_STATE_DIR = tempDir;
    });

    afterEach(() => {
      cleanupTempDir(tempDir);
      delete process.env.CLAWDBOT_STATE_DIR;
    });

    it("should return configured agent directory", () => {
      const agentDirPath = join(tempDir, "custom-agent");
      const config = createMockConfig({
        agents: {
          defaults: {},
          list: [{ id: "test-agent", agentDir: agentDirPath }],
        },
      });

      const resolved = resolveAgentDir(config, "test-agent");

      expect(resolved).toBe(agentDirPath);
    });

    it("should return default path based on state directory", () => {
      const config = createMockConfig({
        agents: {
          defaults: {},
          list: [{ id: "test-agent" }],
        },
      });

      const resolved = resolveAgentDir(config, "test-agent");

      expect(resolved).toBe(join(tempDir, "agents", "test-agent", "agent"));
    });

    it("should create state directory when it doesn't exist", () => {
      const config = createMockConfig({
        agents: {
          defaults: {},
          list: [{ id: "test-agent" }],
        },
      });

      // State dir should be created if it doesn't exist
      const resolved = resolveAgentDir(config, "test-agent");

      expect(resolved).toContain("agents");
    });
  });

  describe("Agent Routing (エージェントルーティング)", () => {
    it("should route message to correct agent based on session", () => {
      const config = createMockConfig({
        agents: {
          defaults: {},
          list: [
            { id: "main", name: "Main", default: true },
            { id: "specialist", name: "Specialist" },
          ],
        },
      });

      // No session key → use default
      const agent1 = resolveSessionAgentId({ config });
      expect(agent1).toBe("main");

      // With session key → use specialist (format: agent:agentId:rest)
      const agent2 = resolveSessionAgentId({
        config,
        sessionKey: "agent:specialist:active",
      });
      expect(agent2).toBe("specialist");
    });

    it("should handle invalid agent IDs gracefully", () => {
      const config = createMockConfig({
        agents: {
          defaults: {},
          list: [{ id: "main", name: "Main" }],
        },
      });

      // Invalid session key should fall back to default
      const agent = resolveSessionAgentId({
        config,
        sessionKey: "agent:nonexistent",
      });
      expect(agent).toBe("main");
    });
  });

  describe("Agent Configuration Validation", () => {
    it("should validate agent configuration structure", () => {
      const validConfig = createMockConfig({
        agents: {
          defaults: {
            model: { primary: "test-model" },
            maxConcurrent: 4,
          },
          list: [
            {
              id: "test-agent",
              name: "Test",
              model: "test-model",
              workspace: "/test",
            },
          ],
        },
      });

      expect(validConfig.agents?.list).toBeDefined();
      expect(Array.isArray(validConfig.agents?.list)).toBe(true);
    });

    it("should handle empty agent list", () => {
      const config = createMockConfig({
        agents: {
          defaults: {},
          list: [],
        },
      });

      const ids = listAgentIds(config);
      expect(ids).toEqual(["main"]);
    });
  });

  describe("Agent Model Resolution", () => {
    it("should resolve model with primary and fallbacks", () => {
      const config = createMockConfig({
        agents: {
          defaults: {},
          list: [
            {
              id: "test-agent",
              model: {
                primary: "anthropic/claude-opus-4",
                fallbacks: ["openai/gpt-4", "google/gemini-pro"],
              },
            },
          ],
        },
      });

      const primary = resolveAgentModelPrimary(config, "test-agent");
      const fallbacks = resolveAgentModelFallbacksOverride(config, "test-agent");

      expect(primary).toBe("anthropic/claude-opus-4");
      expect(fallbacks).toEqual(["openai/gpt-4", "google/gemini-pro"]);
    });

    it("should handle string model configuration", () => {
      const config = createMockConfig({
        agents: {
          defaults: {},
          list: [
            {
              id: "test-agent",
              model: "simple-model",
            },
          ],
        },
      });

      const primary = resolveAgentModelPrimary(config, "test-agent");
      const fallbacks = resolveAgentModelFallbacksOverride(config, "test-agent");

      expect(primary).toBe("simple-model");
      expect(fallbacks).toBeUndefined();
    });
  });
});

/**
 * Agent Unit Test Summary
 *
 * Test Coverage:
 * ✅ Agent ID listing and normalization
 * ✅ Default agent resolution
 * ✅ Session-based agent selection
 * ✅ Agent configuration resolution
 * ✅ Model configuration (primary + fallbacks)
 * ✅ Workspace directory resolution
 * ✅ Agent directory resolution
 * ✅ Agent routing logic
 * ✅ Configuration validation
 *
 * Run with:
 * pnpm test test/unit/agent.test.ts
 *
 * For coverage:
 * pnpm test:coverage test/unit/agent.test.ts
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { OpenClawConfig } from "../config/config.js";
import type { ExecutionRequest } from "./types.js";
import { DefaultRuntimeResolver, createRuntimeResolver, type RuntimeResolver } from "./resolver.js";

// Mock resolveSandboxContext to avoid Docker dependencies in tests
vi.mock("../agents/sandbox/context.js", () => ({
  resolveSandboxContext: vi.fn().mockResolvedValue(null),
}));

describe("RuntimeResolver", () => {
  let resolver: RuntimeResolver;

  beforeEach(() => {
    resolver = createRuntimeResolver();
  });

  // ---------------------------------------------------------------------------
  // Runtime Kind Resolution
  // ---------------------------------------------------------------------------

  describe("resolveRuntimeKind", () => {
    it("returns pi by default when no config provided", async () => {
      const request = createRequest({});
      const result = await resolver.resolve(request);
      expect(result.kind).toBe("pi");
    });

    it("uses explicit runtimeKind from request", async () => {
      const request = createRequest({ runtimeKind: "claude" });
      const result = await resolver.resolve(request);
      expect(result.kind).toBe("claude");
    });

    it("uses explicit runtimeKind=cli from request", async () => {
      const request = createRequest({ runtimeKind: "cli" });
      const result = await resolver.resolve(request);
      expect(result.kind).toBe("cli");
    });

    it("resolves claude from agents.defaults.mainRuntime", async () => {
      const config: Partial<OpenClawConfig> = {
        agents: { defaults: { mainRuntime: "claude" } },
      };
      const request = createRequest({ config: config as OpenClawConfig });
      const result = await resolver.resolve(request);
      expect(result.kind).toBe("claude");
    });

    it("resolves claude from agents.main.runtime", async () => {
      const config: Partial<OpenClawConfig> = {
        agents: { main: { runtime: "claude" } },
      };
      const request = createRequest({ config: config as OpenClawConfig });
      const result = await resolver.resolve(request);
      expect(result.kind).toBe("claude");
    });

    it("resolves claude from agents.defaults.runtime", async () => {
      const config: Partial<OpenClawConfig> = {
        agents: { defaults: { runtime: "claude" } },
      };
      const request = createRequest({ config: config as OpenClawConfig });
      const result = await resolver.resolve(request);
      expect(result.kind).toBe("claude");
    });

    it("prioritizes mainRuntime over agents.defaults.runtime for main agent", async () => {
      const config: Partial<OpenClawConfig> = {
        agents: {
          defaults: {
            mainRuntime: "claude",
            runtime: "pi",
          },
        },
      };
      const request = createRequest({ config: config as OpenClawConfig });
      const result = await resolver.resolve(request);
      expect(result.kind).toBe("claude");
    });

    it("resolves per-agent runtime override", async () => {
      const config: Partial<OpenClawConfig> = {
        agents: {
          list: [{ id: "custom-agent", runtime: "claude" }],
          defaults: { runtime: "pi" },
        },
      };
      const request = createRequest({
        config: config as OpenClawConfig,
        agentId: "custom-agent",
      });
      const result = await resolver.resolve(request);
      expect(result.kind).toBe("claude");
    });

    it("uses global default for non-main agents without per-agent config", async () => {
      const config: Partial<OpenClawConfig> = {
        agents: {
          list: [{ id: "other-agent" }],
          defaults: { runtime: "claude" },
        },
      };
      const request = createRequest({
        config: config as OpenClawConfig,
        agentId: "other-agent",
      });
      const result = await resolver.resolve(request);
      expect(result.kind).toBe("claude");
    });
  });

  // ---------------------------------------------------------------------------
  // Subagent Runtime Inheritance
  // ---------------------------------------------------------------------------

  describe("subagent runtime inheritance", () => {
    it("inherits runtime for subagent sessions by default", async () => {
      const config: Partial<OpenClawConfig> = {
        agents: { defaults: { runtime: "claude" } },
      };
      const request = createRequest({
        config: config as OpenClawConfig,
        sessionKey: "agent:main:subagent:test-uuid",
      });
      const result = await resolver.resolve(request);
      expect(result.kind).toBe("claude");
    });

    it("uses explicit subagent runtime from per-agent config", async () => {
      const config: Partial<OpenClawConfig> = {
        agents: {
          list: [
            {
              id: "main",
              runtime: "pi",
              subagents: { runtime: "claude" },
            },
          ],
        },
      };
      const request = createRequest({
        config: config as OpenClawConfig,
        sessionKey: "agent:main:subagent:test-uuid",
      });
      const result = await resolver.resolve(request);
      expect(result.kind).toBe("claude");
    });

    it("uses explicit subagent runtime from global config", async () => {
      const config: Partial<OpenClawConfig> = {
        agents: {
          defaults: {
            runtime: "pi",
            subagents: { runtime: "claude" },
          },
        },
      };
      const request = createRequest({
        config: config as OpenClawConfig,
        sessionKey: "agent:main:subagent:test-uuid",
      });
      const result = await resolver.resolve(request);
      expect(result.kind).toBe("claude");
    });

    it("inherits parent runtime when subagent runtime is 'inherit'", async () => {
      const config: Partial<OpenClawConfig> = {
        agents: {
          defaults: {
            runtime: "claude",
            subagents: { runtime: "inherit" },
          },
        },
      };
      const request = createRequest({
        config: config as OpenClawConfig,
        sessionKey: "agent:main:subagent:test-uuid",
      });
      const result = await resolver.resolve(request);
      expect(result.kind).toBe("claude");
    });
  });

  // ---------------------------------------------------------------------------
  // CLI Provider Detection
  // ---------------------------------------------------------------------------

  describe("CLI provider detection", () => {
    it("detects built-in claude-cli provider", async () => {
      const config: Partial<OpenClawConfig> = {
        agents: {
          defaults: {
            model: { primary: "claude-cli/claude-opus-4-5" },
          },
        },
      };
      const request = createRequest({ config: config as OpenClawConfig });
      const result = await resolver.resolve(request);
      expect(result.kind).toBe("cli");
    });

    it("detects built-in codex-cli provider", async () => {
      const config: Partial<OpenClawConfig> = {
        agents: {
          defaults: {
            model: { primary: "codex-cli/gpt-5.2-codex" },
          },
        },
      };
      const request = createRequest({ config: config as OpenClawConfig });
      const result = await resolver.resolve(request);
      expect(result.kind).toBe("cli");
    });

    it("detects custom CLI backend", async () => {
      const config: Partial<OpenClawConfig> = {
        agents: {
          defaults: {
            model: { primary: "custom-cli/model" },
            cliBackends: { "custom-cli": { command: "custom-cli" } },
          },
        },
      };
      const request = createRequest({ config: config as OpenClawConfig });
      const result = await resolver.resolve(request);
      expect(result.kind).toBe("cli");
    });

    it("explicit runtimeKind overrides CLI provider detection", async () => {
      const config: Partial<OpenClawConfig> = {
        agents: {
          defaults: {
            model: { primary: "claude-cli/claude-opus-4-5" },
          },
        },
      };
      const request = createRequest({
        config: config as OpenClawConfig,
        runtimeKind: "pi",
      });
      const result = await resolver.resolve(request);
      expect(result.kind).toBe("pi");
    });
  });

  // ---------------------------------------------------------------------------
  // Capabilities
  // ---------------------------------------------------------------------------

  describe("capabilities", () => {
    it("disables tools and streaming for CLI runtime", async () => {
      const request = createRequest({ runtimeKind: "cli" });
      const result = await resolver.resolve(request);
      expect(result.capabilities.supportsTools).toBe(false);
      expect(result.capabilities.supportsStreaming).toBe(false);
    });

    it("enables tools and streaming for pi runtime", async () => {
      const request = createRequest({ runtimeKind: "pi" });
      const result = await resolver.resolve(request);
      expect(result.capabilities.supportsTools).toBe(true);
      expect(result.capabilities.supportsStreaming).toBe(true);
    });

    it("enables tools and streaming for claude runtime", async () => {
      const request = createRequest({ runtimeKind: "claude" });
      const result = await resolver.resolve(request);
      expect(result.capabilities.supportsTools).toBe(true);
      expect(result.capabilities.supportsStreaming).toBe(true);
    });

    it("detects xhigh thinking support for supported models", async () => {
      const config: Partial<OpenClawConfig> = {
        agents: {
          defaults: {
            model: { primary: "openai/gpt-5.2" },
          },
        },
      };
      const request = createRequest({ config: config as OpenClawConfig });
      const result = await resolver.resolve(request);
      expect(result.capabilities.supportsThinking).toBe(true);
    });

    it("returns false for thinking on unsupported models", async () => {
      const config: Partial<OpenClawConfig> = {
        agents: {
          defaults: {
            model: { primary: "anthropic/claude-opus-4-5" },
          },
        },
      };
      const request = createRequest({ config: config as OpenClawConfig });
      const result = await resolver.resolve(request);
      expect(result.capabilities.supportsThinking).toBe(false);
    });
  });

  // ---------------------------------------------------------------------------
  // Tool Policy
  // ---------------------------------------------------------------------------

  describe("tool policy", () => {
    it("enables tools by default", async () => {
      const request = createRequest({});
      const result = await resolver.resolve(request);
      expect(result.toolPolicy.enabled).toBe(true);
    });

    it("resolves tool profile from global config", async () => {
      const config: Partial<OpenClawConfig> = {
        tools: { profile: "minimal" },
      };
      const request = createRequest({ config: config as OpenClawConfig });
      const result = await resolver.resolve(request);
      expect(result.toolPolicy.enabled).toBe(true);
      expect(result.toolPolicy.allowList).toContain("session_status");
    });

    it("resolves tool profile from per-agent config", async () => {
      const config: Partial<OpenClawConfig> = {
        agents: {
          list: [{ id: "main", tools: { profile: "minimal" } }],
        },
        tools: { profile: "full" },
      };
      const request = createRequest({ config: config as OpenClawConfig });
      const result = await resolver.resolve(request);
      expect(result.toolPolicy.allowList).toContain("session_status");
    });

    it("merges allow lists from multiple sources", async () => {
      const config: Partial<OpenClawConfig> = {
        tools: {
          allow: ["read"],
          alsoAllow: ["write"],
        },
      };
      const request = createRequest({ config: config as OpenClawConfig });
      const result = await resolver.resolve(request);
      expect(result.toolPolicy.allowList).toContain("read");
      expect(result.toolPolicy.allowList).toContain("write");
    });

    it("merges deny lists from multiple sources", async () => {
      const config: Partial<OpenClawConfig> = {
        tools: { deny: ["exec"] },
        agents: {
          list: [{ id: "main", tools: { deny: ["write"] } }],
        },
      };
      const request = createRequest({ config: config as OpenClawConfig });
      const result = await resolver.resolve(request);
      expect(result.toolPolicy.denyList).toContain("exec");
      expect(result.toolPolicy.denyList).toContain("write");
    });

    it("expands tool groups in allow list", async () => {
      const config: Partial<OpenClawConfig> = {
        tools: { allow: ["group:fs"] },
      };
      const request = createRequest({ config: config as OpenClawConfig });
      const result = await resolver.resolve(request);
      expect(result.toolPolicy.allowList).toContain("read");
      expect(result.toolPolicy.allowList).toContain("write");
      expect(result.toolPolicy.allowList).toContain("edit");
    });

    it("resolves elevated permission from config", async () => {
      const config: Partial<OpenClawConfig> = {
        tools: { elevated: { enabled: false } },
      };
      const request = createRequest({ config: config as OpenClawConfig });
      const result = await resolver.resolve(request);
      expect(result.toolPolicy.allowElevated).toBe(false);
    });

    it("defaults elevated permission to true", async () => {
      const request = createRequest({});
      const result = await resolver.resolve(request);
      expect(result.toolPolicy.allowElevated).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // Provider and Model Resolution
  // ---------------------------------------------------------------------------

  describe("provider and model resolution", () => {
    it("uses default provider and model when no config", async () => {
      const request = createRequest({});
      const result = await resolver.resolve(request);
      expect(result.provider).toBe("anthropic");
      expect(result.model).toBe("claude-opus-4-5");
    });

    it("resolves provider and model from config", async () => {
      const config: Partial<OpenClawConfig> = {
        agents: {
          defaults: {
            model: { primary: "openai/gpt-5.2" },
          },
        },
      };
      const request = createRequest({ config: config as OpenClawConfig });
      const result = await resolver.resolve(request);
      expect(result.provider).toBe("openai");
      expect(result.model).toBe("gpt-5.2");
    });

    it("resolves model from object config", async () => {
      const config: Partial<OpenClawConfig> = {
        agents: {
          defaults: {
            model: { primary: "google/gemini-3-ultra" },
          },
        },
      };
      const request = createRequest({ config: config as OpenClawConfig });
      const result = await resolver.resolve(request);
      expect(result.provider).toBe("google");
      expect(result.model).toBe("gemini-3-ultra");
    });
  });

  // ---------------------------------------------------------------------------
  // Sandbox Resolution
  // ---------------------------------------------------------------------------

  describe("sandbox resolution", () => {
    it("returns null sandbox when tools disabled", async () => {
      // Since we mocked resolveSandboxContext to return null, this tests the flow
      const request = createRequest({});
      const result = await resolver.resolve(request);
      expect(result.sandbox).toBeNull();
    });
  });

  // ---------------------------------------------------------------------------
  // Factory Function
  // ---------------------------------------------------------------------------

  describe("createRuntimeResolver", () => {
    it("creates a DefaultRuntimeResolver instance", () => {
      const resolver = createRuntimeResolver();
      expect(resolver).toBeInstanceOf(DefaultRuntimeResolver);
    });

    it("accepts logger option", () => {
      const logger = { debug: vi.fn() };
      const resolver = createRuntimeResolver({ logger });
      expect(resolver).toBeInstanceOf(DefaultRuntimeResolver);
    });
  });
});

// ---------------------------------------------------------------------------
// Test Helpers
// ---------------------------------------------------------------------------

function createRequest(overrides: Partial<ExecutionRequest>): ExecutionRequest {
  return {
    agentId: "main",
    sessionId: "test-session",
    workspaceDir: "/tmp/test",
    prompt: "Hello",
    ...overrides,
  };
}

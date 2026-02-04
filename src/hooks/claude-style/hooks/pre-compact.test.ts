import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type { ClaudeHooksConfig } from "../types.js";
import { resetAllCircuitBreakers } from "../executor.js";
import { runPreCompactHooks, hasPreCompactHooks, type PreCompactHookInput } from "./pre-compact.js";

// =============================================================================
// Mocks
// =============================================================================

// Mock config
const mockConfig: { hooks?: { claude?: ClaudeHooksConfig } } = {};

vi.mock("../../../config/config.js", () => ({
  loadConfig: () => mockConfig,
}));

// Mock feature flag
let featureEnabled = false;
vi.mock("../config.js", async () => {
  const actual = await vi.importActual("../config.js");
  return {
    ...actual,
    isClaudeHooksEnabled: () => featureEnabled,
  };
});

// =============================================================================
// Test Helpers
// =============================================================================

function createPreCompactInput(
  messageCount: number = 10,
  tokenEstimate: number = 1000,
): PreCompactHookInput {
  return {
    session_id: "test-session",
    message_count: messageCount,
    token_estimate: tokenEstimate,
    cwd: "/test/cwd",
  };
}

function setupConfig(claude?: ClaudeHooksConfig): void {
  mockConfig.hooks = claude ? { claude } : undefined;
}

// =============================================================================
// Tests
// =============================================================================

describe("PreCompact hooks", () => {
  beforeEach(() => {
    resetAllCircuitBreakers();
    featureEnabled = false;
    mockConfig.hooks = undefined;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe("hasPreCompactHooks", () => {
    it("returns false when feature disabled", () => {
      featureEnabled = false;
      setupConfig({
        PreCompact: [{ matcher: "*", hooks: [{ type: "command", command: "echo" }] }],
      });
      expect(hasPreCompactHooks()).toBe(false);
    });

    it("returns false when no config", () => {
      featureEnabled = true;
      mockConfig.hooks = undefined;
      expect(hasPreCompactHooks()).toBe(false);
    });

    it("returns false when no PreCompact hooks configured", () => {
      featureEnabled = true;
      setupConfig({
        PostToolUse: [{ matcher: "*", hooks: [{ type: "command", command: "echo" }] }],
      });
      expect(hasPreCompactHooks()).toBe(false);
    });

    it("returns true when PreCompact hooks configured", () => {
      featureEnabled = true;
      setupConfig({
        PreCompact: [{ matcher: "*", hooks: [{ type: "command", command: "echo" }] }],
      });
      expect(hasPreCompactHooks()).toBe(true);
    });
  });

  describe("runPreCompactHooks", () => {
    it("returns immediately when feature disabled", async () => {
      featureEnabled = false;
      setupConfig({
        PreCompact: [{ matcher: "*", hooks: [{ type: "command", command: "exit 1" }] }],
      });
      // Should not throw, just return
      await runPreCompactHooks(createPreCompactInput());
    });

    it("returns immediately when no config", async () => {
      featureEnabled = true;
      mockConfig.hooks = undefined;
      await runPreCompactHooks(createPreCompactInput());
    });

    it("returns immediately when no matching hooks", async () => {
      featureEnabled = true;
      setupConfig({
        PostToolUse: [{ matcher: "*", hooks: [{ type: "command", command: "echo" }] }],
      });
      await runPreCompactHooks(createPreCompactInput());
    });

    it("skips non-command handlers", async () => {
      featureEnabled = true;
      setupConfig({
        PreCompact: [
          {
            matcher: "*",
            hooks: [
              { type: "prompt", prompt: "test" },
              { type: "agent", agent: "test" },
            ],
          },
        ],
      });
      await runPreCompactHooks(createPreCompactInput());
    });
  });
});

// =============================================================================
// Integration tests (with actual command execution)
// =============================================================================

describe("PreCompact integration", () => {
  beforeEach(() => {
    resetAllCircuitBreakers();
    featureEnabled = true;
    mockConfig.hooks = undefined;
  });

  describe("fire-and-forget behavior", () => {
    it("completes even when hook fails", async () => {
      setupConfig({
        PreCompact: [
          {
            matcher: "*",
            hooks: [{ type: "command", command: ["node", "-e", "process.exit(1)"] }],
          },
        ],
      });

      // Should not throw
      await runPreCompactHooks(createPreCompactInput(50, 5000));
    });

    it("completes even with invalid JSON output", async () => {
      setupConfig({
        PreCompact: [
          {
            matcher: "*",
            hooks: [{ type: "command", command: ["node", "-e", "console.log('not json')"] }],
          },
        ],
      });

      await runPreCompactHooks(createPreCompactInput());
    });

    it("completes even when command not found", async () => {
      setupConfig({
        PreCompact: [
          {
            matcher: "*",
            hooks: [{ type: "command", command: ["nonexistent-command-xyz"] }],
          },
        ],
      });

      await runPreCompactHooks(createPreCompactInput());
    });

    it("runs multiple hooks in parallel", async () => {
      const startTime = Date.now();
      setupConfig({
        PreCompact: [
          {
            matcher: "*",
            hooks: [
              // Two hooks that each sleep for 100ms
              { type: "command", command: ["node", "-e", "setTimeout(() => {}, 100)"] },
              { type: "command", command: ["node", "-e", "setTimeout(() => {}, 100)"] },
            ],
          },
        ],
      });

      await runPreCompactHooks(createPreCompactInput());
      const elapsed = Date.now() - startTime;

      // If parallel, should take ~100ms; if sequential, ~200ms
      // Allow 150ms margin for overhead
      expect(elapsed).toBeLessThan(250);
    });
  });

  describe("hook receives correct input", () => {
    it("passes message_count and token_count to hook", async () => {
      setupConfig({
        PreCompact: [
          {
            matcher: "*",
            hooks: [
              {
                type: "command",
                command: [
                  "node",
                  "-e",
                  `
                  const input = JSON.parse(require('fs').readFileSync(0, 'utf8'));
                  if (input.message_count !== 42) process.exit(1);
                  if (input.token_count !== 8000) process.exit(1);
                  if (input.hook_event_name !== 'PreCompact') process.exit(1);
                  console.log('{}');
                  `,
                ],
              },
            ],
          },
        ],
      });

      await runPreCompactHooks(createPreCompactInput(42, 8000));
    });

    it("passes session_id to hook", async () => {
      setupConfig({
        PreCompact: [
          {
            matcher: "*",
            hooks: [
              {
                type: "command",
                command: [
                  "node",
                  "-e",
                  `
                  const input = JSON.parse(require('fs').readFileSync(0, 'utf8'));
                  if (input.session_id !== 'test-session') process.exit(1);
                  console.log('{}');
                  `,
                ],
              },
            ],
          },
        ],
      });

      await runPreCompactHooks(createPreCompactInput());
    });

    it("passes cwd to hook", async () => {
      setupConfig({
        PreCompact: [
          {
            matcher: "*",
            hooks: [
              {
                type: "command",
                command: [
                  "node",
                  "-e",
                  `
                  const input = JSON.parse(require('fs').readFileSync(0, 'utf8'));
                  if (input.cwd !== '/test/cwd') process.exit(1);
                  console.log('{}');
                  `,
                ],
              },
            ],
          },
        ],
      });

      await runPreCompactHooks(createPreCompactInput());
    });
  });

  describe("block decision is ignored", () => {
    it("ignores deny decision from hook (PreCompact is fire-and-forget)", async () => {
      setupConfig({
        PreCompact: [
          {
            matcher: "*",
            hooks: [
              {
                type: "command",
                command: [
                  "node",
                  "-e",
                  // Exit code 2 = deny, but should be ignored for PreCompact
                  "process.exit(2)",
                ],
              },
            ],
          },
        ],
      });

      // Should not throw - deny is ignored for PreCompact
      await runPreCompactHooks(createPreCompactInput());
    });
  });
});

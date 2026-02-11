import { describe, expect, it } from "vitest";

import { resolveCliBackendConfig } from "./cli-backends.js";

describe("resolveCliBackendConfig", () => {
  describe("claude-cli defaults", () => {
    it("includes --verbose when using stream-json output format", () => {
      const resolved = resolveCliBackendConfig("claude-cli");
      expect(resolved).not.toBeNull();

      const args = resolved!.config.args ?? [];
      const resumeArgs = resolved!.config.resumeArgs ?? [];

      // stream-json requires --verbose in print mode
      if (args.includes("stream-json")) {
        expect(args).toContain("--verbose");
      }
      if (resumeArgs.includes("stream-json")) {
        expect(resumeArgs).toContain("--verbose");
      }
    });

    it("has streaming enabled with stream-json format", () => {
      const resolved = resolveCliBackendConfig("claude-cli");
      expect(resolved).not.toBeNull();

      expect(resolved!.config.streaming).toBe(true);
      expect(resolved!.config.args).toContain("stream-json");
      expect(resolved!.config.output).toBe("jsonl");
    });

    it("includes required streaming event types", () => {
      const resolved = resolveCliBackendConfig("claude-cli");
      expect(resolved).not.toBeNull();

      const eventTypes = resolved!.config.streamingEventTypes ?? [];
      expect(eventTypes).toContain("text");
      expect(eventTypes).toContain("result");
    });

    it("resume args also use stream-json with --verbose", () => {
      const resolved = resolveCliBackendConfig("claude-cli");
      expect(resolved).not.toBeNull();

      const resumeArgs = resolved!.config.resumeArgs ?? [];
      expect(resumeArgs).toContain("stream-json");
      expect(resumeArgs).toContain("--verbose");
      expect(resumeArgs).toContain("--resume");
      expect(resumeArgs).toContain("{sessionId}");
    });
  });

  describe("codex-cli defaults", () => {
    it("has streaming enabled", () => {
      const resolved = resolveCliBackendConfig("codex-cli");
      expect(resolved).not.toBeNull();

      expect(resolved!.config.streaming).toBe(true);
      expect(resolved!.config.output).toBe("jsonl");
    });

    it("includes required streaming event types", () => {
      const resolved = resolveCliBackendConfig("codex-cli");
      expect(resolved).not.toBeNull();

      const eventTypes = resolved!.config.streamingEventTypes ?? [];
      expect(eventTypes).toContain("item");
      expect(eventTypes).toContain("turn.completed");
    });
  });

  describe("config overrides", () => {
    it("allows disabling streaming via config override", () => {
      const resolved = resolveCliBackendConfig("claude-cli", {
        agents: {
          defaults: {
            cliBackends: {
              "claude-cli": {
                command: "claude",
                streaming: false,
              },
            },
          },
        },
      });
      expect(resolved).not.toBeNull();
      expect(resolved!.config.streaming).toBe(false);
    });

    it("preserves base args when override does not specify args", () => {
      const resolved = resolveCliBackendConfig("claude-cli", {
        agents: {
          defaults: {
            cliBackends: {
              "claude-cli": {
                command: "claude",
                streaming: false,
              },
            },
          },
        },
      });
      expect(resolved).not.toBeNull();
      // Should still have the base args including --verbose
      expect(resolved!.config.args).toContain("--verbose");
      expect(resolved!.config.args).toContain("stream-json");
    });
  });
});

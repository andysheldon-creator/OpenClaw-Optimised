import { describe, it, expect } from "vitest";
import { resolveAgentNodeRouting } from "./agent-scope.js";
import type { OpenClawConfig } from "../config/config.js";

describe("resolveAgentNodeRouting", () => {
  it("returns undefined for agent without node config", () => {
    const cfg: OpenClawConfig = {
      agents: {
        list: [{ id: "main" }],
      },
    };

    const result = resolveAgentNodeRouting(cfg, "main");
    expect(result).toBeUndefined();
  });

  it("returns node ID for agent with node routing configured", () => {
    const cfg: OpenClawConfig = {
      agents: {
        list: [
          { id: "main" },
          { id: "builder", node: "mac-studio" },
        ],
      },
    };

    const result = resolveAgentNodeRouting(cfg, "builder");
    expect(result).toBe("mac-studio");
  });

  it("returns undefined for unknown agent", () => {
    const cfg: OpenClawConfig = {
      agents: {
        list: [{ id: "main" }],
      },
    };

    const result = resolveAgentNodeRouting(cfg, "unknown");
    expect(result).toBeUndefined();
  });

  it("trims whitespace from node value", () => {
    const cfg: OpenClawConfig = {
      agents: {
        list: [{ id: "builder", node: "  mac-studio  " }],
      },
    };

    const result = resolveAgentNodeRouting(cfg, "builder");
    expect(result).toBe("mac-studio");
  });

  it("returns undefined for empty node string", () => {
    const cfg: OpenClawConfig = {
      agents: {
        list: [{ id: "builder", node: "   " }],
      },
    };

    const result = resolveAgentNodeRouting(cfg, "builder");
    expect(result).toBeUndefined();
  });

  it("normalizes agent ID case", () => {
    const cfg: OpenClawConfig = {
      agents: {
        list: [{ id: "Builder", node: "mac-studio" }],
      },
    };

    const result = resolveAgentNodeRouting(cfg, "BUILDER");
    expect(result).toBe("mac-studio");
  });
});

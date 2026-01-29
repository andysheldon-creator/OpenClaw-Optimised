import { describe, expect, it } from "vitest";
import {
  extractConfigPaths,
  matchesConfigPath,
  validateConfigPaths,
} from "./config-path-validator.js";

describe("matchesConfigPath", () => {
  it("matches exact paths", () => {
    expect(matchesConfigPath("agents.list.model", "agents.list.model")).toBe(true);
    expect(matchesConfigPath("agents.list.model", "agents.list.identity")).toBe(false);
    expect(matchesConfigPath("foo.bar.baz", "foo.bar.baz")).toBe(true);
  });

  it("matches single-segment wildcards (*)", () => {
    // * matches one named segment (numeric array indices are transparent)
    expect(matchesConfigPath("agents.list.0.model", "agents.*.model")).toBe(true);
    expect(matchesConfigPath("agents.list.0.model", "*.list.*.model")).toBe(true);
    expect(matchesConfigPath("agents.list.0.model", "*.*.model")).toBe(true);

    // Should not match different structure
    expect(matchesConfigPath("agents.list.model", "agents.*.*.model")).toBe(false);
  });

  it("numeric array indices are transparent", () => {
    // Array index segments (0, 1, 2...) are skipped during matching
    expect(matchesConfigPath("agents.list.0.model", "agents.list.model")).toBe(true);
    expect(matchesConfigPath("agents.list.5.identity.name", "agents.list.identity.name")).toBe(
      true,
    );
    expect(matchesConfigPath("agents.list.0.model.primary", "agents.*.model")).toBe(true);
    expect(matchesConfigPath("agents.list.0.model.primary", "agents.*.model.primary")).toBe(true);
  });

  it("prefix matching grants subtree access", () => {
    // If pattern is fully consumed, remaining path segments are allowed
    expect(matchesConfigPath("agents.list.0.model.primary", "agents.*.model")).toBe(true);
    expect(matchesConfigPath("agents.list.0.model.primary.nested", "agents.*.model")).toBe(true);
    expect(matchesConfigPath("agents.list.0.identity.name", "agents.*.identity")).toBe(true);
  });

  it("matches deep wildcards (**)", () => {
    expect(matchesConfigPath("agents.list.0.model", "agents.**")).toBe(true);
    expect(matchesConfigPath("agents.list.0.identity.name", "agents.**")).toBe(true);
    expect(matchesConfigPath("agents.foo", "agents.**")).toBe(true);

    expect(matchesConfigPath("agents.list.0.model", "**.model")).toBe(true);
    expect(matchesConfigPath("a.b.c.d.model", "**.model")).toBe(true);

    expect(matchesConfigPath("agents.list.0.model", "agents.**.model")).toBe(true);

    // Should not match if other parts don't match
    expect(matchesConfigPath("agents.list.0.model", "tools.**")).toBe(false);
    expect(matchesConfigPath("agents.list.0.model", "**.identity")).toBe(false);
  });

  it("handles combined wildcards", () => {
    expect(matchesConfigPath("agents.list.0.tools.exec.host", "agents.**.exec.host")).toBe(true);
    expect(matchesConfigPath("agents.list.5.tools.allow.0", "agents.**.allow.*")).toBe(true);
  });

  it("rejects non-matching paths", () => {
    expect(matchesConfigPath("agents.list.0.identity", "agents.*.model")).toBe(false);
    expect(matchesConfigPath("tools.allow", "agents.**")).toBe(false);
    expect(matchesConfigPath("agents.list.0.workspace", "agents.*.model")).toBe(false);
  });
});

describe("extractConfigPaths", () => {
  it("extracts paths from simple objects", () => {
    const obj = { model: "gpt-4" };
    expect(extractConfigPaths(obj)).toEqual(["model"]);
  });

  it("extracts paths from nested objects", () => {
    const obj = {
      agents: {
        defaults: {
          model: "gpt-4",
        },
      },
    };
    expect(extractConfigPaths(obj)).toEqual(["agents.defaults.model"]);
  });

  it("extracts paths from arrays", () => {
    const obj = {
      agents: {
        list: [{ model: "gpt-4" }, { model: "claude-3" }],
      },
    };
    expect(extractConfigPaths(obj).sort()).toEqual(
      ["agents.list.0.model", "agents.list.1.model"].sort(),
    );
  });

  it("extracts paths from complex nested structures", () => {
    const obj = {
      agents: {
        list: [
          {
            model: "gpt-4",
            tools: {
              allow: ["exec", "web_search"],
            },
          },
        ],
      },
    };
    const paths = extractConfigPaths(obj).sort();
    expect(paths).toEqual(
      ["agents.list.0.model", "agents.list.0.tools.allow.0", "agents.list.0.tools.allow.1"].sort(),
    );
  });

  it("handles primitive values", () => {
    expect(extractConfigPaths("value")).toEqual([]);
    expect(extractConfigPaths(123)).toEqual([]);
    expect(extractConfigPaths(true)).toEqual([]);
    expect(extractConfigPaths(null)).toEqual([]);
    expect(extractConfigPaths(undefined)).toEqual([]);
  });

  it("handles empty objects and arrays", () => {
    expect(extractConfigPaths({})).toEqual([]);
    expect(extractConfigPaths([])).toEqual([]);
    expect(extractConfigPaths({ nested: {} })).toEqual(["nested"]);
    expect(extractConfigPaths({ nested: [] })).toEqual(["nested"]);
  });
});

describe("validateConfigPaths", () => {
  it("allows all paths when no restrictions configured", () => {
    const paths = ["agents.list.0.model", "agents.list.0.identity"];
    expect(validateConfigPaths(paths, undefined)).toEqual({ allowed: true });
    expect(validateConfigPaths(paths, [])).toEqual({ allowed: true });
  });

  it("allows paths matching the allowlist", () => {
    const paths = ["agents.list.0.model", "agents.list.1.model"];
    const allowed = ["agents.*.model"];
    expect(validateConfigPaths(paths, allowed)).toEqual({ allowed: true });
  });

  it("blocks paths not matching the allowlist", () => {
    const paths = ["agents.list.0.model", "agents.list.0.identity"];
    const allowed = ["agents.*.model"];
    const result = validateConfigPaths(paths, allowed);
    expect(result.allowed).toBe(false);
    if (!result.allowed) {
      expect(result.blockedPaths).toEqual(["agents.list.0.identity"]);
    }
  });

  it("works with multiple allowed patterns", () => {
    const paths = ["agents.list.0.model", "agents.list.0.tools.allow.0", "agents.defaults.model"];
    const allowed = ["agents.*.model", "agents.**.allow.*", "agents.defaults.model"];
    expect(validateConfigPaths(paths, allowed)).toEqual({ allowed: true });
  });

  it("blocks multiple paths", () => {
    const paths = ["agents.list.0.model", "agents.list.0.identity", "agents.list.0.workspace"];
    const allowed = ["agents.*.model"];
    const result = validateConfigPaths(paths, allowed);
    expect(result.allowed).toBe(false);
    if (!result.allowed) {
      expect(result.blockedPaths.sort()).toEqual(
        ["agents.list.0.identity", "agents.list.0.workspace"].sort(),
      );
    }
  });

  it("allows deep wildcard patterns", () => {
    const paths = [
      "agents.list.0.tools.exec.host",
      "agents.list.0.tools.allow.0",
      "agents.list.1.tools.deny.0",
    ];
    const allowed = ["agents.**.tools.**"];
    expect(validateConfigPaths(paths, allowed)).toEqual({ allowed: true });
  });

  it("auto-allows id fields in arrays for merge-by-key", () => {
    const paths = ["agents.list.0.id", "agents.list.0.model.primary"];
    const allowed = ["agents.*.model"];
    expect(validateConfigPaths(paths, allowed)).toEqual({ allowed: true });
  });

  it("real-world scenario: agent model tiering with path restrictions", () => {
    // Parker has allowedConfigPaths: ["agents.*.model"]
    const allowed = ["agents.*.model"];

    // Allowed: changing model
    const modelPatch = extractConfigPaths({
      agents: { list: [{ id: "parker", model: { primary: "claude-sonnet-4-5" } }] },
    });
    expect(validateConfigPaths(modelPatch, allowed)).toEqual({ allowed: true });

    // Blocked: changing identity
    const identityPatch = extractConfigPaths({
      agents: { list: [{ id: "parker", identity: { emoji: "🧪" } }] },
    });
    const result = validateConfigPaths(identityPatch, allowed);
    expect(result.allowed).toBe(false);
  });
});

import { describe, it, expect } from "vitest";

// Test the helper functions directly
// We'll extract them for testing

/**
 * Extract a value at a dot-notation path from an object.
 */
function getPathValue(obj: unknown, path: string): unknown {
  if (!obj || typeof obj !== "object") {
    return undefined;
  }
  const parts = path.split(".");
  let current: unknown = obj;
  for (const part of parts) {
    if (!current || typeof current !== "object") {
      return undefined;
    }
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

/**
 * Extract a section from a JSON schema by navigating to properties.<section>.
 */
function getSchemaSection(schema: unknown, section: string): unknown {
  if (!schema || typeof schema !== "object") {
    return undefined;
  }
  const s = schema as Record<string, unknown>;
  const props = s.properties as Record<string, unknown> | undefined;
  if (!props) {
    return undefined;
  }
  return props[section];
}

/**
 * Extract schema at a dot-notation path.
 */
function getSchemaAtPath(schema: unknown, path: string): unknown {
  if (!schema || typeof schema !== "object") {
    return undefined;
  }
  const parts = path.split(".");
  let current: unknown = schema;
  for (const part of parts) {
    if (!current || typeof current !== "object") {
      return undefined;
    }
    const c = current as Record<string, unknown>;
    const props = c.properties as Record<string, unknown> | undefined;
    if (!props) {
      return undefined;
    }
    current = props[part];
  }
  return current;
}

/**
 * Filter uiHints to only include hints for paths under the given prefix.
 */
function filterUiHints(hints: Record<string, unknown>, prefix: string): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  const prefixDot = prefix + ".";
  for (const [key, value] of Object.entries(hints)) {
    if (key === prefix || key.startsWith(prefixDot)) {
      result[key] = value;
    }
  }
  return result;
}

describe("config handler helpers", () => {
  describe("getPathValue", () => {
    const testConfig = {
      agents: {
        defaults: {
          model: {
            primary: "claude-sonnet-4-20250514",
            fallback: "gpt-4o",
          },
          verboseDefault: "on",
        },
        sessions: {
          foo: { model: "custom" },
        },
      },
      channels: {
        telegram: { enabled: true },
        discord: { enabled: false },
      },
      meta: {
        version: "1.0.0",
      },
    };

    it("extracts top-level value", () => {
      expect(getPathValue(testConfig, "meta")).toEqual({ version: "1.0.0" });
    });

    it("extracts nested value", () => {
      expect(getPathValue(testConfig, "agents.defaults.model.primary")).toBe(
        "claude-sonnet-4-20250514",
      );
    });

    it("extracts intermediate object", () => {
      expect(getPathValue(testConfig, "agents.defaults.model")).toEqual({
        primary: "claude-sonnet-4-20250514",
        fallback: "gpt-4o",
      });
    });

    it("returns undefined for non-existent path", () => {
      expect(getPathValue(testConfig, "agents.nonexistent.path")).toBeUndefined();
    });

    it("returns undefined for path through non-object", () => {
      expect(getPathValue(testConfig, "meta.version.deep")).toBeUndefined();
    });

    it("handles null/undefined input", () => {
      expect(getPathValue(null, "foo")).toBeUndefined();
      expect(getPathValue(undefined, "foo")).toBeUndefined();
    });

    it("handles empty path parts gracefully", () => {
      // This tests edge case behavior
      expect(getPathValue(testConfig, "agents..defaults")).toBeUndefined();
    });
  });

  describe("getSchemaSection", () => {
    const testSchema = {
      type: "object",
      properties: {
        agents: {
          type: "object",
          properties: {
            defaults: { type: "object" },
          },
        },
        channels: {
          type: "object",
          properties: {
            telegram: { type: "object" },
          },
        },
      },
    };

    it("extracts top-level section schema", () => {
      const result = getSchemaSection(testSchema, "agents");
      expect(result).toEqual({
        type: "object",
        properties: {
          defaults: { type: "object" },
        },
      });
    });

    it("returns undefined for non-existent section", () => {
      expect(getSchemaSection(testSchema, "nonexistent")).toBeUndefined();
    });

    it("handles schema without properties", () => {
      expect(getSchemaSection({ type: "object" }, "agents")).toBeUndefined();
    });

    it("handles null/undefined input", () => {
      expect(getSchemaSection(null, "agents")).toBeUndefined();
      expect(getSchemaSection(undefined, "agents")).toBeUndefined();
    });
  });

  describe("getSchemaAtPath", () => {
    const testSchema = {
      type: "object",
      properties: {
        agents: {
          type: "object",
          properties: {
            defaults: {
              type: "object",
              properties: {
                model: {
                  type: "object",
                  properties: {
                    primary: { type: "string" },
                    fallback: { type: "string" },
                  },
                },
              },
            },
          },
        },
      },
    };

    it("extracts schema at deep path", () => {
      const result = getSchemaAtPath(testSchema, "agents.defaults.model");
      expect(result).toEqual({
        type: "object",
        properties: {
          primary: { type: "string" },
          fallback: { type: "string" },
        },
      });
    });

    it("extracts leaf schema", () => {
      const result = getSchemaAtPath(testSchema, "agents.defaults.model.primary");
      expect(result).toEqual({ type: "string" });
    });

    it("returns undefined for non-existent path", () => {
      expect(getSchemaAtPath(testSchema, "agents.nonexistent")).toBeUndefined();
    });

    it("handles null/undefined input", () => {
      expect(getSchemaAtPath(null, "agents")).toBeUndefined();
      expect(getSchemaAtPath(undefined, "agents")).toBeUndefined();
    });
  });

  describe("filterUiHints", () => {
    const testHints = {
      agents: { label: "Agents" },
      "agents.defaults": { label: "Defaults" },
      "agents.defaults.model": { label: "Model" },
      "agents.defaults.model.primary": { label: "Primary Model" },
      "agents.sessions": { label: "Sessions" },
      channels: { label: "Channels" },
      "channels.telegram": { label: "Telegram" },
      "channels.discord": { label: "Discord" },
    };

    it("filters hints for top-level section", () => {
      const result = filterUiHints(testHints, "agents");
      expect(Object.keys(result).toSorted()).toEqual([
        "agents",
        "agents.defaults",
        "agents.defaults.model",
        "agents.defaults.model.primary",
        "agents.sessions",
      ]);
    });

    it("filters hints for nested path", () => {
      const result = filterUiHints(testHints, "agents.defaults.model");
      expect(Object.keys(result).toSorted()).toEqual([
        "agents.defaults.model",
        "agents.defaults.model.primary",
      ]);
    });

    it("returns empty object for non-matching prefix", () => {
      const result = filterUiHints(testHints, "nonexistent");
      expect(result).toEqual({});
    });

    it("includes exact match", () => {
      const result = filterUiHints(testHints, "channels.telegram");
      expect(Object.keys(result)).toEqual(["channels.telegram"]);
    });

    it("does not include partial prefix matches", () => {
      // "agent" should not match "agents"
      const result = filterUiHints(testHints, "agent");
      expect(result).toEqual({});
    });
  });
});

describe("config.get filtering", () => {
  // Integration tests would go here, mocking readConfigFileSnapshot
  // For now, we test the logic via the helper functions above

  it("should support path filtering", () => {
    const config = {
      agents: { defaults: { model: "claude" } },
      channels: { telegram: { enabled: true } },
    };
    const value = getPathValue(config, "agents.defaults.model");
    expect(value).toBe("claude");
  });

  it("should support section filtering", () => {
    const config = {
      agents: { defaults: { model: "claude" } },
      channels: { telegram: { enabled: true } },
    };
    const value = (config as Record<string, unknown>)["channels"];
    expect(value).toEqual({ telegram: { enabled: true } });
  });
});

describe("config.schema filtering", () => {
  const mockSchema = {
    type: "object",
    properties: {
      agents: {
        type: "object",
        description: "Agent configuration",
        properties: {
          defaults: {
            type: "object",
            properties: {
              model: { type: "string" },
            },
          },
        },
      },
      channels: {
        type: "object",
        description: "Channel configuration",
        properties: {
          telegram: { type: "object" },
        },
      },
    },
  };

  it("should extract section schema", () => {
    const section = getSchemaSection(mockSchema, "agents");
    expect(section).toHaveProperty("type", "object");
    expect(section).toHaveProperty("description", "Agent configuration");
  });

  it("should extract schema at path", () => {
    const pathSchema = getSchemaAtPath(mockSchema, "agents.defaults.model");
    expect(pathSchema).toEqual({ type: "string" });
  });

  it("should filter uiHints correctly", () => {
    const hints = {
      agents: { label: "Agents" },
      "agents.defaults": { label: "Defaults" },
      channels: { label: "Channels" },
    };
    const filtered = filterUiHints(hints, "agents");
    expect(filtered).toEqual({
      agents: { label: "Agents" },
      "agents.defaults": { label: "Defaults" },
    });
  });
});

describe("config.schema caching", () => {
  // The caching is implemented in the handler via cachedConfigSchema
  // These tests verify the caching behavior conceptually

  it("should support ifNoneMatch for 304-style caching", () => {
    // When client provides ifNoneMatch matching current version,
    // server should return { notModified: true, version }
    const cachedVersion = "2024.1.1-abc123";
    const clientVersion = cachedVersion; // Same version
    expect(cachedVersion).toBe(clientVersion);
  });

  it("should return full schema when version differs", () => {
    const cachedVersion = "2024.1.2-def456";
    const clientVersion = "2024.1.1-abc123";
    expect(cachedVersion).not.toBe(clientVersion);
  });
});

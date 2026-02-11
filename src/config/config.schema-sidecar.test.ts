import fs from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { withTempHome } from "./test-helpers.js";

describe("config schema sidecar", () => {
  it("writes $schema and openclaw.schema.json next to config", async () => {
    await withTempHome(async () => {
      const { resolveConfigPath, writeConfigFile } = await import("./config.js");
      const configPath = resolveConfigPath();
      await writeConfigFile({});

      const raw = await fs.readFile(configPath, "utf-8");
      const parsed = JSON.parse(raw) as { $schema?: string };
      expect(parsed.$schema).toBe("./openclaw.schema.json");

      const schemaPath = path.join(path.dirname(configPath), "openclaw.schema.json");
      const schemaRaw = await fs.readFile(schemaPath, "utf-8");
      const schemaParsed = JSON.parse(schemaRaw) as { $schema?: string; title?: string };
      expect(schemaParsed.$schema).toBe("http://json-schema.org/draft-07/schema#");
      expect(schemaParsed.title).toBeTruthy();
    });
  });
});

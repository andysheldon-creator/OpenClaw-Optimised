import { describe, test, expect } from "vitest";
import {
  createShengSuanYunGenerationTool,
  createShengSuanYunStatusTool,
} from "./shengsuanyun-generation-tool.js";

describe("ShengSuanYun generation tools", () => {
  describe("createShengSuanYunGenerationTool", () => {
    test("creates tool with correct schema", () => {
      const tool = createShengSuanYunGenerationTool({
        agentDir: "/tmp/test-agent",
      });

      expect(tool).toBeDefined();
      expect(tool.name).toBe("shengsuanyun_create_generation");
      expect(tool.label).toBe("ShengSuanYun Generation");
      expect(tool.description).toContain("multimodal generation");
      expect(tool.parameters).toBeDefined();
    });

    test("requires agentDir when no explicit config", () => {
      const tool = createShengSuanYunGenerationTool();
      expect(tool).toBeDefined();
      // Tool is created but execution will fail without agentDir
    });
  });

  describe("createShengSuanYunStatusTool", () => {
    test("creates tool with correct schema", () => {
      const tool = createShengSuanYunStatusTool({
        agentDir: "/tmp/test-agent",
      });

      expect(tool).toBeDefined();
      expect(tool.name).toBe("shengsuanyun_get_generation_status");
      expect(tool.label).toBe("ShengSuanYun Status");
      expect(tool.description).toContain("status of a ShengSuanYun generation task");
      expect(tool.parameters).toBeDefined();
    });
  });
});

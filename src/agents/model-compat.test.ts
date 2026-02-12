import type { Api, Model } from "@mariozechner/pi-ai";
import { describe, expect, it } from "vitest";
import { normalizeModelCompat } from "./model-compat.js";

const baseModel = (): Model<Api> =>
  ({
    id: "glm-4.7",
    name: "GLM-4.7",
    api: "openai-completions",
    provider: "zai",
    baseUrl: "https://api.z.ai/api/coding/paas/v4",
    reasoning: true,
    input: ["text"],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 8192,
    maxTokens: 1024,
  }) as Model<Api>;

const dashscopeModel = (): Model<Api> =>
  ({
    id: "qwen3-coder-flash",
    name: "Qwen3 Coder Flash",
    api: "openai-completions",
    provider: "dashscope",
    baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
    reasoning: true,
    input: ["text"],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 131072,
    maxTokens: 8192,
  }) as Model<Api>;

describe("normalizeModelCompat", () => {
  it("forces supportsDeveloperRole off for z.ai models", () => {
    const model = baseModel();
    delete (model as { compat?: unknown }).compat;
    const normalized = normalizeModelCompat(model);
    expect(normalized.compat?.supportsDeveloperRole).toBe(false);
  });

  it("leaves non-zai models untouched", () => {
    const model = {
      ...baseModel(),
      provider: "openai",
      baseUrl: "https://api.openai.com/v1",
    };
    delete (model as { compat?: unknown }).compat;
    const normalized = normalizeModelCompat(model);
    expect(normalized.compat).toBeUndefined();
  });

  it("does not override explicit z.ai compat false", () => {
    const model = baseModel();
    model.compat = { supportsDeveloperRole: false };
    const normalized = normalizeModelCompat(model);
    expect(normalized.compat?.supportsDeveloperRole).toBe(false);
  });

  it("forces supportsDeveloperRole off for Dashscope models", () => {
    const model = dashscopeModel();
    delete (model as { compat?: unknown }).compat;
    const normalized = normalizeModelCompat(model);
    expect(normalized.compat?.supportsDeveloperRole).toBe(false);
  });

  it("sets thinkingFormat to qwen for Dashscope models", () => {
    const model = dashscopeModel();
    delete (model as { compat?: unknown }).compat;
    const normalized = normalizeModelCompat(model);
    expect(normalized.compat?.thinkingFormat).toBe("qwen");
  });

  it("handles Dashscope international endpoint", () => {
    const model = {
      ...dashscopeModel(),
      baseUrl: "https://dashscope-intl.aliyuncs.com/compatible-mode/v1",
    };
    delete (model as { compat?: unknown }).compat;
    const normalized = normalizeModelCompat(model);
    expect(normalized.compat?.supportsDeveloperRole).toBe(false);
    expect(normalized.compat?.thinkingFormat).toBe("qwen");
  });

  it("preserves existing Dashscope compat fields", () => {
    const model = dashscopeModel();
    model.compat = { supportsStore: false };
    const normalized = normalizeModelCompat(model);
    expect(normalized.compat?.supportsDeveloperRole).toBe(false);
    expect(normalized.compat?.thinkingFormat).toBe("qwen");
    expect(normalized.compat?.supportsStore).toBe(false);
  });

  it("does not override already-correct Dashscope compat", () => {
    const model = dashscopeModel();
    model.compat = { supportsDeveloperRole: false, thinkingFormat: "qwen" };
    const normalized = normalizeModelCompat(model);
    expect(normalized.compat?.supportsDeveloperRole).toBe(false);
    expect(normalized.compat?.thinkingFormat).toBe("qwen");
  });
});

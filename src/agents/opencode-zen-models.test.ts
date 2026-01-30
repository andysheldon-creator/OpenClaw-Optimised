import { describe, expect, it } from "vitest";

import {
  OPENCODE_ZEN_MODEL_ALIASES,
  OPENCODE_ZEN_STATIC_MODEL_DEFINITIONS,
  resolveOpencodeZenAlias,
  resolveOpencodeZenModelApi,
} from "./opencode-zen-models.js";

describe("resolveOpencodeZenAlias", () => {
  it("resolves opus alias", () => {
    expect(resolveOpencodeZenAlias("opus")).toBe("claude-opus-4-5");
  });

  it("keeps legacy aliases working", () => {
    expect(resolveOpencodeZenAlias("sonnet")).toBe("claude-opus-4-5");
    expect(resolveOpencodeZenAlias("haiku")).toBe("claude-opus-4-5");
    expect(resolveOpencodeZenAlias("gpt4")).toBe("gpt-5.1");
    expect(resolveOpencodeZenAlias("o1")).toBe("gpt-5.2");
    expect(resolveOpencodeZenAlias("gemini-2.5")).toBe("gemini-3-pro");
  });

  it("resolves gpt5 alias", () => {
    expect(resolveOpencodeZenAlias("gpt5")).toBe("gpt-5.2");
  });

  it("resolves gemini alias", () => {
    expect(resolveOpencodeZenAlias("gemini")).toBe("gemini-3-pro");
  });

  it("returns input if no alias exists", () => {
    expect(resolveOpencodeZenAlias("some-unknown-model")).toBe("some-unknown-model");
  });

  it("is case-insensitive", () => {
    expect(resolveOpencodeZenAlias("OPUS")).toBe("claude-opus-4-5");
    expect(resolveOpencodeZenAlias("Gpt5")).toBe("gpt-5.2");
  });
});

describe("resolveOpencodeZenModelApi", () => {
  it("maps APIs by model family", () => {
    expect(resolveOpencodeZenModelApi("claude-opus-4-5")).toBe("anthropic-messages");
    expect(resolveOpencodeZenModelApi("gemini-3-pro")).toBe("google-generative-ai");
    expect(resolveOpencodeZenModelApi("gpt-5.2")).toBe("openai-responses");
    expect(resolveOpencodeZenModelApi("alpha-gd4")).toBe("openai-completions");
    expect(resolveOpencodeZenModelApi("big-pickle")).toBe("openai-completions");
    expect(resolveOpencodeZenModelApi("glm-4.7")).toBe("openai-completions");
    expect(resolveOpencodeZenModelApi("some-unknown-model")).toBe("openai-completions");
  });
});

describe("OPENCODE_ZEN_STATIC_MODEL_DEFINITIONS", () => {
  it("is an array of model definitions", () => {
    expect(Array.isArray(OPENCODE_ZEN_STATIC_MODEL_DEFINITIONS)).toBe(true);
    expect(OPENCODE_ZEN_STATIC_MODEL_DEFINITIONS.length).toBe(9);
  });

  it("includes Claude, GPT, Gemini, and GLM models", () => {
    const ids = OPENCODE_ZEN_STATIC_MODEL_DEFINITIONS.map((m) => m.id);

    expect(ids).toContain("claude-opus-4-5");
    expect(ids).toContain("gpt-5.2");
    expect(ids).toContain("gpt-5.1-codex");
    expect(ids).toContain("gemini-3-pro");
    expect(ids).toContain("glm-4.7");
  });

  it("contains valid ModelDefinitionConfig objects", () => {
    for (const model of OPENCODE_ZEN_STATIC_MODEL_DEFINITIONS) {
      expect(model.id).toBeDefined();
      expect(model.name).toBeDefined();
      expect(typeof model.reasoning).toBe("boolean");
      expect(Array.isArray(model.input)).toBe(true);
      expect(model.cost).toBeDefined();
      expect(typeof model.contextWindow).toBe("number");
      expect(typeof model.maxTokens).toBe("number");
    }
  });
});

describe("OPENCODE_ZEN_MODEL_ALIASES", () => {
  it("has expected aliases", () => {
    expect(OPENCODE_ZEN_MODEL_ALIASES.opus).toBe("claude-opus-4-5");
    expect(OPENCODE_ZEN_MODEL_ALIASES.codex).toBe("gpt-5.1-codex");
    expect(OPENCODE_ZEN_MODEL_ALIASES.gpt5).toBe("gpt-5.2");
    expect(OPENCODE_ZEN_MODEL_ALIASES.gemini).toBe("gemini-3-pro");
    expect(OPENCODE_ZEN_MODEL_ALIASES.glm).toBe("glm-4.7");

    // Legacy aliases (kept for backward compatibility).
    expect(OPENCODE_ZEN_MODEL_ALIASES.sonnet).toBe("claude-opus-4-5");
    expect(OPENCODE_ZEN_MODEL_ALIASES.haiku).toBe("claude-opus-4-5");
    expect(OPENCODE_ZEN_MODEL_ALIASES.gpt4).toBe("gpt-5.1");
    expect(OPENCODE_ZEN_MODEL_ALIASES.o1).toBe("gpt-5.2");
    expect(OPENCODE_ZEN_MODEL_ALIASES["gemini-2.5"]).toBe("gemini-3-pro");
  });
});

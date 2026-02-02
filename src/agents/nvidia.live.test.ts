import { completeSimple, type Model } from "@mariozechner/pi-ai";
import { describe, expect, it } from "vitest";
import { isTruthyEnvValue } from "../infra/env.js";

const NVIDIA_KEY = process.env.NVIDIA_API_KEY ?? "";
const NVIDIA_BASE_URL =
  process.env.NVIDIA_BASE_URL?.trim() || "https://integrate.api.nvidia.com/v1";
const NVIDIA_MODEL = process.env.NVIDIA_MODEL?.trim() || "nvidia/kimi-k2-instruct";
const LIVE = isTruthyEnvValue(process.env.NVIDIA_LIVE_TEST) || isTruthyEnvValue(process.env.LIVE);

const describeLive = LIVE && NVIDIA_KEY ? describe : describe.skip;

describeLive("nvidia live", () => {
  it("returns assistant text", async () => {
    const model: Model<"openai-completions"> = {
      id: NVIDIA_MODEL,
      name: "NVIDIA Kimi K2 Instruct",
      api: "openai-completions",
      provider: "nvidia",
      baseUrl: NVIDIA_BASE_URL,
      reasoning: false,
      input: ["text"],
      cost: { input: 0.27, output: 0.9, cacheRead: 0, cacheWrite: 0 },
      contextWindow: 128000,
      maxTokens: 8192,
    };
    const res = await completeSimple(
      model,
      {
        messages: [
          {
            role: "user",
            content: "Reply with the word ok.",
            timestamp: Date.now(),
          },
        ],
      },
      { apiKey: NVIDIA_KEY, maxTokens: 64 },
    );
    const text = res.content
      .filter((block) => block.type === "text")
      .map((block) => block.text.trim())
      .join(" ");
    expect(text.length).toBeGreaterThan(0);
    expect(text.toLowerCase()).toContain("ok");
  }, 20000);

  it("handles multi-turn conversation", async () => {
    const model: Model<"openai-completions"> = {
      id: NVIDIA_MODEL,
      name: "NVIDIA Kimi K2 Instruct",
      api: "openai-completions",
      provider: "nvidia",
      baseUrl: NVIDIA_BASE_URL,
      reasoning: false,
      input: ["text"],
      cost: { input: 0.27, output: 0.9, cacheRead: 0, cacheWrite: 0 },
      contextWindow: 128000,
      maxTokens: 8192,
    };
    const res = await completeSimple(
      model,
      {
        messages: [
          {
            role: "user",
            content: "My name is Alice.",
            timestamp: Date.now(),
          },
          {
            role: "assistant",
            content: "Hello Alice! Nice to meet you.",
            timestamp: Date.now(),
          },
          {
            role: "user",
            content: "What is my name?",
            timestamp: Date.now(),
          },
        ],
      },
      { apiKey: NVIDIA_KEY, maxTokens: 64 },
    );
    const text = res.content
      .filter((block) => block.type === "text")
      .map((block) => block.text.trim())
      .join(" ");
    expect(text.toLowerCase()).toContain("alice");
  }, 20000);
});

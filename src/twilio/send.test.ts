import { describe, expect, it, vi } from "vitest";

import { splitMessage, waitForFinalStatus } from "./send.js";

describe("splitMessage", () => {
  it("returns single chunk for short messages", () => {
    const result = splitMessage("Hello world");
    expect(result).toEqual(["Hello world"]);
  });

  it("returns single chunk for messages exactly at limit", () => {
    const text = "a".repeat(1600);
    const result = splitMessage(text);
    expect(result).toEqual([text]);
  });

  it("splits long messages at paragraph boundaries", () => {
    const para1 = "a".repeat(1000);
    const para2 = "b".repeat(800);
    const text = `${para1}\n\n${para2}`;
    const result = splitMessage(text);
    expect(result).toHaveLength(2);
    expect(result[0]).toBe(para1);
    expect(result[1]).toBe(para2);
  });

  it("splits at line breaks when no paragraph break available", () => {
    const line1 = "a".repeat(1000);
    const line2 = "b".repeat(800);
    const text = `${line1}\n${line2}`;
    const result = splitMessage(text);
    expect(result).toHaveLength(2);
    expect(result[0]).toBe(line1);
    expect(result[1]).toBe(line2);
  });

  it("splits at sentence boundaries when no line break available", () => {
    const sentence1 = "a".repeat(1000) + ".";
    const sentence2 = "b".repeat(800);
    const text = `${sentence1} ${sentence2}`;
    const result = splitMessage(text);
    expect(result).toHaveLength(2);
    expect(result[0]).toBe(sentence1);
    expect(result[1]).toBe(sentence2);
  });

  it("splits at word boundaries when no sentence end available", () => {
    const word1 = "a".repeat(1000);
    const word2 = "b".repeat(800);
    const text = `${word1} ${word2}`;
    const result = splitMessage(text);
    expect(result).toHaveLength(2);
    expect(result[0]).toBe(word1);
    expect(result[1]).toBe(word2);
  });

  it("hard breaks when no natural break point exists", () => {
    const text = "a".repeat(3200);
    const result = splitMessage(text);
    expect(result).toHaveLength(2);
    expect(result[0]).toBe("a".repeat(1600));
    expect(result[1]).toBe("a".repeat(1600));
  });

  it("handles multiple chunks correctly", () => {
    const text = "a".repeat(4800);
    const result = splitMessage(text);
    expect(result).toHaveLength(3);
  });

  it("respects custom maxChars parameter", () => {
    const text = "Hello world! This is a test.";
    const result = splitMessage(text, 15);
    expect(result.length).toBeGreaterThan(1);
    for (const chunk of result) {
      expect(chunk.length).toBeLessThanOrEqual(15);
    }
  });
});

describe("twilio send helpers", () => {
  it("waitForFinalStatus resolves on delivered", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce({ status: "queued" })
      .mockResolvedValueOnce({ status: "delivered" });
    const client = { messages: vi.fn(() => ({ fetch })) } as never;
    await waitForFinalStatus(client, "SM1", 2, 0.01, console as never);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("waitForFinalStatus exits on failure", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValue({ status: "failed", errorMessage: "boom" });
    const client = { messages: vi.fn(() => ({ fetch })) } as never;
    const runtime = {
      log: console.log,
      error: () => {},
      exit: vi.fn(() => {
        throw new Error("exit");
      }),
    } as never;
    await expect(
      waitForFinalStatus(client, "SM1", 1, 0.01, runtime),
    ).rejects.toBeInstanceOf(Error);
  });
});

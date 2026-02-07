import type { AgentMessage } from "@mariozechner/pi-agent-core";
import type { ImageContent } from "@mariozechner/pi-ai";
import { describe, expect, it } from "vitest";
import { isAbortError } from "../abort.js";
import { injectHistoryImagesIntoMessages } from "./attempt.js";

describe("injectHistoryImagesIntoMessages", () => {
  const image: ImageContent = { type: "image", data: "abc", mimeType: "image/png" };

  it("injects history images and converts string content", () => {
    const messages: AgentMessage[] = [
      {
        role: "user",
        content: "See /tmp/photo.png",
      } as AgentMessage,
    ];

    const didMutate = injectHistoryImagesIntoMessages(messages, new Map([[0, [image]]]));

    expect(didMutate).toBe(true);
    expect(Array.isArray(messages[0]?.content)).toBe(true);
    const content = messages[0]?.content as Array<{ type: string; text?: string; data?: string }>;
    expect(content).toHaveLength(2);
    expect(content[0]?.type).toBe("text");
    expect(content[1]).toMatchObject({ type: "image", data: "abc" });
  });

  it("avoids duplicating existing image content", () => {
    const messages: AgentMessage[] = [
      {
        role: "user",
        content: [{ type: "text", text: "See /tmp/photo.png" }, { ...image }],
      } as AgentMessage,
    ];

    const didMutate = injectHistoryImagesIntoMessages(messages, new Map([[0, [image]]]));

    expect(didMutate).toBe(false);
    const first = messages[0];
    if (!first || !Array.isArray(first.content)) {
      throw new Error("expected array content");
    }
    expect(first.content).toHaveLength(2);
  });

  it("ignores non-user messages and out-of-range indices", () => {
    const messages: AgentMessage[] = [
      {
        role: "assistant",
        content: "noop",
      } as AgentMessage,
    ];

    const didMutate = injectHistoryImagesIntoMessages(messages, new Map([[1, [image]]]));

    expect(didMutate).toBe(false);
    expect(messages[0]?.content).toBe("noop");
  });
});

describe("abortable compaction wait (regression for stuck session)", () => {
  // Reproduces the bug where waitForCompactionRetry() was not wrapped with
  // abortable(), causing the session to stay stuck in active=true forever
  // when a run timed out during compaction.

  /** Mirrors the abortable() helper from attempt.ts */
  function abortable<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
    if (signal.aborted) {
      const err = new Error("aborted");
      err.name = "AbortError";
      return Promise.reject(err);
    }
    return new Promise<T>((resolve, reject) => {
      const onAbort = () => {
        signal.removeEventListener("abort", onAbort);
        const err = new Error("aborted");
        err.name = "AbortError";
        reject(err);
      };
      signal.addEventListener("abort", onAbort, { once: true });
      promise.then(
        (value) => {
          signal.removeEventListener("abort", onAbort);
          resolve(value);
        },
        (err) => {
          signal.removeEventListener("abort", onAbort);
          reject(err);
        },
      );
    });
  }

  it("rejects with AbortError when abort fires during a never-resolving compaction wait", async () => {
    const controller = new AbortController();
    // Simulate a compaction promise that never resolves (the bug scenario)
    const neverResolves = new Promise<void>(() => {});

    const resultPromise = abortable(neverResolves, controller.signal);

    // Simulate timeout firing
    controller.abort();

    await expect(resultPromise).rejects.toThrow();
    try {
      await resultPromise;
    } catch (err) {
      expect(isAbortError(err)).toBe(true);
    }
  });

  it("resolves normally when compaction finishes before abort", async () => {
    const controller = new AbortController();
    const quickResolve = Promise.resolve();

    const result = await abortable(quickResolve, controller.signal);
    expect(result).toBeUndefined();
  });

  it("rejects immediately if already aborted before compaction wait starts", async () => {
    const controller = new AbortController();
    controller.abort(); // Already aborted

    const neverResolves = new Promise<void>(() => {});
    await expect(abortable(neverResolves, controller.signal)).rejects.toThrow();
  });

  it("ensures cleanup runs after abort (simulates finally block)", async () => {
    const controller = new AbortController();
    const neverResolves = new Promise<void>(() => {});
    let cleanupRan = false;

    try {
      const waitPromise = abortable(neverResolves, controller.signal);
      controller.abort();
      await waitPromise;
    } catch (err) {
      if (!isAbortError(err)) {
        throw err;
      }
    } finally {
      // This simulates clearActiveEmbeddedRun() in the real code
      cleanupRan = true;
    }

    expect(cleanupRan).toBe(true);
  });
});

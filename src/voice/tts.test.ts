import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { isTtsConfigured, textToSpeech } from "./tts.js";

vi.mock("../logging.js", () => ({
  createSubsystemLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

// ── isTtsConfigured ───────────────────────────────────────────────────────────

describe("isTtsConfigured", () => {
  it("returns true when both voiceId and apiKey are set", () => {
    expect(isTtsConfigured({ voiceId: "v1", apiKey: "k1" })).toBe(true);
  });

  it("returns false when voiceId is missing", () => {
    expect(isTtsConfigured({ apiKey: "k1" })).toBe(false);
  });

  it("returns false when apiKey is missing", () => {
    expect(isTtsConfigured({ voiceId: "v1" })).toBe(false);
  });

  it("returns false when both are missing", () => {
    expect(isTtsConfigured({})).toBe(false);
  });

  it("returns false for empty strings", () => {
    expect(isTtsConfigured({ voiceId: "", apiKey: "" })).toBe(false);
  });
});

// ── textToSpeech ──────────────────────────────────────────────────────────────

describe("textToSpeech", () => {
  const originalFetch = globalThis.fetch;
  let mockFetch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockFetch = vi.fn();
    globalThis.fetch = mockFetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("calls ElevenLabs API with correct parameters", async () => {
    const audioBytes = new Uint8Array([1, 2, 3, 4]);
    mockFetch.mockResolvedValue({
      ok: true,
      arrayBuffer: () => Promise.resolve(audioBytes.buffer),
    });

    await textToSpeech({
      text: "Hello world",
      voiceId: "voice-123",
      apiKey: "sk-test",
    });

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url, opts] = mockFetch.mock.calls[0];
    expect(url).toContain("voice-123");
    expect(url).toContain("text-to-speech");
    expect(url).toContain("mp3_44100_128");
    expect(opts.method).toBe("POST");
    expect(opts.headers["xi-api-key"]).toBe("sk-test");

    const body = JSON.parse(opts.body);
    expect(body.text).toBe("Hello world");
    expect(body.model_id).toBe("eleven_turbo_v2_5");
    expect(body.voice_settings.stability).toBe(0.5);
    expect(body.voice_settings.similarity_boost).toBe(0.75);
  });

  it("returns audio data as Buffer", async () => {
    const audioBytes = new Uint8Array([10, 20, 30, 40]);
    mockFetch.mockResolvedValue({
      ok: true,
      arrayBuffer: () => Promise.resolve(audioBytes.buffer),
    });

    const result = await textToSpeech({
      text: "test",
      voiceId: "v1",
      apiKey: "k1",
    });

    expect(Buffer.isBuffer(result)).toBe(true);
    expect(result.length).toBe(4);
  });

  it("uses custom model and format when provided", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)),
    });

    await textToSpeech({
      text: "test",
      voiceId: "v1",
      apiKey: "k1",
      modelId: "eleven_v3",
      outputFormat: "pcm_16000",
    });

    const [url, opts] = mockFetch.mock.calls[0];
    expect(url).toContain("pcm_16000");
    const body = JSON.parse(opts.body);
    expect(body.model_id).toBe("eleven_v3");
  });

  it("throws on non-OK HTTP response", async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 401,
      text: () => Promise.resolve("Unauthorized"),
    });

    await expect(
      textToSpeech({ text: "test", voiceId: "v1", apiKey: "bad-key" }),
    ).rejects.toThrow("ElevenLabs TTS failed (401)");
  });

  it("throws on HTTP 500 response", async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 500,
      text: () => Promise.resolve("Internal Server Error"),
    });

    await expect(
      textToSpeech({ text: "test", voiceId: "v1", apiKey: "k1" }),
    ).rejects.toThrow("ElevenLabs TTS failed (500)");
  });

  it("truncates long error response bodies", async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 400,
      text: () => Promise.resolve("x".repeat(500)),
    });

    try {
      await textToSpeech({ text: "test", voiceId: "v1", apiKey: "k1" });
      expect.unreachable("should have thrown");
    } catch (err) {
      expect((err as Error).message.length).toBeLessThan(300);
    }
  });

  it("handles failed text() on error response gracefully", async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 503,
      text: () => Promise.reject(new Error("stream error")),
    });

    await expect(
      textToSpeech({ text: "test", voiceId: "v1", apiKey: "k1" }),
    ).rejects.toThrow("ElevenLabs TTS failed (503)");
  });

  it("throws timeout error on AbortError", async () => {
    mockFetch.mockImplementation(
      () =>
        new Promise((_, reject) => {
          const err = new Error("The operation was aborted");
          err.name = "AbortError";
          reject(err);
        }),
    );

    await expect(
      textToSpeech({
        text: "test",
        voiceId: "v1",
        apiKey: "k1",
        timeoutMs: 100,
      }),
    ).rejects.toThrow("timed out");
  });

  it("includes signal in fetch call for abort support", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)),
    });

    await textToSpeech({ text: "test", voiceId: "v1", apiKey: "k1" });
    const [, opts] = mockFetch.mock.calls[0];
    expect(opts.signal).toBeDefined();
  });
});

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  getActiveVoiceSession,
  getActiveVoiceSessionForConnection,
  getAllActiveVoiceSessions,
  removeActiveVoiceSession,
  removeVoiceSessionForConnection,
  setActiveVoiceSession,
  setVoiceSessionForConnection,
  VoiceSession,
  type VoiceSessionConfig,
  type VoiceSessionEvents,
} from "./session.js";

vi.mock("../logging.js", () => ({
  createSubsystemLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeConfig(
  overrides: Partial<VoiceSessionConfig> = {},
): VoiceSessionConfig {
  return {
    voiceId: "test-voice",
    modelId: "eleven_turbo_v2_5",
    apiKey: "test-api-key",
    systemPrompt: "You are a helpful assistant.",
    interruptOnSpeech: true,
    maxDurationMs: 5_000,
    ...overrides,
  };
}

function makeEvents(
  overrides: Partial<VoiceSessionEvents> = {},
): VoiceSessionEvents {
  return {
    onStateChange: vi.fn(),
    onTranscript: vi.fn(),
    onAudioChunk: vi.fn(),
    onError: vi.fn(),
    onEnd: vi.fn(),
    ...overrides,
  };
}

// ── VoiceSession construction ─────────────────────────────────────────────────

describe("VoiceSession", () => {
  it("creates with a unique id and initial state", () => {
    const session = new VoiceSession("main", makeConfig(), makeEvents());
    expect(session.id).toBeDefined();
    expect(session.id.length).toBeGreaterThan(0);
    expect(session.sessionKey).toBe("main");
    expect(session.state).toBe("connecting");
  });

  it("generates different IDs for different sessions", () => {
    const s1 = new VoiceSession("a", makeConfig(), makeEvents());
    const s2 = new VoiceSession("b", makeConfig(), makeEvents());
    expect(s1.id).not.toBe(s2.id);
  });
});

// ── feedAudio ─────────────────────────────────────────────────────────────────

describe("feedAudio", () => {
  it("does not throw when ws is null (session not started)", () => {
    const session = new VoiceSession("main", makeConfig(), makeEvents());
    // feedAudio should silently return when ws is null
    expect(() => session.feedAudio(Buffer.from("audio"))).not.toThrow();
  });
});

// ── interrupt ─────────────────────────────────────────────────────────────────

describe("interrupt", () => {
  it("does nothing when not in speaking state", () => {
    const events = makeEvents();
    const session = new VoiceSession("main", makeConfig(), makeEvents());
    // State is "connecting", interrupt should be a no-op
    session.interrupt();
    // onStateChange would have been called in constructor, but not for interrupt
    expect(events.onStateChange).not.toHaveBeenCalledWith("listening");
  });

  it("does nothing when interruptOnSpeech is false", () => {
    const events = makeEvents();
    const session = new VoiceSession(
      "main",
      makeConfig({ interruptOnSpeech: false }),
      events,
    );
    session.interrupt();
    // Should not transition
    expect(events.onStateChange).not.toHaveBeenCalledWith("listening");
  });
});

// ── end ───────────────────────────────────────────────────────────────────────

describe("end", () => {
  it("returns a summary with duration and empty transcript", async () => {
    const events = makeEvents();
    const session = new VoiceSession("main", makeConfig(), events);

    const summary = await session.end();
    expect(summary.durationMs).toBeGreaterThanOrEqual(0);
    expect(summary.transcript).toEqual([]);
    expect(session.state).toBe("ended");
  });

  it("fires onEnd callback", async () => {
    const events = makeEvents();
    const session = new VoiceSession("main", makeConfig(), events);
    await session.end();
    expect(events.onEnd).toHaveBeenCalledTimes(1);
    expect(events.onEnd).toHaveBeenCalledWith(
      expect.objectContaining({ durationMs: expect.any(Number) }),
    );
  });

  it("fires onStateChange with ended", async () => {
    const events = makeEvents();
    const session = new VoiceSession("main", makeConfig(), events);
    await session.end();
    expect(events.onStateChange).toHaveBeenCalledWith("ended");
  });

  it("is idempotent (calling end twice does not crash)", async () => {
    const session = new VoiceSession("main", makeConfig(), makeEvents());
    await session.end();
    // Second call should be safe
    const summary = await session.end();
    expect(summary.transcript).toEqual([]);
  });
});

// ── Active Session Registry ───────────────────────────────────────────────────

describe("Active Session Registry", () => {
  afterEach(() => {
    // Clean up any sessions we registered
    removeActiveVoiceSession("test-key-1");
    removeActiveVoiceSession("test-key-2");
  });

  it("set / get / remove lifecycle", () => {
    const session = new VoiceSession("test-key-1", makeConfig(), makeEvents());
    setActiveVoiceSession("test-key-1", session);

    const found = getActiveVoiceSession("test-key-1");
    expect(found).toBe(session);

    removeActiveVoiceSession("test-key-1");
    expect(getActiveVoiceSession("test-key-1")).toBeUndefined();
  });

  it("getAllActiveVoiceSessions returns all registered sessions", () => {
    const s1 = new VoiceSession("test-key-1", makeConfig(), makeEvents());
    const s2 = new VoiceSession("test-key-2", makeConfig(), makeEvents());
    setActiveVoiceSession("test-key-1", s1);
    setActiveVoiceSession("test-key-2", s2);

    const all = getAllActiveVoiceSessions();
    expect(all).toContain(s1);
    expect(all).toContain(s2);
  });

  it("returns undefined for unregistered session key", () => {
    expect(getActiveVoiceSession("not-registered")).toBeUndefined();
  });
});

// ── Connection Mapping ────────────────────────────────────────────────────────

describe("Connection Mapping", () => {
  afterEach(() => {
    removeVoiceSessionForConnection("conn-1");
    removeActiveVoiceSession("mapped-key");
  });

  it("maps connection ID to session via session key", () => {
    const session = new VoiceSession("mapped-key", makeConfig(), makeEvents());
    setActiveVoiceSession("mapped-key", session);
    setVoiceSessionForConnection("conn-1", "mapped-key");

    const found = getActiveVoiceSessionForConnection("conn-1");
    expect(found).toBe(session);
  });

  it("returns undefined when connection not mapped", () => {
    expect(getActiveVoiceSessionForConnection("unknown")).toBeUndefined();
  });

  it("returns undefined when connection mapped but session removed", () => {
    setVoiceSessionForConnection("conn-1", "gone-key");
    expect(getActiveVoiceSessionForConnection("conn-1")).toBeUndefined();
  });

  it("remove cleans up connection mapping", () => {
    const session = new VoiceSession("mapped-key", makeConfig(), makeEvents());
    setActiveVoiceSession("mapped-key", session);
    setVoiceSessionForConnection("conn-1", "mapped-key");

    removeVoiceSessionForConnection("conn-1");
    expect(getActiveVoiceSessionForConnection("conn-1")).toBeUndefined();
  });
});

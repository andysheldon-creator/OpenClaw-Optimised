import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ClawdbotConfig } from "../config/config.js";
import type { MsgContext } from "../auto-reply/templating.js";
import { resolveApiKeyForProvider } from "../agents/model-auth.js";
import { fetchRemoteMedia } from "../media/fetch.js";

vi.mock("../agents/model-auth.js", () => ({
  resolveApiKeyForProvider: vi.fn(async () => ({
    apiKey: "test-key",
    source: "test",
  })),
}));

vi.mock("../media/fetch.js", () => ({
  fetchRemoteMedia: vi.fn(),
}));

async function loadApply() {
  return await import("./apply.js");
}

describe("applyMediaUnderstanding", () => {
  const mockedResolveApiKey = vi.mocked(resolveApiKeyForProvider);
  const mockedFetchRemoteMedia = vi.mocked(fetchRemoteMedia);

  beforeEach(() => {
    mockedResolveApiKey.mockClear();
    mockedFetchRemoteMedia.mockReset();
    mockedFetchRemoteMedia.mockResolvedValue({
      buffer: Buffer.from("audio-bytes"),
      contentType: "audio/ogg",
      fileName: "note.ogg",
    });
  });

  it("sets Transcript and replaces Body when audio transcription succeeds", async () => {
    const { applyMediaUnderstanding } = await loadApply();
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "clawdbot-media-"));
    const audioPath = path.join(dir, "note.ogg");
    await fs.writeFile(audioPath, "hello");

    const ctx: MsgContext = {
      Body: "<media:audio>",
      MediaPath: audioPath,
      MediaType: "audio/ogg",
    };
    const cfg: ClawdbotConfig = {
      tools: {
        audio: {
          transcription: {
            enabled: true,
            provider: "groq",
            maxBytes: 1024 * 1024,
          },
        },
      },
    };

    const result = await applyMediaUnderstanding({
      ctx,
      cfg,
      providers: {
        groq: {
          id: "groq",
          transcribeAudio: async () => ({ text: "transcribed text" }),
        },
      },
    });

    expect(result.appliedAudio).toBe(true);
    expect(ctx.Transcript).toBe("transcribed text");
    expect(ctx.Body).toBe("[Audio]\nTranscript:\ntranscribed text");
    expect(ctx.CommandBody).toBe("transcribed text");
    expect(ctx.RawBody).toBe("transcribed text");
  });

  it("handles URL-only attachments for audio transcription", async () => {
    const { applyMediaUnderstanding } = await loadApply();
    const ctx: MsgContext = {
      Body: "<media:audio>",
      MediaUrl: "https://example.com/note.ogg",
      MediaType: "audio/ogg",
      ChatType: "dm",
    };
    const cfg: ClawdbotConfig = {
      tools: {
        audio: {
          transcription: {
            enabled: true,
            provider: "groq",
            maxBytes: 1024 * 1024,
            scope: {
              default: "deny",
              rules: [{ action: "allow", match: { chatType: "direct" } }],
            },
          },
        },
      },
    };

    const result = await applyMediaUnderstanding({
      ctx,
      cfg,
      providers: {
        groq: {
          id: "groq",
          transcribeAudio: async () => ({ text: "remote transcript" }),
        },
      },
    });

    expect(result.appliedAudio).toBe(true);
    expect(ctx.Transcript).toBe("remote transcript");
    expect(ctx.Body).toBe("[Audio]\nTranscript:\nremote transcript");
  });

  it("skips audio transcription when attachment exceeds maxBytes", async () => {
    const { applyMediaUnderstanding } = await loadApply();
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "clawdbot-media-"));
    const audioPath = path.join(dir, "large.wav");
    await fs.writeFile(audioPath, "0123456789");

    const ctx: MsgContext = {
      Body: "<media:audio>",
      MediaPath: audioPath,
      MediaType: "audio/wav",
    };
    const transcribeAudio = vi.fn(async () => ({ text: "should-not-run" }));
    const cfg: ClawdbotConfig = {
      tools: {
        audio: {
          transcription: {
            enabled: true,
            provider: "groq",
            maxBytes: 4,
          },
        },
      },
    };

    const result = await applyMediaUnderstanding({
      ctx,
      cfg,
      providers: { groq: { id: "groq", transcribeAudio } },
    });

    expect(result.appliedAudio).toBe(false);
    expect(transcribeAudio).not.toHaveBeenCalled();
    expect(ctx.Body).toBe("<media:audio>");
  });

  it("avoids global MediaType when multiple attachments exist", async () => {
    const { applyMediaUnderstanding } = await loadApply();
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "clawdbot-media-"));
    const imagePath = path.join(dir, "image.jpg");
    const audioPath = path.join(dir, "note.ogg");
    await fs.writeFile(imagePath, "image-bytes");
    await fs.writeFile(audioPath, "audio-bytes");

    let seenFileName: string | undefined;
    const ctx: MsgContext = {
      Body: "<media:audio>",
      MediaPaths: [imagePath, audioPath],
      MediaType: "audio/ogg",
    };
    const cfg: ClawdbotConfig = {
      tools: {
        audio: {
          transcription: {
            enabled: true,
            provider: "groq",
            maxBytes: 1024 * 1024,
          },
        },
      },
    };

    const result = await applyMediaUnderstanding({
      ctx,
      cfg,
      providers: {
        groq: {
          id: "groq",
          transcribeAudio: async (req) => {
            seenFileName = req.fileName;
            return { text: "multi audio" };
          },
        },
      },
    });

    expect(result.appliedAudio).toBe(true);
    expect(seenFileName).toBe("note.ogg");
    expect(ctx.Body).toBe("[Audio]\nTranscript:\nmulti audio");
  });

  it("keeps per-index MediaTypes when the array is sparse", async () => {
    const { applyMediaUnderstanding } = await loadApply();
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "clawdbot-media-"));
    const audioPath = path.join(dir, "voice");
    const imagePath = path.join(dir, "image.jpg");
    await fs.writeFile(audioPath, "audio-bytes");
    await fs.writeFile(imagePath, "image-bytes");

    let seenFileName: string | undefined;
    const ctx: MsgContext = {
      Body: "<media:audio>",
      MediaPaths: [audioPath, imagePath],
      MediaTypes: ["audio/ogg"],
    };
    const cfg: ClawdbotConfig = {
      tools: {
        audio: {
          transcription: {
            enabled: true,
            provider: "groq",
            maxBytes: 1024 * 1024,
          },
        },
      },
    };

    const result = await applyMediaUnderstanding({
      ctx,
      cfg,
      providers: {
        groq: {
          id: "groq",
          transcribeAudio: async (req) => {
            seenFileName = req.fileName;
            return { text: "sparse audio" };
          },
        },
      },
    });

    expect(result.appliedAudio).toBe(true);
    expect(seenFileName).toBe("voice");
    expect(ctx.Body).toBe("[Audio]\nTranscript:\nsparse audio");
  });

  it("skips video when base64 payload exceeds limit", async () => {
    const { applyMediaUnderstanding } = await loadApply();
    const bigBuffer = Buffer.alloc(54 * 1024 * 1024);
    mockedFetchRemoteMedia.mockResolvedValueOnce({
      buffer: bigBuffer,
      contentType: "video/mp4",
      fileName: "clip.mp4",
    });

    const describeVideo = vi.fn(async () => ({ text: "should-not-run" }));
    const ctx: MsgContext = {
      Body: "<media:video>",
      MediaUrl: "https://example.com/clip.mp4",
      MediaType: "video/mp4",
    };
    const cfg: ClawdbotConfig = {
      tools: {
        video: {
          understanding: {
            enabled: true,
            provider: "google",
            maxBytes: 100 * 1024 * 1024,
          },
        },
      },
    };

    const result = await applyMediaUnderstanding({
      ctx,
      cfg,
      providers: { google: { id: "google", describeVideo } },
    });

    expect(result.appliedVideo).toBe(false);
    expect(describeVideo).not.toHaveBeenCalled();
    expect(ctx.Body).toBe("<media:video>");
  });

  it("keeps caption text for command parsing when only video understanding runs", async () => {
    const { applyMediaUnderstanding } = await loadApply();
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "clawdbot-media-"));
    const videoPath = path.join(dir, "clip.mp4");
    await fs.writeFile(videoPath, "video-bytes");

    const ctx: MsgContext = {
      Body: "<media:video> show Dom",
      MediaPath: videoPath,
      MediaType: "video/mp4",
    };
    const cfg: ClawdbotConfig = {
      tools: {
        video: {
          understanding: {
            enabled: true,
            provider: "google",
            maxBytes: 1024 * 1024,
          },
        },
      },
    };

    const result = await applyMediaUnderstanding({
      ctx,
      cfg,
      providers: {
        google: {
          id: "google",
          describeVideo: async () => ({ text: "video description" }),
        },
      },
    });

    expect(result.appliedVideo).toBe(true);
    expect(ctx.CommandBody).toBe("show Dom");
    expect(ctx.RawBody).toBe("show Dom");
  });

  it("accepts gemini as an alias for google video understanding", async () => {
    const { applyMediaUnderstanding } = await loadApply();
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "clawdbot-media-"));
    const videoPath = path.join(dir, "clip.mp4");
    await fs.writeFile(videoPath, "video-bytes");

    const ctx: MsgContext = {
      Body: "<media:video>",
      MediaPath: videoPath,
      MediaType: "video/mp4",
    };
    const cfg: ClawdbotConfig = {
      tools: {
        video: {
          understanding: {
            enabled: true,
            provider: "gemini",
            maxBytes: 1024 * 1024,
            profile: "video-profile",
            preferredProfile: "video-preferred",
          },
        },
      },
    };

    const result = await applyMediaUnderstanding({
      ctx,
      cfg,
      providers: {
        google: {
          id: "google",
          describeVideo: async () => ({ text: "video description" }),
        },
      },
      agentDir: "/tmp/agent",
    });

    expect(result.appliedVideo).toBe(true);
    expect(ctx.Body).toBe("[Video]\nDescription:\nvideo description");
    expect(mockedResolveApiKey).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: "google",
        profileId: "video-profile",
        preferredProfile: "video-preferred",
        agentDir: "/tmp/agent",
      }),
    );
  });
});

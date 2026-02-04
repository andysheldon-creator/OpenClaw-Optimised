import { describe, expect, it } from "vitest";
import { isTruthyEnvValue } from "../../../infra/env.js";
import { transcribeSarvamAudio } from "./audio.js";

const SARVAM_KEY = process.env.SARVAM_API_KEY ?? "";
const SARVAM_MODEL = process.env.SARVAM_MODEL?.trim() || "saarika:v2.5";
const SARVAM_BASE_URL = process.env.SARVAM_BASE_URL?.trim();

// Sample audio URL - using a public domain audio sample
// NOTE: For reliable ASR tests, provide a speech sample via SARVAM_SAMPLE_URL env var
const SAMPLE_URL =
  process.env.SARVAM_SAMPLE_URL?.trim() ||
  "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3";

const LIVE =
  isTruthyEnvValue(process.env.SARVAM_LIVE_TEST) ||
  isTruthyEnvValue(process.env.LIVE) ||
  isTruthyEnvValue(process.env.OPENCLAW_LIVE_TEST);

const describeLive = LIVE && SARVAM_KEY ? describe : describe.skip;

async function fetchSampleBuffer(url: string, timeoutMs: number): Promise<Buffer> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Math.max(1, timeoutMs));
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) {
      throw new Error(`Sample download failed (HTTP ${res.status})`);
    }
    const data = await res.arrayBuffer();
    return Buffer.from(data);
  } finally {
    clearTimeout(timer);
  }
}

describeLive("sarvam live", () => {
  it("transcribes sample audio", async () => {
    const buffer = await fetchSampleBuffer(SAMPLE_URL, 15000);
    const result = await transcribeSarvamAudio({
      buffer,
      fileName: "sample.mp3",
      mime: "audio/mpeg",
      apiKey: SARVAM_KEY,
      model: SARVAM_MODEL,
      baseUrl: SARVAM_BASE_URL,
      timeoutMs: 30000,
    });
    expect(result.text.trim().length).toBeGreaterThan(0);
    expect(result.model).toBe(SARVAM_MODEL);
  }, 60000);

  it("transcribes with language code", async () => {
    // Skip if no sample URL provided (default sample is English)
    if (!process.env.SARVAM_SAMPLE_URL) {
      return;
    }
    const buffer = await fetchSampleBuffer(SAMPLE_URL, 15000);
    const result = await transcribeSarvamAudio({
      buffer,
      fileName: "sample.mp3",
      mime: "audio/mpeg",
      apiKey: SARVAM_KEY,
      model: "saarika:v2.5",
      language: "hi-IN",
      timeoutMs: 30000,
    });
    expect(result.text.trim().length).toBeGreaterThan(0);
  }, 60000);

  it("transcribes with timestamps", async () => {
    const buffer = await fetchSampleBuffer(SAMPLE_URL, 15000);
    const result = await transcribeSarvamAudio({
      buffer,
      fileName: "sample.mp3",
      mime: "audio/mpeg",
      apiKey: SARVAM_KEY,
      model: "saarika:v2.5",
      query: { with_timestamps: true },
      timeoutMs: 30000,
    });
    expect(result.text.trim().length).toBeGreaterThan(0);
  }, 60000);
});

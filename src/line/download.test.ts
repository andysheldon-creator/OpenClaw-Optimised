import { describe, expect, it } from "vitest";
import { __testing } from "./download.js";

const { detectContentType, getExtensionForContentType } = __testing;

describe("detectContentType", () => {
  it("detects JPEG from magic bytes", () => {
    const buf = Buffer.from([0xff, 0xd8, 0xff, 0xe0]);
    expect(detectContentType(buf)).toBe("image/jpeg");
  });

  it("detects PNG from magic bytes", () => {
    const buf = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    expect(detectContentType(buf)).toBe("image/png");
  });

  it("detects GIF from magic bytes", () => {
    const buf = Buffer.from([0x47, 0x49, 0x46, 0x38, 0x39, 0x61]);
    expect(detectContentType(buf)).toBe("image/gif");
  });

  it("detects WebP from magic bytes", () => {
    // RIFF....WEBP
    const buf = Buffer.alloc(16);
    buf[0] = 0x52; // R
    buf[1] = 0x49; // I
    buf[2] = 0x46; // F
    buf[3] = 0x46; // F
    buf[8] = 0x57; // W
    buf[9] = 0x45; // E
    buf[10] = 0x42; // B
    buf[11] = 0x50; // P
    expect(detectContentType(buf)).toBe("image/webp");
  });

  it("detects MP4 from magic bytes", () => {
    // ....ftyp
    const buf = Buffer.alloc(12);
    buf[4] = 0x66; // f
    buf[5] = 0x74; // t
    buf[6] = 0x79; // y
    buf[7] = 0x70; // p
    // Avoid M4A match: ensure first 3 bytes are not all 0x00
    buf[0] = 0x00;
    buf[1] = 0x00;
    buf[2] = 0x01; // non-zero third byte → won't match M4A
    expect(detectContentType(buf)).toBe("video/mp4");
  });

  it("detects M4A/AAC from magic bytes", () => {
    // 0x00 0x00 0x00 XX ftyp
    const buf = Buffer.alloc(12);
    buf[0] = 0x00;
    buf[1] = 0x00;
    buf[2] = 0x00;
    buf[3] = 0x20; // typical M4A box size byte
    buf[4] = 0x66; // f
    buf[5] = 0x74; // t
    buf[6] = 0x79; // y
    buf[7] = 0x70; // p
    expect(detectContentType(buf)).toBe("audio/mp4");
  });

  // Edge cases: empty and truncated buffers
  it("returns octet-stream for empty buffer", () => {
    expect(detectContentType(Buffer.alloc(0))).toBe("application/octet-stream");
  });

  it("returns octet-stream for 1-byte buffer", () => {
    expect(detectContentType(Buffer.from([0xff]))).toBe("application/octet-stream");
  });

  it("returns octet-stream for 2-byte non-JPEG buffer", () => {
    expect(detectContentType(Buffer.from([0x00, 0x00]))).toBe("application/octet-stream");
  });

  it("detects JPEG with exactly 2 bytes", () => {
    expect(detectContentType(Buffer.from([0xff, 0xd8]))).toBe("image/jpeg");
  });

  it("returns octet-stream for 3-byte PNG-prefix (too short)", () => {
    // PNG needs 4 bytes but only 3 provided
    expect(detectContentType(Buffer.from([0x89, 0x50, 0x4e]))).toBe("application/octet-stream");
  });

  it("returns octet-stream for 7-byte buffer with ftyp at offset 4 (too short for MP4)", () => {
    // MP4 needs 8 bytes (indices 4–7) but only 7 provided
    const buf = Buffer.alloc(7);
    buf[4] = 0x66;
    buf[5] = 0x74;
    buf[6] = 0x79;
    expect(detectContentType(buf)).toBe("application/octet-stream");
  });

  it("returns octet-stream for 11-byte WebP-prefix (too short)", () => {
    // WebP needs 12 bytes but only 11 provided
    const buf = Buffer.alloc(11);
    buf[0] = 0x52;
    buf[1] = 0x49;
    buf[2] = 0x46;
    buf[3] = 0x46;
    buf[8] = 0x57;
    buf[9] = 0x45;
    buf[10] = 0x42;
    expect(detectContentType(buf)).toBe("application/octet-stream");
  });

  it("returns octet-stream for unrecognized bytes", () => {
    expect(detectContentType(Buffer.from([0x01, 0x02, 0x03, 0x04]))).toBe(
      "application/octet-stream",
    );
  });
});

describe("getExtensionForContentType", () => {
  it.each([
    ["image/jpeg", ".jpg"],
    ["image/png", ".png"],
    ["image/gif", ".gif"],
    ["image/webp", ".webp"],
    ["video/mp4", ".mp4"],
    ["audio/mp4", ".m4a"],
    ["audio/mpeg", ".mp3"],
  ])("maps %s → %s", (contentType, expected) => {
    expect(getExtensionForContentType(contentType)).toBe(expected);
  });

  it("returns .bin for unknown content type", () => {
    expect(getExtensionForContentType("application/octet-stream")).toBe(".bin");
  });

  it("returns .bin for empty string", () => {
    expect(getExtensionForContentType("")).toBe(".bin");
  });

  it("returns .bin for arbitrary content type", () => {
    expect(getExtensionForContentType("text/html")).toBe(".bin");
  });
});

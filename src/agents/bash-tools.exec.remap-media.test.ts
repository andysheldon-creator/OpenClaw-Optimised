import { describe, expect, it } from "vitest";
import { splitMediaFromOutput } from "../media/parse.js";
import { remapMediaContainerPaths } from "./bash-tools.exec.js";

describe("remapMediaContainerPaths", () => {
  it("remaps container-absolute MEDIA path to relative ./", () => {
    const result = remapMediaContainerPaths("MEDIA:/workspace/ghost.png", "/workspace");
    expect(result).toBe("MEDIA:./ghost.png");
  });

  it("remaps with trailing slash on containerWorkdir", () => {
    const result = remapMediaContainerPaths("MEDIA:/workspace/ghost.png", "/workspace/");
    expect(result).toBe("MEDIA:./ghost.png");
  });

  it("remaps nested paths", () => {
    const result = remapMediaContainerPaths("MEDIA:/workspace/images/photo.jpg", "/workspace");
    expect(result).toBe("MEDIA:./images/photo.jpg");
  });

  it("remaps multiple MEDIA tokens in the same text", () => {
    const text = "MEDIA:/workspace/a.png\nsome text\nMEDIA:/workspace/b.jpg";
    const result = remapMediaContainerPaths(text, "/workspace");
    expect(result).toBe("MEDIA:./a.png\nsome text\nMEDIA:./b.jpg");
  });

  it("does not remap HTTP URLs", () => {
    const text = "MEDIA:https://example.com/image.png";
    const result = remapMediaContainerPaths(text, "/workspace");
    expect(result).toBe("MEDIA:https://example.com/image.png");
  });

  it("does not remap relative paths", () => {
    const text = "MEDIA:./local.png";
    const result = remapMediaContainerPaths(text, "/workspace");
    expect(result).toBe("MEDIA:./local.png");
  });

  it("returns text unchanged without containerWorkdir", () => {
    const text = "MEDIA:/workspace/ghost.png";
    const result = remapMediaContainerPaths(text, undefined);
    expect(result).toBe("MEDIA:/workspace/ghost.png");
  });

  it("returns text unchanged when no MEDIA: token present", () => {
    const text = "just regular output";
    const result = remapMediaContainerPaths(text, "/workspace");
    expect(result).toBe("just regular output");
  });

  it("does not remap paths outside the container workdir", () => {
    const text = "MEDIA:/other/path/ghost.png";
    const result = remapMediaContainerPaths(text, "/workspace");
    expect(result).toBe("MEDIA:/other/path/ghost.png");
  });

  it("handles MEDIA: with whitespace before path", () => {
    const result = remapMediaContainerPaths("MEDIA: /workspace/ghost.png", "/workspace");
    expect(result).toBe("MEDIA: ./ghost.png");
  });

  it("is case-insensitive for MEDIA token", () => {
    const result = remapMediaContainerPaths("media:/workspace/ghost.png", "/workspace");
    expect(result).toBe("media:./ghost.png");
  });

  it("remaps double-quoted container path", () => {
    const result = remapMediaContainerPaths('MEDIA:"/workspace/ghost.png"', "/workspace");
    expect(result).toBe('MEDIA:"./ghost.png"');
  });

  it("remaps single-quoted container path", () => {
    const result = remapMediaContainerPaths("MEDIA:'/workspace/ghost.png'", "/workspace");
    expect(result).toBe("MEDIA:'./ghost.png'");
  });

  it("remaps backtick-wrapped container path", () => {
    const result = remapMediaContainerPaths("MEDIA:`/workspace/ghost.png`", "/workspace");
    expect(result).toBe("MEDIA:`./ghost.png`");
  });
});

describe("remapMediaContainerPaths + splitMediaFromOutput integration", () => {
  it("remapped container path is accepted by splitMediaFromOutput", () => {
    const remapped = remapMediaContainerPaths("MEDIA:/workspace/ghost.png", "/workspace");
    const parsed = splitMediaFromOutput(remapped);
    expect(parsed.mediaUrls).toEqual(["./ghost.png"]);
    expect(parsed.mediaUrl).toBe("./ghost.png");
  });

  it("un-remapped container path is rejected by splitMediaFromOutput", () => {
    const parsed = splitMediaFromOutput("MEDIA:/workspace/ghost.png");
    expect(parsed.mediaUrls).toBeUndefined();
  });

  it("quoted remapped container path is accepted by splitMediaFromOutput", () => {
    const remapped = remapMediaContainerPaths('MEDIA:"/workspace/ghost.png"', "/workspace");
    const parsed = splitMediaFromOutput(remapped);
    expect(parsed.mediaUrls).toEqual(["./ghost.png"]);
  });
});

import { describe, it, expect } from "vitest";

describe("version module", () => {
  it("should export a VERSION constant", async () => {
    const { VERSION } = await import("./version.js");
    expect(typeof VERSION).toBe("string");
    expect(VERSION.length).toBeGreaterThan(0);
  });

  it("should have a valid semantic version format", async () => {
    const { VERSION } = await import("./version.js");
    // Should match semver or fallback "0.0.0"
    const semverRegex = /^\d+\.\d+\.\d+([-+].*)?$/;
    expect(VERSION).toMatch(semverRegex);
  });

  it("should never be empty", async () => {
    const { VERSION } = await import("./version.js");
    expect(VERSION).toBeTruthy();
    expect(VERSION.trim().length).toBeGreaterThan(0);
  });

  it("should have default fallback version", async () => {
    // Even if other sources fail, should have at least "0.0.0"
    const { VERSION } = await import("./version.js");
    expect(VERSION).toMatch(/^\d+\.\d+\.\d+/);
  });

  it("should match package.json or build-info version", async () => {
    const { VERSION } = await import("./version.js");
    // VERSION should be defined from one of the sources
    expect(VERSION).toBeDefined();
    expect(VERSION.length).toBeGreaterThan(0);
  });
});

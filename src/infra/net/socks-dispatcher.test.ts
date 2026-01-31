import { describe, expect, it } from "vitest";
import { isSocksProxyUrl, parseSocksUrl } from "./socks-dispatcher.js";

describe("isSocksProxyUrl", () => {
  it("returns true for socks5h URLs", () => {
    expect(isSocksProxyUrl("socks5h://proxy.example.com:1080")).toBe(true);
  });

  it("returns true for socks5 URLs", () => {
    expect(isSocksProxyUrl("socks5://proxy.example.com:1080")).toBe(true);
  });

  it("returns true for socks4 URLs", () => {
    expect(isSocksProxyUrl("socks4://proxy.example.com:1080")).toBe(true);
  });

  it("returns true for socks4a URLs", () => {
    expect(isSocksProxyUrl("socks4a://proxy.example.com:1080")).toBe(true);
  });

  it("is case-insensitive", () => {
    expect(isSocksProxyUrl("SOCKS5H://proxy.example.com:1080")).toBe(true);
    expect(isSocksProxyUrl("Socks5://proxy.example.com:1080")).toBe(true);
  });

  it("returns false for http URLs", () => {
    expect(isSocksProxyUrl("http://proxy.example.com:8080")).toBe(false);
  });

  it("returns false for https URLs", () => {
    expect(isSocksProxyUrl("https://proxy.example.com:8080")).toBe(false);
  });

  it("returns false for empty strings", () => {
    expect(isSocksProxyUrl("")).toBe(false);
  });

  it("handles whitespace-padded URLs", () => {
    expect(isSocksProxyUrl("  socks5h://proxy.example.com:1080  ")).toBe(true);
  });
});

describe("parseSocksUrl", () => {
  it("parses socks5h URL with host and port", () => {
    const config = parseSocksUrl("socks5h://egress.unsandbox.com:1080");
    expect(config).toEqual({
      host: "egress.unsandbox.com",
      port: 1080,
      type: 5,
    });
  });

  it("parses socks5 URL", () => {
    const config = parseSocksUrl("socks5://proxy.local:9050");
    expect(config).toEqual({
      host: "proxy.local",
      port: 9050,
      type: 5,
    });
  });

  it("parses socks4 URL", () => {
    const config = parseSocksUrl("socks4://proxy.local:1080");
    expect(config).toEqual({
      host: "proxy.local",
      port: 1080,
      type: 4,
    });
  });

  it("parses socks4a URL", () => {
    const config = parseSocksUrl("socks4a://proxy.local:1080");
    expect(config).toEqual({
      host: "proxy.local",
      port: 1080,
      type: 4,
    });
  });

  it("defaults port to 1080 when omitted", () => {
    const config = parseSocksUrl("socks5h://proxy.local");
    expect(config.port).toBe(1080);
  });

  it("parses credentials from URL", () => {
    const config = parseSocksUrl("socks5://user:pass@proxy.local:1080");
    expect(config).toEqual({
      host: "proxy.local",
      port: 1080,
      type: 5,
      userId: "user",
      password: "pass",
    });
  });

  it("decodes percent-encoded credentials", () => {
    const config = parseSocksUrl("socks5://us%40er:p%23ss@proxy.local:1080");
    expect(config.userId).toBe("us@er");
    expect(config.password).toBe("p#ss");
  });

  it("parses user-only auth (no password)", () => {
    const config = parseSocksUrl("socks5://user@proxy.local:1080");
    expect(config.userId).toBe("user");
    expect(config.password).toBeUndefined();
  });

  it("throws for unsupported protocols", () => {
    expect(() => parseSocksUrl("http://proxy.local:8080")).toThrow("Unsupported SOCKS URL");
  });

  it("throws for missing host", () => {
    expect(() => parseSocksUrl("socks5h://:1080")).toThrow();
  });

  it("handles uppercase scheme", () => {
    const config = parseSocksUrl("SOCKS5H://proxy.local:1080");
    expect(config.type).toBe(5);
    expect(config.host).toBe("proxy.local");
  });
});

import { describe, expect, it } from "vitest";
import { isTrustedProxyAddress, resolveGatewayListenHosts } from "./net.js";

describe("resolveGatewayListenHosts", () => {
  it("returns the input host when not loopback", async () => {
    const hosts = await resolveGatewayListenHosts("0.0.0.0", {
      canBindToHost: async () => {
        throw new Error("should not be called");
      },
    });
    expect(hosts).toEqual(["0.0.0.0"]);
  });

  it("adds ::1 when IPv6 loopback is available", async () => {
    const hosts = await resolveGatewayListenHosts("127.0.0.1", {
      canBindToHost: async () => true,
    });
    expect(hosts).toEqual(["127.0.0.1", "::1"]);
  });

  it("keeps only IPv4 loopback when IPv6 is unavailable", async () => {
    const hosts = await resolveGatewayListenHosts("127.0.0.1", {
      canBindToHost: async () => false,
    });
    expect(hosts).toEqual(["127.0.0.1"]);
  });
});

describe("isTrustedProxyAddress", () => {
  it("returns false for undefined ip", () => {
    expect(isTrustedProxyAddress(undefined, ["127.0.0.1"])).toBe(false);
  });

  it("returns false for empty trustedProxies", () => {
    expect(isTrustedProxyAddress("192.168.1.1", [])).toBe(false);
    expect(isTrustedProxyAddress("192.168.1.1", undefined)).toBe(false);
  });

  it("matches exact IP addresses", () => {
    expect(isTrustedProxyAddress("192.168.1.1", ["192.168.1.1"])).toBe(true);
    expect(isTrustedProxyAddress("192.168.1.2", ["192.168.1.1"])).toBe(false);
    expect(isTrustedProxyAddress("127.0.0.1", ["127.0.0.1"])).toBe(true);
  });

  it("matches CIDR /16 ranges (bug #8026 - Synology reverse proxy)", () => {
    // This is the exact scenario from bug #8026
    expect(isTrustedProxyAddress("172.22.0.1", ["172.22.0.0/16"])).toBe(true);
    expect(isTrustedProxyAddress("172.22.255.255", ["172.22.0.0/16"])).toBe(true);
    expect(isTrustedProxyAddress("172.23.0.1", ["172.22.0.0/16"])).toBe(false);
    expect(isTrustedProxyAddress("192.168.1.100", ["192.168.0.0/16"])).toBe(true);
  });

  it("matches CIDR /24 ranges", () => {
    expect(isTrustedProxyAddress("192.168.1.1", ["192.168.1.0/24"])).toBe(true);
    expect(isTrustedProxyAddress("192.168.1.254", ["192.168.1.0/24"])).toBe(true);
    expect(isTrustedProxyAddress("192.168.2.1", ["192.168.1.0/24"])).toBe(false);
  });

  it("matches CIDR /8 ranges", () => {
    expect(isTrustedProxyAddress("10.0.0.1", ["10.0.0.0/8"])).toBe(true);
    expect(isTrustedProxyAddress("10.255.255.255", ["10.0.0.0/8"])).toBe(true);
    expect(isTrustedProxyAddress("11.0.0.1", ["10.0.0.0/8"])).toBe(false);
  });

  it("matches CIDR /32 (single host)", () => {
    expect(isTrustedProxyAddress("192.168.1.1", ["192.168.1.1/32"])).toBe(true);
    expect(isTrustedProxyAddress("192.168.1.2", ["192.168.1.1/32"])).toBe(false);
  });

  it("matches CIDR /0 (all IPs)", () => {
    expect(isTrustedProxyAddress("1.2.3.4", ["0.0.0.0/0"])).toBe(true);
    expect(isTrustedProxyAddress("255.255.255.255", ["0.0.0.0/0"])).toBe(true);
  });

  it("supports multiple trusted proxy entries", () => {
    const proxies = ["172.22.0.0/16", "192.168.0.0/16", "10.0.0.1"];
    expect(isTrustedProxyAddress("172.22.0.1", proxies)).toBe(true);
    expect(isTrustedProxyAddress("192.168.50.100", proxies)).toBe(true);
    expect(isTrustedProxyAddress("10.0.0.1", proxies)).toBe(true);
    expect(isTrustedProxyAddress("10.0.0.2", proxies)).toBe(false);
    expect(isTrustedProxyAddress("8.8.8.8", proxies)).toBe(false);
  });

  it("handles IPv4-mapped IPv6 addresses", () => {
    expect(isTrustedProxyAddress("::ffff:172.22.0.1", ["172.22.0.0/16"])).toBe(true);
    expect(isTrustedProxyAddress("::ffff:192.168.1.1", ["192.168.1.1"])).toBe(true);
  });

  it("handles whitespace in proxy entries", () => {
    expect(isTrustedProxyAddress("192.168.1.1", ["  192.168.1.1  "])).toBe(true);
    expect(isTrustedProxyAddress("192.168.1.1", [" 192.168.0.0/16 "])).toBe(true);
  });

  it("returns false for invalid CIDR notation", () => {
    expect(isTrustedProxyAddress("192.168.1.1", ["192.168.1.0/33"])).toBe(false);
    expect(isTrustedProxyAddress("192.168.1.1", ["192.168.1.0/-1"])).toBe(false);
    expect(isTrustedProxyAddress("192.168.1.1", ["invalid/24"])).toBe(false);
  });
});

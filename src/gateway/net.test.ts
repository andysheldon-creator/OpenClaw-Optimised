import { describe, expect, it } from "vitest";
import { isTrustedProxyAddress, resolveGatewayListenHosts } from "./net.js";

describe("isTrustedProxyAddress", () => {
  it("returns false for undefined ip", () => {
    expect(isTrustedProxyAddress(undefined, ["192.168.1.0/24"])).toBe(false);
  });

  it("returns false for empty trustedProxies", () => {
    expect(isTrustedProxyAddress("192.168.1.100", [])).toBe(false);
  });

  it("matches exact IP address", () => {
    expect(isTrustedProxyAddress("192.168.1.100", ["192.168.1.100"])).toBe(true);
    expect(isTrustedProxyAddress("192.168.1.101", ["192.168.1.100"])).toBe(false);
  });

  it("matches CIDR /24 range", () => {
    expect(isTrustedProxyAddress("192.168.1.100", ["192.168.1.0/24"])).toBe(true);
    expect(isTrustedProxyAddress("192.168.1.255", ["192.168.1.0/24"])).toBe(true);
    expect(isTrustedProxyAddress("192.168.2.1", ["192.168.1.0/24"])).toBe(false);
  });

  it("matches CIDR /16 range", () => {
    expect(isTrustedProxyAddress("192.168.1.100", ["192.168.0.0/16"])).toBe(true);
    expect(isTrustedProxyAddress("192.168.255.255", ["192.168.0.0/16"])).toBe(true);
    expect(isTrustedProxyAddress("192.169.0.1", ["192.168.0.0/16"])).toBe(false);
  });

  it("matches CIDR /12 range (172.16.0.0/12)", () => {
    expect(isTrustedProxyAddress("172.16.0.1", ["172.16.0.0/12"])).toBe(true);
    expect(isTrustedProxyAddress("172.23.0.1", ["172.16.0.0/12"])).toBe(true);
    expect(isTrustedProxyAddress("172.31.255.255", ["172.16.0.0/12"])).toBe(true);
    expect(isTrustedProxyAddress("172.32.0.1", ["172.16.0.0/12"])).toBe(false);
    expect(isTrustedProxyAddress("172.15.255.255", ["172.16.0.0/12"])).toBe(false);
  });

  it("matches /8 range", () => {
    expect(isTrustedProxyAddress("10.0.0.1", ["10.0.0.0/8"])).toBe(true);
    expect(isTrustedProxyAddress("10.255.255.255", ["10.0.0.0/8"])).toBe(true);
    expect(isTrustedProxyAddress("11.0.0.1", ["10.0.0.0/8"])).toBe(false);
  });

  it("matches /32 (single host)", () => {
    expect(isTrustedProxyAddress("192.168.1.100", ["192.168.1.100/32"])).toBe(true);
    expect(isTrustedProxyAddress("192.168.1.101", ["192.168.1.100/32"])).toBe(false);
  });

  it("matches multiple proxy entries", () => {
    const proxies = ["192.168.1.0/24", "10.0.0.0/8", "172.16.0.0/12"];
    expect(isTrustedProxyAddress("192.168.1.50", proxies)).toBe(true);
    expect(isTrustedProxyAddress("10.100.50.25", proxies)).toBe(true);
    expect(isTrustedProxyAddress("172.23.0.1", proxies)).toBe(true);
    expect(isTrustedProxyAddress("8.8.8.8", proxies)).toBe(false);
  });

  it("handles IPv4-mapped IPv6 addresses", () => {
    expect(isTrustedProxyAddress("::ffff:192.168.1.100", ["192.168.1.0/24"])).toBe(true);
    expect(isTrustedProxyAddress("::ffff:192.168.1.100", ["192.168.1.100"])).toBe(true);
  });

  it("handles mixed exact IPs and CIDR ranges", () => {
    const proxies = ["172.23.0.1", "192.168.0.0/16"];
    expect(isTrustedProxyAddress("172.23.0.1", proxies)).toBe(true);
    expect(isTrustedProxyAddress("192.168.50.100", proxies)).toBe(true);
    expect(isTrustedProxyAddress("172.23.0.2", proxies)).toBe(false);
  });
});

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

import { describe, expect, it } from "vitest";
import { resolveGatewayListenHosts } from "./net.js";

describe("resolveGatewayListenHosts", () => {
  it("adds :: when LAN IPv6 is available", async () => {
    const hosts = await resolveGatewayListenHosts("0.0.0.0", {
      canBindToHost: async (host) => host === "::",
    });
    expect(hosts).toEqual(["0.0.0.0", "::"]);
  });

  it("adds ::1 when IPv6 loopback is available", async () => {
    const hosts = await resolveGatewayListenHosts("127.0.0.1", {
      canBindToHost: async () => true,
    });
    expect(hosts).toEqual(["127.0.0.1", "::1"]);
  });

  it("keeps only IPv4 loopback when IPv6 is unavailable", async () => {
    const hosts = await resolveGatewayListenHosts("127.0.0.1", {
      canBindToHost: async (host) => host !== "::1",
    });
    expect(hosts).toEqual(["127.0.0.1"]);
  });

  it("keeps only IPv4 LAN when IPv6 is unavailable", async () => {
    const hosts = await resolveGatewayListenHosts("0.0.0.0", {
      canBindToHost: async (host) => host !== "::",
    });
    expect(hosts).toEqual(["0.0.0.0"]);
  });
});

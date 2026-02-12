import net from "node:net";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { parseSsOutput } from "./ports-inspect.js";

const runCommandWithTimeoutMock = vi.fn();

vi.mock("../process/exec.js", () => ({
  runCommandWithTimeout: (...args: unknown[]) => runCommandWithTimeoutMock(...args),
}));

const describeUnix = process.platform === "win32" ? describe.skip : describe;

describeUnix("inspectPortUsage", () => {
  beforeEach(() => {
    runCommandWithTimeoutMock.mockReset();
  });

  it("reports busy when lsof is missing but loopback listener exists", async () => {
    const server = net.createServer();
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const port = (server.address() as net.AddressInfo).port;

    runCommandWithTimeoutMock.mockRejectedValueOnce(
      Object.assign(new Error("spawn lsof ENOENT"), { code: "ENOENT" }),
    );

    try {
      const { inspectPortUsage } = await import("./ports-inspect.js");
      const result = await inspectPortUsage(port);
      expect(result.status).toBe("busy");
      expect(result.errors?.some((err) => err.includes("ENOENT"))).toBe(true);
    } finally {
      server.close();
    }
  });
});

describe("parseSsOutput", () => {
  it("parses a single IPv4 listener with process info", () => {
    const output = [
      "State  Recv-Q Send-Q Local Address:Port  Peer Address:Port Process",
      'LISTEN 0      128    0.0.0.0:18789       0.0.0.0:*        users:(("node",pid=12345,fd=3))',
    ].join("\n");

    const listeners = parseSsOutput(output, 18789);
    expect(listeners).toHaveLength(1);
    expect(listeners[0]).toEqual({
      address: "0.0.0.0:18789",
      pid: 12345,
      command: "node",
    });
  });

  it("parses a single IPv6 listener with process info", () => {
    const output = [
      "State  Recv-Q Send-Q Local Address:Port  Peer Address:Port Process",
      'LISTEN 0      128    [::]:18789          [::]:*           users:(("node",pid=12345,fd=3))',
    ].join("\n");

    const listeners = parseSsOutput(output, 18789);
    expect(listeners).toHaveLength(1);
    expect(listeners[0]).toEqual({
      address: "[::]:18789",
      pid: 12345,
      command: "node",
    });
  });

  it("parses both IPv4 and IPv6 listeners", () => {
    const output = [
      "State  Recv-Q Send-Q Local Address:Port  Peer Address:Port Process",
      'LISTEN 0      128    0.0.0.0:3000        0.0.0.0:*        users:(("node",pid=999,fd=10))',
      'LISTEN 0      128    [::]:3000           [::]:*           users:(("node",pid=999,fd=10))',
    ].join("\n");

    const listeners = parseSsOutput(output, 3000);
    expect(listeners).toHaveLength(2);
    expect(listeners[0]?.pid).toBe(999);
    expect(listeners[0]?.address).toBe("0.0.0.0:3000");
    expect(listeners[1]?.pid).toBe(999);
    expect(listeners[1]?.address).toBe("[::]:3000");
  });

  it("filters out lines for other ports", () => {
    const output = [
      "State  Recv-Q Send-Q Local Address:Port  Peer Address:Port Process",
      'LISTEN 0      128    0.0.0.0:8080        0.0.0.0:*        users:(("nginx",pid=100,fd=6))',
      'LISTEN 0      128    0.0.0.0:3000        0.0.0.0:*        users:(("node",pid=200,fd=3))',
    ].join("\n");

    const listeners = parseSsOutput(output, 3000);
    expect(listeners).toHaveLength(1);
    expect(listeners[0]?.pid).toBe(200);
    expect(listeners[0]?.command).toBe("node");
  });

  it("handles output with no process info (insufficient permissions)", () => {
    const output = [
      "State  Recv-Q Send-Q Local Address:Port  Peer Address:Port Process",
      "LISTEN 0      128    0.0.0.0:18789       0.0.0.0:*       ",
    ].join("\n");

    const listeners = parseSsOutput(output, 18789);
    expect(listeners).toHaveLength(1);
    expect(listeners[0]).toEqual({
      address: "0.0.0.0:18789",
    });
    expect(listeners[0]?.pid).toBeUndefined();
    expect(listeners[0]?.command).toBeUndefined();
  });

  it("handles 127.0.0.1 local address", () => {
    const output = [
      "State  Recv-Q Send-Q Local Address:Port  Peer Address:Port Process",
      'LISTEN 0      511    127.0.0.1:6379      0.0.0.0:*        users:(("redis-server",pid=555,fd=6))',
    ].join("\n");

    const listeners = parseSsOutput(output, 6379);
    expect(listeners).toHaveLength(1);
    expect(listeners[0]).toEqual({
      address: "127.0.0.1:6379",
      pid: 555,
      command: "redis-server",
    });
  });

  it("returns empty array for empty output", () => {
    expect(parseSsOutput("", 18789)).toEqual([]);
  });

  it("returns empty array when no matching port", () => {
    const output = [
      "State  Recv-Q Send-Q Local Address:Port  Peer Address:Port Process",
      'LISTEN 0      128    0.0.0.0:8080        0.0.0.0:*        users:(("nginx",pid=100,fd=6))',
    ].join("\n");

    expect(parseSsOutput(output, 3000)).toEqual([]);
  });

  it("returns empty array when only header is present", () => {
    const output = "State  Recv-Q Send-Q Local Address:Port  Peer Address:Port Process\n";
    expect(parseSsOutput(output, 18789)).toEqual([]);
  });

  it("does not match port as substring of another port", () => {
    // Port 80 should not match :8080
    const output = [
      "State  Recv-Q Send-Q Local Address:Port  Peer Address:Port Process",
      'LISTEN 0      128    0.0.0.0:8080        0.0.0.0:*        users:(("nginx",pid=100,fd=6))',
    ].join("\n");

    expect(parseSsOutput(output, 80)).toEqual([]);
  });

  it("handles multiple processes on the same port", () => {
    const output = [
      "State  Recv-Q Send-Q Local Address:Port  Peer Address:Port Process",
      'LISTEN 0      128    0.0.0.0:443         0.0.0.0:*        users:(("nginx",pid=100,fd=6))',
      'LISTEN 0      128    0.0.0.0:443         0.0.0.0:*        users:(("haproxy",pid=200,fd=4))',
    ].join("\n");

    const listeners = parseSsOutput(output, 443);
    expect(listeners).toHaveLength(2);
    expect(listeners[0]?.command).toBe("nginx");
    expect(listeners[1]?.command).toBe("haproxy");
  });

  it("handles process names with special characters", () => {
    const output = [
      "State  Recv-Q Send-Q Local Address:Port  Peer Address:Port Process",
      'LISTEN 0      128    0.0.0.0:5432        0.0.0.0:*        users:(("postgres: main",pid=777,fd=3))',
    ].join("\n");

    const listeners = parseSsOutput(output, 5432);
    expect(listeners).toHaveLength(1);
    expect(listeners[0]?.command).toBe("postgres: main");
    expect(listeners[0]?.pid).toBe(777);
  });

  it("ignores non-LISTEN state lines", () => {
    const output = [
      "State      Recv-Q Send-Q Local Address:Port  Peer Address:Port Process",
      'LISTEN     0      128    0.0.0.0:3000        0.0.0.0:*        users:(("node",pid=100,fd=3))',
      "ESTAB      0      0      192.168.1.1:3000    10.0.0.1:54321",
      "TIME-WAIT  0      0      192.168.1.1:3000    10.0.0.1:54322",
    ].join("\n");

    const listeners = parseSsOutput(output, 3000);
    expect(listeners).toHaveLength(1);
    expect(listeners[0]?.pid).toBe(100);
  });
});

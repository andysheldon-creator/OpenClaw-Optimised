import { createServer, type Server } from "node:http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  buildProxyOpts,
  createMissionControlProxy,
} from "./mission-control-proxy.js";

// ── buildProxyOpts ──────────────────────────────────────────────────────────

describe("buildProxyOpts", () => {
  it("returns defaults when config is undefined", () => {
    const opts = buildProxyOpts(undefined);
    expect(opts.url).toBe("http://127.0.0.1:3100");
    expect(opts.basePath).toBe("/mc");
  });

  it("strips trailing slash from url", () => {
    const opts = buildProxyOpts({ url: "http://localhost:4000/" });
    expect(opts.url).toBe("http://localhost:4000");
  });

  it("normalizes basePath to start with / and strip trailing /", () => {
    const opts = buildProxyOpts({ basePath: "mission/" });
    expect(opts.basePath).toBe("/mission");
  });

  it("preserves custom basePath starting with /", () => {
    const opts = buildProxyOpts({ basePath: "/dashboard" });
    expect(opts.basePath).toBe("/dashboard");
  });

  it("uses custom url when provided", () => {
    const opts = buildProxyOpts({ url: "https://mc.example.com" });
    expect(opts.url).toBe("https://mc.example.com");
  });
});

// ── createMissionControlProxy ───────────────────────────────────────────────

describe("createMissionControlProxy", () => {
  let upstream: Server;
  let upstreamPort: number;
  let proxy: ReturnType<typeof createMissionControlProxy>;

  // Tiny upstream server that echoes the request path + method
  beforeAll(async () => {
    upstream = createServer((req, res) => {
      const chunks: Buffer[] = [];
      req.on("data", (c) => chunks.push(c));
      req.on("end", () => {
        res.setHeader("Content-Type", "application/json");
        res.setHeader("X-MC-Test", "ok");
        res.end(
          JSON.stringify({
            method: req.method,
            url: req.url,
            body: Buffer.concat(chunks).toString("utf-8"),
            forwarded: req.headers["x-forwarded-for"] ?? null,
          }),
        );
      });
    });

    await new Promise<void>((resolve) => {
      upstream.listen(0, "127.0.0.1", () => resolve());
    });
    const addr = upstream.address();
    upstreamPort = typeof addr === "object" && addr ? addr.port : 0;

    proxy = createMissionControlProxy(
      buildProxyOpts({
        url: `http://127.0.0.1:${upstreamPort}`,
        basePath: "/mc",
      }),
    );
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => upstream.close(() => resolve()));
  });

  function fakeReq(
    url: string,
    method = "GET",
    body?: string,
  ): { req: import("node:http").IncomingMessage; res: MockRes } {
    const { Readable } = require("node:stream");
    const { PassThrough } = require("node:stream");

    const readable = new Readable({
      read() {
        if (body) this.push(body);
        this.push(null);
      },
    });
    readable.url = url;
    readable.method = method;
    readable.headers = { host: "localhost:18789" };
    readable.socket = { remoteAddress: "10.0.0.1" };

    const resStream = new PassThrough();
    const res = resStream as MockRes;
    res.statusCode = 200;
    res.setHeader = (k: string, v: string) => {
      res._headers = res._headers ?? {};
      res._headers[k.toLowerCase()] = v;
    };
    res.writeHead = (code: number, hdrs?: Record<string, string>) => {
      res.statusCode = code;
      if (hdrs) {
        for (const [k, v] of Object.entries(hdrs)) {
          res.setHeader(k, v);
        }
      }
      return res;
    };
    res.headersSent = false;
    res.end = (data?: string | Buffer) => {
      res.headersSent = true;
      res._body =
        typeof data === "string" ? data : (data?.toString("utf-8") ?? "");
      resStream.destroy();
      return res;
    };
    // Collect piped data
    res._body = "";
    const origPipe = resStream.write.bind(resStream);
    resStream.write = ((chunk: Buffer | string) => {
      res._body += typeof chunk === "string" ? chunk : chunk.toString("utf-8");
      return origPipe(chunk);
    }) as typeof resStream.write;

    return {
      req: readable as unknown as import("node:http").IncomingMessage,
      res,
    };
  }

  type MockRes = import("node:http").ServerResponse & {
    _headers?: Record<string, string>;
    _body?: string;
  };

  it("returns false for unrelated paths", async () => {
    const { req, res } = fakeReq("/overview");
    const handled = await proxy(
      req as import("node:http").IncomingMessage,
      res as unknown as import("node:http").ServerResponse,
    );
    expect(handled).toBe(false);
  });

  it("returns false for similar-prefix paths", async () => {
    const { req, res } = fakeReq("/mcnotreal");
    const handled = await proxy(
      req as import("node:http").IncomingMessage,
      res as unknown as import("node:http").ServerResponse,
    );
    expect(handled).toBe(false);
  });

  it("proxies exact basePath to upstream /", async () => {
    const { req, res } = fakeReq("/mc");
    const handled = await proxy(
      req as import("node:http").IncomingMessage,
      res as unknown as import("node:http").ServerResponse,
    );
    expect(handled).toBe(true);
    // Give the proxy pipe a moment to flush
    await new Promise((r) => setTimeout(r, 100));
    expect(res.statusCode).toBe(200);
  });

  it("strips basePath from the upstream URL", async () => {
    const { req, res } = fakeReq("/mc/api/heartbeat");
    const handled = await proxy(
      req as import("node:http").IncomingMessage,
      res as unknown as import("node:http").ServerResponse,
    );
    expect(handled).toBe(true);
    await new Promise((r) => setTimeout(r, 100));
    expect(res.statusCode).toBe(200);
  });

  it("returns 502 when upstream is unreachable", async () => {
    const deadProxy = createMissionControlProxy(
      buildProxyOpts({ url: "http://127.0.0.1:1", basePath: "/mc" }),
    );
    const { req, res } = fakeReq("/mc/test");
    const handled = await deadProxy(
      req as import("node:http").IncomingMessage,
      res as unknown as import("node:http").ServerResponse,
    );
    expect(handled).toBe(true);
    await new Promise((r) => setTimeout(r, 200));
    expect(res.statusCode).toBe(502);
  });
});

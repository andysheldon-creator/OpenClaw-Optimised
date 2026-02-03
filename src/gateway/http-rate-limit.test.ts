import type { ServerResponse } from "node:http";
import { afterEach, describe, expect, it } from "vitest";
import { resolveRateLimitsConfig } from "../config/types.gateway.js";
import { RateLimiter } from "../infra/rate-limiter.js";
import {
  checkRateLimit,
  createHttpRateLimiters,
  destroyHttpRateLimiters,
  send429,
  type HttpRateLimiters,
} from "./http-rate-limit.js";

/** Minimal mock of ServerResponse for testing 429 responses. */
function createMockResponse(): {
  res: ServerResponse;
  statusCode: () => number;
  headers: () => Record<string, string>;
  body: () => string;
} {
  let _statusCode = 200;
  const _headers: Record<string, string> = {};
  let _body = "";

  const res = {
    get statusCode() {
      return _statusCode;
    },
    set statusCode(code: number) {
      _statusCode = code;
    },
    setHeader(name: string, value: string) {
      _headers[name.toLowerCase()] = value;
    },
    end(data?: string) {
      if (data) {
        _body = data;
      }
    },
    getHeader(name: string) {
      return _headers[name.toLowerCase()];
    },
  } as unknown as ServerResponse;

  return {
    res,
    statusCode: () => _statusCode,
    headers: () => _headers,
    body: () => _body,
  };
}

describe("HTTP Rate Limiting", () => {
  let limiters: HttpRateLimiters | undefined;

  afterEach(() => {
    if (limiters) {
      destroyHttpRateLimiters(limiters);
      limiters = undefined;
    }
  });

  describe("createHttpRateLimiters", () => {
    it("creates limiters from resolved config", () => {
      const config = resolveRateLimitsConfig({});
      limiters = createHttpRateLimiters(config);
      expect(limiters.global).toBeInstanceOf(RateLimiter);
      expect(limiters.agent).toBeInstanceOf(RateLimiter);
      expect(limiters.hook).toBeInstanceOf(RateLimiter);
      expect(limiters.static).toBeInstanceOf(RateLimiter);
      expect(limiters.tools).toBeInstanceOf(RateLimiter);
    });

    it("custom globalPerMinute value is respected", () => {
      const config = resolveRateLimitsConfig({ http: { globalPerMinute: 5 } });
      limiters = createHttpRateLimiters(config);
      // Exhaust 5 tokens
      for (let i = 0; i < 5; i++) {
        const mock = createMockResponse();
        expect(checkRateLimit(limiters.global, "ip1", mock.res)).toBe(true);
      }
      // 6th should be denied
      const mock = createMockResponse();
      expect(checkRateLimit(limiters.global, "ip1", mock.res)).toBe(false);
      expect(mock.statusCode()).toBe(429);
    });

    it("custom agentPerMinute value is respected", () => {
      const config = resolveRateLimitsConfig({ http: { agentPerMinute: 3 } });
      limiters = createHttpRateLimiters(config);
      for (let i = 0; i < 3; i++) {
        const mock = createMockResponse();
        expect(checkRateLimit(limiters.agent, "ip1", mock.res)).toBe(true);
      }
      const mock = createMockResponse();
      expect(checkRateLimit(limiters.agent, "ip1", mock.res)).toBe(false);
    });
  });

  describe("Global rate limit", () => {
    it("allows requests within global limit", () => {
      const config = resolveRateLimitsConfig({});
      limiters = createHttpRateLimiters(config);
      const mock = createMockResponse();
      expect(checkRateLimit(limiters.global, "192.168.1.1", mock.res)).toBe(true);
    });

    it("returns 429 when global limit exceeded", () => {
      const config = resolveRateLimitsConfig({ http: { globalPerMinute: 2 } });
      limiters = createHttpRateLimiters(config);

      const m1 = createMockResponse();
      const m2 = createMockResponse();
      expect(checkRateLimit(limiters.global, "ip1", m1.res)).toBe(true);
      expect(checkRateLimit(limiters.global, "ip1", m2.res)).toBe(true);

      const m3 = createMockResponse();
      expect(checkRateLimit(limiters.global, "ip1", m3.res)).toBe(false);
      expect(m3.statusCode()).toBe(429);
    });

    it("includes Retry-After header in 429 response", () => {
      const config = resolveRateLimitsConfig({ http: { globalPerMinute: 1 } });
      limiters = createHttpRateLimiters(config);

      const m1 = createMockResponse();
      checkRateLimit(limiters.global, "ip1", m1.res);

      const m2 = createMockResponse();
      checkRateLimit(limiters.global, "ip1", m2.res);
      expect(m2.headers()["retry-after"]).toBeDefined();
      expect(Number(m2.headers()["retry-after"])).toBeGreaterThan(0);
    });

    it("different IPs have independent limits", () => {
      const config = resolveRateLimitsConfig({ http: { globalPerMinute: 1 } });
      limiters = createHttpRateLimiters(config);

      const m1 = createMockResponse();
      expect(checkRateLimit(limiters.global, "ip1", m1.res)).toBe(true);

      const m2 = createMockResponse();
      expect(checkRateLimit(limiters.global, "ip2", m2.res)).toBe(true);

      // ip1 is now exhausted
      const m3 = createMockResponse();
      expect(checkRateLimit(limiters.global, "ip1", m3.res)).toBe(false);

      // ip2 is also exhausted
      const m4 = createMockResponse();
      expect(checkRateLimit(limiters.global, "ip2", m4.res)).toBe(false);
    });

    it("skipped entirely when rateLimits.enabled is false", () => {
      const config = resolveRateLimitsConfig({ enabled: false });
      // When enabled is false, no limiters should be created.
      expect(config.enabled).toBe(false);
      // In real code, the server would skip creating limiters entirely.
    });
  });

  describe("Per-endpoint rate limits", () => {
    it("/v1/chat/completions returns 429 after limit exceeded", () => {
      const config = resolveRateLimitsConfig({ http: { agentPerMinute: 2 } });
      limiters = createHttpRateLimiters(config);

      for (let i = 0; i < 2; i++) {
        const mock = createMockResponse();
        expect(checkRateLimit(limiters.agent, "chat:ip1", mock.res, "openai")).toBe(true);
      }
      const mock = createMockResponse();
      expect(checkRateLimit(limiters.agent, "chat:ip1", mock.res, "openai")).toBe(false);
      expect(mock.statusCode()).toBe(429);
    });

    it("/v1/chat/completions 429 uses OpenAI error format", () => {
      const config = resolveRateLimitsConfig({ http: { agentPerMinute: 1 } });
      limiters = createHttpRateLimiters(config);

      const m1 = createMockResponse();
      checkRateLimit(limiters.agent, "chat:ip1", m1.res, "openai");

      const m2 = createMockResponse();
      checkRateLimit(limiters.agent, "chat:ip1", m2.res, "openai");
      const parsed = JSON.parse(m2.body());
      expect(parsed.error.type).toBe("rate_limit_error");
      expect(parsed.error.message).toBe("Rate limit exceeded");
      expect(parsed.error.retry_after_ms).toBeGreaterThan(0);
    });

    it("/v1/responses returns 429 after limit exceeded", () => {
      const config = resolveRateLimitsConfig({ http: { agentPerMinute: 1 } });
      limiters = createHttpRateLimiters(config);

      const m1 = createMockResponse();
      checkRateLimit(limiters.agent, "responses:ip1", m1.res, "openai");

      const m2 = createMockResponse();
      expect(checkRateLimit(limiters.agent, "responses:ip1", m2.res, "openai")).toBe(false);
      expect(m2.statusCode()).toBe(429);
    });

    it("custom toolsPerMinute value is respected", () => {
      const config = resolveRateLimitsConfig({ http: { toolsPerMinute: 3 } });
      limiters = createHttpRateLimiters(config);
      for (let i = 0; i < 3; i++) {
        const mock = createMockResponse();
        expect(checkRateLimit(limiters.tools, "tools:ip1", mock.res)).toBe(true);
      }
      const mock = createMockResponse();
      expect(checkRateLimit(limiters.tools, "tools:ip1", mock.res)).toBe(false);
      expect(mock.statusCode()).toBe(429);
    });

    it("static limiter returns 429 after limit exceeded", () => {
      const config = resolveRateLimitsConfig({ http: { staticPerMinute: 2 } });
      limiters = createHttpRateLimiters(config);
      for (let i = 0; i < 2; i++) {
        const mock = createMockResponse();
        expect(checkRateLimit(limiters.static, "static:ip1", mock.res)).toBe(true);
      }
      const mock = createMockResponse();
      expect(checkRateLimit(limiters.static, "static:ip1", mock.res)).toBe(false);
      expect(mock.statusCode()).toBe(429);
    });

    it("/tools/invoke returns 429 after limit exceeded", () => {
      const config = resolveRateLimitsConfig({}); // toolsPerMinute defaults to 20
      limiters = createHttpRateLimiters(config);
      for (let i = 0; i < 20; i++) {
        const mock = createMockResponse();
        expect(checkRateLimit(limiters.tools, "tools:ip1", mock.res)).toBe(true);
      }
      const mock = createMockResponse();
      expect(checkRateLimit(limiters.tools, "tools:ip1", mock.res)).toBe(false);
      expect(mock.statusCode()).toBe(429);
    });

    it("/hooks/agent returns 429 after limit exceeded per token", () => {
      const config = resolveRateLimitsConfig({ http: { hookPerMinute: 2 } });
      limiters = createHttpRateLimiters(config);

      for (let i = 0; i < 2; i++) {
        const mock = createMockResponse();
        expect(checkRateLimit(limiters.hook, "hook:token-a", mock.res)).toBe(true);
      }
      const mock = createMockResponse();
      expect(checkRateLimit(limiters.hook, "hook:token-a", mock.res)).toBe(false);
      expect(mock.statusCode()).toBe(429);
    });

    it("different hook tokens have independent limits", () => {
      const config = resolveRateLimitsConfig({ http: { hookPerMinute: 1 } });
      limiters = createHttpRateLimiters(config);

      const m1 = createMockResponse();
      expect(checkRateLimit(limiters.hook, "hook:token-a", m1.res)).toBe(true);

      const m2 = createMockResponse();
      expect(checkRateLimit(limiters.hook, "hook:token-b", m2.res)).toBe(true);

      // token-a exhausted
      const m3 = createMockResponse();
      expect(checkRateLimit(limiters.hook, "hook:token-a", m3.res)).toBe(false);

      // token-b also exhausted
      const m4 = createMockResponse();
      expect(checkRateLimit(limiters.hook, "hook:token-b", m4.res)).toBe(false);
    });
  });

  describe("429 response format", () => {
    it("includes retry_after_ms in JSON body", () => {
      const mock = createMockResponse();
      send429(mock.res, 5000);
      const parsed = JSON.parse(mock.body());
      expect(parsed.error.retry_after_ms).toBe(5000);
    });

    it("sets Retry-After header in seconds (rounded up)", () => {
      const mock = createMockResponse();
      send429(mock.res, 1500);
      expect(mock.headers()["retry-after"]).toBe("2");
    });

    it("Content-Type is application/json", () => {
      const mock = createMockResponse();
      send429(mock.res, 1000);
      expect(mock.headers()["content-type"]).toBe("application/json; charset=utf-8");
    });

    it("status code is 429", () => {
      const mock = createMockResponse();
      send429(mock.res, 1000);
      expect(mock.statusCode()).toBe(429);
    });
  });

  describe("Config integration", () => {
    it("enabled: false bypasses all rate limit checks", () => {
      const config = resolveRateLimitsConfig({ enabled: false });
      expect(config.enabled).toBe(false);
      // In server code, limiters are not created when enabled is false.
      // This test documents the contract.
    });

    it("defaults are applied when no config provided", () => {
      const config = resolveRateLimitsConfig(undefined);
      expect(config.enabled).toBe(true);
      expect(config.http.globalPerMinute).toBe(100);
      expect(config.http.agentPerMinute).toBe(10);
      expect(config.http.hookPerMinute).toBe(20);
      expect(config.http.staticPerMinute).toBe(200);
      expect(config.http.toolsPerMinute).toBe(20);
    });

    it("partial config merges with defaults", () => {
      const config = resolveRateLimitsConfig({ http: { globalPerMinute: 50 } });
      expect(config.http.globalPerMinute).toBe(50);
      expect(config.http.agentPerMinute).toBe(10); // default
    });
  });
});

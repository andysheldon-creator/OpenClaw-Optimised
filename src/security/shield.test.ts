import { describe, expect, it, beforeEach, vi, afterEach } from "vitest";
import { SecurityShield, type SecurityContext } from "./shield.js";
import { rateLimiter } from "./rate-limiter.js";
import { ipManager } from "./ip-manager.js";
import type { IncomingMessage } from "node:http";

vi.mock("./rate-limiter.js", () => ({
  rateLimiter: {
    check: vi.fn(),
  },
  RateLimitKeys: {
    authAttempt: (ip: string) => `auth:${ip}`,
    authAttemptDevice: (deviceId: string) => `auth:device:${deviceId}`,
    connection: (ip: string) => `conn:${ip}`,
    request: (ip: string) => `req:${ip}`,
    pairingRequest: (channel: string, sender: string) => `pair:${channel}:${sender}`,
    webhookToken: (token: string) => `hook:token:${token}`,
    webhookPath: (path: string) => `hook:path:${path}`,
  },
}));

vi.mock("./ip-manager.js", () => ({
  ipManager: {
    isBlocked: vi.fn(),
  },
}));

describe("SecurityShield", () => {
  let shield: SecurityShield;

  beforeEach(() => {
    vi.clearAllMocks();
    shield = new SecurityShield({
      enabled: true,
      rateLimiting: {
        enabled: true,
        perIp: {
          authAttempts: { max: 5, windowMs: 300_000 },
          connections: { max: 10, windowMs: 60_000 },
          requests: { max: 100, windowMs: 60_000 },
        },
        perDevice: {
          authAttempts: { max: 10, windowMs: 900_000 },
        },
        perSender: {
          pairingRequests: { max: 3, windowMs: 3_600_000 },
        },
        webhook: {
          perToken: { max: 200, windowMs: 60_000 },
          perPath: { max: 50, windowMs: 60_000 },
        },
      },
      intrusionDetection: {
        enabled: true,
        patterns: {
          bruteForce: { threshold: 10, windowMs: 600_000 },
          ssrfBypass: { threshold: 3, windowMs: 300_000 },
          pathTraversal: { threshold: 5, windowMs: 300_000 },
          portScanning: { threshold: 20, windowMs: 10_000 },
        },
        anomalyDetection: {
          enabled: false,
          learningPeriodMs: 86_400_000,
          sensitivityScore: 0.95,
        },
      },
      ipManagement: {
        autoBlock: {
          enabled: true,
          durationMs: 86_400_000,
        },
        allowlist: ["100.64.0.0/10"],
        firewall: {
          enabled: true,
          backend: "iptables",
        },
      },
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const createContext = (ip: string, deviceId?: string): SecurityContext => ({
    ip,
    deviceId,
    userAgent: "test-agent",
    requestId: "test-request-id",
  });

  describe("isEnabled", () => {
    it("should return true when enabled", () => {
      expect(shield.isEnabled()).toBe(true);
    });

    it("should return false when disabled", () => {
      const disabledShield = new SecurityShield({ enabled: false });
      expect(disabledShield.isEnabled()).toBe(false);
    });
  });

  describe("isIpBlocked", () => {
    it("should return true for blocked IP", () => {
      vi.mocked(ipManager.isBlocked).mockReturnValue("test_reason");
      expect(shield.isIpBlocked("192.168.1.100")).toBe(true);
    });

    it("should return false for non-blocked IP", () => {
      vi.mocked(ipManager.isBlocked).mockReturnValue(null);
      expect(shield.isIpBlocked("192.168.1.100")).toBe(false);
    });

    it("should return false when shield disabled", () => {
      const disabledShield = new SecurityShield({ enabled: false });
      expect(disabledShield.isIpBlocked("192.168.1.100")).toBe(false);
    });
  });

  describe("checkAuthAttempt", () => {
    it("should allow auth when under rate limit", () => {
      vi.mocked(ipManager.isBlocked).mockReturnValue(null);
      vi.mocked(rateLimiter.check).mockReturnValue({
        allowed: true,
        remaining: 4,
        resetAt: new Date(),
      });

      const result = shield.checkAuthAttempt(createContext("192.168.1.100"));

      expect(result.allowed).toBe(true);
      expect(result.reason).toBeUndefined();
    });

    it("should deny auth for blocked IP", () => {
      vi.mocked(ipManager.isBlocked).mockReturnValue("brute_force");

      const result = shield.checkAuthAttempt(createContext("192.168.1.100"));

      expect(result.allowed).toBe(false);
      expect(result.reason).toBe("IP blocked: brute_force");
    });

    it("should deny auth when per-IP rate limit exceeded", () => {
      vi.mocked(ipManager.isBlocked).mockReturnValue(null);
      vi.mocked(rateLimiter.check).mockReturnValue({
        allowed: false,
        retryAfterMs: 60000,
        remaining: 0,
        resetAt: new Date(),
      });

      const result = shield.checkAuthAttempt(createContext("192.168.1.100"));

      expect(result.allowed).toBe(false);
      expect(result.reason).toBe("Rate limit exceeded");
      expect(result.rateLimitInfo?.retryAfterMs).toBe(60000);
    });

    it("should deny auth when per-device rate limit exceeded", () => {
      vi.mocked(ipManager.isBlocked).mockReturnValue(null);
      vi.mocked(rateLimiter.check)
        .mockReturnValueOnce({
          allowed: true,
          remaining: 4,
          resetAt: new Date(),
        })
        .mockReturnValueOnce({
          allowed: false,
          retryAfterMs: 120000,
          remaining: 0,
          resetAt: new Date(),
        });

      const result = shield.checkAuthAttempt(createContext("192.168.1.100", "device-123"));

      expect(result.allowed).toBe(false);
      expect(result.reason).toBe("Rate limit exceeded (device)");
    });

    it("should allow auth when shield disabled", () => {
      const disabledShield = new SecurityShield({ enabled: false });
      const result = disabledShield.checkAuthAttempt(createContext("192.168.1.100"));

      expect(result.allowed).toBe(true);
      expect(ipManager.isBlocked).not.toHaveBeenCalled();
      expect(rateLimiter.check).not.toHaveBeenCalled();
    });
  });

  describe("checkConnection", () => {
    it("should allow connection when under rate limit", () => {
      vi.mocked(ipManager.isBlocked).mockReturnValue(null);
      vi.mocked(rateLimiter.check).mockReturnValue({
        allowed: true,
        remaining: 9,
        resetAt: new Date(),
      });

      const result = shield.checkConnection(createContext("192.168.1.100"));

      expect(result.allowed).toBe(true);
    });

    it("should deny connection for blocked IP", () => {
      vi.mocked(ipManager.isBlocked).mockReturnValue("port_scanning");

      const result = shield.checkConnection(createContext("192.168.1.100"));

      expect(result.allowed).toBe(false);
      expect(result.reason).toBe("IP blocked: port_scanning");
    });

    it("should deny connection when rate limit exceeded", () => {
      vi.mocked(ipManager.isBlocked).mockReturnValue(null);
      vi.mocked(rateLimiter.check).mockReturnValue({
        allowed: false,
        retryAfterMs: 30000,
        remaining: 0,
        resetAt: new Date(),
      });

      const result = shield.checkConnection(createContext("192.168.1.100"));

      expect(result.allowed).toBe(false);
      expect(result.reason).toBe("Connection rate limit exceeded");
    });
  });

  describe("checkRequest", () => {
    it("should allow request when under rate limit", () => {
      vi.mocked(ipManager.isBlocked).mockReturnValue(null);
      vi.mocked(rateLimiter.check).mockReturnValue({
        allowed: true,
        remaining: 99,
        resetAt: new Date(),
      });

      const result = shield.checkRequest(createContext("192.168.1.100"));

      expect(result.allowed).toBe(true);
    });

    it("should deny request for blocked IP", () => {
      vi.mocked(ipManager.isBlocked).mockReturnValue("malicious");

      const result = shield.checkRequest(createContext("192.168.1.100"));

      expect(result.allowed).toBe(false);
      expect(result.reason).toBe("IP blocked: malicious");
    });

    it("should deny request when rate limit exceeded", () => {
      vi.mocked(ipManager.isBlocked).mockReturnValue(null);
      vi.mocked(rateLimiter.check).mockReturnValue({
        allowed: false,
        retryAfterMs: 10000,
        remaining: 0,
        resetAt: new Date(),
      });

      const result = shield.checkRequest(createContext("192.168.1.100"));

      expect(result.allowed).toBe(false);
      expect(result.reason).toBe("Request rate limit exceeded");
    });
  });

  describe("checkPairingRequest", () => {
    it("should allow pairing when under rate limit", () => {
      vi.mocked(ipManager.isBlocked).mockReturnValue(null);
      vi.mocked(rateLimiter.check).mockReturnValue({
        allowed: true,
        remaining: 2,
        resetAt: new Date(),
      });

      const result = shield.checkPairingRequest({
        channel: "telegram",
        sender: "user123",
        ip: "192.168.1.100",
      });

      expect(result.allowed).toBe(true);
    });

    it("should deny pairing for blocked IP", () => {
      vi.mocked(ipManager.isBlocked).mockReturnValue("spam");

      const result = shield.checkPairingRequest({
        channel: "telegram",
        sender: "user123",
        ip: "192.168.1.100",
      });

      expect(result.allowed).toBe(false);
      expect(result.reason).toBe("IP blocked: spam");
    });

    it("should deny pairing when rate limit exceeded", () => {
      vi.mocked(ipManager.isBlocked).mockReturnValue(null);
      vi.mocked(rateLimiter.check).mockReturnValue({
        allowed: false,
        retryAfterMs: 3600000,
        remaining: 0,
        resetAt: new Date(),
      });

      const result = shield.checkPairingRequest({
        channel: "telegram",
        sender: "user123",
        ip: "192.168.1.100",
      });

      expect(result.allowed).toBe(false);
      expect(result.reason).toBe("Pairing rate limit exceeded");
    });
  });

  describe("checkWebhook", () => {
    it("should allow webhook when under rate limit", () => {
      vi.mocked(ipManager.isBlocked).mockReturnValue(null);
      vi.mocked(rateLimiter.check).mockReturnValue({
        allowed: true,
        remaining: 199,
        resetAt: new Date(),
      });

      const result = shield.checkWebhook({
        token: "webhook-token",
        path: "/api/webhook",
        ip: "192.168.1.100",
      });

      expect(result.allowed).toBe(true);
    });

    it("should deny webhook for blocked IP", () => {
      vi.mocked(ipManager.isBlocked).mockReturnValue("abuse");

      const result = shield.checkWebhook({
        token: "webhook-token",
        path: "/api/webhook",
        ip: "192.168.1.100",
      });

      expect(result.allowed).toBe(false);
      expect(result.reason).toBe("IP blocked: abuse");
    });

    it("should deny webhook when per-token rate limit exceeded", () => {
      vi.mocked(ipManager.isBlocked).mockReturnValue(null);
      vi.mocked(rateLimiter.check).mockReturnValueOnce({
        allowed: false,
        retryAfterMs: 5000,
        remaining: 0,
        resetAt: new Date(),
      });

      const result = shield.checkWebhook({
        token: "webhook-token",
        path: "/api/webhook",
        ip: "192.168.1.100",
      });

      expect(result.allowed).toBe(false);
      expect(result.reason).toBe("Webhook rate limit exceeded (token)");
    });

    it("should deny webhook when per-path rate limit exceeded", () => {
      vi.mocked(ipManager.isBlocked).mockReturnValue(null);
      vi.mocked(rateLimiter.check)
        .mockReturnValueOnce({
          allowed: true,
          remaining: 199,
          resetAt: new Date(),
        })
        .mockReturnValueOnce({
          allowed: false,
          retryAfterMs: 10000,
          remaining: 0,
          resetAt: new Date(),
        });

      const result = shield.checkWebhook({
        token: "webhook-token",
        path: "/api/webhook",
        ip: "192.168.1.100",
      });

      expect(result.allowed).toBe(false);
      expect(result.reason).toBe("Webhook rate limit exceeded (path)");
    });
  });

  describe("extractIp", () => {
    it("should extract IP from X-Forwarded-For header", () => {
      const req = {
        headers: {
          "x-forwarded-for": "203.0.113.1, 198.51.100.1",
        },
        socket: {
          remoteAddress: "192.168.1.1",
        },
      } as unknown as IncomingMessage;

      const ip = SecurityShield.extractIp(req);
      expect(ip).toBe("203.0.113.1");
    });

    it("should extract IP from X-Real-IP header when X-Forwarded-For absent", () => {
      const req = {
        headers: {
          "x-real-ip": "203.0.113.5",
        },
        socket: {
          remoteAddress: "192.168.1.1",
        },
      } as unknown as IncomingMessage;

      const ip = SecurityShield.extractIp(req);
      expect(ip).toBe("203.0.113.5");
    });

    it("should fall back to socket remote address", () => {
      const req = {
        headers: {},
        socket: {
          remoteAddress: "192.168.1.100",
        },
      } as unknown as IncomingMessage;

      const ip = SecurityShield.extractIp(req);
      expect(ip).toBe("192.168.1.100");
    });

    it("should handle missing socket", () => {
      const req = {
        headers: {},
      } as unknown as IncomingMessage;

      const ip = SecurityShield.extractIp(req);
      expect(ip).toBe("unknown");
    });

    it("should handle array X-Forwarded-For", () => {
      const req = {
        headers: {
          "x-forwarded-for": ["203.0.113.1, 198.51.100.1", "192.0.2.1"],
        },
        socket: {
          remoteAddress: "192.168.1.1",
        },
      } as unknown as IncomingMessage;

      const ip = SecurityShield.extractIp(req);
      expect(ip).toBe("203.0.113.1");
    });
  });

  describe("integration scenarios", () => {
    it("should coordinate IP blocklist and rate limiting", () => {
      // First check: allow
      vi.mocked(ipManager.isBlocked).mockReturnValueOnce(null);
      vi.mocked(rateLimiter.check).mockReturnValueOnce({
        allowed: true,
        remaining: 4,
        resetAt: new Date(),
      });

      const result1 = shield.checkAuthAttempt(createContext("192.168.1.100"));
      expect(result1.allowed).toBe(true);

      // Second check: IP now blocked
      vi.mocked(ipManager.isBlocked).mockReturnValueOnce("brute_force");

      const result2 = shield.checkAuthAttempt(createContext("192.168.1.100"));
      expect(result2.allowed).toBe(false);
      expect(result2.reason).toBe("IP blocked: brute_force");
    });

    it("should handle per-IP and per-device limits together", () => {
      const ctx = createContext("192.168.1.100", "device-123");

      vi.mocked(ipManager.isBlocked).mockReturnValue(null);

      // Per-IP limit OK, per-device limit exceeded
      vi.mocked(rateLimiter.check)
        .mockReturnValueOnce({
          allowed: true,
          remaining: 3,
          resetAt: new Date(),
        })
        .mockReturnValueOnce({
          allowed: false,
          retryAfterMs: 60000,
          remaining: 0,
          resetAt: new Date(),
        });

      const result = shield.checkAuthAttempt(ctx);

      expect(result.allowed).toBe(false);
      expect(result.reason).toBe("Rate limit exceeded (device)");
    });
  });
});

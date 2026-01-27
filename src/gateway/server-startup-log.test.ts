import { describe, expect, it, vi } from "vitest";
import { logSecurityWarnings } from "./server-startup-log.js";
import type { ResolvedGatewayAuth } from "./auth.js";
import { DEFAULT_RATE_LIMIT_CONFIG } from "./rate-limit.js";

describe("logSecurityWarnings", () => {
  const createMockLog = () => ({
    info: vi.fn(),
    warn: vi.fn(),
  });

  describe("non-loopback binding warnings", () => {
    it("warns when binding to 0.0.0.0 without auth", () => {
      const log = createMockLog();
      const auth: ResolvedGatewayAuth = {
        mode: "token",
        token: undefined,
        allowTailscale: false,
      };

      logSecurityWarnings({
        bindHost: "0.0.0.0",
        resolvedAuth: auth,
        rateLimitConfig: DEFAULT_RATE_LIMIT_CONFIG,
        log,
      });

      expect(log.warn).toHaveBeenCalledWith(
        expect.stringContaining("SECURITY WARNING"),
        expect.anything(),
      );
    });

    it("warns when binding to specific IP without auth", () => {
      const log = createMockLog();
      const auth: ResolvedGatewayAuth = {
        mode: "password",
        password: undefined,
        allowTailscale: false,
      };

      logSecurityWarnings({
        bindHost: "192.168.1.100",
        resolvedAuth: auth,
        rateLimitConfig: DEFAULT_RATE_LIMIT_CONFIG,
        log,
      });

      expect(log.warn).toHaveBeenCalledWith(
        expect.stringContaining("SECURITY WARNING"),
        expect.anything(),
      );
    });

    it("does not warn when binding to loopback", () => {
      const log = createMockLog();
      const auth: ResolvedGatewayAuth = {
        mode: "token",
        token: undefined,
        allowTailscale: false,
      };

      logSecurityWarnings({
        bindHost: "127.0.0.1",
        resolvedAuth: auth,
        rateLimitConfig: DEFAULT_RATE_LIMIT_CONFIG,
        log,
      });

      // Should not have a security warning about auth
      expect(log.warn).not.toHaveBeenCalledWith(
        expect.stringContaining("SECURITY WARNING"),
        expect.anything(),
      );
    });

    it("does not warn when binding to non-loopback with token auth", () => {
      const log = createMockLog();
      const auth: ResolvedGatewayAuth = {
        mode: "token",
        token: "secret-token-123",
        allowTailscale: false,
      };

      logSecurityWarnings({
        bindHost: "0.0.0.0",
        resolvedAuth: auth,
        rateLimitConfig: DEFAULT_RATE_LIMIT_CONFIG,
        log,
      });

      expect(log.warn).not.toHaveBeenCalledWith(
        expect.stringContaining("SECURITY WARNING"),
        expect.anything(),
      );
    });

    it("does not warn when binding to non-loopback with password auth", () => {
      const log = createMockLog();
      const auth: ResolvedGatewayAuth = {
        mode: "password",
        password: "secure-password",
        allowTailscale: false,
      };

      logSecurityWarnings({
        bindHost: "0.0.0.0",
        resolvedAuth: auth,
        rateLimitConfig: DEFAULT_RATE_LIMIT_CONFIG,
        log,
      });

      expect(log.warn).not.toHaveBeenCalledWith(
        expect.stringContaining("SECURITY WARNING"),
        expect.anything(),
      );
    });
  });

  describe("rate limiting status", () => {
    it("logs rate limit info when enabled", () => {
      const log = createMockLog();
      const auth: ResolvedGatewayAuth = {
        mode: "token",
        token: "secret-token-123",
        allowTailscale: false,
      };

      logSecurityWarnings({
        bindHost: "127.0.0.1",
        resolvedAuth: auth,
        rateLimitConfig: DEFAULT_RATE_LIMIT_CONFIG,
        log,
      });

      expect(log.info).toHaveBeenCalledWith(expect.stringContaining("rate limiting"));
    });

    it("warns when rate limiting is disabled", () => {
      const log = createMockLog();
      const auth: ResolvedGatewayAuth = {
        mode: "token",
        token: "secret-token-123",
        allowTailscale: false,
      };

      logSecurityWarnings({
        bindHost: "127.0.0.1",
        resolvedAuth: auth,
        rateLimitConfig: {
          ...DEFAULT_RATE_LIMIT_CONFIG,
          enabled: false,
        },
        log,
      });

      expect(log.warn).toHaveBeenCalledWith(
        expect.stringContaining("Rate limiting is disabled"),
        expect.anything(),
      );
    });

    it("shows unlimited for authenticated when config is 0", () => {
      const log = createMockLog();
      const auth: ResolvedGatewayAuth = {
        mode: "token",
        token: "secret-token-123",
        allowTailscale: false,
      };

      logSecurityWarnings({
        bindHost: "127.0.0.1",
        resolvedAuth: auth,
        rateLimitConfig: {
          ...DEFAULT_RATE_LIMIT_CONFIG,
          authenticated: 0,
        },
        log,
      });

      expect(log.info).toHaveBeenCalledWith(expect.stringContaining("unlimited"));
    });

    it("shows specific limit for authenticated when set", () => {
      const log = createMockLog();
      const auth: ResolvedGatewayAuth = {
        mode: "token",
        token: "secret-token-123",
        allowTailscale: false,
      };

      logSecurityWarnings({
        bindHost: "127.0.0.1",
        resolvedAuth: auth,
        rateLimitConfig: {
          ...DEFAULT_RATE_LIMIT_CONFIG,
          authenticated: 500,
        },
        log,
      });

      expect(log.info).toHaveBeenCalledWith(expect.stringContaining("500/min"));
    });
  });
});

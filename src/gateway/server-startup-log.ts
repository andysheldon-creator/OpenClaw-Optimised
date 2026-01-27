import chalk from "chalk";
import { DEFAULT_MODEL, DEFAULT_PROVIDER } from "../agents/defaults.js";
import { resolveConfiguredModelRef } from "../agents/model-selection.js";
import type { loadConfig } from "../config/config.js";
import { getResolvedLoggerSettings } from "../logging.js";
import type { ResolvedGatewayAuth } from "./auth.js";
import { isLoopbackHost } from "./net.js";
import type { ResolvedRateLimitConfig } from "./rate-limit.js";

export function logGatewayStartup(params: {
  cfg: ReturnType<typeof loadConfig>;
  bindHost: string;
  bindHosts?: string[];
  port: number;
  tlsEnabled?: boolean;
  log: { info: (msg: string, meta?: Record<string, unknown>) => void };
  isNixMode: boolean;
}) {
  const { provider: agentProvider, model: agentModel } = resolveConfiguredModelRef({
    cfg: params.cfg,
    defaultProvider: DEFAULT_PROVIDER,
    defaultModel: DEFAULT_MODEL,
  });
  const modelRef = `${agentProvider}/${agentModel}`;
  params.log.info(`agent model: ${modelRef}`, {
    consoleMessage: `agent model: ${chalk.whiteBright(modelRef)}`,
  });
  const scheme = params.tlsEnabled ? "wss" : "ws";
  const formatHost = (host: string) => (host.includes(":") ? `[${host}]` : host);
  const hosts =
    params.bindHosts && params.bindHosts.length > 0 ? params.bindHosts : [params.bindHost];
  const primaryHost = hosts[0] ?? params.bindHost;
  params.log.info(
    `listening on ${scheme}://${formatHost(primaryHost)}:${params.port} (PID ${process.pid})`,
  );
  for (const host of hosts.slice(1)) {
    params.log.info(`listening on ${scheme}://${formatHost(host)}:${params.port}`);
  }
  params.log.info(`log file: ${getResolvedLoggerSettings().file}`);
  if (params.isNixMode) {
    params.log.info("gateway: running in Nix mode (config managed externally)");
  }
}

/**
 * Check if authentication is properly configured for the binding mode.
 * Returns true if auth is configured (token or password set).
 */
function isAuthConfigured(auth: ResolvedGatewayAuth): boolean {
  if (auth.mode === "token" && auth.token) return true;
  if (auth.mode === "password" && auth.password) return true;
  return false;
}

/**
 * Log security warnings at gateway startup.
 * Warns about potentially insecure configurations:
 * - Non-loopback binding without authentication
 * - Rate limiting disabled
 */
export function logSecurityWarnings(params: {
  bindHost: string;
  resolvedAuth: ResolvedGatewayAuth;
  rateLimitConfig?: ResolvedRateLimitConfig;
  log: {
    info: (msg: string, meta?: Record<string, unknown>) => void;
    warn: (msg: string, meta?: Record<string, unknown>) => void;
  };
}): void {
  const { bindHost, resolvedAuth, rateLimitConfig, log } = params;

  // Check if binding to non-loopback without auth
  const isLoopback = isLoopbackHost(bindHost);
  const authConfigured = isAuthConfigured(resolvedAuth);

  if (!isLoopback && !authConfigured) {
    log.warn(
      `SECURITY WARNING: Gateway binding to ${bindHost} (non-loopback) without authentication configured.`,
      {
        consoleMessage: chalk.yellow(
          `⚠️  SECURITY WARNING: Gateway binding to ${chalk.bold(bindHost)} without authentication.\n` +
            `   Configure gateway.auth.token or gateway.auth.password in clawdbot.json for secure access.`,
        ),
      },
    );
  }

  // Log rate limiting status
  if (rateLimitConfig) {
    if (!rateLimitConfig.enabled) {
      log.warn("Rate limiting is disabled. Consider enabling for production use.", {
        consoleMessage: chalk.yellow(
          "⚠️  Rate limiting disabled. Set gateway.rateLimit.enabled: true for protection.",
        ),
      });
    } else {
      log.info(
        `rate limiting: unauthenticated=${rateLimitConfig.unauthenticated}/min, ` +
          `authenticated=${rateLimitConfig.authenticated === 0 ? "unlimited" : `${rateLimitConfig.authenticated}/min`}`,
      );
    }
  }
}

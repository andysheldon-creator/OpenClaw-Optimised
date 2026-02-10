import chalk from "chalk";
import type { loadConfig } from "../config/config.js";
import type { ResolvedGatewayAuth } from "./auth.js";
import { DEFAULT_MODEL, DEFAULT_PROVIDER } from "../agents/defaults.js";
import { resolveConfiguredModelRef } from "../agents/model-selection.js";
import { getResolvedLoggerSettings } from "../logging.js";

export function logGatewayStartup(params: {
  cfg: ReturnType<typeof loadConfig>;
  bindHost: string;
  bindHosts?: string[];
  port: number;
  tlsEnabled?: boolean;
  log: {
    info: (msg: string, meta?: Record<string, unknown>) => void;
    warn?: (msg: string, meta?: Record<string, unknown>) => void;
  };
  isNixMode: boolean;
  resolvedAuth?: ResolvedGatewayAuth;
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

  // SECURITY: Warn if gateway is bound to LAN without authentication.
  // This is a common misconfiguration that exposes the gateway to the network.
  const isLanBound = hosts.some(
    (h) => h === "0.0.0.0" || h === "::" || (!h.startsWith("127.") && h !== "::1"),
  );
  const hasAuth =
    params.resolvedAuth &&
    ((params.resolvedAuth.mode === "token" && params.resolvedAuth.token) ||
      (params.resolvedAuth.mode === "password" && params.resolvedAuth.password) ||
      params.resolvedAuth.allowTailscale);

  if (isLanBound && !hasAuth) {
    const warn = params.log.warn ?? params.log.info;
    warn(`⚠️  SECURITY WARNING: Gateway is bound to LAN without authentication.`, {
      consoleMessage: chalk.yellowBright.bold(
        `⚠️  SECURITY WARNING: Gateway is bound to LAN without authentication.\n` +
          `   Anyone on your network can access this gateway.\n` +
          `   Set OPENCLAW_GATEWAY_TOKEN or gateway.auth.token to secure it.`,
      ),
    });
  }
}

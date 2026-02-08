import chalk from "chalk";
import type { loadConfig } from "../config/config.js";
import { DEFAULT_MODEL, DEFAULT_PROVIDER } from "../agents/defaults.js";
import { resolveConfiguredModelRef } from "../agents/model-selection.js";
import { getResolvedLoggerSettings } from "../logging.js";
import { VERSION } from "../version.js";

function resolveGatewayBuildInfo(): { runPath: string; buildType: "local" | "global" } {
  const runPath = process.cwd();
  // Check if running from a global npm install (node_modules/openclaw) vs a local worktree/checkout
  const isGlobal = runPath.includes("/lib/node_modules/openclaw");
  return { runPath, buildType: isGlobal ? "global" : "local" };
}

export function logGatewayStartup(params: {
  cfg: ReturnType<typeof loadConfig>;
  bindHost: string;
  bindHosts?: string[];
  port: number;
  tlsEnabled?: boolean;
  log: {
    info: (msg: string, meta?: Record<string, unknown>) => void;
    warn: (msg: string) => void;
  };
  isNixMode: boolean;
}) {
  // Version / path / build type
  const { runPath, buildType } = resolveGatewayBuildInfo();
  const buildLabel = buildType === "local" ? "LOCAL BUILD" : "GLOBAL";
  params.log.info(`[gateway] version=${VERSION} path=${runPath} build=${buildLabel}`, {
    consoleMessage: `[gateway] version=${chalk.whiteBright(VERSION)} path=${runPath} build=${buildLabel}`,
  });
  if (buildType === "global") {
    params.log.warn(
      `[gateway] WARNING: running from global install (${runPath}). Use 'pnpm openclaw gateway run' from a worktree for local builds.`,
    );
  }

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

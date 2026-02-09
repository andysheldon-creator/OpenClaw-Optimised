import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { CoreConfig } from "../../types.js";
import { getMatrixRuntime } from "../../runtime.js";
import { resolveMatrixCredentialsDir } from "../credentials.js";

const preparedRegisterKeys = new Set<string>();

function resolveStateDirFromEnv(env: NodeJS.ProcessEnv): string {
  try {
    return getMatrixRuntime().state.resolveStateDir(env, os.homedir);
  } catch {
    // fall through to deterministic fallback for tests/early init
  }
  const override = env.OPENCLAW_STATE_DIR?.trim() || env.CLAWDBOT_STATE_DIR?.trim();
  if (override) {
    if (override.startsWith("~")) {
      const expanded = override.replace(/^~(?=$|[\\/])/, os.homedir());
      return path.resolve(expanded);
    }
    return path.resolve(override);
  }
  return path.join(os.homedir(), ".openclaw");
}

function buildRegisterKey(params: { homeserver: string; userId: string }): string {
  return `${params.homeserver.trim().toLowerCase()}|${params.userId.trim().toLowerCase()}`;
}

function buildBackupDirName(now = new Date()): string {
  const ts = now.toISOString().replace(/[:.]/g, "-");
  const suffix = Math.random().toString(16).slice(2, 8);
  return `${ts}-${suffix}`;
}

export async function prepareMatrixRegisterMode(params: {
  cfg: CoreConfig;
  homeserver: string;
  userId: string;
  env?: NodeJS.ProcessEnv;
}): Promise<string | null> {
  const env = params.env ?? process.env;
  const registerKey = buildRegisterKey({
    homeserver: params.homeserver,
    userId: params.userId,
  });
  if (preparedRegisterKeys.has(registerKey)) {
    return null;
  }

  const stateDir = resolveStateDirFromEnv(env);
  const credentialsDir = resolveMatrixCredentialsDir(env, stateDir);
  if (!fs.existsSync(credentialsDir)) {
    return null;
  }

  const entries = fs.readdirSync(credentialsDir).filter((name) => name !== ".bak");
  if (entries.length === 0) {
    return null;
  }

  const backupRoot = path.join(credentialsDir, ".bak");
  fs.mkdirSync(backupRoot, { recursive: true });
  const backupDir = path.join(backupRoot, buildBackupDirName());
  fs.mkdirSync(backupDir, { recursive: true });

  const matrixConfig = params.cfg.channels?.matrix ?? {};
  fs.writeFileSync(
    path.join(backupDir, "matrix-config.json"),
    JSON.stringify(matrixConfig, null, 2).trimEnd().concat("\n"),
    "utf-8",
  );

  for (const entry of entries) {
    fs.renameSync(path.join(credentialsDir, entry), path.join(backupDir, entry));
  }

  preparedRegisterKeys.add(registerKey);
  return backupDir;
}

export async function finalizeMatrixRegisterConfigAfterSuccess(params: {
  homeserver: string;
  userId: string;
  deviceId?: string;
}): Promise<boolean> {
  let runtime: ReturnType<typeof getMatrixRuntime> | null = null;
  try {
    runtime = getMatrixRuntime();
  } catch {
    return false;
  }

  const cfg = runtime.config.loadConfig() as CoreConfig;
  if (cfg.channels?.matrix?.register !== true) {
    return false;
  }

  const matrixCfg = cfg.channels?.matrix ?? {};
  const nextMatrix: Record<string, unknown> = {
    ...matrixCfg,
    register: false,
    homeserver: params.homeserver,
    userId: params.userId,
    ...(params.deviceId?.trim() ? { deviceId: params.deviceId.trim() } : {}),
  };
  // Registration mode should continue relying on password + cached credentials, not stale inline token.
  delete nextMatrix.accessToken;

  const next: CoreConfig = {
    ...cfg,
    channels: {
      ...(cfg.channels ?? {}),
      matrix: nextMatrix as CoreConfig["channels"]["matrix"],
    },
  };

  await runtime.config.writeConfigFile(next as never);
  return true;
}

export function resetPreparedMatrixRegisterModesForTests(): void {
  preparedRegisterKeys.clear();
}

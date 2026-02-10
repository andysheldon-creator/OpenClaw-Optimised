import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { RuntimeEnv } from "../runtime.js";
import { DEFAULT_GATEWAY_PORT } from "../config/paths.js";
import { runCommandWithTimeout } from "../process/exec.js";
import { ensureDir } from "../utils.js";
import { detectBrowserOpenSupport, openUrl } from "./onboard-helpers.js";

const COMPOSE_FILENAME = "docker-compose.yml";
const EXTRA_COMPOSE_FILENAME = "docker-compose.extra.yml";
const ENV_FILENAME = ".env";

export type RunDockerOptions = {
  /** Skip opening the dashboard in the browser. */
  noOpen?: boolean;
  /** Skip running doctor after starting the gateway. */
  noDoctor?: boolean;
  /** Skip building the image (use existing). */
  noBuild?: boolean;
};

function findRepoRoot(startDir: string): string | null {
  let dir = path.resolve(startDir);
  const root = path.parse(dir).root;
  while (dir !== root) {
    const composePath = path.join(dir, COMPOSE_FILENAME);
    if (fs.existsSync(composePath)) {
      const content = fs.readFileSync(composePath, "utf8");
      if (content.includes("openclaw-gateway")) {
        return dir;
      }
    }
    dir = path.dirname(dir);
  }
  return null;
}

function parseEnvFile(filePath: string): Record<string, string> {
  const out: Record<string, string> = {};
  if (!fs.existsSync(filePath)) {
    return out;
  }
  const content = fs.readFileSync(filePath, "utf8");
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }
    const eq = trimmed.indexOf("=");
    if (eq <= 0) {
      continue;
    }
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim();
    const unquoted = value.replace(/^["']|["']$/g, "");
    out[key] = unquoted;
  }
  return out;
}

function writeEnvFile(filePath: string, vars: Record<string, string>) {
  const lines = Object.entries(vars).map(([k, v]) => `${k}=${v}`);
  fs.writeFileSync(filePath, lines.join("\n") + "\n", "utf8");
}

function upsertEnvFile(filePath: string, vars: Record<string, string>) {
  const existing = parseEnvFile(filePath);
  const merged = { ...existing, ...vars };
  writeEnvFile(filePath, merged);
}

function ensureMinimalConfig(
  configDir: string,
  config: { port: number; bind: string; token: string },
) {
  const configPath = path.join(configDir, "openclaw.json");
  const minimal = {
    gateway: {
      mode: "local" as const,
      port: config.port,
      bind: config.bind,
      auth: { mode: "token" as const, token: config.token },
      controlUi: { allowInsecureAuth: true },
    },
  };
  if (!fs.existsSync(configPath)) {
    fs.writeFileSync(configPath, JSON.stringify(minimal, null, 2), "utf8");
    return;
  }
  // Patch existing config so Control UI can connect with token only (no device pairing).
  try {
    const raw = fs.readFileSync(configPath, "utf8");
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const gateway = (parsed.gateway ?? {}) as Record<string, unknown>;
    const controlUi = (gateway.controlUi ?? {}) as Record<string, unknown>;
    if (controlUi.allowInsecureAuth !== true) {
      controlUi.allowInsecureAuth = true;
      gateway.controlUi = controlUi;
      parsed.gateway = gateway;
      fs.writeFileSync(configPath, JSON.stringify(parsed, null, 2), "utf8");
    }
  } catch {
    // If parse/merge fails, leave config as-is.
  }
}

export async function runDockerCommand(
  runtime: RuntimeEnv,
  options: RunDockerOptions = {},
): Promise<void> {
  const repoRoot =
    process.env.OPENCLAW_REPO_ROOT?.trim() ||
    findRepoRoot(process.cwd()) ||
    findRepoRoot(path.resolve(__dirname, "../.."));
  if (!repoRoot) {
    runtime.error(
      "OpenClaw repo root not found. Run from the openclaw repo directory (where docker-compose.yml is) or set OPENCLAW_REPO_ROOT.",
    );
    runtime.exit(1);
  }

  const envPath = path.join(repoRoot, ENV_FILENAME);
  const existingEnv = parseEnvFile(envPath);

  const configDir = existingEnv.OPENCLAW_CONFIG_DIR?.trim() || path.join(os.homedir(), ".openclaw");
  const workspaceDir =
    existingEnv.OPENCLAW_WORKSPACE_DIR?.trim() || path.join(configDir, "workspace");
  const port = Number(existingEnv.OPENCLAW_GATEWAY_PORT?.trim()) || DEFAULT_GATEWAY_PORT;
  const bind = existingEnv.OPENCLAW_GATEWAY_BIND?.trim() || "lan";
  let token = existingEnv.OPENCLAW_GATEWAY_TOKEN?.trim();
  if (!token) {
    token = crypto.randomBytes(32).toString("hex");
  }

  const envVars: Record<string, string> = {
    OPENCLAW_CONFIG_DIR: configDir,
    OPENCLAW_WORKSPACE_DIR: workspaceDir,
    OPENCLAW_GATEWAY_PORT: String(port),
    OPENCLAW_GATEWAY_BIND: bind,
    OPENCLAW_GATEWAY_TOKEN: token,
    OPENCLAW_IMAGE: existingEnv.OPENCLAW_IMAGE?.trim() || "openclaw:local",
  };
  upsertEnvFile(envPath, envVars);

  await ensureDir(configDir);
  await ensureDir(workspaceDir);
  ensureMinimalConfig(configDir, { port: 18789, bind, token });

  const composeFiles = [path.join(repoRoot, COMPOSE_FILENAME)];
  if (fs.existsSync(path.join(repoRoot, EXTRA_COMPOSE_FILENAME))) {
    composeFiles.push(path.join(repoRoot, EXTRA_COMPOSE_FILENAME));
  }
  const composeArgs = composeFiles.flatMap((f) => ["-f", f]);

  const runDocker = (args: string[], timeoutMs: number) =>
    runCommandWithTimeout(["docker", "compose", ...composeArgs, ...args], {
      cwd: repoRoot,
      env: { ...process.env, ...envVars },
      timeoutMs,
    });

  const imageName = envVars.OPENCLAW_IMAGE ?? "openclaw:local";

  runtime.log("==> Building Docker image (this may take a few minutes on first run)");
  if (!options.noBuild) {
    try {
      await runDocker(["build"], 600_000);
    } catch (err) {
      runtime.error(
        "Docker build failed. Ensure Docker is running and you have docker compose v2.",
      );
      throw err;
    }
  } else {
    try {
      await runCommandWithTimeout(["docker", "image", "inspect", imageName], {
        cwd: repoRoot,
        env: { ...process.env, ...envVars },
        timeoutMs: 5000,
      });
    } catch {
      runtime.error(
        `Image ${imageName} not found. Build it first: from the openclaw repo run "docker compose build", or run "openclaw run" without --no-build.`,
      );
      runtime.exit(1);
    }
  }

  runtime.log("==> Starting gateway");
  try {
    await runDocker(["up", "-d", "openclaw-gateway"], 60_000);
  } catch (err) {
    runtime.error(
      "Failed to start gateway. If you see 'pull access denied', the image was not built locally. From the openclaw repo run: docker compose build && docker compose up -d openclaw-gateway",
    );
    throw err;
  }

  runtime.log("==> Waiting for gateway to be ready");
  const healthEnv = { ...envVars, OPENCLAW_GATEWAY_TOKEN: token };
  const runDockerWithToken = (args: string[], timeoutMs: number) =>
    runCommandWithTimeout(["docker", "compose", ...composeArgs, ...args], {
      cwd: repoRoot,
      env: { ...process.env, ...healthEnv },
      timeoutMs,
    });
  const maxAttempts = 12;
  const delayMs = 2500;
  for (let i = 0; i < maxAttempts; i++) {
    await new Promise((r) => setTimeout(r, delayMs));
    try {
      await runDockerWithToken(
        ["run", "--rm", "openclaw-cli", "health", "--timeout", "5000"],
        15_000,
      );
      break;
    } catch {
      if (i === maxAttempts - 1) {
        runtime.error(
          "Gateway did not become healthy in time. Check: docker compose logs openclaw-gateway",
        );
        runtime.exit(1);
      }
    }
  }

  if (!options.noDoctor) {
    runtime.log("==> Running doctor (health check + fixes)");
    try {
      await runDocker(
        ["run", "--rm", "openclaw-cli", "doctor", "--fix", "--non-interactive"],
        120_000,
      );
    } catch {
      runtime.log("Doctor reported issues (non-fatal). Check output above.");
    }
  }

  const dashboardUrl = `http://127.0.0.1:${port}/?token=${encodeURIComponent(token)}`;
  runtime.log("");
  runtime.log("Dashboard: " + dashboardUrl);
  runtime.log("Config: " + configDir);
  runtime.log("");
  runtime.log(
    "To get chat working: add an API key to the gateway (e.g. Anthropic or OpenAI). From the openclaw repo, add ANTHROPIC_API_KEY=sk-... or OPENAI_API_KEY=sk-... to .env, then run: docker compose up -d openclaw-gateway",
  );
  runtime.log("");

  if (!options.noOpen) {
    const browserSupport = await detectBrowserOpenSupport();
    if (browserSupport.ok) {
      const opened = await openUrl(dashboardUrl);
      if (opened) {
        runtime.log("Opened dashboard in your browser.");
      }
    } else {
      runtime.log("Open the URL above in your browser to use the Control UI.");
    }
  }
}

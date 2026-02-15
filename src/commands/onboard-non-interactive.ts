import path from "node:path";

import {
  type ClawdisConfig,
  CONFIG_PATH_CLAWDIS,
  readConfigFileSnapshot,
  resolveGatewayPort,
  writeConfigFile,
} from "../config/config.js";
import { GATEWAY_LAUNCH_AGENT_LABEL } from "../daemon/constants.js";
import { resolveGatewayProgramArguments } from "../daemon/program-args.js";
import { resolveGatewayService } from "../daemon/service.js";
import type { RuntimeEnv } from "../runtime.js";
import { defaultRuntime } from "../runtime.js";
import { resolveUserPath, sleep } from "../utils.js";
import { healthCommand } from "./health.js";
import { applyMinimaxConfig, setAnthropicApiKey } from "./onboard-auth.js";
import {
  applyWizardMetadata,
  DEFAULT_WORKSPACE,
  detectBinary,
  ensureWorkspaceAndSessions,
  randomToken,
} from "./onboard-helpers.js";
import type {
  AuthChoice,
  OnboardMode,
  OnboardOptions,
} from "./onboard-types.js";

export async function runNonInteractiveOnboarding(
  opts: OnboardOptions,
  runtime: RuntimeEnv = defaultRuntime,
) {
  const snapshot = await readConfigFileSnapshot();
  const baseConfig: ClawdisConfig = snapshot.valid ? snapshot.config : {};
  const mode: OnboardMode = opts.mode ?? "local";

  if (mode === "remote") {
    const remoteUrl = opts.remoteUrl?.trim();
    if (!remoteUrl) {
      runtime.error("Missing --remote-url for remote mode.");
      runtime.exit(1);
      return;
    }

    let nextConfig: ClawdisConfig = {
      ...baseConfig,
      gateway: {
        ...baseConfig.gateway,
        mode: "remote",
        remote: {
          url: remoteUrl,
          token: opts.remoteToken?.trim() || undefined,
        },
      },
    };
    nextConfig = applyWizardMetadata(nextConfig, { command: "onboard", mode });
    await writeConfigFile(nextConfig);
    runtime.log(`Updated ${CONFIG_PATH_CLAWDIS}`);

    const payload = {
      mode,
      remoteUrl,
      auth: opts.remoteToken ? "token" : "none",
    };
    if (opts.json) {
      runtime.log(JSON.stringify(payload, null, 2));
    } else {
      runtime.log(`Remote gateway: ${remoteUrl}`);
      runtime.log(`Auth: ${payload.auth}`);
    }
    return;
  }

  const workspaceDir = resolveUserPath(
    (opts.workspace ?? baseConfig.agent?.workspace ?? DEFAULT_WORKSPACE).trim(),
  );

  let nextConfig: ClawdisConfig = {
    ...baseConfig,
    agent: {
      ...baseConfig.agent,
      workspace: workspaceDir,
    },
    gateway: {
      ...baseConfig.gateway,
      mode: "local",
    },
  };

  const authChoice: AuthChoice = opts.authChoice ?? "skip";
  if (authChoice === "apiKey") {
    const key = opts.anthropicApiKey?.trim();
    if (!key) {
      runtime.error("Missing --anthropic-api-key");
      runtime.exit(1);
      return;
    }
    await setAnthropicApiKey(key);
  } else if (authChoice === "minimax") {
    nextConfig = applyMinimaxConfig(nextConfig);
  } else if (authChoice === "subscription") {
    // Validate Claude CLI is available unless explicitly skipped
    if (!opts.skipCliCheck) {
      const cliFound = await detectBinary("claude");
      if (!cliFound) {
        runtime.error(
          [
            "Claude Code CLI ('claude') not found.",
            "Install it with: npm install -g @anthropic-ai/claude-code",
            "Then run 'claude login' to authenticate.",
            "Use --skip-cli-check to bypass this validation.",
          ].join("\n"),
        );
        runtime.exit(1);
        return;
      }

      // Verify authentication
      try {
        const { runCommandWithTimeout: runCmd } = await import(
          "../process/exec.js"
        );
        const authCheck = await runCmd(
          ["claude", "-p", "say ok", "--output-format", "text"],
          { timeoutMs: 20_000 },
        );
        if (authCheck.code !== 0 || !authCheck.stdout.trim()) {
          runtime.error(
            [
              "Claude CLI is installed but not authenticated.",
              "Run 'claude login' to sign in with your Anthropic account.",
              "Use --skip-cli-check to bypass this validation.",
            ].join("\n"),
          );
          runtime.exit(1);
          return;
        }
        runtime.log("Claude CLI authenticated \u2713");
      } catch {
        runtime.error(
          [
            "Claude CLI authentication check timed out.",
            "Ensure 'claude login' has been completed.",
            "Use --skip-cli-check to bypass this validation.",
          ].join("\n"),
        );
        runtime.exit(1);
        return;
      }
    }

    nextConfig = {
      ...nextConfig,
      agent: {
        ...nextConfig.agent,
        backend: "claude-cli",
        model: "claude-sonnet-4-5",
      },
    };
    runtime.log(
      "Subscription mode: backend=claude-cli, model=claude-sonnet-4-5",
    );
  } else if (authChoice === "oauth" || authChoice === "antigravity") {
    runtime.error(
      `${authChoice === "oauth" ? "OAuth" : "Antigravity"} requires interactive mode.`,
    );
    runtime.exit(1);
    return;
  }

  const hasGatewayPort = opts.gatewayPort !== undefined;
  if (
    hasGatewayPort &&
    (!Number.isFinite(opts.gatewayPort) || (opts.gatewayPort ?? 0) <= 0)
  ) {
    runtime.error("Invalid --gateway-port");
    runtime.exit(1);
    return;
  }
  const port = hasGatewayPort
    ? (opts.gatewayPort as number)
    : resolveGatewayPort(baseConfig);
  let bind = opts.gatewayBind ?? "loopback";
  let authMode = opts.gatewayAuth ?? "off";
  const tailscaleMode = opts.tailscale ?? "off";
  const tailscaleResetOnExit = Boolean(opts.tailscaleResetOnExit);

  if (tailscaleMode !== "off" && bind !== "loopback") {
    bind = "loopback";
  }
  if (authMode === "off" && bind !== "loopback") {
    authMode = "token";
  }
  if (tailscaleMode === "funnel" && authMode !== "password") {
    authMode = "password";
  }

  let gatewayToken = opts.gatewayToken?.trim() || undefined;
  if (authMode === "token") {
    if (!gatewayToken) gatewayToken = randomToken();
    nextConfig = {
      ...nextConfig,
      gateway: {
        ...nextConfig.gateway,
        auth: { ...nextConfig.gateway?.auth, mode: "token" },
      },
    };
  }
  if (authMode === "password") {
    const password = opts.gatewayPassword?.trim();
    if (!password) {
      runtime.error("Missing --gateway-password for password auth.");
      runtime.exit(1);
      return;
    }
    nextConfig = {
      ...nextConfig,
      gateway: {
        ...nextConfig.gateway,
        auth: {
          ...nextConfig.gateway?.auth,
          mode: "password",
          password,
        },
      },
    };
  }

  nextConfig = {
    ...nextConfig,
    gateway: {
      ...nextConfig.gateway,
      port,
      bind,
      tailscale: {
        ...nextConfig.gateway?.tailscale,
        mode: tailscaleMode,
        resetOnExit: tailscaleResetOnExit,
      },
    },
  };

  if (!opts.skipSkills) {
    const nodeManager = opts.nodeManager ?? "npm";
    if (!["npm", "pnpm", "bun"].includes(nodeManager)) {
      runtime.error("Invalid --node-manager (use npm, pnpm, or bun)");
      runtime.exit(1);
      return;
    }
    nextConfig = {
      ...nextConfig,
      skills: {
        ...nextConfig.skills,
        install: {
          ...nextConfig.skills?.install,
          nodeManager,
        },
      },
    };
  }

  // Ollama host passthrough for hybrid router
  if (opts.ollamaHost) {
    process.env.OLLAMA_HOST = opts.ollamaHost;
  }

  nextConfig = applyWizardMetadata(nextConfig, { command: "onboard", mode });
  await writeConfigFile(nextConfig);
  runtime.log(`Updated ${CONFIG_PATH_CLAWDIS}`);
  // Always preserve personality files and refresh setup files on reinstall.
  // Non-interactive cannot prompt the user, so use the safe default.
  await ensureWorkspaceAndSessions(workspaceDir, runtime, {
    upgradeMode: "preserve-personality",
  });

  if (opts.installDaemon) {
    const service = resolveGatewayService();
    const devMode =
      process.argv[1]?.includes(`${path.sep}src${path.sep}`) &&
      process.argv[1]?.endsWith(".ts");
    const { programArguments, workingDirectory } =
      await resolveGatewayProgramArguments({ port, dev: devMode });
    const environment: Record<string, string | undefined> = {
      PATH: process.env.PATH,
      CLAWDIS_GATEWAY_TOKEN: gatewayToken,
      CLAWDIS_LAUNCHD_LABEL:
        process.platform === "darwin" ? GATEWAY_LAUNCH_AGENT_LABEL : undefined,
    };
    await service.install({
      env: process.env,
      stdout: process.stdout,
      programArguments,
      workingDirectory,
      environment,
    });
  }

  if (!opts.skipHealth) {
    await sleep(1000);
    await healthCommand({ json: false, timeoutMs: 10_000 }, runtime);
  }

  if (opts.json) {
    runtime.log(
      JSON.stringify(
        {
          mode,
          workspace: workspaceDir,
          authChoice,
          backend: nextConfig.agent?.backend ?? "pi-embedded",
          model: nextConfig.agent?.model,
          gateway: { port, bind, authMode, tailscaleMode },
          installDaemon: Boolean(opts.installDaemon),
          skipSkills: Boolean(opts.skipSkills),
          skipHealth: Boolean(opts.skipHealth),
        },
        null,
        2,
      ),
    );
  }
}

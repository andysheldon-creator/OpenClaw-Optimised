import path from "node:path";

import {
  confirm,
  intro,
  note,
  outro,
  select,
  spinner,
  text,
} from "@clack/prompts";
import { loginAnthropic, type OAuthCredentials } from "@mariozechner/pi-ai";
import { DEFAULT_MODEL, DEFAULT_PROVIDER } from "../agents/defaults.js";
import type { ClawdisConfig } from "../config/config.js";
import {
  CONFIG_PATH_CLAWDIS,
  readConfigFileSnapshot,
  resolveGatewayPort,
  writeConfigFile,
} from "../config/config.js";
import { GATEWAY_LAUNCH_AGENT_LABEL } from "../daemon/constants.js";
import { resolveGatewayProgramArguments } from "../daemon/program-args.js";
import { resolveGatewayService } from "../daemon/service.js";
import { runCommandWithTimeout } from "../process/exec.js";
import type { RuntimeEnv } from "../runtime.js";
import { defaultRuntime } from "../runtime.js";
import { resolveUserPath, sleep } from "../utils.js";
import {
  isRemoteEnvironment,
  loginAntigravityVpsAware,
} from "./antigravity-oauth.js";
import { healthCommand } from "./health.js";
import {
  applyMinimaxConfig,
  setAnthropicApiKey,
  writeOAuthCredentials,
} from "./onboard-auth.js";
import {
  applyWizardMetadata,
  checkExistingWorkspaceFiles,
  DEFAULT_WORKSPACE,
  detectBinary,
  ensureWorkspaceAndSessions,
  guardCancel,
  handleReset,
  openUrl,
  printWizardHeader,
  probeGatewayReachable,
  randomToken,
  resolveControlUiLinks,
  summarizeExistingConfig,
} from "./onboard-helpers.js";
import { setupProviders } from "./onboard-providers.js";
import { promptRemoteGatewayConfig } from "./onboard-remote.js";
import { setupSkills } from "./onboard-skills.js";
import type {
  AuthChoice,
  GatewayAuthChoice,
  OnboardMode,
  OnboardOptions,
  ResetScope,
} from "./onboard-types.js";

export async function runInteractiveOnboarding(
  opts: OnboardOptions,
  runtime: RuntimeEnv = defaultRuntime,
) {
  printWizardHeader(runtime);
  intro("Clawdis onboarding");

  const snapshot = await readConfigFileSnapshot();
  let baseConfig: ClawdisConfig = snapshot.valid ? snapshot.config : {};

  if (snapshot.exists) {
    const title = snapshot.valid
      ? "Existing config detected"
      : "Invalid config";
    note(summarizeExistingConfig(baseConfig), title);
    if (!snapshot.valid && snapshot.issues.length > 0) {
      note(
        snapshot.issues
          .map((iss) => `- ${iss.path}: ${iss.message}`)
          .join("\n"),
        "Config issues",
      );
    }

    const action = guardCancel(
      await select({
        message: "Config handling",
        options: [
          { value: "keep", label: "Use existing values" },
          { value: "modify", label: "Update values" },
          { value: "reset", label: "Reset" },
        ],
      }),
      runtime,
    );

    if (action === "reset") {
      const workspaceDefault = baseConfig.agent?.workspace ?? DEFAULT_WORKSPACE;
      const resetScope = guardCancel(
        await select({
          message: "Reset scope",
          options: [
            { value: "config", label: "Config only" },
            {
              value: "config+creds+sessions",
              label: "Config + creds + sessions",
            },
            {
              value: "full",
              label: "Full reset (config + creds + sessions + workspace)",
            },
          ],
        }),
        runtime,
      ) as ResetScope;
      await handleReset(resetScope, resolveUserPath(workspaceDefault), runtime);
      baseConfig = {};
    } else if (action === "keep" && !snapshot.valid) {
      baseConfig = {};
    }
  }

  const localPort = resolveGatewayPort(baseConfig);
  const localUrl = `ws://127.0.0.1:${localPort}`;
  const localProbe = await probeGatewayReachable({
    url: localUrl,
    token: process.env.CLAWDIS_GATEWAY_TOKEN,
    password:
      baseConfig.gateway?.auth?.password ??
      process.env.CLAWDIS_GATEWAY_PASSWORD,
  });
  const remoteUrl = baseConfig.gateway?.remote?.url?.trim() ?? "";
  const remoteProbe = remoteUrl
    ? await probeGatewayReachable({
        url: remoteUrl,
        token: baseConfig.gateway?.remote?.token,
      })
    : null;

  const mode =
    opts.mode ??
    (guardCancel(
      await select({
        message: "Where will the Gateway run?",
        options: [
          {
            value: "local",
            label: "Local (this machine)",
            hint: localProbe.ok
              ? `Gateway reachable (${localUrl})`
              : `No gateway detected (${localUrl})`,
          },
          {
            value: "remote",
            label: "Remote (info-only)",
            hint: !remoteUrl
              ? "No remote URL configured yet"
              : remoteProbe?.ok
                ? `Gateway reachable (${remoteUrl})`
                : `Configured but unreachable (${remoteUrl})`,
          },
        ],
      }),
      runtime,
    ) as OnboardMode);

  if (mode === "remote") {
    let nextConfig = await promptRemoteGatewayConfig(baseConfig, runtime);
    nextConfig = applyWizardMetadata(nextConfig, { command: "onboard", mode });
    await writeConfigFile(nextConfig);
    runtime.log(`Updated ${CONFIG_PATH_CLAWDIS}`);
    outro("Remote gateway configured.");
    return;
  }

  const workspaceInput =
    opts.workspace ??
    (guardCancel(
      await text({
        message: "Workspace directory",
        initialValue: baseConfig.agent?.workspace ?? DEFAULT_WORKSPACE,
      }),
      runtime,
    ) as string);

  const workspaceDir = resolveUserPath(
    workspaceInput.trim() || DEFAULT_WORKSPACE,
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

  const authChoice = guardCancel(
    await select({
      message: "Model/auth choice",
      options: [
        { value: "oauth", label: "Anthropic OAuth (Claude Pro/Max)" },
        {
          value: "antigravity",
          label: "Google Antigravity (Claude Sonnet/Opus 4.5, Gemini 3, etc.)",
        },
        { value: "apiKey", label: "Anthropic API key" },
        {
          value: "subscription",
          label: "Claude Code Subscription (Pro/Max)",
          hint: "Uses 'claude -p' — flat monthly fee, no per-token cost",
        },
        { value: "minimax", label: "Minimax M2.1 (LM Studio)" },
        { value: "skip", label: "Skip for now" },
      ],
    }),
    runtime,
  ) as AuthChoice;

  if (authChoice === "oauth") {
    note(
      "Browser will open. Paste the code shown after login (code#state).",
      "Anthropic OAuth",
    );
    const spin = spinner();
    spin.start("Waiting for authorization…");
    let oauthCreds: OAuthCredentials | null = null;
    try {
      oauthCreds = await loginAnthropic(
        async (url) => {
          await openUrl(url);
          runtime.log(`Open: ${url}`);
        },
        async () => {
          const code = guardCancel(
            await text({
              message: "Paste authorization code (code#state)",
              validate: (value) => (value?.trim() ? undefined : "Required"),
            }),
            runtime,
          );
          return String(code);
        },
      );
      spin.stop("OAuth complete");
      if (oauthCreds) {
        await writeOAuthCredentials("anthropic", oauthCreds);
      }
    } catch (err) {
      spin.stop("OAuth failed");
      runtime.error(String(err));
    }
  } else if (authChoice === "antigravity") {
    const isRemote = isRemoteEnvironment();
    note(
      isRemote
        ? [
            "You are running in a remote/VPS environment.",
            "A URL will be shown for you to open in your LOCAL browser.",
            "After signing in, copy the redirect URL and paste it back here.",
          ].join("\n")
        : [
            "Browser will open for Google authentication.",
            "Sign in with your Google account that has Antigravity access.",
            "The callback will be captured automatically on localhost:51121.",
          ].join("\n"),
      "Google Antigravity OAuth",
    );
    const spin = spinner();
    spin.start("Starting OAuth flow…");
    let oauthCreds: OAuthCredentials | null = null;
    try {
      oauthCreds = await loginAntigravityVpsAware(
        async (url) => {
          if (isRemote) {
            spin.stop("OAuth URL ready");
            runtime.log(`\nOpen this URL in your LOCAL browser:\n\n${url}\n`);
          } else {
            spin.message("Complete sign-in in browser…");
            await openUrl(url);
            runtime.log(`Open: ${url}`);
          }
        },
        (msg) => spin.message(msg),
      );
      spin.stop("Antigravity OAuth complete");
      if (oauthCreds) {
        await writeOAuthCredentials("google-antigravity", oauthCreds);
        // Let the user choose their model in the next step rather than
        // hardcoding Opus.  Pre-select Antigravity Opus as the initial
        // value so it's still easy to pick.
      }
    } catch (err) {
      spin.stop("Antigravity OAuth failed");
      runtime.error(String(err));
    }
  } else if (authChoice === "apiKey") {
    const key = guardCancel(
      await text({
        message: "Enter Anthropic API key",
        validate: (value) => (value?.trim() ? undefined : "Required"),
      }),
      runtime,
    );
    await setAnthropicApiKey(String(key).trim());
  } else if (authChoice === "minimax") {
    nextConfig = applyMinimaxConfig(nextConfig);
  } else if (authChoice === "subscription") {
    // Detect Claude Code CLI
    const spin = spinner();
    spin.start("Detecting Claude Code CLI\u2026");
    const cliInstalled = await detectBinary("claude");

    if (cliInstalled) {
      spin.stop("Claude Code CLI found \u2713");
      // Quick auth check
      const authSpin = spinner();
      authSpin.start("Checking Claude authentication\u2026");
      try {
        const testResult = await runCommandWithTimeout(
          ["claude", "-p", "say ok", "--output-format", "text"],
          { timeoutMs: 15_000 },
        );
        if (testResult.code === 0) {
          authSpin.stop("Claude authenticated \u2713");
        } else {
          authSpin.stop("Claude not authenticated");
          note(
            "Run 'claude login' to authenticate, then re-run onboarding.",
            "Action needed",
          );
        }
      } catch {
        authSpin.stop("Claude auth check timed out \u2014 continuing anyway");
      }
    } else {
      spin.stop("Claude Code CLI not found");
      note(
        [
          "Install Claude Code: npm install -g @anthropic-ai/claude-code",
          "Then run 'claude login' to authenticate.",
        ].join("\n"),
        "Action needed",
      );
    }

    nextConfig = {
      ...nextConfig,
      agent: {
        ...nextConfig.agent,
        backend: "claude-cli",
      },
    };
  }

  // ── Model selection ────────────────────────────────────────────────
  // Skip for Minimax (model already set) or if config already has a model
  // and the user chose to keep existing values.
  if (authChoice !== "minimax" && authChoice !== "subscription") {
    const currentModel = nextConfig.agent?.model ?? "";
    const defaultChoice = `${DEFAULT_PROVIDER}/${DEFAULT_MODEL}`;

    // Build options based on auth provider
    const modelOptions =
      authChoice === "antigravity"
        ? [
            {
              value: "google-antigravity/claude-sonnet-4-5",
              label: "Sonnet 4.5 via Antigravity (Recommended)",
              hint: "5x cheaper, same 200k context — $3/$15 per million tokens",
            },
            {
              value: "google-antigravity/claude-opus-4-5-thinking",
              label: "Opus 4.5 via Antigravity (Premium)",
              hint: "Best reasoning — $15/$75 per million tokens",
            },
          ]
        : [
            {
              value: defaultChoice,
              label: "Sonnet 4.5 (Recommended)",
              hint: "5x cheaper than Opus, same 200k context — $3/$15 per million tokens",
            },
            {
              value: `${DEFAULT_PROVIDER}/claude-opus-4-5`,
              label: "Opus 4.5 (Premium)",
              hint: "Best reasoning — $15/$75 per million tokens",
            },
            ...(currentModel && currentModel !== defaultChoice
              ? [
                  {
                    value: currentModel,
                    label: `Keep current (${currentModel})`,
                    hint: "No change",
                  },
                ]
              : []),
          ];

    const modelChoice = guardCancel(
      await select({
        message: "Default AI model",
        options: modelOptions,
      }),
      runtime,
    ) as string;

    if (modelChoice) {
      nextConfig = {
        ...nextConfig,
        agent: {
          ...nextConfig.agent,
          model: modelChoice,
        },
      };
    }
  }

  // Subscription mode always defaults to Sonnet 4.5 (best value on Pro/Max).
  if (authChoice === "subscription") {
    note(
      "Subscription mode defaults to Sonnet 4.5.\nThe hybrid router will use your subscription for all Claude-tier queries.",
      "Model: claude-sonnet-4-5",
    );
    nextConfig = {
      ...nextConfig,
      agent: {
        ...nextConfig.agent,
        model: "claude-sonnet-4-5",
      },
    };
  }

  // ── Monthly budget ─────────────────────────────────────────────────
  const currentBudget =
    Number.parseFloat(process.env.COST_MONTHLY_LIMIT ?? "") || 60;
  const budgetInput = guardCancel(
    await text({
      message: "Monthly budget in GBP (alerts at 80%, warns at 100%)",
      initialValue: String(currentBudget),
      validate: (value) => {
        const n = Number(value);
        return Number.isFinite(n) && n >= 0
          ? undefined
          : "Enter a number (0 to disable)";
      },
    }),
    runtime,
  );
  const monthlyBudget = Number.parseFloat(String(budgetInput));
  // Store in env for the current process; persisted via .env by the user.
  if (Number.isFinite(monthlyBudget) && monthlyBudget !== 60) {
    process.env.COST_MONTHLY_LIMIT = String(monthlyBudget);
  }

  // ── Local LLM (Ollama) detection ──────────────────────────────────
  const ollamaSetup = guardCancel(
    await select({
      message: "Local LLM via Ollama (free for simple queries)?",
      options: [
        {
          value: "detect",
          label: "Auto-detect Ollama (Recommended)",
          hint: "Checks if Ollama is running on localhost:11434",
        },
        {
          value: "custom",
          label: "Custom Ollama host",
          hint: "Specify a different host/port",
        },
        {
          value: "skip",
          label: "Skip \u2014 don't use local LLMs",
          hint: "All queries go to cloud models",
        },
      ],
    }),
    runtime,
  ) as "detect" | "custom" | "skip";

  if (ollamaSetup !== "skip") {
    let ollamaHost = "http://localhost:11434";

    if (ollamaSetup === "custom") {
      const hostInput = guardCancel(
        await text({
          message: "Ollama host URL",
          initialValue: ollamaHost,
          validate: (v) => (v?.trim() ? undefined : "Required"),
        }),
        runtime,
      );
      ollamaHost = String(hostInput).trim();
    }

    // Probe Ollama
    const ollamaSpin = spinner();
    ollamaSpin.start("Checking Ollama\u2026");
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);
      const res = await fetch(`${ollamaHost}/api/tags`, {
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if (res.ok) {
        const data = (await res.json()) as {
          models?: Array<{ name: string }>;
        };
        const models = data.models ?? [];
        const modelNames = models.map((m) => m.name).join(", ");
        ollamaSpin.stop(
          `Ollama OK \u2014 ${models.length} model(s): ${modelNames || "none"}`,
        );

        const hasChat = models.some((m) => m.name.includes("llama"));
        const hasVision = models.some((m) => m.name.includes("llava"));

        if (!hasChat) {
          note(
            "Tip: Run 'ollama pull llama3.1:8b' for free chat routing.",
            "Missing chat model",
          );
        }
        if (!hasVision) {
          note(
            "Tip: Run 'ollama pull llava:7b' for free image analysis.",
            "Missing vision model",
          );
        }
      } else {
        ollamaSpin.stop("Ollama not responding");
        note(
          `Ollama at ${ollamaHost} returned ${res.status}. Install: https://ollama.com`,
          "Note",
        );
      }
    } catch {
      ollamaSpin.stop("Ollama not reachable");
      note(
        `Could not reach ${ollamaHost}. Install Ollama: https://ollama.com`,
        "Note",
      );
    }

    // Store Ollama host in env for hybrid router
    process.env.OLLAMA_HOST = ollamaHost;
  }

  const portRaw = guardCancel(
    await text({
      message: "Gateway port",
      initialValue: String(localPort),
      validate: (value) =>
        Number.isFinite(Number(value)) ? undefined : "Invalid port",
    }),
    runtime,
  );
  const port = Number.parseInt(String(portRaw), 10);

  let bind = guardCancel(
    await select({
      message: "Gateway bind",
      options: [
        { value: "loopback", label: "Loopback (127.0.0.1)" },
        { value: "lan", label: "LAN" },
        { value: "tailnet", label: "Tailnet" },
        { value: "auto", label: "Auto" },
      ],
    }),
    runtime,
  ) as "loopback" | "lan" | "tailnet" | "auto";

  let authMode = guardCancel(
    await select({
      message: "Gateway auth",
      options: [
        {
          value: "off",
          label: "Off (loopback only)",
          hint: "Recommended for single-machine setups",
        },
        {
          value: "token",
          label: "Token",
          hint: "Use for multi-machine access or non-loopback binds",
        },
        { value: "password", label: "Password" },
      ],
    }),
    runtime,
  ) as GatewayAuthChoice;

  const tailscaleMode = guardCancel(
    await select({
      message: "Tailscale exposure",
      options: [
        { value: "off", label: "Off", hint: "No Tailscale exposure" },
        {
          value: "serve",
          label: "Serve",
          hint: "Private HTTPS for your tailnet (devices on Tailscale)",
        },
        {
          value: "funnel",
          label: "Funnel",
          hint: "Public HTTPS via Tailscale Funnel (internet)",
        },
      ],
    }),
    runtime,
  ) as "off" | "serve" | "funnel";

  let tailscaleResetOnExit = false;
  if (tailscaleMode !== "off") {
    tailscaleResetOnExit = Boolean(
      guardCancel(
        await confirm({
          message: "Reset Tailscale serve/funnel on exit?",
          initialValue: false,
        }),
        runtime,
      ),
    );
  }

  if (tailscaleMode !== "off" && bind !== "loopback") {
    note(
      "Tailscale requires bind=loopback. Adjusting bind to loopback.",
      "Note",
    );
    bind = "loopback";
  }

  if (authMode === "off" && bind !== "loopback") {
    note("Non-loopback bind requires auth. Switching to token auth.", "Note");
    authMode = "token";
  }

  if (tailscaleMode === "funnel" && authMode !== "password") {
    note("Tailscale funnel requires password auth.", "Note");
    authMode = "password";
  }

  let gatewayToken: string | undefined;
  if (authMode === "token") {
    const tokenInput = guardCancel(
      await text({
        message: "Gateway token (blank to generate)",
        placeholder: "Needed for multi-machine or non-loopback access",
        initialValue: randomToken(),
      }),
      runtime,
    );
    gatewayToken = String(tokenInput).trim() || randomToken();
  }

  if (authMode === "password") {
    const password = guardCancel(
      await text({
        message: "Gateway password",
        validate: (value) => (value?.trim() ? undefined : "Required"),
      }),
      runtime,
    );
    nextConfig = {
      ...nextConfig,
      gateway: {
        ...nextConfig.gateway,
        auth: {
          ...nextConfig.gateway?.auth,
          mode: "password",
          password: String(password).trim(),
        },
      },
    };
  } else if (authMode === "token") {
    nextConfig = {
      ...nextConfig,
      gateway: {
        ...nextConfig.gateway,
        auth: {
          ...nextConfig.gateway?.auth,
          mode: "token",
          token: gatewayToken,
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

  nextConfig = await setupProviders(nextConfig, runtime, {
    allowSignalInstall: true,
  });

  await writeConfigFile(nextConfig);
  runtime.log(`Updated ${CONFIG_PATH_CLAWDIS}`);

  // ── Pre-existing workspace detection ──────────────────────────────
  // All workspace .md files are personality/context (SOUL, IDENTITY, USER,
  // AGENTS, TOOLS, memory/).  The config that changes between installs
  // (model, gateway, providers, budget) lives in clawdis.json which was
  // already written above.  Only ask the user if personality files exist.
  let upgradeMode: false | "preserve-personality" | "full" = false;
  const existingWorkspace = await checkExistingWorkspaceFiles(workspaceDir);
  if (existingWorkspace) {
    note(existingWorkspace.summary, "Existing workspace detected");
    if (existingWorkspace.hasPersonality) {
      const wsAction = guardCancel(
        await select({
          message: "Keep existing bot personality and memory?",
          options: [
            {
              value: "preserve-personality",
              label: "Yes — keep everything (Recommended)",
              hint: "Preserves SOUL, IDENTITY, USER, AGENTS, TOOLS & memory",
            },
            {
              value: "full",
              label: "No — start fresh",
              hint: "Resets all workspace files to defaults",
            },
          ],
        }),
        runtime,
      ) as "preserve-personality" | "full";
      upgradeMode = wsAction;
    } else {
      // No personality files yet — use write-if-missing (fresh install)
      upgradeMode = false;
    }
  }
  await ensureWorkspaceAndSessions(workspaceDir, runtime, { upgradeMode });

  nextConfig = await setupSkills(nextConfig, workspaceDir, runtime);
  nextConfig = applyWizardMetadata(nextConfig, { command: "onboard", mode });
  await writeConfigFile(nextConfig);

  const installDaemon = guardCancel(
    await confirm({
      message: "Install Gateway daemon (recommended)",
      initialValue: true,
    }),
    runtime,
  );

  if (installDaemon) {
    const service = resolveGatewayService();
    const loaded = await service.isLoaded({ env: process.env });
    if (loaded) {
      const action = guardCancel(
        await select({
          message: "Gateway service already installed",
          options: [
            { value: "restart", label: "Restart" },
            { value: "reinstall", label: "Reinstall" },
            { value: "skip", label: "Skip" },
          ],
        }),
        runtime,
      );
      if (action === "restart") {
        await service.restart({ stdout: process.stdout });
      } else if (action === "reinstall") {
        await service.uninstall({ env: process.env, stdout: process.stdout });
      }
    }

    if (
      !loaded ||
      (loaded && (await service.isLoaded({ env: process.env })) === false)
    ) {
      const devMode =
        process.argv[1]?.includes(`${path.sep}src${path.sep}`) &&
        process.argv[1]?.endsWith(".ts");
      const { programArguments, workingDirectory } =
        await resolveGatewayProgramArguments({ port, dev: devMode });
      const environment: Record<string, string | undefined> = {
        PATH: process.env.PATH,
        CLAWDIS_GATEWAY_TOKEN: gatewayToken,
        CLAWDIS_LAUNCHD_LABEL:
          process.platform === "darwin"
            ? GATEWAY_LAUNCH_AGENT_LABEL
            : undefined,
      };
      await service.install({
        env: process.env,
        stdout: process.stdout,
        programArguments,
        workingDirectory,
        environment,
      });
    }
  }

  await sleep(1500);
  try {
    await healthCommand({ json: false, timeoutMs: 10_000 }, runtime);
  } catch (err) {
    runtime.error(`Health check failed: ${String(err)}`);
  }

  // ── Cost configuration summary ──────────────────────────────────────
  const resolvedModel =
    nextConfig.agent?.model ?? `${DEFAULT_PROVIDER}/${DEFAULT_MODEL}`;
  const dailyBudget =
    Number.parseFloat(process.env.COST_DAILY_LIMIT ?? "") || 2;
  const resolvedMonthly =
    Number.parseFloat(process.env.COST_MONTHLY_LIMIT ?? "") || 60;
  note(
    [
      `Model: ${resolvedModel}`,
      `Monthly budget: \u00A3${resolvedMonthly} (alerts at \u00A3${Math.round(resolvedMonthly * 0.8)})`,
      `Daily limit: \u00A3${dailyBudget}`,
      "Prompt caching: Active (automatic)",
      "Cache metrics: Tracked in cost reports",
    ].join("\n"),
    "Cost configuration",
  );

  note(
    [
      "Add nodes for extra features:",
      "- macOS app (system + notifications)",
      "- iOS app (camera/canvas)",
      "- Android app (camera/canvas)",
    ].join("\n"),
    "Optional apps",
  );

  note(
    (() => {
      const links = resolveControlUiLinks({ bind, port });
      const tokenParam =
        authMode === "token" && gatewayToken
          ? `?token=${encodeURIComponent(gatewayToken)}`
          : "";
      const authedUrl = `${links.httpUrl}${tokenParam}`;
      return [
        `Web UI: ${links.httpUrl}`,
        tokenParam ? `Web UI (with token): ${authedUrl}` : undefined,
        `Gateway WS: ${links.wsUrl}`,
      ]
        .filter(Boolean)
        .join("\n");
    })(),
    "Control UI",
  );

  const wantsOpen = guardCancel(
    await confirm({
      message: "Open Control UI now?",
      initialValue: true,
    }),
    runtime,
  );
  if (wantsOpen) {
    const links = resolveControlUiLinks({ bind, port });
    const tokenParam =
      authMode === "token" && gatewayToken
        ? `?token=${encodeURIComponent(gatewayToken)}`
        : "";
    await openUrl(`${links.httpUrl}${tokenParam}`);
  }

  outro("Onboarding complete.");
}

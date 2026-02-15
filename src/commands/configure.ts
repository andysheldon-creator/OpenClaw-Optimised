import path from "node:path";

import {
  confirm,
  intro,
  multiselect,
  note,
  outro,
  select,
  spinner,
  text,
} from "@clack/prompts";
import { loginAnthropic, type OAuthCredentials } from "@mariozechner/pi-ai";
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
  ensureWorkspaceAndSessions,
  guardCancel,
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

type WizardSection =
  | "model"
  | "providers"
  | "gateway"
  | "daemon"
  | "workspace"
  | "skills"
  | "tasks"
  | "voice"
  | "alerting"
  | "budget"
  | "health";

type ConfigureWizardParams = {
  command: "configure" | "update";
  sections?: WizardSection[];
};

async function promptGatewayConfig(
  cfg: ClawdisConfig,
  runtime: RuntimeEnv,
): Promise<{
  config: ClawdisConfig;
  port: number;
  token?: string;
}> {
  const portRaw = guardCancel(
    await text({
      message: "Gateway port",
      initialValue: String(resolveGatewayPort(cfg)),
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
        { value: "off", label: "Off (loopback only)" },
        { value: "token", label: "Token" },
        { value: "password", label: "Password" },
      ],
    }),
    runtime,
  ) as "off" | "token" | "password";

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
  let next = cfg;

  if (authMode === "token") {
    const tokenInput = guardCancel(
      await text({
        message: "Gateway token (blank to generate)",
        initialValue: randomToken(),
      }),
      runtime,
    );
    gatewayToken = String(tokenInput).trim() || randomToken();
    next = {
      ...next,
      gateway: {
        ...next.gateway,
        auth: { ...next.gateway?.auth, mode: "token" },
      },
    };
  }

  if (authMode === "password") {
    const password = guardCancel(
      await text({
        message: "Gateway password",
        validate: (value) => (value?.trim() ? undefined : "Required"),
      }),
      runtime,
    );
    next = {
      ...next,
      gateway: {
        ...next.gateway,
        auth: {
          ...next.gateway?.auth,
          mode: "password",
          password: String(password).trim(),
        },
      },
    };
  }

  next = {
    ...next,
    gateway: {
      ...next.gateway,
      mode: "local",
      port,
      bind,
      tailscale: {
        ...next.gateway?.tailscale,
        mode: tailscaleMode,
        resetOnExit: tailscaleResetOnExit,
      },
    },
  };

  return { config: next, port, token: gatewayToken };
}

async function promptAuthConfig(
  cfg: ClawdisConfig,
  runtime: RuntimeEnv,
): Promise<ClawdisConfig> {
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
        { value: "minimax", label: "Minimax M2.1 (LM Studio)" },
        { value: "skip", label: "Skip for now" },
      ],
    }),
    runtime,
  ) as "oauth" | "antigravity" | "apiKey" | "minimax" | "skip";

  let next = cfg;

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
        // Pre-fill with Antigravity Sonnet for cost efficiency;
        // the model text prompt below lets the user override.
        if (!next.agent?.model) {
          next = {
            ...next,
            agent: {
              ...next.agent,
              model: "google-antigravity/claude-sonnet-4-5",
            },
          };
        }
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
    next = applyMinimaxConfig(next);
  }

  const modelInput = guardCancel(
    await text({
      message: "Default model (blank to keep)",
      initialValue: next.agent?.model ?? "",
    }),
    runtime,
  );
  const model = String(modelInput ?? "").trim();
  if (model) {
    next = {
      ...next,
      agent: {
        ...next.agent,
        model,
      },
    };
  }

  return next;
}

async function maybeInstallDaemon(params: {
  runtime: RuntimeEnv;
  port: number;
  gatewayToken?: string;
}) {
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
      params.runtime,
    );
    if (action === "restart") {
      await service.restart({ stdout: process.stdout });
      return;
    }
    if (action === "skip") return;
    if (action === "reinstall") {
      await service.uninstall({ env: process.env, stdout: process.stdout });
    }
  }

  const devMode =
    process.argv[1]?.includes(`${path.sep}src${path.sep}`) &&
    process.argv[1]?.endsWith(".ts");
  const { programArguments, workingDirectory } =
    await resolveGatewayProgramArguments({ port: params.port, dev: devMode });
  const environment: Record<string, string | undefined> = {
    PATH: process.env.PATH,
    CLAWDIS_GATEWAY_TOKEN: params.gatewayToken,
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

// ── Autonomous Tasks ──────────────────────────────────────────────────────

async function promptTasksConfig(
  cfg: ClawdisConfig,
  runtime: RuntimeEnv,
): Promise<ClawdisConfig> {
  const existing = cfg.tasks;
  if (existing?.enabled !== undefined) {
    note(
      [
        `Enabled: ${existing.enabled !== false ? "yes" : "no"}`,
        `Max concurrent: ${existing.maxConcurrentTasks ?? 3}`,
        `Max steps/task: ${existing.maxStepsPerTask ?? 50}`,
        `Step interval: ${((existing.defaultStepIntervalMs ?? 30_000) / 1000).toFixed(0)}s`,
      ].join("\n"),
      "Current task settings",
    );
  }

  const enabled = Boolean(
    guardCancel(
      await confirm({
        message: "Enable autonomous long-running tasks?",
        initialValue: existing?.enabled !== false,
      }),
      runtime,
    ),
  );

  if (!enabled) {
    return { ...cfg, tasks: { ...cfg.tasks, enabled: false } };
  }

  const maxConcurrentRaw = guardCancel(
    await text({
      message: "Max concurrent tasks",
      initialValue: String(existing?.maxConcurrentTasks ?? 3),
      validate: (v) => {
        const n = Number(v);
        return Number.isInteger(n) && n >= 1 && n <= 10
          ? undefined
          : "Must be 1-10";
      },
    }),
    runtime,
  );

  const maxStepsRaw = guardCancel(
    await text({
      message: "Max steps per task (safety limit)",
      initialValue: String(existing?.maxStepsPerTask ?? 50),
      validate: (v) => {
        const n = Number(v);
        return Number.isInteger(n) && n >= 1 && n <= 200
          ? undefined
          : "Must be 1-200";
      },
    }),
    runtime,
  );

  const stepInterval = guardCancel(
    await select({
      message: "Delay between steps",
      options: [
        { value: 15_000, label: "15 seconds" },
        { value: 30_000, label: "30 seconds (default)" },
        { value: 60_000, label: "1 minute" },
        { value: 300_000, label: "5 minutes" },
      ],
    }),
    runtime,
  ) as number;

  const stepTimeout = guardCancel(
    await select({
      message: "Timeout per step",
      options: [
        { value: 300_000, label: "5 minutes" },
        { value: 600_000, label: "10 minutes (default)" },
        { value: 1_800_000, label: "30 minutes" },
      ],
    }),
    runtime,
  ) as number;

  return {
    ...cfg,
    tasks: {
      ...cfg.tasks,
      enabled: true,
      maxConcurrentTasks: Number.parseInt(String(maxConcurrentRaw), 10),
      maxStepsPerTask: Number.parseInt(String(maxStepsRaw), 10),
      defaultStepIntervalMs: stepInterval,
      defaultTimeoutPerStepMs: stepTimeout,
    },
  };
}

// ── Voice Calls ───────────────────────────────────────────────────────────

async function promptVoiceConfig(
  cfg: ClawdisConfig,
  runtime: RuntimeEnv,
): Promise<ClawdisConfig> {
  const existing = cfg.talk;
  if (existing?.voiceId) {
    note(
      [
        `Voice ID: ${existing.voiceId}`,
        `API key: ${existing.apiKey ? "***configured***" : "not set"}`,
        `Conversational: ${existing.conversational?.enabled ? "yes" : "no"}`,
      ].join("\n"),
      "Current voice settings",
    );
  }

  const envKey = process.env.ELEVENLABS_API_KEY?.trim();

  const enabled = Boolean(
    guardCancel(
      await confirm({
        message: "Enable voice calls (requires ElevenLabs API key)?",
        initialValue: Boolean(existing?.voiceId || envKey),
      }),
      runtime,
    ),
  );

  if (!enabled) {
    return cfg;
  }

  let apiKey = existing?.apiKey ?? envKey ?? "";
  if (envKey) {
    note(
      "ElevenLabs API key detected from ELEVENLABS_API_KEY environment variable.",
      "API key found",
    );
  } else {
    const keyInput = guardCancel(
      await text({
        message: "ElevenLabs API key",
        initialValue: existing?.apiKey ?? "",
        validate: (v) => (v?.trim() ? undefined : "Required for voice calls"),
      }),
      runtime,
    );
    apiKey = String(keyInput).trim();
  }

  const voiceIdInput = guardCancel(
    await text({
      message: "ElevenLabs voice ID",
      initialValue: existing?.voiceId ?? "",
      validate: (v) =>
        v?.trim()
          ? undefined
          : "Required — find yours at elevenlabs.io/app/voices",
    }),
    runtime,
  );
  const voiceId = String(voiceIdInput).trim();

  const conversationalEnabled = Boolean(
    guardCancel(
      await confirm({
        message: 'Enable Telegram voice mode ("call me" trigger)?',
        initialValue: existing?.conversational?.enabled ?? false,
      }),
      runtime,
    ),
  );

  let triggerWords: string[] | undefined;
  let maxDurationMs: number | undefined;

  if (conversationalEnabled) {
    const triggersInput = guardCancel(
      await text({
        message: "Trigger words (comma-separated)",
        initialValue:
          existing?.conversational?.triggerWords?.join(", ") ?? "call me",
      }),
      runtime,
    );
    triggerWords = String(triggersInput)
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

    maxDurationMs = guardCancel(
      await select({
        message: "Max voice call duration",
        options: [
          { value: 600_000, label: "10 minutes" },
          { value: 1_800_000, label: "30 minutes (default)" },
          { value: 3_600_000, label: "60 minutes" },
        ],
      }),
      runtime,
    ) as number;
  }

  return {
    ...cfg,
    talk: {
      ...cfg.talk,
      apiKey: envKey ? undefined : apiKey, // Don't persist env-sourced key
      voiceId,
      conversational: {
        ...cfg.talk?.conversational,
        enabled: conversationalEnabled,
        ...(triggerWords ? { triggerWords } : {}),
        ...(maxDurationMs ? { maxDurationMs } : {}),
      },
    },
  };
}

// ── Crash Alerting ────────────────────────────────────────────────────────

type AlertChannelType =
  | "webhook"
  | "telegram"
  | "whatsapp"
  | "discord"
  | "signal";

async function promptAlertingConfig(
  cfg: ClawdisConfig,
  runtime: RuntimeEnv,
): Promise<ClawdisConfig> {
  const existing = cfg.alerting;
  if (existing?.channels?.length) {
    note(
      [
        `Enabled: ${existing.enabled !== false ? "yes" : "no"}`,
        `Channels: ${existing.channels.map((c) => c.type).join(", ")}`,
        `On crash: ${existing.onCrash !== false ? "yes" : "no"}`,
        `On restart: ${existing.onRestart !== false ? "yes" : "no"}`,
      ].join("\n"),
      "Current alerting settings",
    );
  }

  const enabled = Boolean(
    guardCancel(
      await confirm({
        message: "Enable crash/restart alerting?",
        initialValue: existing?.enabled !== false,
      }),
      runtime,
    ),
  );

  if (!enabled) {
    return { ...cfg, alerting: { ...cfg.alerting, enabled: false } };
  }

  const onCrash = Boolean(
    guardCancel(
      await confirm({
        message: "Send alert on unhandled crash?",
        initialValue: existing?.onCrash !== false,
      }),
      runtime,
    ),
  );

  const onRestart = Boolean(
    guardCancel(
      await confirm({
        message: "Send alert on gateway restart?",
        initialValue: existing?.onRestart !== false,
      }),
      runtime,
    ),
  );

  const channels: Array<{ type: AlertChannelType; url?: string; to?: string }> =
    [...(existing?.channels ?? [])];

  let addMore = true;
  while (addMore) {
    const channelChoice = guardCancel(
      await select({
        message: `Add alert channel${channels.length > 0 ? ` (${channels.length} configured)` : ""}`,
        options: [
          {
            value: "webhook",
            label: "Webhook (POST JSON)",
          },
          {
            value: "telegram",
            label: "Telegram",
            hint: cfg.telegram?.botToken
              ? "Bot token detected"
              : "Needs bot token",
          },
          { value: "whatsapp", label: "WhatsApp" },
          { value: "discord", label: "Discord webhook" },
          { value: "done", label: "Done adding channels" },
        ],
      }),
      runtime,
    ) as AlertChannelType | "done";

    if (channelChoice === "done") {
      addMore = false;
      break;
    }

    if (channelChoice === "webhook") {
      const url = guardCancel(
        await text({
          message: "Webhook URL",
          validate: (v) =>
            v?.trim()?.startsWith("http") ? undefined : "Must be a valid URL",
        }),
        runtime,
      );
      channels.push({ type: "webhook", url: String(url).trim() });
    } else if (channelChoice === "telegram") {
      const chatId = guardCancel(
        await text({
          message: "Telegram chat ID (your user or group ID)",
          validate: (v) => (v?.trim() ? undefined : "Required"),
        }),
        runtime,
      );
      channels.push({ type: "telegram", to: String(chatId).trim() });
    } else if (channelChoice === "whatsapp") {
      const phone = guardCancel(
        await text({
          message: "WhatsApp number (e.g. +15555550123)",
          validate: (v) => (v?.trim() ? undefined : "Required"),
        }),
        runtime,
      );
      channels.push({ type: "whatsapp", to: String(phone).trim() });
    } else if (channelChoice === "discord") {
      const url = guardCancel(
        await text({
          message: "Discord webhook URL",
          validate: (v) =>
            v?.trim()?.startsWith("http") ? undefined : "Must be a valid URL",
        }),
        runtime,
      );
      channels.push({ type: "discord", url: String(url).trim() });
    }
  }

  if (channels.length > 0) {
    note(
      channels.map((c) => `- ${c.type}: ${c.url ?? c.to ?? ""}`).join("\n"),
      "Configured alert channels",
    );
  }

  return {
    ...cfg,
    alerting: {
      ...cfg.alerting,
      enabled: true,
      onCrash,
      onRestart,
      channels,
    },
  };
}

// ── Budget & Cost Controls ────────────────────────────────────────────────

async function promptBudgetConfig(
  cfg: ClawdisConfig,
  runtime: RuntimeEnv,
): Promise<ClawdisConfig> {
  const existingBudget = (cfg.agent as Record<string, unknown> | undefined)
    ?.monthlyBudgetUsd as number | undefined;

  if (existingBudget) {
    note(`Monthly budget cap: $${existingBudget}`, "Current budget settings");
  }

  const wantsBudget = Boolean(
    guardCancel(
      await confirm({
        message: "Set a monthly spending cap?",
        initialValue: Boolean(existingBudget),
      }),
      runtime,
    ),
  );

  let next = cfg;

  if (wantsBudget) {
    const budgetRaw = guardCancel(
      await text({
        message: "Monthly budget cap (USD)",
        initialValue: existingBudget ? String(existingBudget) : "50",
        validate: (v) => {
          const n = Number(v);
          return Number.isFinite(n) && n > 0
            ? undefined
            : "Must be a positive number";
        },
      }),
      runtime,
    );
    next = {
      ...next,
      agent: {
        ...next.agent,
        monthlyBudgetUsd: Number.parseFloat(String(budgetRaw)),
      } as ClawdisConfig["agent"],
    };
  }

  const wantsOllama = Boolean(
    guardCancel(
      await confirm({
        message: "Enable Ollama for local model routing (free, reduces cost)?",
        initialValue: false,
      }),
      runtime,
    ),
  );

  if (wantsOllama) {
    const hostInput = guardCancel(
      await text({
        message: "Ollama host URL",
        initialValue: process.env.OLLAMA_HOST ?? "http://localhost:11434",
      }),
      runtime,
    );
    const ollamaHost = String(hostInput).trim();

    // Probe Ollama
    const spin = spinner();
    spin.start("Checking Ollama connectivity...");
    try {
      const res = await fetch(`${ollamaHost}/api/tags`, {
        signal: AbortSignal.timeout(5000),
      });
      if (res.ok) {
        const data = (await res.json()) as {
          models?: Array<{ name: string }>;
        };
        const models = data.models?.map((m) => m.name) ?? [];
        spin.stop(
          models.length > 0
            ? `Ollama connected (${models.length} model${models.length === 1 ? "" : "s"} available)`
            : "Ollama connected (no models pulled yet)",
        );
        if (models.length > 0) {
          note(models.join("\n"), "Available Ollama models");
        }
      } else {
        spin.stop("Ollama responded but returned an error");
      }
    } catch {
      spin.stop(
        "Could not reach Ollama — make sure it is running on the target machine",
      );
    }

    note(
      [
        "Set these environment variables to enable Ollama routing:",
        `  OLLAMA_HOST=${ollamaHost}`,
        "  ENABLE_OLLAMA=true",
        "  ENABLE_HYBRID_ROUTING=true",
      ].join("\n"),
      "Ollama configuration",
    );
  }

  return next;
}

export async function runConfigureWizard(
  opts: ConfigureWizardParams,
  runtime: RuntimeEnv = defaultRuntime,
) {
  printWizardHeader(runtime);
  intro(
    opts.command === "update" ? "Clawdis update wizard" : "Clawdis configure",
  );

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
    if (!snapshot.valid) {
      const reset = guardCancel(
        await confirm({
          message: "Config invalid. Start fresh?",
          initialValue: true,
        }),
        runtime,
      );
      if (reset) baseConfig = {};
    }
  }

  const localUrl = "ws://127.0.0.1:18789";
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

  const mode = guardCancel(
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
  ) as "local" | "remote";

  if (mode === "remote") {
    let remoteConfig = await promptRemoteGatewayConfig(baseConfig, runtime);
    remoteConfig = applyWizardMetadata(remoteConfig, {
      command: opts.command,
      mode,
    });
    await writeConfigFile(remoteConfig);
    runtime.log(`Updated ${CONFIG_PATH_CLAWDIS}`);
    outro("Remote gateway configured.");
    return;
  }

  const selected = opts.sections
    ? opts.sections
    : (guardCancel(
        await multiselect({
          message: "Select sections to configure",
          options: [
            { value: "workspace", label: "Workspace" },
            { value: "model", label: "Model/auth" },
            { value: "gateway", label: "Gateway config" },
            { value: "daemon", label: "Gateway daemon" },
            { value: "providers", label: "Providers" },
            { value: "skills", label: "Skills" },
            {
              value: "tasks",
              label: "Autonomous tasks",
              hint: "Long-running multi-step task system",
            },
            {
              value: "voice",
              label: "Voice calls",
              hint: "ElevenLabs voice for Web UI + Telegram",
            },
            {
              value: "alerting",
              label: "Crash alerting",
              hint: "Notifications on crash/restart",
            },
            {
              value: "budget",
              label: "Budget & cost controls",
              hint: "Monthly cap, Ollama routing",
            },
            { value: "health", label: "Health check" },
          ],
        }),
        runtime,
      ) as WizardSection[]);

  if (!selected || selected.length === 0) {
    outro("No changes selected.");
    return;
  }

  let nextConfig = { ...baseConfig };
  let workspaceDir =
    nextConfig.agent?.workspace ??
    baseConfig.agent?.workspace ??
    DEFAULT_WORKSPACE;
  let gatewayPort = resolveGatewayPort(baseConfig);
  let gatewayToken: string | undefined;

  if (selected.includes("workspace")) {
    const workspaceInput = guardCancel(
      await text({
        message: "Workspace directory",
        initialValue: workspaceDir,
      }),
      runtime,
    );
    workspaceDir = resolveUserPath(
      String(workspaceInput ?? "").trim() || DEFAULT_WORKSPACE,
    );
    nextConfig = {
      ...nextConfig,
      agent: {
        ...nextConfig.agent,
        workspace: workspaceDir,
      },
    };

    // Check for pre-existing workspace files before creating/overwriting.
    // All workspace .md files are personality/context — only ask the user
    // if personality files exist.
    let upgradeMode: false | "preserve-personality" | "full" = false;
    const existingWs = await checkExistingWorkspaceFiles(workspaceDir);
    if (existingWs) {
      note(existingWs.summary, "Existing workspace detected");
      if (existingWs.hasPersonality) {
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
        upgradeMode = false;
      }
    }
    await ensureWorkspaceAndSessions(workspaceDir, runtime, { upgradeMode });
  }

  if (selected.includes("model")) {
    nextConfig = await promptAuthConfig(nextConfig, runtime);
  }

  if (selected.includes("gateway")) {
    const gateway = await promptGatewayConfig(nextConfig, runtime);
    nextConfig = gateway.config;
    gatewayPort = gateway.port;
    gatewayToken = gateway.token;
  }

  if (selected.includes("providers")) {
    nextConfig = await setupProviders(nextConfig, runtime, {
      allowDisable: true,
      allowSignalInstall: true,
    });
  }

  if (selected.includes("skills")) {
    const wsDir = resolveUserPath(workspaceDir);
    nextConfig = await setupSkills(nextConfig, wsDir, runtime);
  }

  if (selected.includes("tasks")) {
    nextConfig = await promptTasksConfig(nextConfig, runtime);
  }

  if (selected.includes("voice")) {
    nextConfig = await promptVoiceConfig(nextConfig, runtime);
  }

  if (selected.includes("alerting")) {
    nextConfig = await promptAlertingConfig(nextConfig, runtime);
  }

  if (selected.includes("budget")) {
    nextConfig = await promptBudgetConfig(nextConfig, runtime);
  }

  nextConfig = applyWizardMetadata(nextConfig, {
    command: opts.command,
    mode,
  });
  await writeConfigFile(nextConfig);
  runtime.log(`Updated ${CONFIG_PATH_CLAWDIS}`);

  if (selected.includes("daemon")) {
    if (!selected.includes("gateway")) {
      const portInput = guardCancel(
        await text({
          message: "Gateway port for daemon install",
          initialValue: String(gatewayPort),
          validate: (value) =>
            Number.isFinite(Number(value)) ? undefined : "Invalid port",
        }),
        runtime,
      );
      gatewayPort = Number.parseInt(String(portInput), 10);
    }

    await maybeInstallDaemon({
      runtime,
      port: gatewayPort,
      gatewayToken,
    });
  }

  if (selected.includes("health")) {
    await sleep(1000);
    try {
      await healthCommand({ json: false, timeoutMs: 10_000 }, runtime);
    } catch (err) {
      runtime.error(`Health check failed: ${String(err)}`);
    }
  }

  note(
    (() => {
      const bind = nextConfig.gateway?.bind ?? "loopback";
      const links = resolveControlUiLinks({ bind, port: gatewayPort });
      return [`Web UI: ${links.httpUrl}`, `Gateway WS: ${links.wsUrl}`].join(
        "\n",
      );
    })(),
    "Control UI",
  );

  const wantsOpen = guardCancel(
    await confirm({
      message: "Open Control UI now?",
      initialValue: false,
    }),
    runtime,
  );
  if (wantsOpen) {
    const bind = nextConfig.gateway?.bind ?? "loopback";
    const links = resolveControlUiLinks({ bind, port: gatewayPort });
    await openUrl(links.httpUrl);
  }

  outro("Configure complete.");
}

export async function configureCommand(runtime: RuntimeEnv = defaultRuntime) {
  await runConfigureWizard({ command: "configure" }, runtime);
}

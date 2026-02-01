import type { OnboardOptions } from "../commands/onboard-types.js";
import type { OpenClawConfig } from "../config/config.js";
import type { RuntimeEnv } from "../runtime.js";
import type { WizardPrompter } from "./prompts.js";
import { resolveDefaultAgentId, resolveAgentWorkspaceDir } from "../agents/agent-scope.js";
import { setupSkills } from "../commands/onboard-skills.js";
import { readConfigFileSnapshot, writeConfigFile, resolveGatewayPort } from "../config/config.js";
import { logConfigUpdated } from "../config/logging.js";
import { defaultRuntime } from "../runtime.js";

type WebConfigureSection =
  | "gateway"
  | "web-tools"
  | "model-keys"
  | "channels"
  | "skills"
  | "agent-runtime";

type WizardRunOpts = OnboardOptions & { wizard?: "onboarding" | "configure" };

function clampPort(n: number) {
  if (!Number.isFinite(n)) return 18789;
  if (n < 1) return 18789;
  if (n > 65535) return 18789;
  return Math.floor(n);
}

export async function runConfigureWizardWeb(
  _opts: WizardRunOpts,
  runtime: RuntimeEnv = defaultRuntime,
  prompter: WizardPrompter,
) {
  await prompter.intro("OpenClaw configure");

  const snapshot = await readConfigFileSnapshot();
  const baseConfig: OpenClawConfig = snapshot.valid ? snapshot.config : {};

  if (snapshot.exists && !snapshot.valid) {
    await prompter.note(
      [
        "Your config file exists but is invalid.",
        "Run `openclaw doctor --fix` in the CLI once to repair it, then come back here.",
        "Docs: https://docs.openclaw.ai/gateway/configuration",
      ].join("\n"),
      "Config invalid",
    );
    await prompter.outro("Cannot continue until config is valid.");
    runtime.exit(1);
    return;
  }

  const sections = await prompter.multiselect<WebConfigureSection>({
    message: "What do you want to configure now?",
    options: [
      { value: "gateway", label: "Gateway", hint: "Port, bind, auth" },
      { value: "web-tools", label: "Web tools", hint: "web_fetch + web_search" },
      {
        value: "model-keys",
        label: "Model API keys",
        hint: "OpenAI, Anthropic, Gemini, OpenRouter",
      },
      {
        value: "channels",
        label: "Channels",
        hint: "Discord, Telegram (basic setup)",
      },
      {
        value: "skills",
        label: "Skills",
        hint: "Install skill dependencies + API keys",
      },
      {
        value: "agent-runtime",
        label: "Agent runtime",
        hint: "Default model, fallbacks, thinking, concurrency",
      },
    ],
    initialValues: ["gateway", "web-tools", "model-keys", "channels", "skills", "agent-runtime"],
  });

  let next = structuredClone(baseConfig);

  if (sections.includes("gateway")) {
    const portStr = await prompter.text({
      message: "Gateway port",
      initialValue: String(resolveGatewayPort(next)),
      validate: (val) => (Number.isFinite(Number(val)) ? undefined : "Invalid port"),
    });
    const port = clampPort(Number.parseInt(portStr, 10));

    const bind = await prompter.select({
      message: "Gateway bind",
      options: [
        { value: "loopback", label: "Local only (recommended)", hint: "127.0.0.1" },
        { value: "lan", label: "LAN (advanced)", hint: "0.0.0.0" },
      ],
      initialValue: (next.gateway?.bind === "lan" ? "lan" : "loopback") as any,
    });

    const authMode = await prompter.select({
      message: "Gateway auth",
      options: [
        { value: "token", label: "Token" },
        { value: "password", label: "Password" },
      ],
      initialValue: (next.gateway?.auth?.mode === "password" ? "password" : "token") as any,
    });

    let auth: any = { ...(next.gateway?.auth ?? {}) };

    if (authMode === "token") {
      const token = await prompter.text({
        message: "Gateway token",
        initialValue: String(next.gateway?.auth?.token ?? ""),
        placeholder: "Paste token",
        validate: (v) => (v.trim() ? undefined : "Required"),
      });
      auth = { mode: "token", token: token.trim() };
    }

    if (authMode === "password") {
      const password = await prompter.text({
        message: "Gateway password",
        initialValue: "",
        placeholder: "Set a password",
        validate: (v) => (v.trim() ? undefined : "Required"),
      });
      auth = { mode: "password", password: password.trim() };
    }

    next = {
      ...next,
      gateway: {
        ...next.gateway,
        mode: "local",
        port,
        bind,
        auth,
      },
    };
  }

  if (sections.includes("web-tools")) {
    const enableFetch = await prompter.confirm({
      message: "Enable web_fetch (keyless HTTP fetch)?",
      initialValue: next.tools?.web?.fetch?.enabled ?? true,
    });

    const enableSearch = await prompter.confirm({
      message: "Enable web_search (Brave Search)?",
      initialValue: next.tools?.web?.search?.enabled ?? false,
    });

    let apiKey: string | undefined = next.tools?.web?.search?.apiKey;
    if (enableSearch) {
      const key = await prompter.text({
        message: "Brave Search API key (optional if BRAVE_API_KEY is set)",
        initialValue: apiKey ? "" : "",
        placeholder: apiKey ? "Leave blank to keep current" : "BSA...",
      });
      if (key.trim()) apiKey = key.trim();
    }

    next = {
      ...next,
      tools: {
        ...next.tools,
        web: {
          ...next.tools?.web,
          fetch: {
            ...next.tools?.web?.fetch,
            enabled: enableFetch,
          },
          search: {
            ...next.tools?.web?.search,
            enabled: enableSearch,
            ...(apiKey ? { apiKey } : {}),
          },
        },
      },
    };

    if (enableSearch && !apiKey) {
      await prompter.note(
        [
          "web_search is enabled but no API key is stored.",
          "Set BRAVE_API_KEY in the Gateway environment, or re-run this wizard and paste the key.",
          "Docs: https://docs.openclaw.ai/tools/web",
        ].join("\n"),
        "Web search",
      );
    }
  }

  if (sections.includes("model-keys")) {
    await prompter.note(
      [
        "This stores API keys in openclaw.json under env.vars.",
        "That is convenient, but it is plaintext on disk.",
        "If you prefer, set these as real environment variables instead.",
      ].join("\n"),
      "Model API keys",
    );

    type KeyChoice = "openai" | "anthropic" | "gemini" | "openrouter";
    const picks = await prompter.multiselect<KeyChoice>({
      message: "Which keys do you want to set?",
      options: [
        { value: "openai", label: "OpenAI", hint: "OPENAI_API_KEY" },
        { value: "anthropic", label: "Anthropic", hint: "ANTHROPIC_API_KEY" },
        { value: "gemini", label: "Google Gemini", hint: "GEMINI_API_KEY" },
        { value: "openrouter", label: "OpenRouter", hint: "OPENROUTER_API_KEY" },
      ],
      initialValues: ["openai", "anthropic", "gemini"],
    });

    const envVars = { ...(next.env?.vars ?? {}) };

    async function promptKey(label: string, keyName: string) {
      const value = await prompter.text({
        message: `${label} API key`,
        initialValue: "",
        placeholder: envVars[keyName] ? "Leave blank to keep current" : "Paste key",
        validate: (v) => (v.trim() || envVars[keyName] ? undefined : "Required"),
      });
      const trimmed = value.trim();
      if (trimmed) envVars[keyName] = trimmed;
    }

    if (picks.includes("openai")) await promptKey("OpenAI", "OPENAI_API_KEY");
    if (picks.includes("anthropic")) await promptKey("Anthropic", "ANTHROPIC_API_KEY");
    if (picks.includes("gemini")) await promptKey("Gemini", "GEMINI_API_KEY");
    if (picks.includes("openrouter")) await promptKey("OpenRouter", "OPENROUTER_API_KEY");

    next = {
      ...next,
      env: {
        ...next.env,
        vars: envVars,
      },
    };
  }

  const parseAllowFrom = (raw: string): Array<string | number> | undefined => {
    const trimmed = raw.trim();
    if (!trimmed) return undefined;
    const parts = trimmed
      .split(/[,\n]/g)
      .map((p) => p.trim())
      .filter(Boolean);
    if (parts.length === 0) return undefined;
    return parts.map((p) => {
      if (p === "*") return "*";
      const n = Number(p);
      return Number.isFinite(n) && String(n) === p ? n : p;
    });
  };

  if (sections.includes("channels")) {
    await prompter.note(
      [
        "Channel setup (basic).",
        "Tip: set allowlists so your bot does not respond to random people.",
      ].join("\n"),
      "Channels",
    );

    type ChannelChoice = "discord" | "telegram";
    const picks = await prompter.multiselect<ChannelChoice>({
      message: "Which channels do you want to configure?",
      options: [
        { value: "discord", label: "Discord", hint: "Bot token + allowlists" },
        { value: "telegram", label: "Telegram", hint: "Bot token + allowlists" },
      ],
      initialValues: ["discord", "telegram"],
    });

    let nextChannels: any = { ...(next.channels ?? {}) };

    const advanced = await prompter.confirm({
      message: "Configure advanced channel routing now?",
      initialValue: true,
    });

    if (picks.includes("discord")) {
      const enabled = await prompter.confirm({
        message: "Enable Discord?",
        initialValue: nextChannels.discord?.enabled ?? true,
      });

      const token = await prompter.text({
        message: "Discord bot token",
        initialValue: "",
        placeholder: nextChannels.discord?.token ? "Leave blank to keep current" : "Paste token",
        validate: (v) => (v.trim() || nextChannels.discord?.token ? undefined : "Required"),
      });

      const dmPolicy = await prompter.select({
        message: "Discord DM policy",
        options: [
          { value: "pairing", label: "Pairing" },
          { value: "allowlist", label: "Allowlist" },
          { value: "open", label: "Open (dangerous)" },
          { value: "disabled", label: "Disabled" },
        ],
        initialValue: (nextChannels.discord?.dm?.policy ?? "pairing") as any,
      });

      let dmAllowFrom = nextChannels.discord?.dm?.allowFrom;
      if (dmPolicy === "allowlist" || dmPolicy === "open") {
        const raw = await prompter.text({
          message: 'Discord allowFrom (comma separated user ids). Use "*" for open',
          initialValue: "",
          placeholder: dmAllowFrom?.length ? "Leave blank to keep current" : "123, 456",
          validate: (v) => (v.trim() || dmAllowFrom?.length ? undefined : "Required"),
        });
        if (raw.trim()) dmAllowFrom = parseAllowFrom(raw);
      }

      let groupPolicy = nextChannels.discord?.groupPolicy;
      let requireMentionGuildDefault = nextChannels.discord?.requireMention;

      if (advanced) {
        groupPolicy = await prompter.select({
          message: "Discord group policy",
          options: [
            { value: "allowlist", label: "allowlist (recommended)" },
            { value: "open", label: "open" },
            { value: "disabled", label: "disabled" },
          ],
          initialValue: (groupPolicy ?? "allowlist") as any,
        });

        const req = await prompter.confirm({
          message: "Require @mention in Discord guild channels by default?",
          initialValue:
            typeof requireMentionGuildDefault === "boolean" ? requireMentionGuildDefault : true,
        });
        requireMentionGuildDefault = req;
      }

      nextChannels.discord = {
        ...(nextChannels.discord ?? {}),
        enabled,
        ...(token.trim() ? { token: token.trim() } : {}),
        ...(groupPolicy ? { groupPolicy } : {}),
        ...(typeof requireMentionGuildDefault === "boolean"
          ? { requireMention: requireMentionGuildDefault }
          : {}),
        dm: {
          ...(nextChannels.discord?.dm ?? {}),
          policy: dmPolicy,
          ...(dmAllowFrom ? { allowFrom: dmAllowFrom } : {}),
        },
      };

      if (advanced) {
        // Guild/channel allowlisting
        const guildsRaw = await prompter.text({
          message: "Discord guild IDs to configure (comma separated, optional)",
          initialValue: "",
          placeholder: "123456789012345678, 234567890123456789",
        });
        const guildIds = (guildsRaw || "")
          .split(/[,\n]/g)
          .map((s) => s.trim())
          .filter(Boolean);

        if (guildIds.length) {
          const guilds: any = { ...(nextChannels.discord?.guilds ?? {}) };

          for (const gid of guildIds) {
            const gRequireMention = await prompter.confirm({
              message: `Discord guild ${gid}: require mention?`,
              initialValue:
                typeof requireMentionGuildDefault === "boolean" ? requireMentionGuildDefault : true,
            });

            const channelIdsRaw = await prompter.text({
              message: `Discord guild ${gid}: allowed channel IDs (comma separated)`,
              initialValue: "",
              placeholder: "345678901234567890",
              validate: (v) => (v.trim() ? undefined : "Required"),
            });
            const channelIds = (channelIdsRaw || "")
              .split(/[,\n]/g)
              .map((s) => s.trim())
              .filter(Boolean);

            const channels: any = {};
            for (const cid of channelIds) {
              channels[cid] = {
                allow: true,
                requireMention: gRequireMention,
              };
            }

            guilds[gid] = {
              ...(guilds[gid] ?? {}),
              requireMention: gRequireMention,
              channels: { ...(guilds[gid]?.channels ?? {}), ...channels },
            };
          }

          nextChannels.discord.guilds = guilds;
        }
      }
    }

    if (picks.includes("telegram")) {
      const enabled = await prompter.confirm({
        message: "Enable Telegram?",
        initialValue: nextChannels.telegram?.enabled ?? false,
      });

      const botToken = await prompter.text({
        message: "Telegram bot token",
        initialValue: "",
        placeholder: nextChannels.telegram?.botToken
          ? "Leave blank to keep current"
          : "123456:ABC...",
        validate: (v) => (v.trim() || nextChannels.telegram?.botToken ? undefined : "Required"),
      });

      const dmPolicy = await prompter.select({
        message: "Telegram DM policy",
        options: [
          { value: "pairing", label: "Pairing" },
          { value: "allowlist", label: "Allowlist" },
          { value: "open", label: "Open (dangerous)" },
          { value: "disabled", label: "Disabled" },
        ],
        initialValue: (nextChannels.telegram?.dmPolicy ?? "pairing") as any,
      });

      let allowFrom = nextChannels.telegram?.allowFrom;
      if (dmPolicy === "allowlist" || dmPolicy === "open") {
        const raw = await prompter.text({
          message: 'Telegram allowFrom (comma separated user ids). Use "*" for open',
          initialValue: "",
          placeholder: allowFrom?.length ? "Leave blank to keep current" : "123, 456",
          validate: (v) => (v.trim() || allowFrom?.length ? undefined : "Required"),
        });
        if (raw.trim()) allowFrom = parseAllowFrom(raw);
      }

      let groupPolicy = nextChannels.telegram?.groupPolicy;
      let groupAllowFrom = nextChannels.telegram?.groupAllowFrom;

      if (advanced) {
        groupPolicy = await prompter.select({
          message: "Telegram group policy",
          options: [
            { value: "allowlist", label: "allowlist (recommended)" },
            { value: "open", label: "open" },
            { value: "disabled", label: "disabled" },
          ],
          initialValue: (groupPolicy ?? "allowlist") as any,
        });

        const raw = await prompter.text({
          message: "Telegram groupAllowFrom (comma separated user ids, optional)",
          initialValue: "",
          placeholder: groupAllowFrom?.length ? "Leave blank to keep current" : "123, 456",
        });
        if (raw.trim()) groupAllowFrom = parseAllowFrom(raw);
      }

      nextChannels.telegram = {
        ...(nextChannels.telegram ?? {}),
        enabled,
        dmPolicy,
        ...(botToken.trim() ? { botToken: botToken.trim() } : {}),
        ...(allowFrom ? { allowFrom } : {}),
        ...(groupPolicy ? { groupPolicy } : {}),
        ...(groupAllowFrom ? { groupAllowFrom } : {}),
      };

      if (advanced) {
        const groupsRaw = await prompter.text({
          message: "Telegram group chat IDs to configure (comma separated, optional)",
          initialValue: "",
          placeholder: "-1001234567890",
        });
        const groupIds = (groupsRaw || "")
          .split(/[,\n]/g)
          .map((s) => s.trim())
          .filter(Boolean);

        if (groupIds.length) {
          const groups: any = { ...(nextChannels.telegram?.groups ?? {}) };

          for (const gid of groupIds) {
            const enabledGroup = await prompter.confirm({
              message: `Telegram group ${gid}: enable?`,
              initialValue: true,
            });

            const reqMention = await prompter.confirm({
              message: `Telegram group ${gid}: require mention?`,
              initialValue: true,
            });

            groups[gid] = {
              ...(groups[gid] ?? {}),
              enabled: enabledGroup,
              requireMention: reqMention,
            };
          }

          nextChannels.telegram.groups = groups;
        }
      }
    }

    next = {
      ...next,
      channels: nextChannels,
    };
  }

  if (sections.includes("skills")) {
    const agentId = resolveDefaultAgentId(next);
    const wsDir = resolveAgentWorkspaceDir(next, agentId);
    next = await setupSkills(next, wsDir, runtime, prompter);
  }

  if (sections.includes("agent-runtime")) {
    await prompter.note(
      [
        "Set defaults for the main agent.",
        "You can override per-session later using /status or config edits.",
      ].join("\n"),
      "Agent runtime",
    );

    const primaryModel = await prompter.text({
      message: "Default primary model (e.g. openai/gpt-5.2)",
      initialValue: String(next.agents?.defaults?.model?.primary ?? ""),
      placeholder: "openai/gpt-5.2",
      validate: (v) => (v.trim() ? undefined : "Required"),
    });

    const fallbacksRaw = await prompter.text({
      message: "Fallback models (comma separated, optional)",
      initialValue: Array.isArray(next.agents?.defaults?.model?.fallbacks)
        ? next.agents?.defaults?.model?.fallbacks?.join(", ")
        : "",
      placeholder: "openai/gpt-5-mini, google/gemini-3-flash-preview",
    });

    const thinkingDefault = await prompter.select({
      message: "Default thinking level",
      options: [
        { value: "off", label: "off" },
        { value: "minimal", label: "minimal" },
        { value: "low", label: "low" },
        { value: "medium", label: "medium" },
        { value: "high", label: "high" },
        { value: "xhigh", label: "xhigh" },
      ],
      initialValue: (next.agents?.defaults?.thinkingDefault ?? "low") as any,
    });

    const maxConcurrentStr = await prompter.text({
      message: "Max concurrent runs (main agent)",
      initialValue: String(next.agents?.defaults?.maxConcurrent ?? 2),
      validate: (v) => (Number.isFinite(Number(v)) && Number(v) > 0 ? undefined : "Invalid"),
    });

    const subMaxConcurrentStr = await prompter.text({
      message: "Max concurrent subagents",
      initialValue: String(next.agents?.defaults?.subagents?.maxConcurrent ?? 2),
      validate: (v) => (Number.isFinite(Number(v)) && Number(v) > 0 ? undefined : "Invalid"),
    });

    const fallbacks = (fallbacksRaw || "")
      .split(/[,\n]/g)
      .map((s) => s.trim())
      .filter(Boolean);

    next = {
      ...next,
      agents: {
        ...next.agents,
        defaults: {
          ...next.agents?.defaults,
          model: {
            ...next.agents?.defaults?.model,
            primary: primaryModel.trim(),
            ...(fallbacks.length ? { fallbacks } : {}),
          },
          thinkingDefault: thinkingDefault as any,
          maxConcurrent: Math.floor(Number(maxConcurrentStr)),
          subagents: {
            ...next.agents?.defaults?.subagents,
            maxConcurrent: Math.floor(Number(subMaxConcurrentStr)),
          },
        },
      },
    };
  }

  await writeConfigFile(next);
  logConfigUpdated(runtime);

  await prompter.outro("Saved. You can re-run Configure anytime from the UI.");
}

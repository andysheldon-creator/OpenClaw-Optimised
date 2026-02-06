/**
 * Webhook Channel Plugin
 *
 * A simplified webhook provider plugin for OpenClaw.
 *
 * NOTE: This plugin provides basic webhook infrastructure. Full bidirectional
 * WebSocket webhook functionality requires the standalone openclaw-webhook-bridge
 * service, which connects to OpenClaw Gateway via WebSocket/HTTP.
 *
 * See: https://github.com/sternelee/openclaw-webhook-bridge
 */

import type {
  ChannelOnboardingAdapter,
  OpenClawConfig,
  OpenClawPluginApi,
} from "openclaw/plugin-sdk";
import {
  DEFAULT_ACCOUNT_ID,
  type ChannelPlugin,
  formatDocsLink,
  type WizardPrompter,
} from "openclaw/plugin-sdk";

const channel = "webhook" as const;

const meta = {
  id: "webhook",
  label: "Webhook",
  selectionLabel: "Webhook (WebSocket)",
  detailLabel: "WebSocket",
  docsPath: "/channels/webhook",
  docsLabel: "webhook",
  blurb:
    "generic WebSocket webhook for connecting external services; requires openclaw-webhook-bridge.",
  systemImage: "arrow.up.arrow.down",
  selectionDocsPrefix: "Requires",
  selectionDocsOmitLabel: false,
  selectionExtras: ["https://github.com/sternelee/openclaw-webhook-bridge"],
  order: 100,
};

const webhookOnboardingAdapter: ChannelOnboardingAdapter = {
  channel,
  getStatus: async ({ cfg }) => {
    const configured = Boolean(cfg?.channels?.webhook?.url?.trim());
    const uid = cfg?.channels?.webhook?.uid?.trim();
    const statusLines = [
      `Webhook: ${configured ? "configured" : "needs WebSocket URL"}`,
      ...(configured && uid ? [`Instance UID: ${uid}`] : []),
    ];
    return {
      channel,
      configured,
      statusLines,
      selectionHint: configured ? "configured" : "needs setup",
      quickstartScore: 0,
    };
  },
  configure: async ({ cfg, prompter }: { cfg: OpenClawConfig; prompter: WizardPrompter }) => {
    const existing = cfg.channels?.webhook ?? {};
    const configured = Boolean(existing.url?.trim());

    if (!configured) {
      await prompter.note(
        [
          "Webhook channel connects to a WebSocket server for bidirectional messaging.",
          "",
          "This requires the standalone openclaw-webhook-bridge service or a compatible",
          "WebSocket server that implements the OpenClaw webhook protocol.",
          "",
          `Docs: ${formatDocsLink("/channels/webhook", "channels/webhook")}`,
          `Bridge: ${formatDocsLink("https://github.com/sternelee/openclaw-webhook-bridge", "openclaw-webhook-bridge")}`,
        ].join("\n"),
        "Webhook setup",
      );
    }

    // Prompt for WebSocket URL (required)
    const url = String(
      await prompter.text({
        message: "WebSocket URL",
        initialValue: existing.url ?? "",
        placeholder: "ws://localhost:8080/ws",
        validate: (value: string | undefined) => {
          const trimmed = String(value ?? "").trim();
          if (!trimmed) {
            return "WebSocket URL is required";
          }
          if (!/^wss?:\/\/./i.test(trimmed)) {
            return "Must be a valid WebSocket URL (ws:// or wss://)";
          }
          return undefined;
        },
      }),
    ).trim();

    // Prompt for optional UID (auto-generate if empty)
    const uidInput = String(
      await prompter.text({
        message: "Instance UID (optional, auto-generated if empty)",
        initialValue: existing.uid ?? "",
        placeholder: "Leave empty for auto-generated UID",
      }),
    ).trim();
    const uid = uidInput || crypto.randomUUID();

    // Prompt for Agent ID
    const agentId = String(
      await prompter.text({
        message: "Agent ID",
        initialValue: existing.agentId ?? "main",
        placeholder: "main",
        validate: (value: string | undefined) => (value?.trim() ? undefined : "Required"),
      }),
    ).trim();

    // Prompt for session scope
    const sessionScope = await prompter.select({
      message: "Session Scope",
      initialValue: existing.sessionScope ?? "per-sender",
      options: [
        { value: "per-sender", label: "per-sender (each message gets unique session)" },
        { value: "global", label: "global (all messages share one session)" },
        { value: "explicit", label: "explicit (use session field from message)" },
      ],
    });

    // Prompt for reconnect delay (advanced)
    const reconnectDelayMsInput = await prompter.text({
      message: "Reconnect Delay (ms, optional)",
      initialValue: String(existing.reconnectDelayMs ?? 1000),
      placeholder: "1000",
    });
    const reconnectDelayMs = reconnectDelayMsInput?.trim()
      ? Number.parseInt(String(reconnectDelayMsInput).trim(), 10)
      : undefined;

    // Prompt for max reconnect delay (advanced)
    const maxReconnectDelayMsInput = await prompter.text({
      message: "Max Reconnect Delay (ms, optional)",
      initialValue: String(existing.maxReconnectDelayMs ?? 30000),
      placeholder: "30000",
    });
    const maxReconnectDelayMs = maxReconnectDelayMsInput?.trim()
      ? Number.parseInt(String(maxReconnectDelayMsInput).trim(), 10)
      : undefined;

    // Show the UID if it was auto-generated
    const isNewUid = uidInput.trim() === "";
    if (isNewUid) {
      await prompter.note(
        [
          `Your Instance UID has been auto-generated:`,
          `  ${uid}`,
          ``,
          `Save this UID for reference when configuring the bridge service.`,
        ].join("\n"),
        "Instance UID",
      );
    }

    const next: OpenClawConfig = {
      ...cfg,
      channels: {
        ...cfg.channels,
        webhook: {
          ...existing,
          enabled: true,
          url,
          uid,
          agentId,
          sessionScope,
          ...(reconnectDelayMs && { reconnectDelayMs }),
          ...(maxReconnectDelayMs && { maxReconnectDelayMs }),
        },
      },
    };

    return { cfg: next, accountId: DEFAULT_ACCOUNT_ID };
  },
  disable: (cfg: OpenClawConfig) => {
    const webhookConfig = cfg.channels?.webhook ?? {};
    return {
      ...cfg,
      channels: {
        ...cfg.channels,
        webhook: { ...webhookConfig, enabled: false },
      },
    };
  },
};

export const webhookPlugin: ChannelPlugin = {
  id: "webhook",
  meta,
  onboarding: webhookOnboardingAdapter,
  capabilities: {
    chatTypes: ["direct"],
    polls: false,
    reactions: false,
    threads: false,
    media: false,
    nativeCommands: false,
  },
  config: {
    listAccountIds: () => [DEFAULT_ACCOUNT_ID],
    resolveAccount: ({ cfg }) => {
      const config = cfg?.channels?.webhook ?? {};
      return {
        accountId: DEFAULT_ACCOUNT_ID,
        enabled: config.enabled !== false,
        configured: Boolean(config.url?.trim()),
        name: `Webhook${config.url ? ` (${config.url})` : ""}`,
      };
    },
    defaultAccountId: () => DEFAULT_ACCOUNT_ID,
    isConfigured: (account: { configured: boolean }) => account.configured,
    describeAccount: (account: {
      accountId: string;
      name?: string;
      enabled: boolean;
      configured: boolean;
    }) => ({
      accountId: account.accountId,
      name: account.name ?? "",
      enabled: account.enabled,
      configured: account.configured,
    }),
  },
};

const plugin = {
  id: "webhook",
  name: "Webhook Channel",
  description: "Generic WebSocket webhook channel for connecting external services",
  register(api: OpenClawPluginApi) {
    api.registerChannel({ plugin: webhookPlugin });
  },
};

export default plugin;

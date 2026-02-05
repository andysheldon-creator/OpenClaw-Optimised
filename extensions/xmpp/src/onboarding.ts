/**
 * XMPP onboarding adapter for CLI setup wizard.
 */

import {
  addWildcardAllowFrom,
  formatDocsLink,
  promptChannelAccessConfig,
  type ChannelOnboardingAdapter,
  type ChannelOnboardingDmPolicy,
  type WizardPrompter,
} from "openclaw/plugin-sdk";
import type { CoreConfig, XmppConfig } from "./types.js";
import { getBareJid } from "./client.js";

const channel = "xmpp" as const;

/**
 * Set XMPP configuration
 */
function setXmppConfig(cfg: CoreConfig, updates: Partial<XmppConfig>): CoreConfig {
  const existing = cfg.channels?.xmpp ?? {};

  return {
    ...cfg,
    channels: {
      ...cfg.channels,
      xmpp: {
        ...existing,
        ...updates,
        enabled: true,
      },
    },
  };
}

/**
 * Set XMPP DM policy
 */
function setXmppDmPolicy(
  cfg: CoreConfig,
  policy: "pairing" | "open" | "allowlist" | "disabled",
): CoreConfig {
  const allowFrom =
    policy === "open" ? addWildcardAllowFrom(cfg.channels?.xmpp?.allowFrom) : undefined;

  return setXmppConfig(cfg, {
    dmPolicy: policy,
    ...(allowFrom ? { allowFrom } : {}),
  });
}

/**
 * Set XMPP group policy
 */
function setXmppGroupPolicy(
  cfg: CoreConfig,
  groupPolicy: "open" | "allowlist" | "disabled",
): CoreConfig {
  return setXmppConfig(cfg, { groupPolicy });
}

/**
 * Set XMPP MUC rooms configuration
 */
function setXmppMucRooms(cfg: CoreConfig, roomJids: string[]): CoreConfig {
  const mucRooms = Object.fromEntries(roomJids.map((jid) => [jid, { enabled: true }]));

  return setXmppConfig(cfg, {
    rooms: roomJids,
    mucRooms,
  });
}

/**
 * Note about XMPP setup
 */
async function noteXmppSetupHelp(prompter: WizardPrompter): Promise<void> {
  await prompter.note(
    [
      "XMPP requires a JID (Jabber ID) and password.",
      "1. Get an XMPP account from your server admin or public provider",
      "2. Choose connection type:",
      "   - WebSocket: wss://server/ws or wss://server/xmpp-websocket",
      "   - TCP: hostname (e.g., chat.example.com) or hostname:port (default port: 5222)",
      "3. You'll need: JID (e.g. bot@example.com), password, and server URL/hostname",
      "Env vars supported: XMPP_JID, XMPP_PASSWORD, XMPP_SERVER",
      `Docs: ${formatDocsLink("/channels/xmpp", "channels/xmpp")}`,
    ].join("\n"),
    "XMPP setup",
  );
}

/**
 * Prompt for XMPP JID
 */
async function promptJid(
  prompter: WizardPrompter,
  existing: XmppConfig | undefined,
  envJid: string | undefined,
): Promise<string> {
  const existingJid = existing?.jid ?? "";

  // If we have an existing JID and no env var, ask if we should keep it
  if (existingJid && !envJid) {
    const keepJid = await prompter.confirm({
      message: "XMPP JID already configured. Keep it?",
      initialValue: true,
    });
    if (keepJid) {
      return existingJid;
    }
  }

  return String(
    await prompter.text({
      message: "XMPP JID (Jabber ID)",
      placeholder: "bot@example.com",
      initialValue: envJid ?? existingJid,
      validate: (value) => {
        const raw = String(value ?? "").trim();
        if (!raw) {
          return "Required";
        }
        if (!raw.includes("@")) {
          return "JID must be in format user@server";
        }
        return undefined;
      },
    }),
  ).trim();
}

/**
 * Prompt for XMPP password
 */
async function promptPassword(
  prompter: WizardPrompter,
  existing: XmppConfig | undefined,
  envPassword: string | undefined,
): Promise<string> {
  const existingPassword = existing?.password ?? "";

  // If we have an existing password and no env var, ask if we should keep it
  if (existingPassword && !envPassword) {
    const keepPassword = await prompter.confirm({
      message: "XMPP password already configured. Keep it?",
      initialValue: true,
    });
    if (keepPassword) {
      return existingPassword;
    }
  }

  return String(
    await prompter.text({
      message: "XMPP password",
      initialValue: envPassword ?? (existingPassword ? "********" : ""),
      validate: (value) => {
        const raw = String(value ?? "").trim();
        if (!raw) {
          return "Required";
        }
        return undefined;
      },
    }),
  ).trim();
}

/**
 * Prompt for XMPP server (WebSocket URL or TCP hostname)
 */
async function promptServer(
  prompter: WizardPrompter,
  existing: XmppConfig | undefined,
  envServer: string | undefined,
): Promise<string> {
  const existingServer = existing?.server ?? "";

  return String(
    await prompter.text({
      message: "XMPP server (WebSocket URL or hostname for TCP)",
      placeholder: "wss://example.com/ws OR chat.example.com OR chat.example.com:5222",
      initialValue: envServer ?? existingServer,
      validate: (value) => {
        const raw = String(value ?? "").trim();
        if (!raw) {
          return "Required";
        }
        // Accept WebSocket URLs or hostnames (with optional port)
        const isWebSocket = raw.startsWith("wss://") || raw.startsWith("ws://");
        const isHostname =
          /^[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*(:[0-9]{1,5})?$/.test(
            raw,
          );

        if (!isWebSocket && !isHostname) {
          return "Must be a WebSocket URL (wss://...) or hostname (e.g., chat.example.com or chat.example.com:5222)";
        }
        return undefined;
      },
    }),
  ).trim();
}

/**
 * Prompt for XMPP resource (optional)
 */
async function promptResource(
  prompter: WizardPrompter,
  existing: XmppConfig | undefined,
): Promise<string | undefined> {
  const existingResource = existing?.resource ?? "openclaw";

  const resource = String(
    await prompter.text({
      message: "XMPP resource (optional, default: openclaw)",
      placeholder: "openclaw",
      initialValue: existingResource,
    }),
  ).trim();

  return resource || "openclaw";
}

/**
 * Prompt for MUC rooms to auto-join
 */
async function promptRooms(
  prompter: WizardPrompter,
  existing: XmppConfig | undefined,
): Promise<string[]> {
  const existingRooms = existing?.rooms ?? [];

  const roomsInput = String(
    await prompter.text({
      message: "MUC rooms to auto-join (comma-separated, optional)",
      placeholder: "room@conference.example.com, team@muc.example.com",
      initialValue: existingRooms.join(", "),
    }),
  ).trim();

  if (!roomsInput) {
    return [];
  }

  return roomsInput
    .split(/[,;\n]+/)
    .map((room) => room.trim())
    .filter(Boolean);
}

/**
 * Prompt for XMPP allowFrom (DM allowlist)
 */
async function promptXmppAllowFrom(params: {
  cfg: CoreConfig;
  prompter: WizardPrompter;
}): Promise<CoreConfig> {
  const { cfg, prompter } = params;
  const existing = cfg.channels?.xmpp;
  const existingAllowFrom = existing?.allowFrom ?? [];

  const entry = await prompter.text({
    message: "XMPP DM allowlist (bare JIDs: user@server, comma-separated)",
    placeholder: "admin@example.com, user@example.com",
    initialValue: existingAllowFrom[0] ? String(existingAllowFrom[0]) : undefined,
  });

  const allowFrom = String(entry ?? "")
    .split(/[,;\n]+/)
    .map((jid) => jid.trim())
    .filter(Boolean)
    .map((jid) => {
      // Normalize to bare JID
      try {
        return getBareJid(jid);
      } catch {
        return jid;
      }
    });

  const unique = [...new Set([...existingAllowFrom.map(String), ...allowFrom])];

  return setXmppConfig(cfg, {
    dmPolicy: "allowlist",
    allowFrom: unique,
  });
}

/**
 * Configure with env vars if available
 */
async function configureWithEnvVars(
  cfg: CoreConfig,
  prompter: WizardPrompter,
  existing: XmppConfig | undefined,
  envJid: string,
  envPassword: string,
  envServer: string,
  forceAllowFrom: boolean,
): Promise<{ cfg: CoreConfig } | null> {
  const useEnv = await prompter.confirm({
    message: "XMPP env vars detected (XMPP_JID, XMPP_PASSWORD, XMPP_SERVER). Use env values?",
    initialValue: true,
  });

  if (!useEnv) {
    return null;
  }

  const resource = await promptResource(prompter, existing);
  const rooms = await promptRooms(prompter, existing);

  const cfgWithAccount = setXmppConfig(cfg, {
    jid: envJid,
    password: envPassword,
    server: envServer,
    resource,
    rooms,
  });

  if (forceAllowFrom) {
    return { cfg: await promptXmppAllowFrom({ cfg: cfgWithAccount, prompter }) };
  }

  return { cfg: cfgWithAccount };
}

const dmPolicy: ChannelOnboardingDmPolicy = {
  label: "XMPP",
  channel,
  policyKey: "channels.xmpp.dmPolicy",
  allowFromKey: "channels.xmpp.allowFrom",
  getCurrent: (cfg) => (cfg as CoreConfig).channels?.xmpp?.dmPolicy ?? "pairing",
  setPolicy: (cfg, policy) => setXmppDmPolicy(cfg as CoreConfig, policy),
  promptAllowFrom: promptXmppAllowFrom,
};

export const xmppOnboardingAdapter: ChannelOnboardingAdapter = {
  channel,
  getStatus: async ({ cfg }) => {
    const existing = (cfg as CoreConfig).channels?.xmpp;
    const configured = Boolean(existing?.jid && existing?.password && existing?.server);

    return {
      channel,
      configured,
      statusLines: [
        `XMPP: ${configured ? "configured" : "needs JID, password, and server (WebSocket/TCP)"}`,
      ],
      selectionHint: configured ? "configured" : "needs setup",
    };
  },
  configure: async ({ cfg, prompter, forceAllowFrom }) => {
    let next = cfg as CoreConfig;
    const existing = next.channels?.xmpp;

    if (!existing?.jid || !existing?.password || !existing?.server) {
      await noteXmppSetupHelp(prompter);
    }

    const envJid = process.env.XMPP_JID?.trim();
    const envPassword = process.env.XMPP_PASSWORD?.trim();
    const envServer = process.env.XMPP_SERVER?.trim();
    const envReady = Boolean(envJid && envPassword && envServer);

    // Check if env vars are set and config is empty
    if (envReady && !existing?.jid && !existing?.password && !existing?.server) {
      const envResult = await configureWithEnvVars(
        next,
        prompter,
        existing,
        envJid!,
        envPassword!,
        envServer!,
        forceAllowFrom,
      );
      if (envResult) {
        return envResult;
      }
    }

    // Prompt for credentials
    const jid = await promptJid(prompter, existing, envJid);
    const password = await promptPassword(prompter, existing, envPassword);
    const server = await promptServer(prompter, existing, envServer);
    const resource = await promptResource(prompter, existing);
    const rooms = await promptRooms(prompter, existing);

    const cfgWithAccount = setXmppConfig(next, {
      jid,
      password,
      server,
      resource,
      rooms,
    });

    const cfgWithAllowFrom = forceAllowFrom
      ? await promptXmppAllowFrom({ cfg: cfgWithAccount, prompter })
      : cfgWithAccount;

    // DM policy (including "pairing" mode) is handled via dmPolicy adapter, not here

    // Prompt for group/MUC access control
    const groupAccessConfig = await promptChannelAccessConfig({
      prompter,
      label: "XMPP group chats (MUC)",
      currentPolicy: existing?.groupPolicy ?? "open",
      currentEntries: Object.keys(existing?.mucRooms ?? {}),
      placeholder: "room@conference.example.com",
      updatePrompt: Boolean(existing?.groupPolicy),
    });

    if (groupAccessConfig) {
      if (groupAccessConfig.policy !== "allowlist") {
        return { cfg: setXmppGroupPolicy(cfgWithAllowFrom, groupAccessConfig.policy) };
      } else {
        const cfgWithGroupPolicy = setXmppGroupPolicy(cfgWithAllowFrom, "allowlist");
        return { cfg: setXmppMucRooms(cfgWithGroupPolicy, groupAccessConfig.entries) };
      }
    }

    return { cfg: cfgWithAllowFrom };
  },
  dmPolicy,
  disable: (cfg) => ({
    ...(cfg as CoreConfig),
    channels: {
      ...(cfg as CoreConfig).channels,
      xmpp: { ...(cfg as CoreConfig).channels?.xmpp, enabled: false },
    },
  }),
};

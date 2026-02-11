import type {
  ChannelOnboardingAdapter,
  ChannelOnboardingDmPolicy,
  DmPolicy,
  OpenClawConfig,
  WizardPrompter,
} from "openclaw/plugin-sdk";
import {
  addWildcardAllowFrom,
  formatDocsLink,
  normalizeAccountId,
  promptAccountId,
} from "openclaw/plugin-sdk";
import { isValidGossipUserId, normalizeGossipUserId, startGossipBus } from "./gossip-bus.js";
import { getGossipRuntime } from "./runtime.js";
import { getGossipSessionsBaseDir } from "./storage.js";
import {
  listGossipAccountIds,
  resolveDefaultGossipAccountId,
  resolveGossipAccount,
} from "./types.js";

const channel = "gossip" as const;

export const DEFAULT_PROTOCOL_URL = "https://api.usegossip.com/api";
export const DEFAULT_USERNAME = "openclaw";

function setGossipDmPolicy(cfg: OpenClawConfig, dmPolicy: DmPolicy): OpenClawConfig {
  const base = (cfg.channels as Record<string, unknown> | undefined)?.gossip as
    | Record<string, unknown>
    | undefined;
  const allowFrom =
    dmPolicy === "open" ? addWildcardAllowFrom(base?.allowFrom as string[] | undefined) : undefined;
  return {
    ...cfg,
    channels: {
      ...cfg.channels,
      gossip: {
        ...base,
        dmPolicy,
        ...(allowFrom ? { allowFrom } : {}),
      },
    } as OpenClawConfig["channels"],
  };
}

function setGossipAllowFrom(cfg: OpenClawConfig, allowFrom: string[]): OpenClawConfig {
  const base = (cfg.channels as Record<string, unknown> | undefined)?.gossip as
    | Record<string, unknown>
    | undefined;
  return {
    ...cfg,
    channels: {
      ...cfg.channels,
      gossip: {
        ...base,
        allowFrom,
      },
    } as OpenClawConfig["channels"],
  };
}

function parseAllowFromInput(raw: string): string[] {
  return raw
    .split(/[\n,;]+/g)
    .map((entry) => normalizeGossipUserId(entry))
    .filter(Boolean);
}

async function promptGossipAllowFrom(params: {
  cfg: OpenClawConfig;
  prompter: WizardPrompter;
  accountId?: string;
}): Promise<OpenClawConfig> {
  const accountId = params.accountId ?? resolveDefaultGossipAccountId(params.cfg);
  const resolved = resolveGossipAccount({ cfg: params.cfg, accountId });
  const existing = (resolved.config.allowFrom ?? []).map(String);

  await params.prompter.note(
    [
      "Allowlist DMs by Gossip user ID (e.g. gossip1sw8cvs4vy6k...).",
      "You can also paste base64 IDs; they will be normalized to bech32.",
      "Leave blank to skip. Multiple IDs: comma-separated.",
      `Docs: ${formatDocsLink("/channels/gossip", "gossip")}`,
    ].join("\n"),
    "Gossip allowlist",
  );

  const entry = await params.prompter.text({
    message: "Gossip allowFrom (user IDs)",
    placeholder: "paste one or more Gossip user IDs",
    initialValue: existing[0] ?? undefined,
    validate: (value) => {
      const raw = String(value ?? "").trim();
      if (!raw) {
        return undefined;
      }
      const parts = parseAllowFromInput(raw);
      for (const part of parts) {
        if (part === "*") {
          continue;
        }
        if (!isValidGossipUserId(part)) {
          return `Invalid Gossip user ID: ${part}`;
        }
      }
      return undefined;
    },
  });

  const parts = parseAllowFromInput(String(entry ?? ""));
  const normalized = [...new Set(parts)];
  return setGossipAllowFrom(params.cfg, normalized);
}

const dmPolicy: ChannelOnboardingDmPolicy = {
  label: "Gossip",
  channel,
  policyKey: "channels.gossip.dmPolicy",
  allowFromKey: "channels.gossip.allowFrom",
  getCurrent: (cfg): DmPolicy => {
    const raw = (cfg.channels as Record<string, unknown> | undefined)?.gossip as
      | Record<string, unknown>
      | undefined;
    const p = raw?.dmPolicy;
    if (p === "pairing" || p === "allowlist" || p === "open" || p === "disabled") {
      return p;
    }
    return "pairing";
  },
  setPolicy: (cfg, policy) => setGossipDmPolicy(cfg, policy),
  promptAllowFrom: promptGossipAllowFrom,
};

async function noteGossipHelp(prompter: WizardPrompter): Promise<void> {
  await prompter.note(
    [
      "Gossip uses a mnemonic for identity. Leave mnemonic blank to auto-generate on first run.",
      "Username is your display name. Protocol URL defaults to the official Gossip API.",
      `Docs: ${formatDocsLink("/channels/gossip", "gossip")}`,
    ].join("\n"),
    "Gossip setup",
  );
}

function applyGossipConfig(params: {
  cfg: OpenClawConfig;
  accountId: string;
  input: {
    name?: string;
    username?: string;
    protocolUrl?: string;
    mnemonic?: string;
  };
}): OpenClawConfig {
  const { cfg, input } = params;
  const base = (cfg.channels as Record<string, unknown> | undefined)?.gossip as
    | Record<string, unknown>
    | undefined;

  const gossip = {
    ...base,
    enabled: true,
    ...(input.name !== undefined ? { name: input.name } : {}),
    ...(input.username !== undefined ? { username: input.username } : {}),
    ...(input.protocolUrl !== undefined ? { protocolUrl: input.protocolUrl } : {}),
    ...(input.mnemonic !== undefined ? { mnemonic: input.mnemonic } : {}),
  };

  return {
    ...cfg,
    channels: {
      ...cfg.channels,
      gossip,
    } as OpenClawConfig["channels"],
  };
}

export const gossipOnboardingAdapter: ChannelOnboardingAdapter = {
  channel,
  dmPolicy,

  getStatus: async ({ cfg }) => {
    const accountIds = listGossipAccountIds(cfg);
    const configured = accountIds.some(
      (id) => resolveGossipAccount({ cfg, accountId: id }).configured,
    );

    return {
      channel,
      configured,
      statusLines: [`Gossip: ${configured ? "configured" : "needs setup"}`],
      selectionHint: configured ? "configured" : "decentralized messenger",
      quickstartScore: configured ? 1 : 4,
    };
  },

  configure: async ({ cfg, prompter, accountOverrides, shouldPromptAccountIds }) => {
    const override = accountOverrides[channel]?.trim();
    const defaultAccountId = resolveDefaultGossipAccountId(cfg);
    let accountId = override ? normalizeAccountId(override) : defaultAccountId;

    if (shouldPromptAccountIds && !override) {
      accountId = await promptAccountId({
        cfg,
        prompter,
        label: "Gossip",
        currentId: accountId,
        listAccountIds: listGossipAccountIds,
        defaultAccountId,
      });
    }

    const resolved = resolveGossipAccount({ cfg, accountId });
    await noteGossipHelp(prompter);

    const username = await prompter.text({
      message: "Username (display name)",
      placeholder: DEFAULT_USERNAME,
      initialValue: resolved.username || undefined,
    });

    const protocolUrl = await prompter.text({
      message: "Protocol API URL (blank for default)",
      placeholder: DEFAULT_PROTOCOL_URL,
      initialValue:
        resolved.protocolUrl !== DEFAULT_PROTOCOL_URL ? resolved.protocolUrl : undefined,
    });

    const wantsMnemonic = await prompter.confirm({
      message: "Set an existing mnemonic? (blank = auto-generate on first run)",
      initialValue: Boolean(resolved.mnemonic?.trim()),
    });

    let mnemonic: string | undefined;
    if (wantsMnemonic) {
      const raw = await prompter.text({
        message: "BIP39 mnemonic (12/24 words)",
        placeholder: "word1 word2 ...",
        initialValue: resolved.mnemonic || undefined,
      });
      mnemonic = raw?.trim() || undefined;
    }

    const name = await prompter.text({
      message: "Account name (optional)",
      initialValue: resolved.name ?? undefined,
    });

    const next = applyGossipConfig({
      cfg,
      accountId,
      input: {
        name: name?.trim() || undefined,
        username: (username?.trim() || DEFAULT_USERNAME).trim(),
        protocolUrl: (protocolUrl?.trim() || DEFAULT_PROTOCOL_URL).trim(),
        mnemonic,
      },
    });

    // Start the bus briefly to obtain and display the Gossip user ID (saved to session.json).
    const gossipCfg = (next.channels as Record<string, unknown> | undefined)?.gossip as
      | { mnemonic?: string; username?: string; protocolUrl?: string }
      | undefined;
    const busMnemonic = gossipCfg?.mnemonic?.trim() || undefined;
    const busUsername = (gossipCfg?.username?.trim() || DEFAULT_USERNAME).trim();
    const busProtocolUrl = (gossipCfg?.protocolUrl?.trim() || DEFAULT_PROTOCOL_URL).trim();

    let onboardingLog: { debug?(message: string): void } | undefined;
    try {
      onboardingLog = getGossipRuntime().logging.getChildLogger({
        module: "gossip-onboarding",
      });
    } catch {
      // Runtime not set (unusual during onboarding)
    }
    const debug = (msg: string) => onboardingLog?.debug?.(msg);

    try {
      debug("gossip onboarding: starting bus to fetch userId");
      const bus = await startGossipBus({
        accountId,
        mnemonic: busMnemonic,
        username: busUsername,
        protocolUrl: busProtocolUrl,
        log: onboardingLog,
        onMessage: async () => {},
        onError: () => {},
      });
      const userId = bus.userId;
      debug(`gossip onboarding: got userId=${userId}`);
      await bus.close();
      debug("gossip onboarding: closed bus");

      const sessionPath = `${getGossipSessionsBaseDir()}/${accountId}/session.json`;
      await prompter.note(
        [
          `Your Gossip user ID (share this so others can message your bot):`,
          ``,
          userId,
          ``,
          `It is also saved in: ${sessionPath}`,
        ].join("\n"),
        "Gossip user ID",
      );
    } catch (err) {
      debug(`gossip onboarding: failed to fetch userId: ${String(err)}`);
      await prompter.note(
        [
          "Could not fetch your Gossip user ID now (e.g. network).",
          "After you start the gateway, your ID will appear in the logs and be saved in:",
          `${getGossipSessionsBaseDir()}/${accountId}/session.json`,
        ].join("\n"),
        "Gossip user ID",
      );
    }

    return { cfg: next, accountId };
  },
};

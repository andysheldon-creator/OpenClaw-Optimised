/**
 * XMTP Onboarding Adapter
 *
 * Provides the CLI onboarding wizard for configuring XMTP channel.
 * Follows the pattern established by Telegram, Discord, and Signal adapters.
 */

import { randomBytes } from "crypto";

import { createUser } from "@xmtp/agent-sdk/user";

import {
  DEFAULT_XMTP_ACCOUNT_ID,
  listXmtpAccountIds,
  normalizeXmtpAccountId,
  resolveDefaultXmtpAccountId,
  resolveXmtpAccount,
} from "./accounts.js";
import type { XmtpConfig, XmtpDmPolicy, XmtpEnv } from "./types.xmtp.js";

// ============================================================================
// Types
// ============================================================================

/**
 * Prompter interface (from clawdbot onboarding system).
 * Matches the @clack/prompts interface used by clawdbot.
 */
interface Prompter {
  text: (options: {
    message: string;
    placeholder?: string;
    initialValue?: string;
    validate?: (value: string | undefined) => string | undefined;
  }) => Promise<string | symbol>;
  confirm: (options: {
    message: string;
    initialValue?: boolean;
  }) => Promise<boolean | symbol>;
  select: <T>(options: {
    message: string;
    options: Array<{ value: T; label: string; hint?: string }>;
    initialValue?: T;
  }) => Promise<T | symbol>;
  note: (message: string, title?: string) => Promise<void>;
}

/**
 * Status result from getStatus.
 */
interface OnboardingStatus {
  provider: string;
  configured: boolean;
  statusLines: string[];
  selectionHint: string;
  quickstartScore: number;
}

/**
 * Configure result.
 */
interface ConfigureResult {
  cfg: Record<string, unknown>;
  accountId: string;
}

/**
 * DM policy adapter interface.
 */
interface DmPolicyAdapter {
  label: string;
  provider: string;
  policyKey: string;
  allowFromKey: string;
  getCurrent: (cfg: Record<string, unknown>) => XmtpDmPolicy;
  setPolicy: (cfg: Record<string, unknown>, policy: XmtpDmPolicy) => Record<string, unknown>;
}

/**
 * Onboarding adapter interface.
 */
export interface XmtpOnboardingAdapter {
  provider: string;
  getStatus: (params: {
    cfg: Record<string, unknown>;
    options?: Record<string, unknown>;
    accountOverrides?: Record<string, string>;
  }) => Promise<OnboardingStatus>;
  configure: (params: {
    cfg: Record<string, unknown>;
    prompter: Prompter;
    accountOverrides: Record<string, string>;
    shouldPromptAccountIds?: boolean;
    forceAllowFrom?: boolean;
    options?: Record<string, unknown>;
  }) => Promise<ConfigureResult>;
  dmPolicy: DmPolicyAdapter;
  disable: (cfg: Record<string, unknown>) => Record<string, unknown>;
}

// ============================================================================
// Wallet Generation
// ============================================================================

/**
 * Generated wallet result.
 */
export interface GeneratedWallet {
  /** Private key (0x-prefixed, 64 hex chars) */
  privateKey: `0x${string}`;
  /** Derived Ethereum address */
  address: string;
}

/**
 * Generate a new Ethereum wallet for XMTP bot.
 *
 * Uses cryptographically secure random bytes to generate a private key,
 * then derives the Ethereum address using the XMTP SDK.
 *
 * @returns Generated wallet with private key and address
 *
 * @example
 * ```typescript
 * const wallet = generateWallet();
 * console.log(`Address: ${wallet.address}`);
 * console.log(`Key: ${wallet.privateKey}`);
 * // Address: 0x1234...abcd
 * // Key: 0x...
 * ```
 */
export function generateWallet(): GeneratedWallet {
  // Generate 32 random bytes for private key
  const privateKeyBytes = randomBytes(32);
  const privateKey = `0x${privateKeyBytes.toString("hex")}` as `0x${string}`;

  // Derive address using XMTP SDK
  const user = createUser(privateKey);
  const address = user.account.address;

  return { privateKey, address };
}

/**
 * Derive Ethereum address from a private key.
 *
 * @param privateKey - 0x-prefixed private key
 * @returns Ethereum address or null if invalid
 */
export function deriveAddress(privateKey: string): string | null {
  if (!privateKey || !privateKey.startsWith("0x") || privateKey.length !== 66) {
    return null;
  }
  try {
    const user = createUser(privateKey as `0x${string}`);
    return user.account.address;
  } catch {
    return null;
  }
}

/**
 * Validate a wallet private key format.
 *
 * @param key - Potential private key
 * @returns Error message or undefined if valid
 */
function validateWalletKey(key: string | undefined): string | undefined {
  const trimmed = (key ?? "").trim();
  if (!trimmed) return "Required";
  if (!trimmed.startsWith("0x")) return "Must start with 0x";
  if (trimmed.length !== 66) return "Must be 64 hex characters (+ 0x prefix)";
  if (!/^0x[a-fA-F0-9]{64}$/.test(trimmed)) return "Must be valid hex characters";

  // Try to derive address to verify it's a valid key
  const address = deriveAddress(trimmed);
  if (!address) return "Invalid private key format";

  return undefined;
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Get XMTP config from flexible config object.
 */
function getXmtpConfig(cfg: Record<string, unknown>): XmtpConfig | undefined {
  const channels = cfg.channels as Record<string, unknown> | undefined;
  return channels?.xmtp as XmtpConfig | undefined;
}

/**
 * Add wildcard to allowFrom list for open policy.
 */
function addWildcardAllowFrom(existing: string[] | undefined): string[] {
  const current = existing ?? [];
  if (current.includes("*")) return current;
  return ["*", ...current];
}

/**
 * Prompt user for account ID selection.
 */
async function promptAccountId(params: {
  cfg: Record<string, unknown>;
  prompter: Prompter;
  label: string;
  currentId: string;
  listAccountIds: (cfg: Record<string, unknown>) => string[];
  defaultAccountId: string | null;
}): Promise<string> {
  const { cfg, prompter, label, currentId, listAccountIds, defaultAccountId } = params;
  const existingIds = listAccountIds(cfg);

  const options = [
    {
      value: DEFAULT_XMTP_ACCOUNT_ID,
      label: `default${currentId === DEFAULT_XMTP_ACCOUNT_ID ? " (current)" : ""}`,
      hint: "Main account",
    },
    ...existingIds
      .filter((id) => id !== DEFAULT_XMTP_ACCOUNT_ID)
      .map((id) => ({
        value: id,
        label: `${id}${id === currentId ? " (current)" : ""}`,
        hint: id === defaultAccountId ? "default" : undefined,
      })),
    { value: "__new__", label: "Create new account", hint: "Add another XMTP identity" },
  ];

  const selected = await prompter.select({
    message: `${label} account`,
    options,
    initialValue: currentId,
  });

  if (typeof selected === "symbol") {
    return currentId; // Cancelled
  }

  if (selected === "__new__") {
    const newId = await prompter.text({
      message: "New account name",
      placeholder: "work, personal, bot2",
      validate: (v) => {
        const trimmed = (v ?? "").trim();
        if (!trimmed) return "Required";
        if (trimmed === DEFAULT_XMTP_ACCOUNT_ID) return "Cannot use 'default' as account name";
        if (existingIds.includes(trimmed)) return "Account already exists";
        if (!/^[a-z0-9_-]+$/i.test(trimmed)) return "Use only letters, numbers, dashes, underscores";
        return undefined;
      },
    });
    return typeof newId === "symbol" ? currentId : String(newId).trim();
  }

  return selected;
}

/**
 * Display XMTP setup help note.
 */
async function noteXmtpSetupHelp(prompter: Prompter): Promise<void> {
  await prompter.note(
    [
      "XMTP is a decentralized messaging protocol for Ethereum wallets.",
      "",
      "Your bot needs an Ethereum wallet (private key) to send and receive messages.",
      "You can either:",
      "  1) Generate a new wallet (recommended for new bots)",
      "  2) Use an existing private key",
      "",
      "⚠️  Keep your private key secure! Anyone with access can control the bot.",
      "",
      "Docs: https://xmtp.org/docs",
    ].join("\n"),
    "XMTP Setup"
  );
}

/**
 * Prompt for allowFrom addresses.
 */
async function promptXmtpAllowFrom(params: {
  cfg: Record<string, unknown>;
  prompter: Prompter;
  accountId: string;
}): Promise<Record<string, unknown>> {
  const { cfg, prompter, accountId } = params;
  const resolved = resolveXmtpAccount({ cfg, accountId });
  const existingAllowFrom = resolved?.config.allowFrom ?? [];

  const entry = await prompter.text({
    message: "XMTP allowFrom (Ethereum address)",
    placeholder: "0x1234...5678",
    initialValue: existingAllowFrom[0] ? String(existingAllowFrom[0]) : undefined,
    validate: (value) => {
      const raw = String(value ?? "").trim();
      if (!raw) return "Required";
      if (!/^0x[a-fA-F0-9]{40}$/i.test(raw)) return "Use a valid Ethereum address (0x + 40 hex)";
      return undefined;
    },
  });

  if (typeof entry === "symbol") {
    return cfg; // Cancelled
  }

  const normalized = String(entry).trim().toLowerCase();
  const merged = [
    ...existingAllowFrom.map((item) => String(item).trim().toLowerCase()).filter(Boolean),
    normalized,
  ];
  const unique = [...new Set(merged)];

  if (accountId === DEFAULT_XMTP_ACCOUNT_ID) {
    return {
      ...cfg,
      channels: {
        ...(cfg.channels as Record<string, unknown>),
        xmtp: {
          ...getXmtpConfig(cfg),
          enabled: true,
          dmPolicy: "allowlist",
          allowFrom: unique,
        },
      },
    };
  }

  const xmtpCfg = getXmtpConfig(cfg);
  return {
    ...cfg,
    channels: {
      ...(cfg.channels as Record<string, unknown>),
      xmtp: {
        ...xmtpCfg,
        enabled: true,
        accounts: {
          ...xmtpCfg?.accounts,
          [accountId]: {
            ...xmtpCfg?.accounts?.[accountId],
            enabled: true,
            dmPolicy: "allowlist",
            allowFrom: unique,
          },
        },
      },
    },
  };
}

// ============================================================================
// DM Policy Helper
// ============================================================================

/**
 * Set XMTP DM policy in config.
 */
function setXmtpDmPolicy(
  cfg: Record<string, unknown>,
  dmPolicy: XmtpDmPolicy
): Record<string, unknown> {
  const xmtpCfg = getXmtpConfig(cfg);
  const allowFrom = dmPolicy === "open" ? addWildcardAllowFrom(xmtpCfg?.allowFrom) : undefined;

  return {
    ...cfg,
    channels: {
      ...(cfg.channels as Record<string, unknown>),
      xmtp: {
        ...xmtpCfg,
        dmPolicy,
        ...(allowFrom ? { allowFrom } : {}),
      },
    },
  };
}

// ============================================================================
// Onboarding Adapter
// ============================================================================

const provider = "xmtp";

const dmPolicyAdapter: DmPolicyAdapter = {
  label: "XMTP",
  provider,
  policyKey: "channels.xmtp.dmPolicy",
  allowFromKey: "channels.xmtp.allowFrom",
  getCurrent: (cfg) => {
    const xmtpCfg = getXmtpConfig(cfg);
    return (xmtpCfg?.dmPolicy ?? "pairing") as XmtpDmPolicy;
  },
  setPolicy: (cfg, policy) => setXmtpDmPolicy(cfg, policy),
};

/**
 * XMTP onboarding adapter for `clawdbot onboard` wizard.
 *
 * Provides interactive setup for:
 * - Wallet key configuration (generate new or use existing)
 * - Network selection (dev vs production)
 * - DM policy configuration (pairing, allowlist, open)
 * - AllowFrom addresses
 */
export const xmtpOnboardingAdapter: XmtpOnboardingAdapter = {
  provider,

  /**
   * Get current XMTP configuration status.
   */
  getStatus: async ({ cfg }) => {
    const configured = listXmtpAccountIds(cfg).some((accountId) =>
      Boolean(resolveXmtpAccount({ cfg, accountId })?.configured)
    );

    // Check for env var as well
    const hasEnvKey = Boolean(process.env.XMTP_WALLET_KEY?.trim());

    return {
      provider,
      configured: configured || hasEnvKey,
      statusLines: [
        `XMTP: ${configured || hasEnvKey ? "configured" : "needs wallet key"}`,
      ],
      selectionHint: configured || hasEnvKey
        ? "configured"
        : "decentralized · wallet-to-wallet messaging",
      quickstartScore: configured || hasEnvKey ? 2 : 3,
    };
  },

  /**
   * Run the XMTP configuration wizard.
   */
  configure: async ({
    cfg,
    prompter,
    accountOverrides,
    shouldPromptAccountIds,
    forceAllowFrom,
  }) => {
    const xmtpOverride = accountOverrides.xmtp?.trim();
    const defaultXmtpAccountId = resolveDefaultXmtpAccountId(cfg);
    let xmtpAccountId = xmtpOverride
      ? normalizeXmtpAccountId(xmtpOverride, cfg)
      : defaultXmtpAccountId ?? DEFAULT_XMTP_ACCOUNT_ID;

    // Prompt for account selection if multiple accounts or --all flag
    if (shouldPromptAccountIds && !xmtpOverride) {
      xmtpAccountId = await promptAccountId({
        cfg,
        prompter,
        label: "XMTP",
        currentId: xmtpAccountId,
        listAccountIds: listXmtpAccountIds,
        defaultAccountId: defaultXmtpAccountId,
      });
    }

    let next = cfg;
    const resolvedAccount = resolveXmtpAccount({ cfg: next, accountId: xmtpAccountId });
    const accountConfigured = Boolean(resolvedAccount?.configured);
    const allowEnv = xmtpAccountId === DEFAULT_XMTP_ACCOUNT_ID;
    const canUseEnv = allowEnv && Boolean(process.env.XMTP_WALLET_KEY?.trim());
    const hasConfigKey = Boolean(resolvedAccount?.walletKey);

    let walletKey: string | null = null;
    let walletAddress: string | null = null;

    // Show setup help if not configured
    if (!accountConfigured) {
      await noteXmtpSetupHelp(prompter);
    }

    // Handle wallet key configuration
    if (canUseEnv && !hasConfigKey) {
      const keepEnv = await prompter.confirm({
        message: "XMTP_WALLET_KEY detected in environment. Use env var?",
        initialValue: true,
      });

      if (keepEnv) {
        // Just enable, key comes from env
        const derivedAddress = deriveAddress(process.env.XMTP_WALLET_KEY ?? "");
        if (derivedAddress) {
          await prompter.note(`Using wallet from environment: ${derivedAddress}`, "XMTP");
        }
      } else {
        // Ask if they want to generate or enter
        const keySource = await prompter.select({
          message: "How would you like to configure the wallet?",
          options: [
            { value: "generate", label: "Generate new wallet", hint: "Recommended for new bots" },
            { value: "existing", label: "Enter existing private key", hint: "Use your own key" },
          ],
        });

        if (typeof keySource !== "symbol") {
          if (keySource === "generate") {
            const wallet = generateWallet();
            walletKey = wallet.privateKey;
            walletAddress = wallet.address;
            await prompter.note(
              [
                `Generated new wallet:`,
                `Address: ${walletAddress}`,
                ``,
                `⚠️  IMPORTANT: Save your private key securely!`,
                `The key will be stored in your clawdbot.json config.`,
                `Back it up if you need to recover this bot identity.`,
              ].join("\n"),
              "New Wallet"
            );
          } else {
            walletKey = String(
              await prompter.text({
                message: "Enter wallet private key",
                placeholder: "0x...",
                validate: validateWalletKey,
              })
            ).trim();
            if (walletKey && typeof walletKey !== "symbol") {
              walletAddress = deriveAddress(walletKey);
            }
          }
        }
      }
    } else if (hasConfigKey) {
      // Already configured
      const keep = await prompter.confirm({
        message: `XMTP wallet configured (${resolvedAccount?.walletAddress ?? "unknown"}). Keep it?`,
        initialValue: true,
      });

      if (!keep) {
        const keySource = await prompter.select({
          message: "How would you like to configure the wallet?",
          options: [
            { value: "generate", label: "Generate new wallet", hint: "Create fresh identity" },
            { value: "existing", label: "Enter existing private key", hint: "Use your own key" },
          ],
        });

        if (typeof keySource !== "symbol") {
          if (keySource === "generate") {
            const wallet = generateWallet();
            walletKey = wallet.privateKey;
            walletAddress = wallet.address;
            await prompter.note(
              [
                `Generated new wallet:`,
                `Address: ${walletAddress}`,
                ``,
                `⚠️  Your previous wallet will be replaced!`,
              ].join("\n"),
              "New Wallet"
            );
          } else {
            walletKey = String(
              await prompter.text({
                message: "Enter wallet private key",
                placeholder: "0x...",
                validate: validateWalletKey,
              })
            ).trim();
            if (walletKey && typeof walletKey !== "symbol") {
              walletAddress = deriveAddress(walletKey);
            }
          }
        }
      }
    } else {
      // No config, no env - need to configure
      const keySource = await prompter.select({
        message: "How would you like to configure the wallet?",
        options: [
          { value: "generate", label: "Generate new wallet", hint: "Recommended for new bots" },
          { value: "existing", label: "Enter existing private key", hint: "Use your own key" },
        ],
      });

      if (typeof keySource !== "symbol") {
        if (keySource === "generate") {
          const wallet = generateWallet();
          walletKey = wallet.privateKey;
          walletAddress = wallet.address;
          await prompter.note(
            [
              `Generated new wallet:`,
              `Address: ${walletAddress}`,
              ``,
              `⚠️  IMPORTANT: Save your private key securely!`,
              `The key will be stored in your clawdbot.json config.`,
            ].join("\n"),
            "New Wallet"
          );
        } else {
          walletKey = String(
            await prompter.text({
              message: "Enter wallet private key",
              placeholder: "0x...",
              validate: validateWalletKey,
            })
          ).trim();
          if (walletKey && typeof walletKey !== "symbol") {
            walletAddress = deriveAddress(walletKey);
          }
        }
      }
    }

    // Prompt for network selection
    const currentEnv = resolvedAccount?.env ?? "dev";
    const envChoice = await prompter.select<XmtpEnv>({
      message: "XMTP network",
      options: [
        {
          value: "dev" as XmtpEnv,
          label: "Development",
          hint: "Free, for testing (recommended to start)",
        },
        {
          value: "production" as XmtpEnv,
          label: "Production",
          hint: "Real network, costs apply",
        },
      ],
      initialValue: currentEnv as XmtpEnv,
    });

    const env: XmtpEnv = typeof envChoice === "symbol" ? currentEnv : envChoice;

    // Prompt for DM policy
    const currentPolicy = resolvedAccount?.config.dmPolicy ?? "pairing";
    const policyChoice = await prompter.select<XmtpDmPolicy>({
      message: "DM policy (who can message the bot?)",
      options: [
        {
          value: "pairing" as XmtpDmPolicy,
          label: "Pairing",
          hint: "Users request access, you approve (most secure)",
        },
        {
          value: "allowlist" as XmtpDmPolicy,
          label: "Allowlist",
          hint: "Only pre-approved addresses",
        },
        {
          value: "open" as XmtpDmPolicy,
          label: "Open",
          hint: "Anyone can message (not recommended)",
        },
      ],
      initialValue: currentPolicy as XmtpDmPolicy,
    });

    const dmPolicy: XmtpDmPolicy = typeof policyChoice === "symbol" ? currentPolicy : policyChoice;

    // Build updated config
    const xmtpCfg = getXmtpConfig(next);

    if (xmtpAccountId === DEFAULT_XMTP_ACCOUNT_ID) {
      next = {
        ...next,
        channels: {
          ...(next.channels as Record<string, unknown>),
          xmtp: {
            ...xmtpCfg,
            enabled: true,
            ...(walletKey ? { walletKey } : {}),
            env,
            dmPolicy,
          },
        },
      };
    } else {
      next = {
        ...next,
        channels: {
          ...(next.channels as Record<string, unknown>),
          xmtp: {
            ...xmtpCfg,
            enabled: true,
            accounts: {
              ...xmtpCfg?.accounts,
              [xmtpAccountId]: {
                ...xmtpCfg?.accounts?.[xmtpAccountId],
                enabled: true,
                ...(walletKey ? { walletKey } : {}),
                env,
                dmPolicy,
              },
            },
          },
        },
      };
    }

    // Prompt for allowFrom only if allowlist mode (pairing doesn't need it)
    if (dmPolicy === "allowlist") {
      next = await promptXmtpAllowFrom({
        cfg: next,
        prompter,
        accountId: xmtpAccountId,
      });
    }

    // Show final config note
    const finalAddress = walletAddress ?? resolvedAccount?.walletAddress;
    await prompter.note(
      [
        `XMTP configured successfully!`,
        ``,
        `Wallet: ${finalAddress ?? "(from env)"}`,
        `Network: ${env}`,
        `DM Policy: ${dmPolicy}`,
        ``,
        `Start with: clawdbot gateway start`,
        ``,
        env === "dev"
          ? "💡 Dev network is free for testing. Switch to production when ready."
          : "⚠️  Production network has costs. See XMTP pricing for details.",
      ].join("\n"),
      "XMTP Setup Complete"
    );

    return { cfg: next, accountId: xmtpAccountId };
  },

  dmPolicy: dmPolicyAdapter,

  /**
   * Disable XMTP channel.
   */
  disable: (cfg) => {
    const xmtpCfg = getXmtpConfig(cfg);
    return {
      ...cfg,
      channels: {
        ...(cfg.channels as Record<string, unknown>),
        xmtp: {
          ...xmtpCfg,
          enabled: false,
        },
      },
    };
  },
};

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { Agent } from "@xmtp/agent-sdk";
import { createSigner, createUser } from "@xmtp/agent-sdk/user";
import { ContentTypeReaction, type Reaction } from "@xmtp/content-type-reaction";
import { ContentTypeReply, type Reply } from "@xmtp/content-type-reply";
import { ContentTypeText } from "@xmtp/content-type-text";
import type { ChannelPlugin } from "clawdbot/plugin-sdk";
import {
  buildChannelConfigSchema,
  DEFAULT_ACCOUNT_ID,
  formatPairingApproveHint,
} from "clawdbot/plugin-sdk";

import {
  DEFAULT_XMTP_ACCOUNT_ID,
  getAccountIdByAddress,
  isXmtpAccountEnabled,
  listXmtpAccountIds,
  normalizeXmtpAccountId,
  resolveDefaultXmtpAccountId,
  resolveXmtpAccount,
  validateMultiAccountConfig,
} from "./accounts.js";
import { XmtpSendError } from "./errors.js";
import { xmtpOnboardingAdapter } from "./onboarding.js";
import { createLogger } from "./logger.js";
import { getXmtpRuntime } from "./runtime.js";
import { XmtpChannelConfigSchema } from "./schemas.xmtp.js";
import type {
  ResolvedXmtpAccount,
  XmtpAccountSnapshot,
  XmtpActionResult,
  XmtpAuthorizationResult,
  XmtpChannelSummary,
  XmtpConfig,
  XmtpDmPolicy,
  XmtpEnv,
  XmtpInboundContext,
  XmtpPluginCapabilities,
  XmtpPluginMeta,
  XmtpReactParams,
  XmtpRuntimeState,
  XmtpStatusIssue,
} from "./types.xmtp.js";

// Store active agent handles per account
const activeAgents = new Map<string, Agent>();

// Re-export for external consumers
export {
  DEFAULT_XMTP_ACCOUNT_ID,
  getAccountIdByAddress,
  isXmtpAccountEnabled,
  listXmtpAccountIds,
  normalizeXmtpAccountId,
  resolveDefaultXmtpAccountId,
  resolveXmtpAccount,
  validateMultiAccountConfig,
};

/**
 * Detect if an error is due to corrupted session history (orphaned tool_result blocks).
 * This happens when the conversation history has tool_result messages without matching
 * tool_use messages in the previous assistant turn.
 */
function isCorruptedSessionError(error: unknown): boolean {
  const message = String(error);
  // Match errors like: "unexpected 'tool_use_id' found in 'tool_result' blocks"
  // or "each tool_result block must have a corresponding tool_use block"
  return (
    message.includes("tool_result") &&
    (message.includes("tool_use") || message.includes("tool_use_id")) &&
    (message.includes("unexpected") || message.includes("corresponding") || message.includes("must have"))
  );
}

/**
 * Clear a corrupted session by deleting the session file and resetting the session entry.
 * Returns true if the session was successfully cleared.
 */
async function clearCorruptedSession(params: {
  sessionKey: string;
  log?: { info: (msg: string) => void; warn: (msg: string) => void };
}): Promise<boolean> {
  const { sessionKey, log } = params;

  try {
    // @ts-ignore - accessing internal clawdbot modules
    const clawdbotPath = "/opt/homebrew/lib/node_modules/clawdbot/dist";
    const { loadSessionStore, updateSessionStore } = await import(`${clawdbotPath}/config/sessions/store.js`);
    const { resolveStorePath } = await import(`${clawdbotPath}/config/sessions.js`);
    const { loadConfig } = await import(`${clawdbotPath}/config/config.js`);

    const cfg = loadConfig();
    const storePath = resolveStorePath(cfg.session?.store, {});
    const store = loadSessionStore(storePath);
    const sessionEntry = store[sessionKey];

    if (!sessionEntry) {
      log?.warn(`Session not found for key: ${sessionKey}`);
      return false;
    }

    // Delete the session transcript file if it exists
    const sessionFile = sessionEntry.sessionFile;
    if (sessionFile && fs.existsSync(sessionFile)) {
      fs.unlinkSync(sessionFile);
      log?.info(`Deleted corrupted session file: ${sessionFile}`);
    }

    // Reset the session entry with a new session ID
    await updateSessionStore(storePath, (s: Record<string, any>) => {
      const entry = s[sessionKey];
      if (entry) {
        entry.sessionId = crypto.randomUUID();
        entry.sessionFile = undefined; // Will be regenerated
        entry.updatedAt = Date.now();
        entry.systemSent = false;
        entry.compactionCount = 0;
        entry.abortedLastRun = false;
      }
    });

    log?.info(`Reset session entry for key: ${sessionKey}`);
    return true;
  } catch (err) {
    log?.warn(`Failed to clear corrupted session: ${String(err)}`);
    return false;
  }
}

// Re-export types for consumers
export type { ResolvedXmtpAccount } from "./types.xmtp.js";

/**
 * Plugin metadata for XMTP channel.
 */
const xmtpMeta: XmtpPluginMeta = {
  id: "xmtp",
  label: "XMTP",
  selectionLabel: "XMTP (Decentralized Messaging)",
  docsPath: "/channels/xmtp",
  docsLabel: "xmtp",
  blurb: "Decentralized messaging via XMTP protocol",
  order: 110,
};

/**
 * Plugin capabilities for XMTP channel.
 */
const xmtpCapabilities: XmtpPluginCapabilities = {
  chatTypes: ["direct", "group"],
  reactions: true,
  media: true,
};

// Cast to any to allow additional plugin properties (actions, directory)
// not yet typed in ChannelPlugin interface
export const xmtpPlugin: ChannelPlugin<ResolvedXmtpAccount> & Record<string, unknown> = {
  id: "xmtp",
  meta: {
    ...xmtpMeta,
    quickstartAllowFrom: true,
  },
  capabilities: xmtpCapabilities,
  reload: { configPrefixes: ["channels.xmtp"] },
  configSchema: buildChannelConfigSchema(XmtpChannelConfigSchema),
  onboarding: xmtpOnboardingAdapter,

  config: {
    listAccountIds: (cfg) => listXmtpAccountIds(cfg),
    resolveAccount: (cfg, accountId) => {
      const account = resolveXmtpAccount({ cfg, accountId });
      // Return null-safe account (plugin SDK expects non-null or throw)
      if (!account) {
        // Return a default unconfigured account
        return {
          accountId: accountId ?? DEFAULT_ACCOUNT_ID,
          name: null,
          enabled: false,
          configured: false,
          walletKey: null,
          walletAddress: null,
          env: "dev" as XmtpEnv,
          dbPath: ".xmtp/db",
          encryptionKey: null,
          config: {
            dmPolicy: "pairing" as XmtpDmPolicy,
            allowFrom: [],
          },
        };
      }
      return account;
    },
    defaultAccountId: (cfg) => resolveDefaultXmtpAccountId(cfg) ?? DEFAULT_ACCOUNT_ID,
    isConfigured: (account) => account.configured,
    describeAccount: (account) => ({
      accountId: account.accountId,
      name: account.name,
      enabled: account.enabled,
      configured: account.configured,
      walletAddress: account.walletAddress,
      env: account.env,
    }),
    resolveAllowFrom: ({ cfg, accountId }) => {
      const account = resolveXmtpAccount({ cfg, accountId });
      return (account?.config.allowFrom ?? []).map((entry) => String(entry));
    },
    formatAllowFrom: ({ allowFrom }) =>
      (allowFrom ?? [])
        .map((entry) => String(entry).trim().toLowerCase())
        .filter(Boolean),
  },

  pairing: {
    idLabel: "xmtpAddress",
    normalizeAllowEntry: (entry) => entry.toLowerCase().replace(/^xmtp:/i, ""),
    notifyApproval: async (params) => {
      const { id } = params;
      // Use first available running agent for notifications
      // (pairing notifications don't have account context in current SDK)
      let agent: Agent | undefined;
      for (const [, runningAgent] of activeAgents) {
        agent = runningAgent;
        break;
      }
      
      if (agent) {
        const dm = await agent.createDmWithAddress(id as `0x${string}`);
        await dm.send("Your pairing request has been approved!");
      }
    },
  },

  security: {
    resolveDmPolicy: ({ account }) => ({
      policy: account.config.dmPolicy ?? "pairing",
      allowFrom: account.config.allowFrom ?? [],
      policyPath: "channels.xmtp.dmPolicy",
      allowFromPath: "channels.xmtp.allowFrom",
      approveHint: formatPairingApproveHint("xmtp"),
      normalizeEntry: (raw) => raw.toLowerCase().replace(/^xmtp:/i, "").trim(),
    }),
  },

  messaging: {
    normalizeTarget: (target) => target.toLowerCase().replace(/^xmtp:/i, ""),
    targetResolver: {
      looksLikeId: (input) => {
        // Strip xmtp: prefix if present before checking
        const trimmed = input.trim().replace(/^xmtp:/i, "");
        // Accept ethereum addresses (0x + 40 hex) or conversation IDs (32+ hex chars)
        return /^0x[a-fA-F0-9]{40}$/i.test(trimmed) || /^[a-fA-F0-9]{32,}$/i.test(trimmed);
      },
      hint: "<0x... ethereum address or conversation id>",
    },
  },

  outbound: {
    deliveryMode: "direct",
    textChunkLimit: 4000,
    sendText: async (params: { to: string; text: string; accountId?: string; replyToId?: string }) => {
      const { to, text, accountId, replyToId } = params;
      const runtime = getXmtpRuntime();
      const aid = accountId ?? DEFAULT_XMTP_ACCOUNT_ID;
      const agent = activeAgents.get(aid);
      if (!agent) {
        throw new Error(`XMTP agent not running for account ${aid}`);
      }
      const tableMode = runtime.channel.text.resolveMarkdownTableMode({
        cfg: runtime.config.loadConfig(),
        channel: "xmtp",
        accountId: aid,
      });
      const message = runtime.channel.text.convertMarkdownTables(
        text ?? "",
        tableMode
      );
      
      // Resolve ENS names to addresses
      let targetAddress = to.toLowerCase();
      
      // Import ENS utilities dynamically
      const { isEnsName, resolveEnsName } = await import("./ens.js");
      
      if (isEnsName(targetAddress)) {
        const resolved = await resolveEnsName(targetAddress);
        if (!resolved) {
          throw new XmtpSendError({
            message: `Failed to resolve ENS name: ${targetAddress}. Check that the ENS name is registered and has an address set. Try using the raw Ethereum address instead.`,
            code: "PROTOCOL_SEND_FAILED",
            retryable: false,
            context: {
              ensName: targetAddress,
            }
          });
        }
        targetAddress = resolved.toLowerCase();
      }
      
      const normalizedTo = targetAddress as `0x${string}`;
      const dm = await agent.createDmWithAddress(normalizedTo);

      // Send as reply if replyToId is provided
      if (replyToId) {
        const replyContent: Reply = {
          reference: replyToId,
          content: message,
          contentType: ContentTypeText,
        };
        await dm.send(replyContent, ContentTypeReply);
      } else {
        await dm.send(message);
      }

      return { channel: "xmtp", to: normalizedTo };
    },
  },

  // Actions implementation - reactions and ENS resolution support
  actions: {
    /** List available actions for XMTP channel */
    listActions: (): string[] => ["react", "ens"],

    /** Handle an action request */
    handleAction: async (args: {
      action: string;
      params: Record<string, unknown>;
      accountId?: string;
    }): Promise<XmtpActionResult> => {
      const { action, params, accountId } = args;
      const aid = accountId ?? DEFAULT_XMTP_ACCOUNT_ID;
      const agent = activeAgents.get(aid);
      if (!agent) {
        throw new Error(`XMTP agent not running for account ${aid}`);
      }

      /**
       * Format tool results in the expected clawdbot format.
       */
      const jsonResult = (payload: Record<string, unknown>): XmtpActionResult => ({
        content: [
          {
            type: "text",
            text: JSON.stringify(payload, null, 2),
          },
        ],
        details: payload,
      });

      if (action === "react") {
        // Log all incoming params for debugging
        console.log(`[XMTP:REACT] handleAction 'react' called with params: ${JSON.stringify(params, null, 2)}`);
        console.log(`[XMTP:REACT] Full args object: action=${action}, accountId=${accountId}, aid=${aid}`);

        // Parse params with type safety
        const reactParams = params as XmtpReactParams;

        // Validate required params - normalize by stripping xmtp: prefix if present
        const rawConversationId = reactParams.conversationId || reactParams.to;
        const conversationId = rawConversationId?.replace(/^xmtp:/i, "");
        const messageId = reactParams.messageId;
        const emoji = reactParams.emoji || "👍";
        const remove = reactParams.remove === true;
        // senderInboxId is required for group messages to identify whose message is being reacted to
        const senderInboxId = reactParams.senderInboxId;

        console.log(`[XMTP:REACT] Resolved params: rawConversationId=${rawConversationId}, conversationId=${conversationId}, messageId=${messageId}, emoji=${emoji}, remove=${remove}, senderInboxId=${senderInboxId}`);

        if (!conversationId) {
          console.error(`[XMTP:REACT] Missing conversationId. params.conversationId=${params?.conversationId}, params.to=${params?.to}`);
          throw new Error("Missing required param: conversationId or to");
        }
        if (!messageId) {
          console.error(`[XMTP:REACT] Missing messageId. params.messageId=${params?.messageId}`);
          throw new Error("Missing required param: messageId");
        }

        // Get conversation context
        console.log(`[XMTP:REACT] Looking up conversation: ${conversationId}`);
        const conversationCtx = await agent.getConversationContext(conversationId);
        console.log(`[XMTP:REACT] Conversation lookup result: ${conversationCtx ? 'found' : 'NOT FOUND'}`);
        if (conversationCtx) {
          console.log(`[XMTP:REACT] Conversation details: id=${conversationCtx.conversation?.id}, type=${typeof conversationCtx.conversation}`);
        }
        if (!conversationCtx) {
          console.error(`[XMTP:REACT] Conversation not found: ${conversationId}`);
          throw new Error(`Conversation not found: ${conversationId}`);
        }

        // Build reaction payload
        const reaction: Reaction = {
          reference: messageId,
          action: remove ? "removed" : "added",
          content: emoji,
          schema: "unicode",
          // Required for group messages - identifies the sender of the message being reacted to
          ...(senderInboxId && { referenceInboxId: senderInboxId }),
        };

        console.log(`[XMTP:REACT] Sending reaction payload: ${JSON.stringify(reaction)}`);
        console.log(`[XMTP:REACT] ContentTypeReaction: ${JSON.stringify(ContentTypeReaction)}`);

        // Send reaction through the conversation
        try {
          await conversationCtx.conversation.send(reaction, ContentTypeReaction);
          console.log(`[XMTP:REACT] Reaction sent successfully: ${emoji} on message ${messageId}`);
        } catch (sendError) {
          console.error(`[XMTP:REACT] Failed to send reaction: ${String(sendError)}`);
          console.error(`[XMTP:REACT] Send error stack: ${(sendError as Error)?.stack}`);
          throw sendError;
        }

        // Return result in the expected clawdbot jsonResult format
        return jsonResult({
          ok: true,
          action: reaction.action,
          emoji,
          messageId,
        });
      }

      if (action === "ens") {
        // Import ENS utilities
        const { resolveEnsName, isEnsName } = await import("./ens.js");

        const ensName = params.name as string;
        if (!ensName) {
          throw new Error("Missing required param: name");
        }

        if (!isEnsName(ensName)) {
          return jsonResult({
            ok: false,
            error: "invalid_ens_name",
            message: `Not a valid ENS name: ${ensName}`,
            ensName,
          });
        }

        const address = await resolveEnsName(ensName);

        if (!address) {
          return jsonResult({
            ok: false,
            error: "resolution_failed",
            message: `Failed to resolve ENS name: ${ensName}`,
            ensName,
          });
        }

        return jsonResult({
          ok: true,
          ensName,
          address,
        });
      }

      throw new Error(`Unknown action: ${action}`);
    },
  },

  // Directory implementation - list peers and groups
  directory: {
    self: async (args: { cfg: unknown; accountId?: string }) => {
      const { cfg, accountId } = args;
      const account = resolveXmtpAccount({ cfg: cfg as Record<string, unknown>, accountId });
      return {
        kind: "user" as const,
        id: account?.walletAddress ?? "",
        name: account?.name || account?.walletAddress || "Unknown",
      };
    },

    listPeers: async (args: { accountId?: string; query?: string; limit?: number }) => {
      const { accountId, query, limit } = args;
      const aid = accountId ?? DEFAULT_XMTP_ACCOUNT_ID;
      const agent = activeAgents.get(aid);
      if (!agent) {
        return [];
      }

      try {
        // Sync conversations first to get the latest
        await agent.client.conversations.sync();

        // List all DM conversations
        const dms = agent.client.conversations.listDms();

        // Map DMs to peer entries
        const peers = await Promise.all(
          dms.map(async (dm) => {
            // Get peer inbox ID and try to get their address
            const peerInboxId = dm.peerInboxId;
            // Try to get members to find the peer address
            let peerAddress = peerInboxId; // fallback to inbox ID
            try {
              const members = await dm.members();
              const peerMember = members.find(
                (m) => m.inboxId !== agent.client.inboxId
              );
              // GroupMember has identifiers array, not addresses
              if (peerMember && (peerMember as any).identifiers?.[0]?.identifier) {
                peerAddress = (peerMember as any).identifiers[0].identifier;
              }
            } catch {
              // Ignore member lookup errors
            }

            return {
              kind: "user" as const,
              id: peerAddress,
              name: peerAddress,
            };
          })
        );

        // Apply query filter if provided
        let result = peers;
        if (query) {
          const q = query.toLowerCase();
          result = peers.filter(
            (p) => p.id.toLowerCase().includes(q) || p.name.toLowerCase().includes(q)
          );
        }

        // Apply limit
        return result.slice(0, limit || 50);
      } catch {
        // Ignore errors, return empty list
        return [];
      }
    },

    listGroups: async (args: { accountId?: string; query?: string; limit?: number }) => {
      const { accountId, query, limit } = args;
      const aid = accountId ?? DEFAULT_XMTP_ACCOUNT_ID;
      const agent = activeAgents.get(aid);
      if (!agent) {
        return [];
      }

      try {
        // Sync conversations first to get the latest
        await agent.client.conversations.sync();

        // List all group conversations
        const groups = agent.client.conversations.listGroups();

        // Map groups to directory entries
        const groupEntries = groups.map((group) => ({
          kind: "group" as const,
          id: group.id,
          name: group.name || group.id,
        }));

        // Apply query filter if provided
        let result = groupEntries;
        if (query) {
          const q = query.toLowerCase();
          result = groupEntries.filter(
            (g) => g.id.toLowerCase().includes(q) || g.name.toLowerCase().includes(q)
          );
        }

        // Apply limit
        return result.slice(0, limit || 50);
      } catch {
        // Ignore errors, return empty list
        return [];
      }
    },
  },

  status: {
    /** Default runtime state for new accounts */
    defaultRuntime: {
      accountId: DEFAULT_XMTP_ACCOUNT_ID,
      running: false,
      lastStartAt: null,
      lastStopAt: null,
      lastError: null,
    },

    /** Collect status issues from accounts for alerting */
    collectStatusIssues: (accounts) =>
      accounts.flatMap((account) => {
        const lastError =
          typeof account.lastError === "string" ? account.lastError.trim() : "";
        if (!lastError) return [];
        return [
          {
            channel: "xmtp" as const,
            accountId: String(account.accountId),
            kind: "runtime" as const,
            message: `Channel error: ${lastError}`,
          },
        ];
      }),

    /** Build channel-level status summary */
    buildChannelSummary: ({ snapshot }) => ({
      configured: Boolean(snapshot.configured),
      walletAddress: (snapshot.walletAddress as string) ?? null,
      env: ((snapshot.env as string) ?? "dev") as XmtpEnv,
      running: Boolean(snapshot.running),
      lastStartAt: (snapshot.lastStartAt as number) ?? null,
      lastStopAt: (snapshot.lastStopAt as number) ?? null,
      lastError: (snapshot.lastError as string) ?? null,
    }),

    /** Build per-account status snapshot */
    buildAccountSnapshot: ({ account, runtime }) => ({
      accountId: account.accountId,
      name: account.name,
      enabled: account.enabled,
      configured: account.configured,
      walletAddress: account.walletAddress,
      env: account.env,
      running: Boolean(runtime?.running),
      lastStartAt: (runtime?.lastStartAt as number) ?? null,
      lastStopAt: (runtime?.lastStopAt as number) ?? null,
      lastError: (runtime?.lastError as string) ?? null,
      lastInboundAt: (runtime?.lastInboundAt as number) ?? null,
      lastOutboundAt: (runtime?.lastOutboundAt as number) ?? null,
    }),
  },

  gateway: {
    startAccount: async (ctx) => {
      const account = ctx.account;
      ctx.setStatus({
        accountId: account.accountId,
        walletAddress: account.walletAddress,
        env: account.env,
      });
      ctx.log?.info(
        `[${account.accountId}] starting XMTP provider (address: ${account.walletAddress}, env: ${account.env})`
      );

      if (!account.configured || !account.walletKey) {
        throw new Error(
          "XMTP wallet key not configured. Set XMTP_WALLET_KEY or configure in clawdbot.json"
        );
      }

      const runtime = getXmtpRuntime();

      // Create signer from wallet key (must be 0x-prefixed hex string)
      const walletKey = account.walletKey as `0x${string}`;
      const user = createUser(walletKey);
      const signer = createSigner(user);

      // Ensure db directory exists (separate per network to avoid conflicts)
      const dbDirectory = path.join(account.dbPath, account.env);
      fs.mkdirSync(dbDirectory, { recursive: true, mode: 0o700 });
      ctx.log?.info(`[${account.accountId}] Database directory: ${dbDirectory}`);

      // Initialize agent with proper dbPath function
      // The dbPath should be a function that returns the full path including the db filename
      const agent = await Agent.create(signer, {
        env: account.env,
        dbPath: (inboxId: string) => {
          const fullPath = path.join(dbDirectory, `xmtp-${inboxId}.db3`);
          ctx.log?.info(`[${account.accountId}] Using database: ${fullPath}`);
          return fullPath;
        },
        dbEncryptionKey: account.encryptionKey
          ? (account.encryptionKey as `0x${string}`)
          : undefined,
      });

      // Check and ensure registration
      const client = agent.client;
      ctx.log?.info(
        `[${account.accountId}] XMTP client created, inbox ID: ${client.inboxId}, isRegistered: ${client.isRegistered}`
      );

      // Explicitly register if not already registered
      if (!client.isRegistered) {
        ctx.log?.info(`[${account.accountId}] Registering XMTP identity...`);
        await client.register();
        ctx.log?.info(`[${account.accountId}] XMTP identity registered successfully`);
      } else {
        ctx.log?.info(`[${account.accountId}] XMTP identity already registered`);
      }

      /**
       * Check if a sender is authorized to message this bot.
       * Returns authorization status and command permission.
       */
      const checkSenderAuthorization = async (
        senderAddress: string
      ): Promise<XmtpAuthorizationResult> => {
        const normalizedSender = senderAddress.toLowerCase();
        const dmPolicy = account.config.dmPolicy;
        const allowFrom = (account.config.allowFrom ?? []).map(a => a.toLowerCase());

        // Check if sender is explicitly in config allowlist
        const isInConfigAllowlist = allowFrom.length > 0 &&
          allowFrom.some(allowed =>
            allowed === normalizedSender ||
            allowed === `xmtp:${normalizedSender}`
          );

        // Check if sender is in the pairing store (approved pairings)
        // @ts-ignore
        const clawdbotPath = "/opt/homebrew/lib/node_modules/clawdbot/dist";
        const { readChannelAllowFromStore } = await import(`${clawdbotPath}/pairing/pairing-store.js`);
        const storeAllowFrom = await readChannelAllowFromStore("xmtp") ?? [];
        const isInPairingStore = storeAllowFrom.some((entry: string) =>
          entry.toLowerCase() === normalizedSender
        );

        const isAuthorized = isInConfigAllowlist || isInPairingStore;

        if (dmPolicy === "open") {
          // Open policy: anyone can message, but only authorized users can run commands
          return {
            allowed: true,
            commandAuthorized: isAuthorized
          };
        }

        if (dmPolicy === "allowlist") {
          // Allowlist policy: only config allowlist users can message (no pairing)
          if (!isInConfigAllowlist) {
            return {
              allowed: false,
              commandAuthorized: false,
              reason: "not_in_allowlist"
            };
          }
          return { allowed: true, commandAuthorized: true };
        }

        if (dmPolicy === "pairing") {
          // Pairing policy: config allowlist OR approved pairings can message
          if (isAuthorized) {
            return { allowed: true, commandAuthorized: true };
          }

          // Not authorized - will need to handle pairing
          return {
            allowed: false,
            commandAuthorized: false,
            reason: "needs_pairing"
          };
        }

        // Default: deny
        return { allowed: false, commandAuthorized: false, reason: "unknown_policy" };
      };

      // Helper to handle pairing request
      const handlePairingRequest = async (
        senderAddress: string,
        msgCtx: any
      ): Promise<void> => {
        // @ts-ignore
        const clawdbotPath = "/opt/homebrew/lib/node_modules/clawdbot/dist";
        const { upsertChannelPairingRequest } = await import(`${clawdbotPath}/pairing/pairing-store.js`);

        const normalizedAddress = senderAddress.toLowerCase();
        const { code, created } = await upsertChannelPairingRequest({
          channel: "xmtp",
          id: normalizedAddress,
          meta: {
            address: normalizedAddress,
            label: senderAddress,
          },
        });

        if (created) {
          ctx.log?.info(
            `[${account.accountId}] New pairing request from ${senderAddress}, code: ${code}`
          );
        }

        // Send pairing instructions to the user
        await msgCtx.sendText([
          "🔐 Clawdbot: Access not configured.",
          "",
          `Your wallet address: ${senderAddress}`,
          "",
          `Pairing code: ${code}`,
          "",
          "Ask the bot owner to approve with:",
          `clawdbot pairing approve xmtp ${code}`,
        ].join("\n"));
      };

      // Set up message handlers
      agent.on("text", async (msgCtx) => {
        try {
          const senderAddress = await msgCtx.getSenderAddress();
          if (!senderAddress) {
            ctx.log?.warn(`[${account.accountId}] Message with unknown sender, ignoring`);
            return;
          }
          const senderInboxId = msgCtx.message.senderInboxId;
          const conversationId = msgCtx.conversation.id;
          const isGroup = !msgCtx.isDm();
          const messageText = String(msgCtx.message.content);

          ctx.log?.debug(
            `[${account.accountId}] Message from ${senderAddress}: ${messageText.slice(0, 50)}...`
          );

          // Check authorization
          const authResult = await checkSenderAuthorization(senderAddress);

          if (!authResult.allowed) {
            if (authResult.reason === "needs_pairing") {
              await handlePairingRequest(senderAddress, msgCtx);
              return;
            }
            if (authResult.reason === "not_in_allowlist") {
              ctx.log?.info(
                `[${account.accountId}] Blocked message from unauthorized sender: ${senderAddress}`
              );
              await msgCtx.sendText("⛔ Access denied. You are not authorized to use this bot.");
              return;
            }
            // Unknown reason, just ignore
            ctx.log?.warn(
              `[${account.accountId}] Blocked message from ${senderAddress}: ${authResult.reason}`
            );
            return;
          }

          // Dynamically import clawdbot's reply system using absolute paths
          // @ts-ignore - accessing internal clawdbot modules
          const clawdbotPath = "/opt/homebrew/lib/node_modules/clawdbot/dist";
          const { getReplyFromConfig } = await import(`${clawdbotPath}/auto-reply/reply/get-reply.js`);
          // @ts-ignore
          const { loadConfig } = await import(`${clawdbotPath}/config/config.js`);

          const cfg = loadConfig();

          // Build inbound context for clawdbot
          ctx.log?.info(`[${account.accountId}] [TEXT] Building inboundCtx for message processing`);
          ctx.log?.debug(`[${account.accountId}] [TEXT] Raw values before inboundCtx:`);
          ctx.log?.debug(`[${account.accountId}]   - messageText: ${messageText?.slice(0, 100)}...`);
          ctx.log?.debug(`[${account.accountId}]   - senderAddress: ${senderAddress}`);
          ctx.log?.debug(`[${account.accountId}]   - conversationId: ${conversationId}`);
          ctx.log?.debug(`[${account.accountId}]   - senderInboxId: ${senderInboxId}`);
          ctx.log?.debug(`[${account.accountId}]   - isGroup: ${isGroup}`);
          ctx.log?.debug(`[${account.accountId}]   - msgCtx.message.id: ${msgCtx.message.id}`);

          const inboundCtx: XmtpInboundContext = {
            Body: messageText,
            RawBody: messageText,
            From: `xmtp:${senderAddress}`,
            To: `xmtp:${conversationId}`,
            SessionKey: `xmtp:${conversationId}`,
            AccountId: account.accountId,
            ChatType: isGroup ? "group" : "direct",
            ConversationLabel: senderAddress,
            SenderName: senderAddress,
            SenderId: senderAddress,
            Provider: "xmtp",
            Surface: "xmtp",
            MessageSid: msgCtx.message.id,
            ConversationId: conversationId,
            SenderInboxId: senderInboxId,
            Timestamp: Date.now(),
            CommandAuthorized: authResult.commandAuthorized,
            OriginatingChannel: "xmtp",
            OriginatingTo: `xmtp:${conversationId}`,
          };

          ctx.log?.debug(`[${account.accountId}] [TEXT] inboundCtx constructed: ${JSON.stringify(inboundCtx)}`);
          ctx.log?.info(`[${account.accountId}] [TEXT] Calling getReplyFromConfig for session ${inboundCtx.SessionKey}`);

          // Get reply from clawdbot agent with corruption recovery
          let replyResult;
          try {
            replyResult = await getReplyFromConfig(inboundCtx, {
              onBlockReply: async (payload: { text?: string }) => {
                ctx.log?.debug(`[${account.accountId}] [TEXT] onBlockReply called with payload: ${JSON.stringify(payload)}`);
                if (payload.text) {
                  ctx.log?.info(`[${account.accountId}] [TEXT] Sending block reply via onBlockReply (${payload.text.length} chars)`);
                  await msgCtx.conversation.send(payload.text);
                  ctx.log?.debug(`[${account.accountId}] [TEXT] Block reply sent successfully`);
                }
              },
            }, cfg);
          } catch (replyError) {
            // Check if this is a corrupted session error
            if (isCorruptedSessionError(replyError)) {
              ctx.log?.warn(
                `[${account.accountId}] Detected corrupted session, attempting recovery for ${inboundCtx.SessionKey}`
              );

              const cleared = await clearCorruptedSession({
                sessionKey: inboundCtx.SessionKey,
                log: ctx.log,
              });

              if (cleared) {
                // Retry with fresh session
                ctx.log?.info(`[${account.accountId}] Retrying message with fresh session`);
                await msgCtx.sendText("⚠️ Session recovered from corruption. Please resend your message.");
              } else {
                await msgCtx.sendText("⚠️ Session error occurred. Please try /new to start a fresh conversation.");
              }
              return;
            }
            // Re-throw other errors
            throw replyError;
          }

          ctx.log?.info(`[${account.accountId}] [TEXT] getReplyFromConfig completed, processing replies`);
          ctx.log?.debug(`[${account.accountId}] [TEXT] replyResult type: ${typeof replyResult}, isArray: ${Array.isArray(replyResult)}`);
          ctx.log?.debug(`[${account.accountId}] [TEXT] replyResult value: ${JSON.stringify(replyResult)}`);

          // Send final reply
          const replies = replyResult ? (Array.isArray(replyResult) ? replyResult : [replyResult]) : [];
          ctx.log?.info(`[${account.accountId}] [TEXT] Sending ${replies.length} reply message(s)`);
          for (let i = 0; i < replies.length; i++) {
            const reply = replies[i];
            ctx.log?.debug(`[${account.accountId}] [TEXT] Reply ${i + 1}: has text=${!!reply.text}, length=${reply.text?.length || 0}`);
            if (reply.text) {
              ctx.log?.info(`[${account.accountId}] [TEXT] Sending reply ${i + 1} via msgCtx.sendText (${reply.text.length} chars)`);
              await msgCtx.sendText(reply.text);
              ctx.log?.debug(`[${account.accountId}] [TEXT] Reply ${i + 1} sent successfully`);
            }
          }
          ctx.log?.info(`[${account.accountId}] [TEXT] All replies sent, message handling complete`);
        } catch (error) {
          ctx.log?.error(
            `[${account.accountId}] [TEXT] Error handling message: ${String(error)}`
          );
          ctx.log?.error(
            `[${account.accountId}] [TEXT] Error stack: ${(error as Error)?.stack}`
          );
        }
      });

      agent.on("dm", async (dmCtx) => {
        ctx.log?.debug(
          `[${account.accountId}] New DM conversation: ${dmCtx.conversation.id}`
        );
      });

      agent.on("group", async (groupCtx) => {
        ctx.log?.debug(
          `[${account.accountId}] New group conversation: ${groupCtx.conversation.id}`
        );
      });

      // Handle incoming reactions (logging only - reactions are typically UI-only)
      agent.on("reaction", async (msgCtx) => {
        try {
          ctx.log?.info(`[${account.accountId}] [REACTION EVENT] Received reaction event`);

          // Log raw msgCtx structure
          ctx.log?.debug(`[${account.accountId}] [REACTION EVENT] msgCtx keys: ${Object.keys(msgCtx || {}).join(', ')}`);
          ctx.log?.debug(`[${account.accountId}] [REACTION EVENT] msgCtx.message exists: ${!!msgCtx?.message}`);
          ctx.log?.debug(`[${account.accountId}] [REACTION EVENT] msgCtx.message keys: ${Object.keys(msgCtx?.message || {}).join(', ')}`);

          // Log message content structure in detail
          const rawContent = msgCtx?.message?.content;
          ctx.log?.debug(`[${account.accountId}] [REACTION EVENT] rawContent type: ${typeof rawContent}`);
          ctx.log?.debug(`[${account.accountId}] [REACTION EVENT] rawContent value: ${JSON.stringify(rawContent)}`);

          // Check for undefined values that might cause errors
          ctx.log?.debug(`[${account.accountId}] [REACTION EVENT] Checking for undefined values:`);
          ctx.log?.debug(`[${account.accountId}]   - msgCtx: ${msgCtx === undefined ? 'UNDEFINED' : 'defined'}`);
          ctx.log?.debug(`[${account.accountId}]   - msgCtx.message: ${msgCtx?.message === undefined ? 'UNDEFINED' : 'defined'}`);
          ctx.log?.debug(`[${account.accountId}]   - msgCtx.message.content: ${msgCtx?.message?.content === undefined ? 'UNDEFINED' : 'defined'}`);
          ctx.log?.debug(`[${account.accountId}]   - msgCtx.message.id: ${msgCtx?.message?.id === undefined ? 'UNDEFINED' : msgCtx?.message?.id}`);
          ctx.log?.debug(`[${account.accountId}]   - msgCtx.message.senderInboxId: ${msgCtx?.message?.senderInboxId === undefined ? 'UNDEFINED' : msgCtx?.message?.senderInboxId}`);
          ctx.log?.debug(`[${account.accountId}]   - msgCtx.conversation: ${msgCtx?.conversation === undefined ? 'UNDEFINED' : 'defined'}`);
          ctx.log?.debug(`[${account.accountId}]   - msgCtx.conversation.id: ${msgCtx?.conversation?.id === undefined ? 'UNDEFINED' : msgCtx?.conversation?.id}`);

          const reaction = msgCtx.message.content;
          ctx.log?.debug(`[${account.accountId}] [REACTION EVENT] reaction.action: ${reaction?.action === undefined ? 'UNDEFINED' : reaction?.action}`);
          ctx.log?.debug(`[${account.accountId}] [REACTION EVENT] reaction.content: ${reaction?.content === undefined ? 'UNDEFINED' : reaction?.content}`);
          ctx.log?.debug(`[${account.accountId}] [REACTION EVENT] reaction.reference: ${reaction?.reference === undefined ? 'UNDEFINED' : reaction?.reference}`);
          ctx.log?.debug(`[${account.accountId}] [REACTION EVENT] reaction.schema: ${reaction?.schema === undefined ? 'UNDEFINED' : reaction?.schema}`);
          ctx.log?.debug(`[${account.accountId}] [REACTION EVENT] reaction.referenceInboxId: ${(reaction as any)?.referenceInboxId === undefined ? 'UNDEFINED' : (reaction as any)?.referenceInboxId}`);

          const senderAddress = await msgCtx.getSenderAddress();
          ctx.log?.info(
            `[${account.accountId}] [REACTION EVENT] Reaction from ${senderAddress}: ${reaction?.action} "${reaction?.content}" on message ${reaction?.reference}`
          );
        } catch (error) {
          ctx.log?.error(
            `[${account.accountId}] [REACTION EVENT] Error handling reaction: ${String(error)}`
          );
          ctx.log?.error(
            `[${account.accountId}] [REACTION EVENT] Error stack: ${(error as Error)?.stack}`
          );
          ctx.log?.error(
            `[${account.accountId}] [REACTION EVENT] Error name: ${(error as Error)?.name}, message: ${(error as Error)?.message}`
          );
        }
      });

      // Handle incoming replies - process them like regular messages but include reply context
      agent.on("reply", async (msgCtx) => {
        try {
          const reply = msgCtx.message.content as Reply;
          const senderAddress = await msgCtx.getSenderAddress();
          if (!senderAddress) {
            ctx.log?.warn(`[${account.accountId}] Reply with unknown sender, ignoring`);
            return;
          }
          const senderInboxId = msgCtx.message.senderInboxId;
          const conversationId = msgCtx.conversation.id;
          const isGroup = !msgCtx.isDm();
          const messageText = String(reply?.content ?? "");
          const replyToId = reply?.reference;

          ctx.log?.debug(
            `[${account.accountId}] Reply from ${senderAddress} to message ${replyToId}: ${messageText.slice(0, 50)}...`
          );

          // Check authorization (same as text handler)
          const authResult = await checkSenderAuthorization(senderAddress);

          if (!authResult.allowed) {
            if (authResult.reason === "needs_pairing") {
              await handlePairingRequest(senderAddress, msgCtx);
              return;
            }
            if (authResult.reason === "not_in_allowlist") {
              ctx.log?.info(
                `[${account.accountId}] Blocked reply from unauthorized sender: ${senderAddress}`
              );
              await msgCtx.sendText("⛔ Access denied. You are not authorized to use this bot.");
              return;
            }
            ctx.log?.warn(
              `[${account.accountId}] Blocked reply from ${senderAddress}: ${authResult.reason}`
            );
            return;
          }

          // Dynamically import clawdbot's reply system
          // @ts-ignore
          const clawdbotPath = "/opt/homebrew/lib/node_modules/clawdbot/dist";
          const { getReplyFromConfig } = await import(`${clawdbotPath}/auto-reply/reply/get-reply.js`);
          // @ts-ignore
          const { loadConfig } = await import(`${clawdbotPath}/config/config.js`);

          const cfg = loadConfig();

          // Build inbound context for clawdbot (same as text but with ReplyToId)
          ctx.log?.info(`[${account.accountId}] [REPLY] Building inboundCtx for reply message processing`);
          ctx.log?.debug(`[${account.accountId}] [REPLY] Raw values before inboundCtx:`);
          ctx.log?.debug(`[${account.accountId}]   - messageText: ${messageText?.slice(0, 100)}...`);
          ctx.log?.debug(`[${account.accountId}]   - senderAddress: ${senderAddress}`);
          ctx.log?.debug(`[${account.accountId}]   - conversationId: ${conversationId}`);
          ctx.log?.debug(`[${account.accountId}]   - senderInboxId: ${senderInboxId}`);
          ctx.log?.debug(`[${account.accountId}]   - replyToId: ${replyToId}`);
          ctx.log?.debug(`[${account.accountId}]   - isGroup: ${isGroup}`);
          ctx.log?.debug(`[${account.accountId}]   - msgCtx.message.id: ${msgCtx.message.id}`);

          const inboundCtx: XmtpInboundContext = {
            Body: messageText,
            RawBody: messageText,
            From: `xmtp:${senderAddress}`,
            To: `xmtp:${conversationId}`,
            SessionKey: `xmtp:${conversationId}`,
            AccountId: account.accountId,
            ChatType: isGroup ? "group" : "direct",
            ConversationLabel: senderAddress,
            SenderName: senderAddress,
            SenderId: senderAddress,
            Provider: "xmtp",
            Surface: "xmtp",
            MessageSid: msgCtx.message.id,
            ReplyToId: replyToId,  // Include reply reference
            ConversationId: conversationId,
            SenderInboxId: senderInboxId,
            Timestamp: Date.now(),
            CommandAuthorized: authResult.commandAuthorized,
            OriginatingChannel: "xmtp",
            OriginatingTo: `xmtp:${conversationId}`,
          };

          ctx.log?.debug(`[${account.accountId}] [REPLY] inboundCtx constructed: ${JSON.stringify(inboundCtx)}`);
          ctx.log?.info(`[${account.accountId}] [REPLY] Calling getReplyFromConfig for session ${inboundCtx.SessionKey}`);

          // Get reply from clawdbot agent with corruption recovery
          let replyResult;
          try {
            replyResult = await getReplyFromConfig(inboundCtx, {
              onBlockReply: async (payload: { text?: string }) => {
                ctx.log?.debug(`[${account.accountId}] [REPLY] onBlockReply called with payload: ${JSON.stringify(payload)}`);
                if (payload.text) {
                  ctx.log?.info(`[${account.accountId}] [REPLY] Sending block reply via onBlockReply (${payload.text.length} chars)`);
                  await msgCtx.conversation.send(payload.text);
                  ctx.log?.debug(`[${account.accountId}] [REPLY] Block reply sent successfully`);
                }
              },
            }, cfg);
          } catch (replyError) {
            // Check if this is a corrupted session error
            if (isCorruptedSessionError(replyError)) {
              ctx.log?.warn(
                `[${account.accountId}] Detected corrupted session in reply handler, attempting recovery for ${inboundCtx.SessionKey}`
              );

              const cleared = await clearCorruptedSession({
                sessionKey: inboundCtx.SessionKey,
                log: ctx.log,
              });

              if (cleared) {
                ctx.log?.info(`[${account.accountId}] Retrying reply with fresh session`);
                await msgCtx.sendText("⚠️ Session recovered from corruption. Please resend your message.");
              } else {
                await msgCtx.sendText("⚠️ Session error occurred. Please try /new to start a fresh conversation.");
              }
              return;
            }
            // Re-throw other errors
            throw replyError;
          }

          ctx.log?.info(`[${account.accountId}] [REPLY] getReplyFromConfig completed, processing replies`);
          ctx.log?.debug(`[${account.accountId}] [REPLY] replyResult type: ${typeof replyResult}, isArray: ${Array.isArray(replyResult)}`);
          ctx.log?.debug(`[${account.accountId}] [REPLY] replyResult value: ${JSON.stringify(replyResult)}`);

          // Send final reply
          const replies = replyResult ? (Array.isArray(replyResult) ? replyResult : [replyResult]) : [];
          ctx.log?.info(`[${account.accountId}] [REPLY] Sending ${replies.length} reply message(s)`);
          for (let i = 0; i < replies.length; i++) {
            const r = replies[i];
            ctx.log?.debug(`[${account.accountId}] [REPLY] Reply ${i + 1}: has text=${!!r.text}, length=${r.text?.length || 0}`);
            if (r.text) {
              ctx.log?.info(`[${account.accountId}] [REPLY] Sending reply ${i + 1} via msgCtx.sendText (${r.text.length} chars)`);
              await msgCtx.sendText(r.text);
              ctx.log?.debug(`[${account.accountId}] [REPLY] Reply ${i + 1} sent successfully`);
            }
          }
          ctx.log?.info(`[${account.accountId}] [REPLY] All replies sent, reply handling complete`);
        } catch (error) {
          ctx.log?.error(
            `[${account.accountId}] [REPLY] Error handling reply: ${String(error)}`
          );
          ctx.log?.error(
            `[${account.accountId}] [REPLY] Error stack: ${(error as Error)?.stack}`
          );
        }
      });

      agent.on("unhandledError", (error) => {
        ctx.log?.error(`[${account.accountId}] Unhandled error: ${String(error)}`);
      });

      // Start the agent
      await agent.start();

      // Store the agent handle
      activeAgents.set(account.accountId, agent);

      ctx.log?.info(
        `[${account.accountId}] XMTP provider started (address: ${account.walletAddress})`
      );

      // Return cleanup function
      return {
        stop: async () => {
          await agent.stop();
          activeAgents.delete(account.accountId);
          ctx.log?.info(`[${account.accountId}] XMTP provider stopped`);
        },
      };
    },
  },
};

/**
 * Get active XMTP agent for an account.
 * Useful for debugging and status reporting.
 */
export function getActiveXmtpAgent(
  accountId: string = DEFAULT_ACCOUNT_ID
): Agent | undefined {
  return activeAgents.get(accountId);
}

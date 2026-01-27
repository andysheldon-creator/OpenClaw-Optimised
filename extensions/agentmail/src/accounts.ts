import { DEFAULT_ACCOUNT_ID, normalizeAccountId } from "clawdbot/plugin-sdk";

import type {
  AgentMailConfig,
  CoreConfig,
  ResolvedAgentMailAccount,
} from "./utils.js";

/**
 * Lists all AgentMail account IDs.
 * Currently supports only a single default account.
 */
export function listAgentMailAccountIds(_cfg: CoreConfig): string[] {
  return [DEFAULT_ACCOUNT_ID];
}

/**
 * Returns the default AgentMail account ID.
 */
export function resolveDefaultAgentMailAccountId(cfg: CoreConfig): string {
  const ids = listAgentMailAccountIds(cfg);
  if (ids.includes(DEFAULT_ACCOUNT_ID)) return DEFAULT_ACCOUNT_ID;
  return ids[0] ?? DEFAULT_ACCOUNT_ID;
}

/** Resolved AgentMail credentials and paths. */
export type ResolvedAgentMailCredentials = {
  apiKey?: string;
  inboxId?: string;
  webhookUrl?: string;
  webhookPath: string;
};

const DEFAULT_WEBHOOK_PATH = "/webhooks/agentmail";

/** Extracts the path from a URL string. Returns undefined if just root "/". */
function extractPathFromUrl(url: string): string | undefined {
  try {
    const parsed = new URL(url);
    // Return undefined if just root path "/" - use default instead
    if (!parsed.pathname || parsed.pathname === "/") {
      return undefined;
    }
    return parsed.pathname;
  } catch {
    return undefined;
  }
}

/**
 * Resolves AgentMail credentials from config and environment.
 * Maps user-facing keys (token, emailAddress) to SDK names (apiKey, inboxId).
 * Derives webhookPath from webhookUrl if not explicitly set.
 */
export function resolveCredentials(
  cfg: CoreConfig,
  env: Record<string, string | undefined> = process.env
): ResolvedAgentMailCredentials {
  const base = cfg.channels?.agentmail ?? {};
  const webhookUrl = base.webhookUrl || env.AGENTMAIL_WEBHOOK_URL;

  // Derive path from URL if not explicitly set
  let webhookPath = base.webhookPath || env.AGENTMAIL_WEBHOOK_PATH;
  if (!webhookPath && webhookUrl) {
    webhookPath = extractPathFromUrl(webhookUrl);
  }
  webhookPath = webhookPath || DEFAULT_WEBHOOK_PATH;

  return {
    apiKey: base.token || env.AGENTMAIL_TOKEN,
    inboxId: base.emailAddress || env.AGENTMAIL_EMAIL_ADDRESS,
    webhookUrl,
    webhookPath,
  };
}

/**
 * Resolves a specific AgentMail account with its configuration and status.
 */
export function resolveAgentMailAccount(params: {
  cfg: CoreConfig;
  accountId?: string | null;
}): ResolvedAgentMailAccount {
  const accountId = normalizeAccountId(params.accountId);
  const base = (params.cfg.channels?.agentmail ?? {}) as AgentMailConfig;
  const { apiKey, inboxId } = resolveCredentials(params.cfg);

  return {
    accountId,
    name: base.name?.trim() || undefined,
    enabled: base.enabled !== false,
    configured: Boolean(apiKey && inboxId),
    config: base,
    inboxId,
  };
}

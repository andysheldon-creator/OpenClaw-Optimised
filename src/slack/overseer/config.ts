/**
 * Configuration resolution for Slack Overseer integration.
 */

import type { OpenClawConfig } from "../../config/types.js";
import type { SlackOverseerConfig } from "../../config/types.slack.js";
import { resolveSlackAccount } from "../accounts.js";

export type ResolvedSlackOverseerConfig = {
  enabled: boolean;
  channels: {
    activity?: string;
    notifications?: string;
    questions?: string;
  };
  escalationMentions: string[];
  decisionTimeoutMs: number;
  includeDashboardLink: boolean;
};

const DEFAULT_DECISION_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes

export function resolveSlackOverseerConfig(
  cfg: OpenClawConfig,
  accountId?: string,
): ResolvedSlackOverseerConfig | null {
  const account = resolveSlackAccount({ cfg, accountId });
  const overseerCfg: SlackOverseerConfig | undefined = account.config.overseer;

  if (!overseerCfg?.enabled) {
    return null;
  }

  return {
    enabled: true,
    channels: {
      activity: overseerCfg.channels?.activity,
      notifications: overseerCfg.channels?.notifications,
      questions: overseerCfg.channels?.questions,
    },
    escalationMentions: overseerCfg.escalationMentions ?? [],
    decisionTimeoutMs: overseerCfg.decisionTimeoutMs ?? DEFAULT_DECISION_TIMEOUT_MS,
    includeDashboardLink: overseerCfg.includeDashboardLink ?? true,
  };
}

export function resolveDashboardUrl(
  cfg: OpenClawConfig,
  params?: {
    agentId?: string;
    goalId?: string;
    assignmentId?: string;
  },
): string | undefined {
  const gatewayPort = cfg.gateway?.port ?? 18789;
  const baseUrl = `http://localhost:${gatewayPort}/ui`;

  if (!params) {
    return baseUrl;
  }

  const searchParams = new URLSearchParams();
  if (params.agentId) {
    searchParams.set("agentId", params.agentId);
  }
  if (params.goalId) {
    searchParams.set("goalId", params.goalId);
  }
  if (params.assignmentId) {
    searchParams.set("assignmentId", params.assignmentId);
  }

  const query = searchParams.toString();
  return query ? `${baseUrl}?${query}` : baseUrl;
}

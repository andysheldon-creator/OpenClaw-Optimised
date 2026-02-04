import { randomUUID } from "node:crypto";
import type { CliDeps } from "../../cli/deps.js";
import { loadConfig } from "../../config/config.js";
import { resolveMainSessionKeyFromConfig } from "../../config/sessions.js";
import { runCronIsolatedAgentTurn } from "../../cron/isolated-agent.js";
import type { CronJob } from "../../cron/types.js";
import { requestHeartbeatNow } from "../../infra/heartbeat-wake.js";
import { enqueueSystemEvent } from "../../infra/system-events.js";
import {
  createGitHubWebhookHandler,
  type GitHubWebhookConfig,
} from "../../github/webhook-handler.js";
import type { createSubsystemLogger } from "../../logging/subsystem.js";

type SubsystemLogger = ReturnType<typeof createSubsystemLogger>;

export function createGatewayGitHubWebhookHandler(params: { deps: CliDeps; log: SubsystemLogger }) {
  const { deps, log } = params;

  const getConfig = (): GitHubWebhookConfig | null => {
    const cfg = loadConfig();
    const webhookCfg = cfg.github?.webhook;

    if (!webhookCfg?.enabled) {
      return null;
    }

    return {
      enabled: true,
      secret: webhookCfg.secret,
      path: webhookCfg.path || "/github/webhook",
      agents: {
        reviewer: webhookCfg.agents?.reviewer,
        author: webhookCfg.agents?.author,
        autoMerge: webhookCfg.agents?.autoMerge ?? false,
      },
      events: {
        pullRequest: webhookCfg.events?.pullRequest !== false,
        pullRequestReview: webhookCfg.events?.pullRequestReview !== false,
        checkSuite: webhookCfg.events?.checkSuite !== false,
      },
    };
  };

  const dispatchAgent = (agentId: string, message: string, metadata?: Record<string, unknown>) => {
    const sessionKey = `github-webhook:${randomUUID()}`;
    const mainSessionKey = resolveMainSessionKeyFromConfig();
    const jobId = randomUUID();
    const now = Date.now();

    const job: CronJob = {
      id: jobId,
      name: `github-webhook-${metadata?.event || "event"}`,
      enabled: true,
      createdAtMs: now,
      updatedAtMs: now,
      schedule: { kind: "at", atMs: now },
      sessionTarget: "isolated",
      wakeMode: "now",
      payload: {
        kind: "agentTurn",
        message,
        model: undefined,
        thinking: undefined,
        timeoutSeconds: undefined,
        deliver: false, // Don't deliver responses back to GitHub
        channel: "none",
        to: undefined,
        allowUnsafeExternalContent: false,
      },
      state: { nextRunAtMs: now },
    };

    void (async () => {
      try {
        const cfg = loadConfig();

        // Find agent configuration
        const agent = cfg.agents?.list?.find((a) => a.id === agentId);
        if (!agent) {
          log.warn(`GitHub webhook: Agent ${agentId} not found in config`);
          return;
        }

        log.info(
          `GitHub webhook: Dispatching to agent ${agentId} (event: ${metadata?.event || "unknown"})`,
        );

        const result = await runCronIsolatedAgentTurn({
          cfg,
          deps,
          job,
          message,
          sessionKey,
          lane: "cron",
        });

        const summary = result.summary?.trim() || result.error?.trim() || result.status;
        const prefix =
          result.status === "ok"
            ? `GitHub webhook (${agentId})`
            : `GitHub webhook (${agentId}, ${result.status})`;

        enqueueSystemEvent(`${prefix}: ${summary}`.trim(), {
          sessionKey: mainSessionKey,
        });

        requestHeartbeatNow({ reason: `github-webhook:${jobId}` });
      } catch (err) {
        log.warn(`GitHub webhook agent failed: ${String(err)}`);
        enqueueSystemEvent(`GitHub webhook (${agentId}, error): ${String(err)}`, {
          sessionKey: mainSessionKey,
        });
        requestHeartbeatNow({ reason: `github-webhook:${jobId}:error` });
      }
    })();
  };

  return createGitHubWebhookHandler({
    getConfig,
    dispatchAgent,
  });
}

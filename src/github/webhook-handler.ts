import crypto from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import { logInfo, logWarn, logError } from "../logger.js";
import { enqueueSystemEvent } from "../infra/system-events.js";

export type GitHubWebhookEvent =
  | "pull_request"
  | "pull_request_review"
  | "pull_request_review_comment"
  | "check_suite"
  | "check_run";

export type GitHubWebhookAction =
  | "opened"
  | "closed"
  | "reopened"
  | "synchronize"
  | "review_requested"
  | "submitted"
  | "dismissed"
  | "completed";

export type GitHubPullRequestPayload = {
  action: GitHubWebhookAction;
  number: number;
  pull_request: {
    id: number;
    number: number;
    title: string;
    body: string;
    state: "open" | "closed";
    html_url: string;
    user: {
      login: string;
      id: number;
    };
    head: {
      ref: string;
      sha: string;
    };
    base: {
      ref: string;
      sha: string;
    };
    merged: boolean;
    mergeable: boolean | null;
    mergeable_state: string;
  };
  repository: {
    name: string;
    full_name: string;
    owner: {
      login: string;
    };
  };
  sender: {
    login: string;
    id: number;
  };
};

export type GitHubReviewPayload = {
  action: "submitted" | "edited" | "dismissed";
  review: {
    id: number;
    user: {
      login: string;
    };
    body: string;
    state: "approved" | "changes_requested" | "commented";
    html_url: string;
  };
  pull_request: GitHubPullRequestPayload["pull_request"];
  repository: GitHubPullRequestPayload["repository"];
};

export type GitHubCheckSuitePayload = {
  action: "completed" | "requested" | "rerequested";
  check_suite: {
    id: number;
    status: "queued" | "in_progress" | "completed";
    conclusion:
      | "success"
      | "failure"
      | "neutral"
      | "cancelled"
      | "skipped"
      | "timed_out"
      | "action_required"
      | null;
    head_branch: string;
    head_sha: string;
    pull_requests: Array<{
      number: number;
      head: { ref: string; sha: string };
      base: { ref: string; sha: string };
    }>;
  };
  repository: GitHubPullRequestPayload["repository"];
};

export type GitHubWebhookPayload =
  | GitHubPullRequestPayload
  | GitHubReviewPayload
  | GitHubCheckSuitePayload;

export type GitHubWebhookConfig = {
  enabled: boolean;
  secret?: string;
  path: string;
  agents: {
    /** Agent ID to notify when PR is opened/updated */
    reviewer?: string;
    /** Agent ID to notify when review is submitted */
    author?: string;
    /** Auto-merge when checks pass (if agent approves) */
    autoMerge?: boolean;
  };
  events: {
    pullRequest?: boolean;
    pullRequestReview?: boolean;
    checkSuite?: boolean;
  };
};

// Verify GitHub webhook signature (HMAC-SHA256)
function verifySignature(secret: string, payload: string, signature: string | undefined): boolean {
  if (!signature) {
    return false;
  }

  // GitHub sends: sha256=<hash>
  const signatureParts = signature.split("=");
  if (signatureParts.length !== 2 || signatureParts[0] !== "sha256") {
    return false;
  }

  const expectedSignature = signatureParts[1];
  const hmac = crypto.createHmac("sha256", secret);
  hmac.update(payload, "utf8");
  const computedSignature = hmac.digest("hex");

  // Constant-time comparison to prevent timing attacks
  return crypto.timingSafeEqual(
    Buffer.from(expectedSignature, "hex"),
    Buffer.from(computedSignature, "hex"),
  );
}

// Read request body as string
async function readBody(req: IncomingMessage, maxBytes = 10_000_000): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let totalSize = 0;

    req.on("data", (chunk: Buffer) => {
      totalSize += chunk.length;
      if (totalSize > maxBytes) {
        req.destroy();
        reject(new Error("Payload too large"));
        return;
      }
      chunks.push(chunk);
    });

    req.on("end", () => {
      resolve(Buffer.concat(chunks).toString("utf8"));
    });

    req.on("error", reject);
  });
}

// Send JSON response
function sendJson(res: ServerResponse, status: number, body: unknown) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(body));
}

// Handle pull request events
function handlePullRequestEvent(
  payload: GitHubPullRequestPayload,
  config: GitHubWebhookConfig,
  dispatchAgent: (agentId: string, message: string, metadata?: Record<string, unknown>) => void,
) {
  const { action, number, pull_request, repository, sender } = payload;

  logInfo(`GitHub webhook: PR #${number} ${action} by @${sender.login} in ${repository.full_name}`);

  if (!config.agents.reviewer) {
    logWarn("GitHub webhook: No reviewer agent configured, skipping PR notification");
    return;
  }

  // Notify reviewer agent for PR events
  if (["opened", "synchronize", "reopened", "review_requested"].includes(action)) {
    const message =
      action === "opened"
        ? `New PR #${number} needs review: ${pull_request.title}\n\n${pull_request.html_url}\n\nAuthor: @${pull_request.user.login}\nBranch: ${pull_request.head.ref} → ${pull_request.base.ref}\n\nUse github_get_pr to fetch details and github_review_pr to approve or request changes.`
        : action === "synchronize"
          ? `PR #${number} updated with new commits: ${pull_request.title}\n\n${pull_request.html_url}\n\nPlease re-review the changes.`
          : action === "review_requested"
            ? `You've been requested to review PR #${number}: ${pull_request.title}\n\n${pull_request.html_url}`
            : `PR #${number} reopened: ${pull_request.title}\n\n${pull_request.html_url}`;

    dispatchAgent(config.agents.reviewer, message, {
      event: "github.pull_request",
      action,
      prNumber: number,
      prUrl: pull_request.html_url,
      repository: repository.full_name,
      author: pull_request.user.login,
    });
  }

  // Notify author when PR is closed/merged
  if (action === "closed" && config.agents.author) {
    const status = pull_request.merged ? "merged" : "closed";
    const message = `Your PR #${number} was ${status}: ${pull_request.title}\n\n${pull_request.html_url}`;

    dispatchAgent(config.agents.author, message, {
      event: "github.pull_request",
      action,
      prNumber: number,
      prUrl: pull_request.html_url,
      repository: repository.full_name,
      merged: pull_request.merged,
    });
  }
}

// Handle pull request review events
function handlePullRequestReviewEvent(
  payload: GitHubReviewPayload,
  config: GitHubWebhookConfig,
  dispatchAgent: (agentId: string, message: string, metadata?: Record<string, unknown>) => void,
) {
  const { action, review, pull_request, repository } = payload;

  if (action !== "submitted") {
    return; // Only handle submitted reviews
  }

  logInfo(
    `GitHub webhook: PR #${pull_request.number} review ${review.state} by @${review.user.login} in ${repository.full_name}`,
  );

  // Notify PR author about review
  if (config.agents.author) {
    const statusEmoji =
      review.state === "approved" ? "✅" : review.state === "changes_requested" ? "⚠️" : "💬";
    const statusText =
      review.state === "approved"
        ? "approved"
        : review.state === "changes_requested"
          ? "requested changes on"
          : "commented on";

    const message = `${statusEmoji} @${review.user.login} ${statusText} your PR #${pull_request.number}: ${pull_request.title}\n\n${review.html_url}\n\n${review.body ? `Review:\n${review.body}` : ""}`;

    dispatchAgent(config.agents.author, message, {
      event: "github.pull_request_review",
      action,
      prNumber: pull_request.number,
      reviewState: review.state,
      reviewer: review.user.login,
      repository: repository.full_name,
    });
  }

  // Auto-merge if approved and configured
  if (
    review.state === "approved" &&
    config.agents.autoMerge &&
    config.agents.reviewer &&
    pull_request.mergeable
  ) {
    const message = `PR #${pull_request.number} approved and ready to merge: ${pull_request.title}\n\n${pull_request.html_url}\n\nUse github_merge_pr to merge now.`;

    dispatchAgent(config.agents.reviewer, message, {
      event: "github.pull_request_review",
      action: "auto_merge_ready",
      prNumber: pull_request.number,
      repository: repository.full_name,
    });
  }
}

// Handle check suite events (CI status)
function handleCheckSuiteEvent(
  payload: GitHubCheckSuitePayload,
  config: GitHubWebhookConfig,
  dispatchAgent: (agentId: string, message: string, metadata?: Record<string, unknown>) => void,
) {
  const { action, check_suite, repository } = payload;

  if (action !== "completed" || check_suite.pull_requests.length === 0) {
    return; // Only handle completed checks for PRs
  }

  logInfo(
    `GitHub webhook: Check suite ${check_suite.conclusion} for ${repository.full_name}@${check_suite.head_sha.slice(0, 7)}`,
  );

  const prNumbers = check_suite.pull_requests.map((pr) => pr.number);

  // Notify reviewer if checks pass
  if (check_suite.conclusion === "success" && config.agents.reviewer) {
    for (const prNumber of prNumbers) {
      const message = `✅ CI checks passed for PR #${prNumber}\n\nAll checks completed successfully. Ready to merge if approved.`;

      dispatchAgent(config.agents.reviewer, message, {
        event: "github.check_suite",
        action,
        prNumber,
        checkStatus: check_suite.conclusion,
        repository: repository.full_name,
      });
    }
  }

  // Notify author if checks fail
  if (
    ["failure", "timed_out", "cancelled"].includes(check_suite.conclusion || "") &&
    config.agents.author
  ) {
    for (const prNumber of prNumbers) {
      const message = `❌ CI checks failed for PR #${prNumber}\n\nCheck suite conclusion: ${check_suite.conclusion}\n\nPlease review the failed checks and push fixes.`;

      dispatchAgent(config.agents.author, message, {
        event: "github.check_suite",
        action,
        prNumber,
        checkStatus: check_suite.conclusion,
        repository: repository.full_name,
      });
    }
  }
}

export type GitHubWebhookHandler = (req: IncomingMessage, res: ServerResponse) => Promise<boolean>;

export function createGitHubWebhookHandler(opts: {
  getConfig: () => GitHubWebhookConfig | null;
  dispatchAgent: (agentId: string, message: string, metadata?: Record<string, unknown>) => void;
}): GitHubWebhookHandler {
  const { getConfig, dispatchAgent } = opts;

  return async (req, res) => {
    const config = getConfig();
    if (!config || !config.enabled) {
      return false;
    }

    // Check if this is a GitHub webhook request
    const url = new URL(req.url ?? "/", `http://localhost`);
    if (url.pathname !== config.path) {
      return false;
    }

    // Only accept POST requests
    if (req.method !== "POST") {
      res.statusCode = 405;
      res.setHeader("Allow", "POST");
      sendJson(res, 405, { error: "Method not allowed" });
      return true;
    }

    try {
      // Read request body
      const body = await readBody(req);

      // Verify signature if secret is configured
      if (config.secret) {
        const signature = req.headers["x-hub-signature-256"] as string | undefined;
        if (!verifySignature(config.secret, body, signature)) {
          logWarn("GitHub webhook: Invalid signature");
          sendJson(res, 401, { error: "Invalid signature" });
          return true;
        }
      }

      // Parse payload
      const payload = JSON.parse(body) as GitHubWebhookPayload;
      const event = req.headers["x-github-event"] as GitHubWebhookEvent | undefined;

      if (!event) {
        sendJson(res, 400, { error: "Missing X-GitHub-Event header" });
        return true;
      }

      logInfo(`GitHub webhook: Received ${event} event`);

      // Route event to appropriate handler
      if (event === "pull_request" && config.events.pullRequest !== false) {
        handlePullRequestEvent(payload as GitHubPullRequestPayload, config, dispatchAgent);
      } else if (event === "pull_request_review" && config.events.pullRequestReview !== false) {
        handlePullRequestReviewEvent(payload as GitHubReviewPayload, config, dispatchAgent);
      } else if (event === "check_suite" && config.events.checkSuite !== false) {
        handleCheckSuiteEvent(payload as GitHubCheckSuitePayload, config, dispatchAgent);
      } else {
        logInfo(`GitHub webhook: Ignoring ${event} event (not configured)`);
      }

      // Always respond with 200 to acknowledge receipt
      sendJson(res, 200, { ok: true });
      return true;
    } catch (err) {
      logError(`GitHub webhook error: ${String(err)}`);
      sendJson(res, 500, { error: "Internal server error" });
      return true;
    }
  };
}

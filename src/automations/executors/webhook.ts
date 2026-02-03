/**
 * Webhook Executor - Executes HTTP webhooks with retry logic.
 *
 * Handles HTTP requests with retry policies, exponential backoff,
 * and artifact storage for responses.
 */

import crypto from "node:crypto";
import path from "node:path";
import type { AutomationRunnerResult } from "../runner.js";
import type { AutomationServiceState } from "../service/state.js";
import type { WebhookConfig, AutomationArtifact, AutomationMilestone } from "../types.js";
import { retryAsync, type RetryOptions } from "../../infra/retry.js";
import { ArtifactStorage } from "../artifacts.js";
import { emitAutomationProgress } from "../events.js";

/**
 * Default retry policy for webhooks.
 */
type RetryPolicy = NonNullable<WebhookConfig["retryPolicy"]>;

const DEFAULT_RETRY_POLICY: RetryPolicy = {
  maxAttempts: 3,
  initialDelayMs: 1000,
  maxDelayMs: 30000,
  backoffMultiplier: 2,
  retryOn5xx: true,
  retryStatusCodes: [],
  successStatusCodes: [200, 201, 202, 204],
};

/**
 * Executor for webhook automations.
 */
export class WebhookExecutor {
  private readonly artifacts: AutomationArtifact[] = [];
  private readonly milestones: AutomationMilestone[] = [];
  private artifactStorage: ArtifactStorage;

  constructor(
    private readonly state: AutomationServiceState,
    private readonly automation: import("../types.js").Automation,
    private readonly runId: string,
    private readonly startedAt: number,
  ) {
    this.artifactStorage = new ArtifactStorage({
      artifactsDir: path.join(
        process.env.HOME ?? process.env.USERPROFILE ?? ".",
        ".clawdbrain",
        "automations",
        "artifacts",
      ),
      baseUrl: "/api/artifacts",
    });
  }

  /**
   * Execute the webhook automation.
   */
  async execute(): Promise<AutomationRunnerResult> {
    const config = this.automation.config as WebhookConfig;

    try {
      // Milestone 1: Preparing webhook request
      this.addMilestone("Preparing webhook request");
      const retryPolicy: RetryPolicy = {
        ...DEFAULT_RETRY_POLICY,
        ...config.retryPolicy,
      };

      // Milestone 2: Sending webhook request
      this.addMilestone("Sending webhook request");
      this.emitProgress(20);

      // Prepare request options
      const headers: Record<string, string> = {
        ...(config.contentType && { "Content-Type": config.contentType }),
        ...config.headers,
      };

      const requestOptions: RequestInit = {
        method: config.method,
        headers,
        body: this.prepareBody(config),
        redirect: config.followRedirects ? "follow" : "manual",
      };

      // Execute with retry logic
      const result = await this.executeWithRetry(config, requestOptions, retryPolicy);

      // Store response as artifact
      const responseArtifact = await this.artifactStorage.storeText(
        this.runId,
        "response.json",
        "application/json",
        JSON.stringify(
          {
            status: result.status,
            statusText: result.statusText,
            headers: Object.fromEntries(result.headers.entries()),
            body: result.body,
          },
          null,
          2,
        ),
      );
      this.artifacts.push(responseArtifact);

      // Check if response is successful
      const successStatusCodes = retryPolicy.successStatusCodes!;
      const isSuccess = successStatusCodes.includes(result.status);

      if (!isSuccess) {
        this.addMilestone("Failed");
        return {
          status: "error",
          milestones: this.milestones,
          artifacts: this.artifacts,
          conflicts: [],
          error: `Webhook returned status ${result.status}: ${result.statusText}`,
        };
      }

      // Milestone 3: Completed
      this.addMilestone("Completed");
      this.emitProgress(100);

      return {
        status: "success",
        milestones: this.milestones,
        artifacts: this.artifacts,
        conflicts: [],
      };
    } catch (err) {
      const error = err as Error;

      // Milestone: Failed
      this.addMilestone("Failed");

      return {
        status: "error",
        milestones: this.milestones,
        artifacts: this.artifacts,
        conflicts: [],
        error: error.message ?? String(err),
      };
    }
  }

  /**
   * Execute the webhook with retry logic.
   */
  private async executeWithRetry(
    config: WebhookConfig,
    requestOptions: RequestInit,
    retryPolicy: RetryPolicy,
  ): Promise<{ status: number; statusText: string; headers: Headers; body: string }> {
    let attempt = 0;

    const retryOptions: RetryOptions = {
      label: "webhook",
      attempts: retryPolicy.maxAttempts,
      minDelayMs: retryPolicy.initialDelayMs,
      maxDelayMs: retryPolicy.maxDelayMs,
      onRetry: (info) => {
        attempt = info.attempt;
        this.addMilestone(`Retry attempt ${info.attempt}`);
        this.emitProgress(20 + (info.attempt / retryPolicy.maxAttempts!) * 60);
      },
      shouldRetry: (err, _currentAttempt) => {
        // Don't retry on certain errors
        if (err && typeof err === "object" && "name" in err) {
          const errorName = (err as { name: string }).name;
          if (errorName === "AbortError") {
            return false; // Don't retry timeout errors
          }
        }
        return true;
      },
      retryAfterMs: (err) => {
        // Check if it's a Response object with status code
        if (err && typeof err === "object" && "status" in err) {
          const status = (err as { status: number }).status;

          // Check custom retry status codes
          if (retryPolicy.retryStatusCodes?.includes(status)) {
            return undefined; // Use default exponential backoff
          }

          // Don't retry 4xx errors (client errors)
          if (status >= 400 && status < 500) {
            throw err; // Don't retry
          }

          // Retry 5xx errors (server errors) if enabled
          if (status >= 500 && status < 600) {
            if (retryPolicy.retryOn5xx) {
              return undefined; // Use default exponential backoff
            }
            throw err; // Don't retry
          }
        }
        return undefined; // Use default exponential backoff
      },
    };

    return retryAsync(async () => {
      this.addMilestone(attempt === 0 ? "Sending webhook request" : `Retry attempt ${attempt + 1}`);
      this.emitProgress(20 + (attempt / retryPolicy.maxAttempts!) * 60);

      const controller = new AbortController();
      const timeoutMs = config.timeoutMs ?? 30000; // Default 30 seconds

      const timeoutId = setTimeout(() => {
        controller.abort();
      }, timeoutMs);

      try {
        const response = await fetch(config.url, {
          ...requestOptions,
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        const body = await response.text();

        // Milestone: Response received
        if (response.ok || retryPolicy.retryStatusCodes?.includes(response.status)) {
          this.addMilestone("Response received");
        }

        // If status indicates error and we should not retry, throw to trigger retry logic
        if (!response.ok) {
          const error = new Error(response.statusText) as Error & { status: number; body: string };
          error.status = response.status;
          error.body = body;
          throw error;
        }

        return {
          status: response.status,
          statusText: response.statusText,
          headers: response.headers,
          body,
        };
      } catch (err) {
        clearTimeout(timeoutId);
        throw err;
      }
    }, retryOptions);
  }

  /**
   * Prepare the request body based on content type.
   */
  private prepareBody(config: WebhookConfig): string | undefined {
    if (!config.body) {
      return undefined;
    }

    // If content type is JSON and body is not already a string, stringify it
    if (config.contentType?.includes("application/json")) {
      try {
        // Try to parse as JSON in case it's already a stringified JSON
        const parsed = JSON.parse(config.body);
        return JSON.stringify(parsed);
      } catch {
        // Not valid JSON, return as-is
        return config.body;
      }
    }

    return config.body;
  }

  /**
   * Add a milestone to the timeline.
   */
  private addMilestone(title: string): void {
    const milestone: AutomationMilestone = {
      id: crypto.randomUUID(),
      title,
      status: "completed",
      timestamp: new Date().toISOString(),
    };

    // Mark previous milestone as completed
    if (this.milestones.length > 0) {
      this.milestones[this.milestones.length - 1].status = "completed";
    }

    // Add new milestone as current
    milestone.status = "current";
    this.milestones.push(milestone);
  }

  /**
   * Emit progress event with percentage.
   */
  private emitProgress(percentage: number): void {
    const currentMilestone = this.milestones[this.milestones.length - 1];
    emitAutomationProgress(
      this.state,
      this.automation.id,
      this.runId,
      currentMilestone.title,
      percentage,
    );
  }
}

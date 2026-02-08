/**
 * WF-002 (#53) — Dashboard trigger controls
 *
 * Types and stub implementation for managing workflow triggers
 * from the Clawdbot dashboard. Supports manual, scheduled,
 * webhook, and event-driven trigger types.
 */

// ---------------------------------------------------------------------------
// Trigger types
// ---------------------------------------------------------------------------

export type TriggerType = "manual" | "schedule" | "webhook" | "event";

/** Configuration specific to each trigger type. */
export type TriggerConfig = {
  /** Cron expression for schedule triggers (e.g. "0 9 * * 1-5"). */
  cron?: string;
  /** Webhook path suffix for webhook triggers (appended to the base webhook URL). */
  webhookPath?: string;
  /** HTTP method accepted by the webhook (defaults to POST). */
  webhookMethod?: "GET" | "POST" | "PUT";
  /** Event name to listen for (e.g. "run.completed", "skill.error"). */
  eventName?: string;
  /** Optional filter expression evaluated against the event payload. */
  eventFilter?: string;
};

/** A trigger attached to a workflow. */
export type WorkflowTrigger = {
  /** Unique identifier for this trigger. */
  id: string;
  /** The workflow this trigger belongs to. */
  workflowId: string;
  /** How the workflow is kicked off. */
  triggerType: TriggerType;
  /** Type-specific configuration. */
  config: TriggerConfig;
  /** Whether this trigger is currently active. */
  enabled: boolean;
  /** ISO-8601 timestamp of creation. */
  createdAt: string;
  /** ISO-8601 timestamp of last modification. */
  updatedAt: string;
};

// ---------------------------------------------------------------------------
// Trigger manager interface
// ---------------------------------------------------------------------------

/** Contract for managing workflow triggers at runtime. */
export type TriggerManager = {
  /** Enable a trigger so it begins firing. */
  enable(triggerId: string): Promise<void>;
  /** Disable a trigger without deleting it. */
  disable(triggerId: string): Promise<void>;
  /** List all triggers for a given workflow. */
  list(workflowId: string): Promise<WorkflowTrigger[]>;
  /** Immediately execute a trigger (useful for manual and test runs). */
  execute(triggerId: string, payload?: unknown): Promise<{ runId: string }>;
};

// ---------------------------------------------------------------------------
// Stub implementation
// ---------------------------------------------------------------------------

/**
 * In-memory stub trigger manager for development and testing.
 * Replace with a persistent backend (Postgres-backed, n8n API, etc.)
 * before production use.
 */
export class StubTriggerManager implements TriggerManager {
  private triggers: Map<string, WorkflowTrigger> = new Map();

  /** Seed the store with an existing trigger (test helper). */
  seed(trigger: WorkflowTrigger): void {
    this.triggers.set(trigger.id, trigger);
  }

  async enable(triggerId: string): Promise<void> {
    const t = this.triggers.get(triggerId);
    if (!t) {
      throw new Error(`Trigger not found: ${triggerId}`);
    }
    this.triggers.set(triggerId, { ...t, enabled: true, updatedAt: new Date().toISOString() });
  }

  async disable(triggerId: string): Promise<void> {
    const t = this.triggers.get(triggerId);
    if (!t) {
      throw new Error(`Trigger not found: ${triggerId}`);
    }
    this.triggers.set(triggerId, { ...t, enabled: false, updatedAt: new Date().toISOString() });
  }

  async list(workflowId: string): Promise<WorkflowTrigger[]> {
    return [...this.triggers.values()].filter((t) => t.workflowId === workflowId);
  }

  async execute(triggerId: string, _payload?: unknown): Promise<{ runId: string }> {
    const t = this.triggers.get(triggerId);
    if (!t) {
      throw new Error(`Trigger not found: ${triggerId}`);
    }
    if (!t.enabled) {
      throw new Error(`Trigger ${triggerId} is disabled`);
    }

    // TODO: dispatch to the n8n API or Clawdbot runtime to actually start a run
    const runId = `run_${Date.now()}_${triggerId}`;
    return { runId };
  }
}

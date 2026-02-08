/**
 * SEC-005 (#79) — Secret rotation workflow
 *
 * Types and interface for managing the lifecycle of secrets (API keys,
 * tokens, credentials). Rotation schedules track when each secret was
 * last rotated and when it is due for renewal. The SecretRotator
 * interface abstracts provider-specific rotation logic so that callers
 * can trigger rotation uniformly.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Current status of a secret with respect to its rotation schedule. */
export type RotationStatus = "current" | "due" | "overdue" | "rotating" | "failed";

/** A schedule entry describing a managed secret and its rotation cadence. */
export type RotationSchedule = {
  /** Identifier of the secret (e.g. `"OPENAI_API_KEY"`, `"DISCORD_TOKEN"`). */
  secretId: string;
  /** Human-readable label. */
  label: string;
  /** Rotation interval in days. 0 = manual rotation only. */
  intervalDays: number;
  /** ISO-8601 timestamp of the last successful rotation. */
  lastRotatedAt: string | null;
  /** ISO-8601 timestamp of the next scheduled rotation. */
  nextRotationAt: string | null;
  /** Current rotation status. */
  status: RotationStatus;
};

/** The outcome of a single rotation attempt. */
export type RotationResult = {
  /** Secret that was rotated. */
  secretId: string;
  /** Whether the rotation succeeded. */
  success: boolean;
  /** ISO-8601 timestamp of when the rotation was attempted. */
  attemptedAt: string;
  /** ISO-8601 timestamp of when the rotation completed (null if still running). */
  completedAt: string | null;
  /** Error message if the rotation failed. */
  error?: string;
  /** Whether the previous secret was revoked after successful rotation. */
  previousRevoked: boolean;
};

// ---------------------------------------------------------------------------
// Service interface
// ---------------------------------------------------------------------------

/**
 * Provider-agnostic interface for rotating secrets.
 *
 * Implementations handle the mechanics of generating a new credential,
 * storing it in the vault, and (optionally) revoking the old one.
 */
export type SecretRotator = {
  /**
   * Rotate a single secret by its identifier.
   *
   * The implementation should:
   *   1. Generate or request a new credential value.
   *   2. Store the new value in the configured vault / secret store.
   *   3. Optionally revoke the previous credential.
   *   4. Update the rotation schedule entry.
   *
   * @param secretId - The secret to rotate.
   * @returns The result of the rotation attempt.
   */
  rotate(secretId: string): Promise<RotationResult>;

  /**
   * Return the current rotation schedule for all managed secrets.
   */
  listSchedules(): Promise<RotationSchedule[]>;

  /**
   * Return secrets that are due or overdue for rotation.
   */
  getDueRotations(): Promise<RotationSchedule[]>;
};

// ---------------------------------------------------------------------------
// Stub implementation
// ---------------------------------------------------------------------------

/**
 * In-memory stub rotator for development and testing.
 * Does not perform real rotation — records intent and returns a success stub.
 */
export class StubSecretRotator implements SecretRotator {
  private schedules: Map<string, RotationSchedule> = new Map();

  /** Register a secret for managed rotation. */
  addSchedule(schedule: RotationSchedule): void {
    this.schedules.set(schedule.secretId, { ...schedule });
  }

  async rotate(secretId: string): Promise<RotationResult> {
    const schedule = this.schedules.get(secretId);
    if (!schedule) {
      return {
        secretId,
        success: false,
        attemptedAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
        error: `No rotation schedule found for "${secretId}".`,
        previousRevoked: false,
      };
    }

    // TODO: integrate with real vault / provider APIs to issue new credentials
    const now = new Date().toISOString();
    schedule.lastRotatedAt = now;
    schedule.status = "current";
    schedule.nextRotationAt =
      schedule.intervalDays > 0
        ? new Date(Date.now() + schedule.intervalDays * 86_400_000).toISOString()
        : null;

    return {
      secretId,
      success: true,
      attemptedAt: now,
      completedAt: now,
      previousRevoked: false,
    };
  }

  async listSchedules(): Promise<RotationSchedule[]> {
    return [...this.schedules.values()];
  }

  async getDueRotations(): Promise<RotationSchedule[]> {
    const now = Date.now();
    return [...this.schedules.values()].filter((s) => {
      if (s.status === "due" || s.status === "overdue") {
        return true;
      }
      if (s.nextRotationAt && new Date(s.nextRotationAt).getTime() <= now) {
        return true;
      }
      return false;
    });
  }
}

/**
 * CORE-003 (#19) — Idempotency keys
 *
 * Branded string type and record structure for ensuring that duplicate
 * step executions within a run are detected and short-circuited.
 */

import crypto from "node:crypto";

/** Branded string so plain strings cannot be used where an idempotency key is expected. */
export type IdempotencyKey = string & { readonly __brand: "IdempotencyKey" };

export type IdempotencyStatus = "pending" | "completed" | "failed";

export type IdempotencyRecord = {
  key: IdempotencyKey;
  runId: string;
  stepIndex: number;
  status: IdempotencyStatus;
  createdAt: number;
  expiresAt: number;
};

/**
 * Derive a deterministic idempotency key from a run ID and step index.
 * The key is stable for a given (runId, stepIndex) pair so retries
 * resolve to the same record.
 */
export function generateIdempotencyKey(runId: string, stepIndex: number): IdempotencyKey {
  const raw = `${runId}:${stepIndex}`;
  const digest = crypto.createHash("sha256").update(raw).digest("base64url");
  return digest as IdempotencyKey;
}

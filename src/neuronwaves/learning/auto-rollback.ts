import type { NeuronWavesPolicy } from "../policy/types.js";
import { saveNeuronWavesPolicy } from "../policy/store.js";
import { appendLedgerEvent } from "./ledger.js";
import { appendPolicyHistory, readLastPolicyHistory } from "./policy-history.js";

export type RollbackDecision =
  | { shouldRollback: false; reason: string }
  | { shouldRollback: true; reason: string };

export function decidePolicyRollback(params: {
  policy: NeuronWavesPolicy;
  failureStreak: number;
}): RollbackDecision {
  // Minimal v1 heuristic: if devLevel=3 and we observe a short failure streak,
  // rollback the most recent policy change.
  if (params.policy.mode !== "dev" || (params.policy.devLevel ?? 1) !== 3) {
    return { shouldRollback: false, reason: "not-dev3" };
  }
  if (params.failureStreak >= 3) {
    return { shouldRollback: true, reason: `failure-streak:${params.failureStreak}` };
  }
  return { shouldRollback: false, reason: "below-threshold" };
}

export async function rollbackLastPolicyChange(params: {
  workspaceDir: string;
  nowMs?: number;
  reason: string;
}): Promise<{ rolledBack: boolean; message: string }> {
  const nowMs = params.nowMs ?? Date.now();
  const last = await readLastPolicyHistory(params.workspaceDir);
  if (!last) {
    return { rolledBack: false, message: "no policy history" };
  }

  // restore previous policy
  await saveNeuronWavesPolicy(params.workspaceDir, last.from);

  const ledger = await appendLedgerEvent({
    workspaceDir: params.workspaceDir,
    kind: "policy.rollback",
    payload: {
      reason: params.reason,
      from: last.to,
      to: last.from,
    },
    nowMs,
  });

  await appendPolicyHistory(params.workspaceDir, {
    atMs: nowMs,
    reason: `rollback:${params.reason}`,
    ledgerEventId: ledger.id,
    from: last.to,
    to: last.from,
  });

  return { rolledBack: true, message: `rolled back policy (event ${ledger.id})` };
}

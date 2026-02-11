import {
  claimReadyNotifications,
  isNotificationTerminal,
  transitionNotificationState,
  type NotificationRow,
} from "./store.js";

export type DeliveryWorkerSendParams = {
  targetSessionKey: string;
  message: string;
  metadata: {
    notificationId: string;
    taskId: string;
    messageId: string;
    mentionAlias: string;
  };
};

export type DeliveryWorkerSendResult = {
  ok: boolean;
  status?: "delivered" | "failed" | "timeout" | "deferred_busy";
  error?: string;
  busyReason?: string;
  etaAt?: number;
  nextCheckAt?: number;
  actorSessionKey?: string;
};

export type RunDeliveryWorkerParams = {
  sendViaSessions: (params: DeliveryWorkerSendParams) => Promise<DeliveryWorkerSendResult>;
  getMessageText: (messageId: string) => string | Promise<string>;
  limit?: number;
  maxAttempts?: number;
  retryDelayMs?: number;
  now?: number;
  dbPath?: string;
};

export type RunDeliveryWorkerResult = {
  polled: number;
  processed: number;
  delivered: number;
  deferredBusy: number;
  failed: number;
  timedOut: number;
  deadLettered: number;
  escalated: number;
  notifications: NotificationRow[];
};

export async function runMissionControlDeliveryWorker(
  params: RunDeliveryWorkerParams,
): Promise<RunDeliveryWorkerResult> {
  const now = params.now ?? Date.now();
  const maxAttempts = Math.max(1, Math.trunc(params.maxAttempts ?? 3));
  const retryDelayMs = Math.max(1_000, Math.trunc(params.retryDelayMs ?? 30_000));
  const rows = claimReadyNotifications({ dbPath: params.dbPath, limit: params.limit, now });

  const out: NotificationRow[] = [];
  let delivered = 0;
  let deferredBusy = 0;
  let failed = 0;
  let timedOut = 0;
  let deadLettered = 0;
  let escalated = 0;

  for (const row of rows) {
    const slaBreached = typeof row.sla_due_at === "number" && row.sla_due_at <= now;
    if (slaBreached) {
      const timeoutRow = transitionNotificationState({
        dbPath: params.dbPath,
        id: row.id,
        state: "timeout",
        error: "SLA breach",
        actorSessionKey: "system:delivery-worker",
      });
      if (timeoutRow) {
        out.push(timeoutRow);
        timedOut += 1;
        const reassigned = transitionNotificationState({
          dbPath: params.dbPath,
          id: row.id,
          state: "reassigned",
          force: true,
          error: "SLA breach reassigned",
          actorSessionKey: "system:delivery-worker",
        });
        if (reassigned) {
          out.push(reassigned);
          escalated += 1;
          const requeued = transitionNotificationState({
            dbPath: params.dbPath,
            id: row.id,
            state: "queued",
            force: true,
            retryAt: now,
            actorSessionKey: "system:delivery-worker",
          });
          if (requeued) {
            out.push(requeued);
          }
        }
      }
      continue;
    }

    const delivering = transitionNotificationState({
      dbPath: params.dbPath,
      id: row.id,
      state: "delivering",
      attempts: row.attempts + 1,
      actorSessionKey: "system:delivery-worker",
      retryAt: null,
      error: null,
    });
    if (!delivering) {
      continue;
    }

    try {
      const messageText = await params.getMessageText(row.message_id);
      const sendResult = await params.sendViaSessions({
        targetSessionKey: row.target_session_key,
        message: messageText,
        metadata: {
          notificationId: row.id,
          taskId: row.task_id,
          messageId: row.message_id,
          mentionAlias: row.mention_alias,
        },
      });

      if (sendResult.status === "deferred_busy") {
        const deferred = transitionNotificationState({
          dbPath: params.dbPath,
          id: row.id,
          state: "deferred_busy",
          busyReason: sendResult.busyReason ?? "busy",
          etaAt: sendResult.etaAt ?? null,
          nextCheckAt: sendResult.nextCheckAt ?? now + retryDelayMs,
          actorSessionKey: sendResult.actorSessionKey ?? row.target_session_key,
          retryAt: sendResult.nextCheckAt ?? now + retryDelayMs,
          error: null,
        });
        if (deferred) {
          out.push(deferred);
          deferredBusy += 1;
        }
        continue;
      }

      if (sendResult.ok && sendResult.status !== "failed" && sendResult.status !== "timeout") {
        const next = transitionNotificationState({
          dbPath: params.dbPath,
          id: row.id,
          state: "delivered",
          actorSessionKey: sendResult.actorSessionKey ?? row.target_session_key,
          retryAt: null,
          error: null,
        });
        if (next) {
          out.push(next);
          delivered += 1;
        }
        continue;
      }

      const timedOutStatus = sendResult.status === "timeout";
      const attempts = delivering.attempts;
      const shouldDeadLetter = attempts >= maxAttempts;
      const failedState = transitionNotificationState({
        dbPath: params.dbPath,
        id: row.id,
        state: timedOutStatus ? "timeout" : shouldDeadLetter ? "dead_letter" : "failed",
        attempts,
        retryAt: timedOutStatus || shouldDeadLetter ? null : now + retryDelayMs,
        error: sendResult.error ?? (timedOutStatus ? "delivery timeout" : "delivery failed"),
        actorSessionKey: "system:delivery-worker",
      });
      if (failedState) {
        out.push(failedState);
        if (timedOutStatus) {
          timedOut += 1;
        } else if (shouldDeadLetter || isNotificationTerminal(failedState.state)) {
          deadLettered += 1;
        } else {
          failed += 1;
        }
      }
    } catch (err) {
      const attempts = delivering.attempts;
      const shouldDeadLetter = attempts >= maxAttempts;
      const next = transitionNotificationState({
        dbPath: params.dbPath,
        id: row.id,
        state: shouldDeadLetter ? "dead_letter" : "failed",
        attempts,
        retryAt: shouldDeadLetter ? null : now + retryDelayMs,
        error: String(err),
        actorSessionKey: "system:delivery-worker",
      });
      if (next) {
        out.push(next);
        if (shouldDeadLetter) {
          deadLettered += 1;
        } else {
          failed += 1;
        }
      }
    }
  }

  return {
    polled: rows.length,
    processed: out.length,
    delivered,
    deferredBusy,
    failed,
    timedOut,
    deadLettered,
    escalated,
    notifications: out,
  };
}

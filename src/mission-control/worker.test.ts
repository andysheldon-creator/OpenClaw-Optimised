import { mkdtempSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  createTaskMessage,
  listNotifications,
  transitionNotificationState,
  upsertAgentAlias,
} from "./store.js";
import { runMissionControlDeliveryWorker } from "./worker.js";

function dbPathFor(name: string) {
  const dir = mkdtempSync(path.join(os.tmpdir(), `openclaw-mc-worker-${name}-`));
  return path.join(dir, "mission_control.db");
}

describe("mission-control delivery worker", () => {
  it("delivers queued notifications automatically and updates state", async () => {
    const dbPath = dbPathFor("deliver");
    upsertAgentAlias({ dbPath, alias: "Vision", sessionKey: "agent:vision:main" });

    const message = createTaskMessage({
      dbPath,
      taskId: "task-worker",
      authorSessionKey: "agent:dev:main",
      content: "please review @Vision",
    });

    const res = await runMissionControlDeliveryWorker({
      dbPath,
      getMessageText: () => message.content,
      sendViaSessions: async () => ({ ok: true, status: "delivered" }),
    });

    expect(res.polled).toBe(1);
    expect(res.delivered).toBe(1);
    const row = listNotifications({ dbPath, taskId: "task-worker" })[0];
    expect(row?.state).toBe("delivered");
    expect(typeof row?.delivering_at).toBe("number");
    expect(typeof row?.delivered_at).toBe("number");
  });

  it("supports busy defer then resumed check with two target agents", async () => {
    const dbPath = dbPathFor("busy");
    upsertAgentAlias({ dbPath, alias: "Vision", sessionKey: "agent:vision:main" });
    upsertAgentAlias({ dbPath, alias: "Ops", sessionKey: "agent:ops:main" });

    const message = createTaskMessage({
      dbPath,
      taskId: "task-busy",
      authorSessionKey: "agent:dev:main",
      content: "@Vision @Ops please pick this up",
      slaMs: 300_000,
    });

    const firstNow = Date.now();
    const firstRun = await runMissionControlDeliveryWorker({
      dbPath,
      now: firstNow,
      getMessageText: () => message.content,
      sendViaSessions: async ({ targetSessionKey }) => {
        if (targetSessionKey === "agent:vision:main") {
          return {
            ok: true,
            status: "deferred_busy",
            busyReason: "deploy window",
            etaAt: firstNow + 120_000,
            nextCheckAt: firstNow + 10_000,
            actorSessionKey: targetSessionKey,
          };
        }
        return { ok: true, status: "delivered", actorSessionKey: targetSessionKey };
      },
    });

    expect(firstRun.polled).toBe(2);
    expect(firstRun.delivered).toBe(1);
    expect(firstRun.deferredBusy).toBe(1);

    const firstRows = listNotifications({ dbPath, taskId: "task-busy" });
    const visionDeferred = firstRows.find((n) => n.target_session_key === "agent:vision:main");
    const opsDelivered = firstRows.find((n) => n.target_session_key === "agent:ops:main");
    expect(visionDeferred?.state).toBe("deferred_busy");
    expect(visionDeferred?.busy_reason).toBe("deploy window");
    expect(opsDelivered?.state).toBe("delivered");

    const secondRun = await runMissionControlDeliveryWorker({
      dbPath,
      now: firstNow + 11_000,
      getMessageText: () => message.content,
      sendViaSessions: async () => ({ ok: true, status: "delivered" }),
    });

    expect(secondRun.polled).toBe(1);
    expect(secondRun.delivered).toBe(1);
    const visionFinal = listNotifications({ dbPath, taskId: "task-busy" }).find(
      (n) => n.target_session_key === "agent:vision:main",
    );
    expect(visionFinal?.state).toBe("delivered");
  });

  it("triggers timeout escalation path on SLA breach", async () => {
    const dbPath = dbPathFor("timeout");
    upsertAgentAlias({ dbPath, alias: "Vision", sessionKey: "agent:vision:main" });
    createTaskMessage({
      dbPath,
      taskId: "task-timeout",
      authorSessionKey: "agent:dev:main",
      content: "urgent @Vision",
      slaMs: 1,
    });

    const now = Date.now() + 5_000;
    const res = await runMissionControlDeliveryWorker({
      dbPath,
      now,
      getMessageText: () => "urgent",
      sendViaSessions: async () => ({ ok: true, status: "delivered" }),
    });

    expect(res.timedOut).toBe(1);
    expect(res.escalated).toBe(1);
    const row = listNotifications({ dbPath, taskId: "task-timeout" })[0];
    expect(row?.state).toBe("queued");
    expect(typeof row?.timeout_at).toBe("number");
    expect(typeof row?.reassigned_at).toBe("number");
  });

  it("records ack reaction path end-to-end", async () => {
    const dbPath = dbPathFor("ack");
    upsertAgentAlias({ dbPath, alias: "Vision", sessionKey: "agent:vision:main" });
    createTaskMessage({
      dbPath,
      taskId: "task-ack",
      authorSessionKey: "agent:dev:main",
      content: "ack me @Vision",
    });

    const n = listNotifications({ dbPath, taskId: "task-ack" })[0];
    if (!n) throw new Error("missing notification");
    transitionNotificationState({ dbPath, id: n.id, state: "delivering", attempts: 1 });
    transitionNotificationState({ dbPath, id: n.id, state: "delivered" });
    transitionNotificationState({
      dbPath,
      id: n.id,
      state: "seen",
      actorSessionKey: "agent:vision:main",
    });
    transitionNotificationState({
      dbPath,
      id: n.id,
      state: "accepted",
      actorSessionKey: "agent:vision:main",
    });
    transitionNotificationState({
      dbPath,
      id: n.id,
      state: "in_progress",
      actorSessionKey: "agent:vision:main",
    });
    const done = transitionNotificationState({
      dbPath,
      id: n.id,
      state: "completed",
      actorSessionKey: "agent:vision:main",
    });
    expect(done?.state).toBe("completed");
    expect(typeof done?.completed_at).toBe("number");
  });
});

import { mkdtempSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  createTaskMessage,
  getThreadUnreadCount,
  listNotifications,
  listTaskMessages,
  listTaskNotifications,
  markThreadReadState,
  MISSION_CONTROL_MIGRATION_SQL,
  parseMentions,
  runMissionControlMigrations,
  transitionNotificationState,
  upsertAgentAlias,
} from "./store.js";

describe("mission-control task thread store", () => {
  it("creates idempotent migration tables and stores messages by task_id", () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), "openclaw-mc-"));
    const dbPath = path.join(dir, "mission_control.db");

    runMissionControlMigrations(dbPath);
    runMissionControlMigrations(dbPath);
    expect(MISSION_CONTROL_MIGRATION_SQL).toContain("task_messages");
    expect(MISSION_CONTROL_MIGRATION_SQL).toContain("agent_aliases");
    expect(MISSION_CONTROL_MIGRATION_SQL).toContain("notifications");
    expect(MISSION_CONTROL_MIGRATION_SQL).toContain("thread_read_state");

    createTaskMessage({
      dbPath,
      taskId: "task-a",
      authorSessionKey: "agent:dev:main",
      content: "hello @Vision",
    });
    createTaskMessage({
      dbPath,
      taskId: "task-b",
      authorSessionKey: "agent:other:main",
      content: "task b",
    });

    const taskA = listTaskMessages({ dbPath, taskId: "task-a" });
    const taskB = listTaskMessages({ dbPath, taskId: "task-b" });
    expect(taskA).toHaveLength(1);
    expect(taskB).toHaveLength(1);
    expect(taskA[0]?.mentions_json).toContain("Vision");
  });

  it("extracts mentions without delivery semantics", () => {
    expect(parseMentions("hi @Vision and @agent:seo-analyst:main")).toEqual([
      "Vision",
      "agent:seo-analyst:main",
    ]);
  });

  it("resolves aliases to session keys and enqueues one queued notification per target", () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), "openclaw-mc-"));
    const dbPath = path.join(dir, "mission_control.db");

    upsertAgentAlias({ dbPath, alias: "Vision", sessionKey: "agent:vision:main" });
    upsertAgentAlias({ dbPath, alias: "ops", sessionKey: "agent:ops:main" });

    const message = createTaskMessage({
      dbPath,
      taskId: "task-notify",
      authorSessionKey: "agent:dev:main",
      content: "Heads up @Vision @Vision @ops @agent:seo-analyst:main",
      slaMs: 60_000,
    });

    const notifications = listNotifications({ dbPath, taskId: "task-notify" });
    expect(notifications).toHaveLength(3);
    expect(notifications.map((n) => n.message_id)).toEqual([message.id, message.id, message.id]);
    expect(notifications.map((n) => n.state)).toEqual(["queued", "queued", "queued"]);
    expect(notifications.every((n) => typeof n.sla_due_at === "number")).toBe(true);
    expect(notifications.map((n) => n.target_session_key).sort()).toEqual([
      "agent:ops:main",
      "agent:seo-analyst:main",
      "agent:vision:main",
    ]);
  });

  it("supports full reaction lifecycle transitions with busy metadata", () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), "openclaw-mc-"));
    const dbPath = path.join(dir, "mission_control.db");

    upsertAgentAlias({ dbPath, alias: "Vision", sessionKey: "agent:vision:main" });
    createTaskMessage({
      dbPath,
      taskId: "task-lifecycle",
      authorSessionKey: "agent:dev:main",
      content: "ping @Vision",
    });

    const queued = listNotifications({ dbPath, taskId: "task-lifecycle" })[0];
    if (!queued) {
      throw new Error("expected queued notification");
    }

    const delivering = transitionNotificationState({
      dbPath,
      id: queued.id,
      state: "delivering",
      attempts: 1,
    });
    expect(delivering?.state).toBe("delivering");

    const delivered = transitionNotificationState({ dbPath, id: queued.id, state: "delivered" });
    expect(delivered?.state).toBe("delivered");

    const seen = transitionNotificationState({ dbPath, id: queued.id, state: "seen" });
    expect(seen?.state).toBe("seen");

    const accepted = transitionNotificationState({
      dbPath,
      id: queued.id,
      state: "accepted",
      actorSessionKey: "agent:vision:main",
    });
    expect(accepted?.actor_session_key).toBe("agent:vision:main");

    const inProgress = transitionNotificationState({ dbPath, id: queued.id, state: "in_progress" });
    expect(inProgress?.state).toBe("in_progress");

    const deferredBusy = transitionNotificationState({
      dbPath,
      id: queued.id,
      state: "deferred_busy",
      busyReason: "On call",
      etaAt: Date.now() + 30_000,
      nextCheckAt: Date.now() + 15_000,
    });
    expect(deferredBusy?.state).toBe("deferred_busy");
    expect(deferredBusy?.busy_reason).toBe("On call");
    expect(typeof deferredBusy?.next_check_at).toBe("number");

    const resumed = transitionNotificationState({
      dbPath,
      id: queued.id,
      state: "in_progress",
      force: true,
    });
    expect(resumed?.state).toBe("in_progress");

    const completed = transitionNotificationState({ dbPath, id: queued.id, state: "completed" });
    expect(completed?.state).toBe("completed");

    const byMessage = listTaskNotifications({ dbPath, taskId: "task-lifecycle" });
    expect(byMessage[0]?.completed_at).toBeTypeOf("number");
  });

  it("tracks read/unread pointers per task/session", () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), "openclaw-mc-"));
    const dbPath = path.join(dir, "mission_control.db");

    createTaskMessage({
      dbPath,
      taskId: "task-unread",
      authorSessionKey: "agent:a:main",
      content: "hello world",
    });
    const second = createTaskMessage({
      dbPath,
      taskId: "task-unread",
      authorSessionKey: "agent:a:main",
      content: "second",
    });

    const unreadBefore = getThreadUnreadCount({
      dbPath,
      taskId: "task-unread",
      sessionKey: "agent:b:main",
    });
    expect(unreadBefore.unread).toBe(2);

    markThreadReadState({
      dbPath,
      taskId: "task-unread",
      sessionKey: "agent:b:main",
      lastReadMessageId: second.id,
      lastReadAt: second.created_at,
    });
    const unreadAfter = getThreadUnreadCount({
      dbPath,
      taskId: "task-unread",
      sessionKey: "agent:b:main",
    });
    expect(unreadAfter.unread).toBe(0);
  });
});

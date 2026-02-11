import type { IncomingMessage, ServerResponse } from "node:http";
import { mkdtempSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { handleMissionControlHttpRequest } from "./http.js";
import { createTaskMessage, runMissionControlMigrations, upsertAgentAlias } from "./store.js";

function makeRes() {
  let body = "";
  const headers = new Map<string, string>();
  const res = {
    statusCode: 200,
    setHeader: (name: string, value: string) => {
      headers.set(name.toLowerCase(), value);
    },
    end: (chunk?: string) => {
      body = chunk ?? "";
      return res;
    },
  } as unknown as ServerResponse;
  return {
    res,
    getBody: () => body,
    getHeader: (name: string) => headers.get(name.toLowerCase()),
  };
}

describe("handleMissionControlHttpRequest notifications debug endpoint", () => {
  let dbPath = "";

  beforeEach(() => {
    const dir = mkdtempSync(path.join(os.tmpdir(), "openclaw-mc-http-"));
    dbPath = path.join(dir, "mission_control.db");
    runMissionControlMigrations(dbPath);
    upsertAgentAlias({ dbPath, alias: "Vision", sessionKey: "agent:vision:main" });
    createTaskMessage({
      dbPath,
      taskId: "task-http",
      authorSessionKey: "agent:dev:main",
      content: "hello @Vision",
    });
    process.env.MISSION_CONTROL_DB_PATH = dbPath;
  });

  it("returns read-only queue state for a task", async () => {
    const req = {
      method: "GET",
      url: "/api/mission-control/tasks/task-http/notifications?limit=10",
    } as IncomingMessage;
    const mock = makeRes();

    const handled = await handleMissionControlHttpRequest(req, mock.res);

    expect(handled).toBe(true);
    expect(mock.res.statusCode).toBe(200);
    expect(mock.getHeader("content-type")).toContain("application/json");
    const payload = JSON.parse(mock.getBody()) as {
      ok: boolean;
      taskId: string;
      queue: { total: number; notifications: Array<{ state: string; target_session_key: string }> };
    };
    expect(payload.ok).toBe(true);
    expect(payload.taskId).toBe("task-http");
    expect(payload.queue.total).toBe(1);
    expect(payload.queue.notifications[0]?.state).toBe("queued");
    expect(payload.queue.notifications[0]?.target_session_key).toBe("agent:vision:main");
  });

  it("supports read/unread endpoints", async () => {
    const getReq = {
      method: "GET",
      url: "/api/mission-control/tasks/task-http/unread/agent%3Avision%3Amain",
    } as IncomingMessage;
    const getRes = makeRes();
    await handleMissionControlHttpRequest(getReq, getRes.res);
    const before = JSON.parse(getRes.getBody()) as { unread: number };
    expect(before.unread).toBe(1);

    const listReq = {
      method: "GET",
      url: "/api/mission-control/tasks/task-http/messages",
    } as IncomingMessage;
    const listRes = makeRes();
    await handleMissionControlHttpRequest(listReq, listRes.res);
    const listPayload = JSON.parse(listRes.getBody()) as {
      messages: Array<{ id: string; created_at: number }>;
    };

    const postReq = {
      method: "POST",
      url: "/api/mission-control/tasks/task-http/unread/agent%3Avision%3Amain",
      [Symbol.asyncIterator]: async function* () {
        yield Buffer.from(
          JSON.stringify({
            lastReadMessageId: listPayload.messages[0]?.id,
            lastReadAt: listPayload.messages[0]?.created_at,
          }),
        );
      },
    } as unknown as IncomingMessage;
    const postRes = makeRes();
    await handleMissionControlHttpRequest(postReq, postRes.res);
    const after = JSON.parse(postRes.getBody()) as { unread: { unread: number } };
    expect(after.unread.unread).toBe(0);
  });

  it("keeps notifications list endpoint read-only", async () => {
    const req = {
      method: "POST",
      url: "/api/mission-control/tasks/task-http/notifications",
    } as IncomingMessage;
    const mock = makeRes();

    const handled = await handleMissionControlHttpRequest(req, mock.res);

    expect(handled).toBe(true);
    expect(mock.res.statusCode).toBe(405);
  });
});

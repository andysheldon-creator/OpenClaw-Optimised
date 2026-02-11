import type { IncomingMessage, ServerResponse } from "node:http";
import {
  createTaskMessage,
  getThreadUnreadCount,
  listNotifications,
  listTaskMessages,
  listTaskNotifications,
  markThreadReadState,
  transitionNotificationState,
  type NotificationState,
} from "./store.js";

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(body));
}

async function readJsonBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  const raw = Buffer.concat(chunks).toString("utf8").trim();
  if (!raw) {
    return {};
  }
  return JSON.parse(raw);
}

function extractTaskMessagesTaskId(pathname: string): string | null {
  const match = /^\/api\/mission-control\/tasks\/([^/]+)\/messages\/?$/i.exec(pathname);
  return match?.[1] ? decodeURIComponent(match[1]) : null;
}

function extractTaskNotificationsTaskId(pathname: string): string | null {
  const match = /^\/api\/mission-control\/tasks\/([^/]+)\/notifications\/?$/i.exec(pathname);
  return match?.[1] ? decodeURIComponent(match[1]) : null;
}

function extractTaskUnread(pathname: string): { taskId: string; sessionKey: string } | null {
  const match =
    /^\/api\/mission-control\/tasks\/([^/]+)\/unread\/([^/]+)\/?$/i.exec(pathname) ??
    /^\/api\/mission-control\/tasks\/([^/]+)\/read-state\/([^/]+)\/?$/i.exec(pathname);
  if (!match?.[1] || !match[2]) {
    return null;
  }
  return { taskId: decodeURIComponent(match[1]), sessionKey: decodeURIComponent(match[2]) };
}

function extractNotificationId(pathname: string): string | null {
  const match = /^\/api\/mission-control\/notifications\/([^/]+)\/?$/i.exec(pathname);
  return match?.[1] ? decodeURIComponent(match[1]) : null;
}

function parseNotificationState(raw: string | null): NotificationState | undefined {
  if (!raw) {
    return undefined;
  }
  const value = raw.trim().toLowerCase() as NotificationState;
  const allowed: NotificationState[] = [
    "queued",
    "delivering",
    "delivered",
    "seen",
    "accepted",
    "in_progress",
    "completed",
    "declined",
    "deferred_busy",
    "timeout",
    "failed",
    "dead_letter",
    "reassigned",
  ];
  return allowed.includes(value) ? value : undefined;
}

export async function handleMissionControlHttpRequest(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<boolean> {
  const url = new URL(req.url ?? "/", "http://localhost");

  const notificationId = extractNotificationId(url.pathname);
  if (notificationId) {
    if (req.method !== "PATCH") {
      res.statusCode = 405;
      res.setHeader("Allow", "PATCH");
      res.end("Method Not Allowed");
      return true;
    }
    try {
      const body = (await readJsonBody(req)) as {
        state?: string;
        attempts?: number;
        retryAt?: number | null;
        error?: string | null;
        actorSessionKey?: string | null;
        busyReason?: string | null;
        etaAt?: number | null;
        nextCheckAt?: number | null;
      };
      const state = parseNotificationState(body.state ?? null);
      if (!state) {
        sendJson(res, 400, { ok: false, error: "state is required and must be valid" });
        return true;
      }
      const updated = transitionNotificationState({
        id: notificationId,
        state,
        attempts: typeof body.attempts === "number" ? body.attempts : undefined,
        retryAt: body.retryAt,
        error: body.error,
        actorSessionKey: body.actorSessionKey,
        busyReason: body.busyReason,
        etaAt: body.etaAt,
        nextCheckAt: body.nextCheckAt,
      });
      if (!updated) {
        sendJson(res, 404, { ok: false, error: "notification not found" });
        return true;
      }
      sendJson(res, 200, { ok: true, notification: updated });
      return true;
    } catch (err) {
      sendJson(res, 400, { ok: false, error: `invalid json: ${String(err)}` });
      return true;
    }
  }

  const unreadRef = extractTaskUnread(url.pathname);
  if (unreadRef) {
    if (req.method === "GET") {
      const unread = getThreadUnreadCount({
        taskId: unreadRef.taskId,
        sessionKey: unreadRef.sessionKey,
      });
      sendJson(res, 200, { ok: true, ...unread });
      return true;
    }
    if (req.method === "POST") {
      try {
        const body = (await readJsonBody(req)) as {
          lastReadMessageId?: string | null;
          lastReadAt?: number;
        };
        const state = markThreadReadState({
          taskId: unreadRef.taskId,
          sessionKey: unreadRef.sessionKey,
          lastReadMessageId:
            typeof body.lastReadMessageId === "string" ? body.lastReadMessageId : null,
          lastReadAt: typeof body.lastReadAt === "number" ? body.lastReadAt : undefined,
        });
        const unread = getThreadUnreadCount({
          taskId: unreadRef.taskId,
          sessionKey: unreadRef.sessionKey,
        });
        sendJson(res, 200, { ok: true, readState: state, unread });
        return true;
      } catch (err) {
        sendJson(res, 400, { ok: false, error: `invalid json: ${String(err)}` });
        return true;
      }
    }
    res.statusCode = 405;
    res.setHeader("Allow", "GET, POST");
    res.end("Method Not Allowed");
    return true;
  }

  const notificationsTaskId = extractTaskNotificationsTaskId(url.pathname);
  if (notificationsTaskId) {
    if (req.method !== "GET") {
      res.statusCode = 405;
      res.setHeader("Allow", "GET");
      res.end("Method Not Allowed");
      return true;
    }

    const limitRaw = Number(url.searchParams.get("limit") ?? "200");
    const limit = Number.isFinite(limitRaw)
      ? Math.max(1, Math.min(1000, Math.trunc(limitRaw)))
      : 200;
    const stateRaw = url.searchParams.get("state");
    const state = parseNotificationState(stateRaw);
    if (stateRaw && !state) {
      sendJson(res, 400, { ok: false, error: `invalid state: ${stateRaw}` });
      return true;
    }

    const notifications = listNotifications({ taskId: notificationsTaskId, state, limit });
    sendJson(res, 200, {
      ok: true,
      taskId: notificationsTaskId,
      queue: {
        total: notifications.length,
        notifications,
      },
    });
    return true;
  }

  const taskId = extractTaskMessagesTaskId(url.pathname);
  if (!taskId) {
    return false;
  }

  if (req.method === "GET") {
    const limitRaw = Number(url.searchParams.get("limit") ?? "200");
    const limit = Number.isFinite(limitRaw)
      ? Math.max(1, Math.min(500, Math.trunc(limitRaw)))
      : 200;
    const messages = listTaskMessages({ taskId, limit });
    const notifications = listTaskNotifications({ taskId });
    sendJson(res, 200, { ok: true, taskId, messages, notifications });
    return true;
  }

  if (req.method === "POST") {
    try {
      const body = (await readJsonBody(req)) as {
        authorSessionKey?: unknown;
        content?: unknown;
        slaMs?: unknown;
      };
      const authorSessionKey =
        typeof body.authorSessionKey === "string" && body.authorSessionKey.trim()
          ? body.authorSessionKey.trim()
          : "agent:dev:main";
      const content = typeof body.content === "string" ? body.content.trim() : "";
      if (!content) {
        sendJson(res, 400, { ok: false, error: "content is required" });
        return true;
      }
      const slaMs = typeof body.slaMs === "number" ? body.slaMs : undefined;
      const message = createTaskMessage({ taskId, authorSessionKey, content, slaMs });
      sendJson(res, 201, { ok: true, taskId, message });
      return true;
    } catch (err) {
      sendJson(res, 400, { ok: false, error: `invalid json: ${String(err)}` });
      return true;
    }
  }

  res.statusCode = 405;
  res.setHeader("Allow", "GET, POST");
  res.end("Method Not Allowed");
  return true;
}

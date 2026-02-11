import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

export type TaskMessageRow = {
  id: string;
  task_id: string;
  author_session_key: string;
  content: string;
  mentions_json: string;
  created_at: number;
};

export type NotificationState =
  | "queued"
  | "delivering"
  | "delivered"
  | "seen"
  | "accepted"
  | "in_progress"
  | "completed"
  | "declined"
  | "deferred_busy"
  | "timeout"
  | "failed"
  | "dead_letter"
  | "reassigned";

export type NotificationRow = {
  id: string;
  message_id: string;
  task_id: string;
  mention_alias: string;
  target_session_key: string;
  state: NotificationState;
  attempts: number;
  retry_at: number | null;
  error: string | null;
  actor_session_key: string | null;
  busy_reason: string | null;
  eta_at: number | null;
  next_check_at: number | null;
  sla_due_at: number | null;
  queued_at: number | null;
  delivering_at: number | null;
  delivered_at: number | null;
  seen_at: number | null;
  accepted_at: number | null;
  in_progress_at: number | null;
  completed_at: number | null;
  declined_at: number | null;
  deferred_busy_at: number | null;
  timeout_at: number | null;
  failed_at: number | null;
  dead_letter_at: number | null;
  reassigned_at: number | null;
  created_at: number;
  updated_at: number;
};

export type ThreadReadStateRow = {
  task_id: string;
  session_key: string;
  last_read_message_id: string | null;
  last_read_at: number;
  updated_at: number;
};

export type NotificationWithMessage = NotificationRow & {
  message_created_at: number;
  message_content: string;
};

const NOTIFICATION_STATES: ReadonlySet<NotificationState> = new Set([
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
]);

const TERMINAL_STATES: ReadonlySet<NotificationState> = new Set([
  "completed",
  "declined",
  "timeout",
  "dead_letter",
]);

const RETRYABLE_STATES: ReadonlySet<NotificationState> = new Set([
  "queued",
  "failed",
  "deferred_busy",
]);

const STATE_TO_TIMESTAMP_FIELD: Record<NotificationState, keyof NotificationRow> = {
  queued: "queued_at",
  delivering: "delivering_at",
  delivered: "delivered_at",
  seen: "seen_at",
  accepted: "accepted_at",
  in_progress: "in_progress_at",
  completed: "completed_at",
  declined: "declined_at",
  deferred_busy: "deferred_busy_at",
  timeout: "timeout_at",
  failed: "failed_at",
  dead_letter: "dead_letter_at",
  reassigned: "reassigned_at",
};

const TRANSITIONS: Readonly<Record<NotificationState, ReadonlySet<NotificationState>>> = {
  queued: new Set(["delivering", "reassigned", "timeout"]),
  delivering: new Set(["delivered", "deferred_busy", "failed", "timeout", "dead_letter"]),
  delivered: new Set(["seen", "accepted", "declined", "deferred_busy", "timeout"]),
  seen: new Set(["accepted", "declined", "deferred_busy", "timeout"]),
  accepted: new Set(["in_progress", "completed", "deferred_busy", "timeout"]),
  in_progress: new Set(["completed", "deferred_busy", "timeout"]),
  completed: new Set([]),
  declined: new Set([]),
  deferred_busy: new Set(["queued", "delivering", "accepted", "in_progress", "timeout"]),
  timeout: new Set(["reassigned"]),
  failed: new Set(["queued", "delivering", "dead_letter", "timeout"]),
  dead_letter: new Set([]),
  reassigned: new Set(["queued", "delivering"]),
};

export const MISSION_CONTROL_MIGRATION_SQL = `
CREATE TABLE IF NOT EXISTS task_messages (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL,
  author_session_key TEXT NOT NULL,
  content TEXT NOT NULL,
  mentions_json TEXT NOT NULL DEFAULT '[]',
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_task_messages_task_created
  ON task_messages(task_id, created_at);

CREATE TABLE IF NOT EXISTS agent_aliases (
  alias TEXT PRIMARY KEY,
  session_key TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS notifications (
  id TEXT PRIMARY KEY,
  message_id TEXT NOT NULL,
  task_id TEXT NOT NULL,
  mention_alias TEXT NOT NULL,
  target_session_key TEXT NOT NULL,
  state TEXT NOT NULL CHECK (state IN ('queued','delivering','delivered','seen','accepted','in_progress','completed','declined','deferred_busy','timeout','failed','dead_letter','reassigned')),
  attempts INTEGER NOT NULL DEFAULT 0,
  retry_at INTEGER,
  error TEXT,
  actor_session_key TEXT,
  busy_reason TEXT,
  eta_at INTEGER,
  next_check_at INTEGER,
  sla_due_at INTEGER,
  queued_at INTEGER,
  delivering_at INTEGER,
  delivered_at INTEGER,
  seen_at INTEGER,
  accepted_at INTEGER,
  in_progress_at INTEGER,
  completed_at INTEGER,
  declined_at INTEGER,
  deferred_busy_at INTEGER,
  timeout_at INTEGER,
  failed_at INTEGER,
  dead_letter_at INTEGER,
  reassigned_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY(message_id) REFERENCES task_messages(id) ON DELETE CASCADE,
  UNIQUE(message_id, target_session_key)
);

CREATE TABLE IF NOT EXISTS thread_read_state (
  task_id TEXT NOT NULL,
  session_key TEXT NOT NULL,
  last_read_message_id TEXT,
  last_read_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY(task_id, session_key),
  FOREIGN KEY(last_read_message_id) REFERENCES task_messages(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_notifications_task_created
  ON notifications(task_id, created_at);

CREATE INDEX IF NOT EXISTS idx_notifications_state_retry
  ON notifications(state, retry_at, created_at);

CREATE INDEX IF NOT EXISTS idx_notifications_target_state
  ON notifications(target_session_key, state, created_at);

CREATE INDEX IF NOT EXISTS idx_notifications_ready
  ON notifications(state, retry_at, next_check_at, created_at);

CREATE INDEX IF NOT EXISTS idx_thread_read_state_task
  ON thread_read_state(task_id, session_key, updated_at);
`;

const MIGRATION_BACKFILL_SQL = [
  "ALTER TABLE notifications ADD COLUMN actor_session_key TEXT",
  "ALTER TABLE notifications ADD COLUMN busy_reason TEXT",
  "ALTER TABLE notifications ADD COLUMN eta_at INTEGER",
  "ALTER TABLE notifications ADD COLUMN next_check_at INTEGER",
  "ALTER TABLE notifications ADD COLUMN sla_due_at INTEGER",
  "ALTER TABLE notifications ADD COLUMN queued_at INTEGER",
  "ALTER TABLE notifications ADD COLUMN delivering_at INTEGER",
  "ALTER TABLE notifications ADD COLUMN delivered_at INTEGER",
  "ALTER TABLE notifications ADD COLUMN seen_at INTEGER",
  "ALTER TABLE notifications ADD COLUMN accepted_at INTEGER",
  "ALTER TABLE notifications ADD COLUMN in_progress_at INTEGER",
  "ALTER TABLE notifications ADD COLUMN completed_at INTEGER",
  "ALTER TABLE notifications ADD COLUMN declined_at INTEGER",
  "ALTER TABLE notifications ADD COLUMN deferred_busy_at INTEGER",
  "ALTER TABLE notifications ADD COLUMN timeout_at INTEGER",
  "ALTER TABLE notifications ADD COLUMN failed_at INTEGER",
  "ALTER TABLE notifications ADD COLUMN dead_letter_at INTEGER",
  "ALTER TABLE notifications ADD COLUMN reassigned_at INTEGER",
  "CREATE TABLE IF NOT EXISTS thread_read_state (task_id TEXT NOT NULL, session_key TEXT NOT NULL, last_read_message_id TEXT, last_read_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, PRIMARY KEY(task_id, session_key), FOREIGN KEY(last_read_message_id) REFERENCES task_messages(id) ON DELETE SET NULL)",
  "CREATE INDEX IF NOT EXISTS idx_notifications_ready ON notifications(state, retry_at, next_check_at, created_at)",
  "CREATE INDEX IF NOT EXISTS idx_thread_read_state_task ON thread_read_state(task_id, session_key, updated_at)",
] as const;

function resolveDbPath(explicitPath?: string): string {
  const dbPath =
    explicitPath ??
    process.env.MISSION_CONTROL_DB_PATH ??
    path.join(process.cwd(), "data", "mission_control.db");
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  return dbPath;
}

export function parseMentions(content: string): string[] {
  const found = content.match(/@([a-zA-Z0-9:_./-]+)/g) ?? [];
  return Array.from(new Set(found.map((raw) => raw.slice(1).trim()).filter(Boolean)));
}

function openDb(dbPath?: string): DatabaseSync {
  return new DatabaseSync(resolveDbPath(dbPath));
}

function toNumberOrNull(value: unknown): number | null {
  return value === null || value === undefined ? null : Number(value);
}

function toStringOrNull(value: unknown): string | null {
  return value === null || value === undefined ? null : String(value);
}

function toNotificationRow(row: Record<string, unknown>): NotificationRow {
  return {
    id: String(row.id ?? ""),
    message_id: String(row.message_id ?? ""),
    task_id: String(row.task_id ?? ""),
    mention_alias: String(row.mention_alias ?? ""),
    target_session_key: String(row.target_session_key ?? ""),
    state: String(row.state ?? "queued") as NotificationState,
    attempts: Number(row.attempts ?? 0),
    retry_at: toNumberOrNull(row.retry_at),
    error: toStringOrNull(row.error),
    actor_session_key: toStringOrNull(row.actor_session_key),
    busy_reason: toStringOrNull(row.busy_reason),
    eta_at: toNumberOrNull(row.eta_at),
    next_check_at: toNumberOrNull(row.next_check_at),
    sla_due_at: toNumberOrNull(row.sla_due_at),
    queued_at: toNumberOrNull(row.queued_at),
    delivering_at: toNumberOrNull(row.delivering_at),
    delivered_at: toNumberOrNull(row.delivered_at),
    seen_at: toNumberOrNull(row.seen_at),
    accepted_at: toNumberOrNull(row.accepted_at),
    in_progress_at: toNumberOrNull(row.in_progress_at),
    completed_at: toNumberOrNull(row.completed_at),
    declined_at: toNumberOrNull(row.declined_at),
    deferred_busy_at: toNumberOrNull(row.deferred_busy_at),
    timeout_at: toNumberOrNull(row.timeout_at),
    failed_at: toNumberOrNull(row.failed_at),
    dead_letter_at: toNumberOrNull(row.dead_letter_at),
    reassigned_at: toNumberOrNull(row.reassigned_at),
    created_at: Number(row.created_at ?? 0),
    updated_at: Number(row.updated_at ?? 0),
  };
}

function resolveMentionTargets(
  db: DatabaseSync,
  mentions: string[],
): Array<{ mentionAlias: string; sessionKey: string }> {
  const byAlias = db.prepare(
    `SELECT session_key
     FROM agent_aliases
     WHERE alias = ? OR lower(alias) = lower(?)
     LIMIT 1`,
  );
  const out = new Map<string, { mentionAlias: string; sessionKey: string }>();

  for (const mentionAlias of mentions) {
    const explicitSession = mentionAlias.startsWith("agent:") ? mentionAlias : null;
    const aliasRow = explicitSession
      ? null
      : (byAlias.get(mentionAlias, mentionAlias) as { session_key?: string } | undefined);
    const sessionKey = explicitSession ?? aliasRow?.session_key?.trim();
    if (!sessionKey) {
      continue;
    }
    if (!out.has(sessionKey)) {
      out.set(sessionKey, { mentionAlias, sessionKey });
    }
  }

  return [...out.values()];
}

function runBackfillMigrations(db: DatabaseSync): void {
  for (const sql of MIGRATION_BACKFILL_SQL) {
    try {
      db.exec(sql);
    } catch {
      // ignore duplicate-column style migration errors
    }
  }
}

export function runMissionControlMigrations(dbPath?: string): void {
  const db = openDb(dbPath);
  try {
    db.exec(MISSION_CONTROL_MIGRATION_SQL);
    runBackfillMigrations(db);
  } finally {
    db.close();
  }
}

export function upsertAgentAlias(params: {
  alias: string;
  sessionKey: string;
  dbPath?: string;
}): void {
  const alias = params.alias.trim();
  const sessionKey = params.sessionKey.trim();
  if (!alias || !sessionKey) {
    throw new Error("alias and sessionKey are required");
  }

  const now = Date.now();
  const db = openDb(params.dbPath);
  try {
    db.exec(MISSION_CONTROL_MIGRATION_SQL);
    runBackfillMigrations(db);
    db.prepare(
      `INSERT INTO agent_aliases (alias, session_key, created_at, updated_at)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(alias) DO UPDATE SET
         session_key = excluded.session_key,
         updated_at = excluded.updated_at`,
    ).run(alias, sessionKey, now, now);
  } finally {
    db.close();
  }
}

export function listTaskMessages(params: {
  taskId: string;
  limit?: number;
  dbPath?: string;
}): TaskMessageRow[] {
  const db = openDb(params.dbPath);
  try {
    db.exec(MISSION_CONTROL_MIGRATION_SQL);
    runBackfillMigrations(db);
    const limit = Number.isFinite(params.limit)
      ? Math.max(1, Math.trunc(params.limit ?? 100))
      : 100;
    const stmt = db.prepare(
      `SELECT id, task_id, author_session_key, content, mentions_json, created_at
       FROM task_messages
       WHERE task_id = ?
       ORDER BY created_at ASC
       LIMIT ?`,
    );
    return stmt.all(params.taskId, limit) as TaskMessageRow[];
  } finally {
    db.close();
  }
}

export function listTaskNotifications(params: {
  taskId: string;
  dbPath?: string;
}): NotificationWithMessage[] {
  const db = openDb(params.dbPath);
  try {
    db.exec(MISSION_CONTROL_MIGRATION_SQL);
    runBackfillMigrations(db);
    const stmt = db.prepare(
      `SELECT n.*, m.created_at AS message_created_at, m.content AS message_content
       FROM notifications n
       INNER JOIN task_messages m ON m.id = n.message_id
       WHERE n.task_id = ?
       ORDER BY m.created_at ASC, n.created_at ASC`,
    );
    const rows = stmt.all(params.taskId) as Record<string, unknown>[];
    return rows.map((row) => ({
      ...toNotificationRow(row),
      message_created_at: Number(row.message_created_at ?? 0),
      message_content: String(row.message_content ?? ""),
    }));
  } finally {
    db.close();
  }
}

export function listNotifications(
  params: {
    taskId?: string;
    state?: NotificationState;
    limit?: number;
    dbPath?: string;
  } = {},
): NotificationRow[] {
  const db = openDb(params.dbPath);
  try {
    db.exec(MISSION_CONTROL_MIGRATION_SQL);
    runBackfillMigrations(db);
    const limit = Number.isFinite(params.limit)
      ? Math.max(1, Math.trunc(params.limit ?? 200))
      : 200;
    const values: Array<string | number> = [];
    const where: string[] = [];

    if (params.taskId) {
      where.push("task_id = ?");
      values.push(params.taskId);
    }
    if (params.state) {
      where.push("state = ?");
      values.push(params.state);
    }

    const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
    const stmt = db.prepare(
      `SELECT id, message_id, task_id, mention_alias, target_session_key, state, attempts, retry_at, error,
              actor_session_key, busy_reason, eta_at, next_check_at, sla_due_at,
              queued_at, delivering_at, delivered_at, seen_at, accepted_at, in_progress_at, completed_at,
              declined_at, deferred_busy_at, timeout_at, failed_at, dead_letter_at, reassigned_at,
              created_at, updated_at
       FROM notifications
       ${whereSql}
       ORDER BY created_at ASC
       LIMIT ?`,
    );

    return (stmt.all(...values, limit) as Record<string, unknown>[]).map(toNotificationRow);
  } finally {
    db.close();
  }
}

function validateTransition(from: NotificationState, to: NotificationState): void {
  if (from === to) {
    return;
  }
  const allowed = TRANSITIONS[from];
  if (!allowed?.has(to)) {
    throw new Error(`invalid notification transition: ${from} -> ${to}`);
  }
}

export function transitionNotificationState(params: {
  id: string;
  state: NotificationState;
  attempts?: number;
  retryAt?: number | null;
  error?: string | null;
  actorSessionKey?: string | null;
  busyReason?: string | null;
  etaAt?: number | null;
  nextCheckAt?: number | null;
  slaDueAt?: number | null;
  force?: boolean;
  dbPath?: string;
}): NotificationRow | null {
  const id = params.id.trim();
  if (!id) {
    throw new Error("id is required");
  }
  if (!NOTIFICATION_STATES.has(params.state)) {
    throw new Error(`invalid notification state: ${params.state}`);
  }

  const db = openDb(params.dbPath);
  try {
    db.exec(MISSION_CONTROL_MIGRATION_SQL);
    runBackfillMigrations(db);
    const current = db.prepare(`SELECT * FROM notifications WHERE id = ? LIMIT 1`).get(id) as
      | Record<string, unknown>
      | undefined;
    if (!current) {
      return null;
    }

    const currentState = String(current.state ?? "queued") as NotificationState;
    if (!params.force) {
      validateTransition(currentState, params.state);
    }

    const nextAttempts =
      typeof params.attempts === "number" && Number.isFinite(params.attempts)
        ? Math.max(0, Math.trunc(params.attempts))
        : Number(current.attempts ?? 0);
    const nextRetryAt =
      params.retryAt === undefined
        ? ((current.retry_at as number | null | undefined) ?? null)
        : params.retryAt === null
          ? null
          : Math.trunc(params.retryAt);
    const nextError =
      params.error === undefined
        ? ((current.error as string | null | undefined) ?? null)
        : params.error;
    const nextActor =
      params.actorSessionKey === undefined
        ? ((current.actor_session_key as string | null | undefined) ?? null)
        : params.actorSessionKey;
    const nextBusyReason =
      params.busyReason === undefined
        ? ((current.busy_reason as string | null | undefined) ?? null)
        : params.busyReason;
    const nextEtaAt =
      params.etaAt === undefined
        ? ((current.eta_at as number | null | undefined) ?? null)
        : params.etaAt === null
          ? null
          : Math.trunc(params.etaAt);
    const nextCheckAt =
      params.nextCheckAt === undefined
        ? ((current.next_check_at as number | null | undefined) ?? null)
        : params.nextCheckAt === null
          ? null
          : Math.trunc(params.nextCheckAt);
    const nextSlaDueAt =
      params.slaDueAt === undefined
        ? ((current.sla_due_at as number | null | undefined) ?? null)
        : params.slaDueAt === null
          ? null
          : Math.trunc(params.slaDueAt);

    const updatedAt = Date.now();
    const stateTsField = STATE_TO_TIMESTAMP_FIELD[params.state];
    db.prepare(
      `UPDATE notifications
       SET state = ?, attempts = ?, retry_at = ?, error = ?,
           actor_session_key = ?, busy_reason = ?, eta_at = ?, next_check_at = ?, sla_due_at = ?,
           ${stateTsField} = COALESCE(${stateTsField}, ?),
           updated_at = ?
       WHERE id = ?`,
    ).run(
      params.state,
      nextAttempts,
      nextRetryAt,
      nextError,
      nextActor,
      nextBusyReason,
      nextEtaAt,
      nextCheckAt,
      nextSlaDueAt,
      updatedAt,
      updatedAt,
      id,
    );

    const updated = db.prepare(`SELECT * FROM notifications WHERE id = ? LIMIT 1`).get(id) as
      | Record<string, unknown>
      | undefined;
    return updated ? toNotificationRow(updated) : null;
  } finally {
    db.close();
  }
}

export function createTaskMessage(params: {
  taskId: string;
  authorSessionKey: string;
  content: string;
  slaMs?: number;
  dbPath?: string;
}): TaskMessageRow {
  const now = Date.now();
  const id = randomUUID();
  const mentions = parseMentions(params.content);
  const row: TaskMessageRow = {
    id,
    task_id: params.taskId,
    author_session_key: params.authorSessionKey,
    content: params.content,
    mentions_json: JSON.stringify(mentions),
    created_at: now,
  };

  const db = openDb(params.dbPath);
  try {
    db.exec(MISSION_CONTROL_MIGRATION_SQL);
    runBackfillMigrations(db);
    db.exec("BEGIN");
    try {
      const insertMessage = db.prepare(
        `INSERT INTO task_messages (id, task_id, author_session_key, content, mentions_json, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      );
      insertMessage.run(
        row.id,
        row.task_id,
        row.author_session_key,
        row.content,
        row.mentions_json,
        row.created_at,
      );

      const targets = resolveMentionTargets(db, mentions).filter(
        (target) => target.sessionKey !== row.author_session_key,
      );
      const insertNotification = db.prepare(
        `INSERT OR IGNORE INTO notifications
         (id, message_id, task_id, mention_alias, target_session_key, state, attempts, retry_at, error,
          actor_session_key, busy_reason, eta_at, next_check_at, sla_due_at,
          queued_at, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, 'queued', 0, NULL, NULL, NULL, NULL, NULL, NULL, ?, ?, ?, ?)`,
      );

      for (const target of targets) {
        const notificationId = randomUUID();
        const slaDueAt =
          typeof params.slaMs === "number" ? now + Math.max(0, Math.trunc(params.slaMs)) : null;
        insertNotification.run(
          notificationId,
          row.id,
          row.task_id,
          target.mentionAlias,
          target.sessionKey,
          slaDueAt,
          now,
          now,
          now,
        );
      }

      db.exec("COMMIT");
      return row;
    } catch (err) {
      db.exec("ROLLBACK");
      throw err;
    }
  } finally {
    db.close();
  }
}

export function claimReadyNotifications(
  params: {
    limit?: number;
    now?: number;
    dbPath?: string;
  } = {},
): NotificationRow[] {
  const db = openDb(params.dbPath);
  try {
    db.exec(MISSION_CONTROL_MIGRATION_SQL);
    runBackfillMigrations(db);
    const now = params.now ?? Date.now();
    const limit = Number.isFinite(params.limit) ? Math.max(1, Math.trunc(params.limit ?? 20)) : 20;
    const stmt = db.prepare(
      `SELECT *
       FROM notifications
       WHERE state IN ('queued', 'failed', 'deferred_busy')
         AND (retry_at IS NULL OR retry_at <= ?)
         AND (next_check_at IS NULL OR next_check_at <= ?)
       ORDER BY created_at ASC
       LIMIT ?`,
    );
    const rows = stmt.all(now, now, limit) as Record<string, unknown>[];
    return rows.map(toNotificationRow);
  } finally {
    db.close();
  }
}

export function markThreadReadState(params: {
  taskId: string;
  sessionKey: string;
  lastReadMessageId?: string | null;
  lastReadAt?: number;
  dbPath?: string;
}): ThreadReadStateRow {
  const taskId = params.taskId.trim();
  const sessionKey = params.sessionKey.trim();
  if (!taskId || !sessionKey) {
    throw new Error("taskId and sessionKey are required");
  }
  const ts = params.lastReadAt ?? Date.now();
  const db = openDb(params.dbPath);
  try {
    db.exec(MISSION_CONTROL_MIGRATION_SQL);
    runBackfillMigrations(db);
    db.prepare(
      `INSERT INTO thread_read_state (task_id, session_key, last_read_message_id, last_read_at, updated_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(task_id, session_key)
       DO UPDATE SET
         last_read_message_id = excluded.last_read_message_id,
         last_read_at = excluded.last_read_at,
         updated_at = excluded.updated_at`,
    ).run(taskId, sessionKey, params.lastReadMessageId ?? null, ts, ts);

    const row = db
      .prepare(
        `SELECT task_id, session_key, last_read_message_id, last_read_at, updated_at
         FROM thread_read_state
         WHERE task_id = ? AND session_key = ?
         LIMIT 1`,
      )
      .get(taskId, sessionKey) as Record<string, unknown>;
    return {
      task_id: String(row.task_id ?? taskId),
      session_key: String(row.session_key ?? sessionKey),
      last_read_message_id: toStringOrNull(row.last_read_message_id),
      last_read_at: Number(row.last_read_at ?? ts),
      updated_at: Number(row.updated_at ?? ts),
    };
  } finally {
    db.close();
  }
}

export function getThreadUnreadCount(params: {
  taskId: string;
  sessionKey: string;
  dbPath?: string;
}): { taskId: string; sessionKey: string; unread: number; lastReadAt: number | null } {
  const db = openDb(params.dbPath);
  try {
    db.exec(MISSION_CONTROL_MIGRATION_SQL);
    runBackfillMigrations(db);
    const readState = db
      .prepare(
        `SELECT last_read_at
         FROM thread_read_state
         WHERE task_id = ? AND session_key = ?
         LIMIT 1`,
      )
      .get(params.taskId, params.sessionKey) as { last_read_at?: number } | undefined;
    const lastReadAt = typeof readState?.last_read_at === "number" ? readState.last_read_at : null;
    const unreadRow = db
      .prepare(
        `SELECT COUNT(*) AS unread
         FROM task_messages
         WHERE task_id = ?
           AND author_session_key <> ?
           AND (? IS NULL OR created_at > ?)`,
      )
      .get(params.taskId, params.sessionKey, lastReadAt, lastReadAt) as { unread?: number };
    return {
      taskId: params.taskId,
      sessionKey: params.sessionKey,
      unread: Number(unreadRow.unread ?? 0),
      lastReadAt,
    };
  } finally {
    db.close();
  }
}

export function isNotificationTerminal(state: NotificationState): boolean {
  return TERMINAL_STATES.has(state);
}

export function isNotificationRetryable(state: NotificationState): boolean {
  return RETRYABLE_STATES.has(state);
}

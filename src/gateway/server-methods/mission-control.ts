import Database from "better-sqlite3";
import { homedir } from "node:os";
import { join } from "node:path";
import type { GatewayRequestHandlers } from "./types.js";
import { ErrorCodes, errorShape } from "../protocol/index.js";

const DB_PATH =
  process.env.MISSION_CONTROL_DB ||
  join(homedir(), ".openclaw/workspace-dev/data/mission_control.db");

let db: Database.Database | null = null;

function getDb(): Database.Database {
  if (!db) {
    db = new Database(DB_PATH);
    db.pragma("journal_mode = WAL");
  }
  return db;
}

type Job = {
  id: string;
  type: string;
  title: string;
  description: string | null;
  status: "pending" | "running" | "review" | "revising" | "done" | "failed" | "success";
  priority: number;
  agent_id: string | null;
  created_at: number;
  updated_at: number | null;
  started_at: number | null;
  finished_at: number | null;
  result_summary: string | null;
  error_message: string | null;
  tags: string | null;
  session_key: string | null;
  fail_count: number;
  verifier_last_confidence: number | null;
  pr_number: number | null;
  pr_url: string | null;
  revision_count: number;
};

export const missionControlHandlers: GatewayRequestHandlers = {
  "missionControl.list": ({ respond }) => {
    try {
      const database = getDb();
      const jobs = database
        .prepare(
          `
        SELECT * FROM jobs 
        ORDER BY created_at DESC 
        LIMIT 100
      `,
        )
        .all() as Job[];

      respond(true, { ok: true, jobs }, undefined);
    } catch (error) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INTERNAL_ERROR, `Failed to list jobs: ${String(error)}`),
      );
    }
  },

  "missionControl.get": ({ params, respond }) => {
    try {
      const id = String(params?.id ?? "");
      if (!id) {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "Missing job id"));
        return;
      }

      const database = getDb();
      const job = database.prepare("SELECT * FROM jobs WHERE id = ?").get(id) as Job | undefined;

      if (!job) {
        respond(false, undefined, errorShape(ErrorCodes.NOT_FOUND, "Job not found"));
        return;
      }

      respond(true, { ok: true, job }, undefined);
    } catch (error) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INTERNAL_ERROR, `Failed to get job: ${String(error)}`),
      );
    }
  },

  "missionControl.updateStatus": ({ params, respond }) => {
    try {
      const id = String(params?.id ?? "");
      const status = String(params?.status ?? "");

      if (!id || !status) {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "Missing id or status"));
        return;
      }

      const validStatuses = ["pending", "running", "review", "revising", "done", "failed"];
      if (!validStatuses.includes(status)) {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "Invalid status"));
        return;
      }

      const database = getDb();
      const now = Date.now();
      const fields = ["status = ?", "updated_at = ?"];
      const values: (string | number)[] = [status, now];

      if (status === "running") {
        fields.push("started_at = ?");
        values.push(now);
      }
      if (status === "done" || status === "failed") {
        fields.push("finished_at = ?");
        values.push(now);
      }

      values.push(id);
      database.prepare(`UPDATE jobs SET ${fields.join(", ")} WHERE id = ?`).run(...values);

      respond(true, { ok: true }, undefined);
    } catch (error) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INTERNAL_ERROR, `Failed to update status: ${String(error)}`),
      );
    }
  },

  "missionControl.delete": ({ params, respond }) => {
    try {
      const id = String(params?.id ?? "");
      if (!id) {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "Missing job id"));
        return;
      }

      const database = getDb();
      // Delete related records first (foreign key constraints)
      database.prepare("DELETE FROM job_confidence_history WHERE job_id = ?").run(id);
      // Delete the job
      const result = database.prepare("DELETE FROM jobs WHERE id = ?").run(id);

      respond(true, { ok: true, deleted: result.changes > 0 }, undefined);
    } catch (error) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INTERNAL_ERROR, `Failed to delete job: ${String(error)}`),
      );
    }
  },

  "missionControl.create": ({ params, respond }) => {
    try {
      const database = getDb();
      const now = Date.now();
      const id = crypto.randomUUID();

      database
        .prepare(
          `INSERT INTO jobs (id, type, title, description, status, priority, agent_id, created_at, updated_at, tags)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          id,
          String(params?.type ?? "task"),
          String(params?.title ?? ""),
          params?.description ?? null,
          "pending",
          Number(params?.priority ?? 0),
          params?.agent_id ?? null,
          now,
          null,
          params?.tags ?? null,
        );

      respond(true, { ok: true, id }, undefined);
    } catch (error) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INTERNAL_ERROR, `Failed to create job: ${String(error)}`),
      );
    }
  },

  "missionControl.spawn": ({ params, respond }) => {
    // Stub - actual spawn logic to be implemented
    respond(
      false,
      undefined,
      errorShape(ErrorCodes.NOT_IMPLEMENTED, "Mission control spawn not yet implemented"),
    );
  },
};

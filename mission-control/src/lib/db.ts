import Database from "better-sqlite3";
import { homedir } from "os";
import { join } from "path";

const DB_PATH =
  process.env.MISSION_CONTROL_DB ||
  join(homedir(), ".openclaw/workspace-dev/data/mission_control.db");

let db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (!db) {
    db = new Database(DB_PATH);
    db.pragma("journal_mode = WAL");
  }
  return db;
}

export type Job = {
  id: string;
  type: string;
  title: string;
  description: string | null;
  status: "pending" | "running" | "review" | "revising" | "done" | "failed";
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

export function listJobs(): Job[] {
  const db = getDb();
  return db
    .prepare(`
    SELECT * FROM jobs 
    ORDER BY created_at DESC 
    LIMIT 100
  `)
    .all() as Job[];
}

export function getJob(id: string): Job | null {
  const db = getDb();
  return db.prepare("SELECT * FROM jobs WHERE id = ?").get(id) as Job | null;
}

export function createJob(job: Omit<Job, "created_at" | "updated_at">): Job {
  const db = getDb();
  const stmt = db.prepare(`
    INSERT INTO jobs (id, type, title, description, status, priority, agent_id, created_at, updated_at, session_key, tags)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const now = Date.now();
  stmt.run(
    job.id,
    job.type,
    job.title,
    job.description,
    job.status,
    job.priority,
    job.agent_id,
    now,
    now,
    job.session_key,
    job.tags,
  );
  return getJob(job.id)!;
}

export function updateJobStatus(
  id: string,
  status: Job["status"],
  updates: Partial<Job> = {},
): void {
  const db = getDb();
  const fields = ["status = ?", "updated_at = ?"];
  const values: (string | number | null)[] = [status, Date.now()];

  if (status === "running") {
    fields.push("started_at = ?");
    values.push(Date.now());
  }
  if (status === "done" || status === "failed") {
    fields.push("finished_at = ?");
    values.push(Date.now());
  }

  for (const [key, value] of Object.entries(updates)) {
    if (key !== "id" && key !== "created_at" && key !== "updated_at") {
      fields.push(`${key} = ?`);
      values.push(value);
    }
  }

  values.push(id);
  db.prepare(`UPDATE jobs SET ${fields.join(", ")} WHERE id = ?`).run(...values);
}

export function deleteJob(id: string): boolean {
  const db = getDb();

  // Delete related records first (foreign key constraints)
  db.prepare("DELETE FROM job_confidence_history WHERE job_id = ?").run(id);

  // Delete the job
  const result = db.prepare("DELETE FROM jobs WHERE id = ?").run(id);
  return result.changes > 0;
}

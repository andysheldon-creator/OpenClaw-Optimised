import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import { listJobs, createJob, updateJobStatus, type Job } from "../../../lib/db";

export async function GET() {
  try {
    const jobs = listJobs();
    return NextResponse.json({ ok: true, jobs });
  } catch (err) {
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const job: Omit<Job, "created_at" | "updated_at"> = {
      id: randomUUID(),
      type: body.type || "task",
      title: body.title || "Untitled",
      description: body.description || null,
      status: "pending",
      priority: body.priority || 3,
      agent_id: null,
      started_at: null,
      finished_at: null,
      result_summary: null,
      error_message: null,
      tags: body.tags ? JSON.stringify(body.tags) : null,
      session_key: null,
      fail_count: 0,
      verifier_last_confidence: null,
      pr_number: null,
      pr_url: null,
      revision_count: 0,
    };

    const created = createJob(job);

    // TODO: Dispatch to OpenClaw agent if auto_dispatch is enabled
    // await dispatchToAgent(created);

    return NextResponse.json({ ok: true, job: created });
  } catch (err) {
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}

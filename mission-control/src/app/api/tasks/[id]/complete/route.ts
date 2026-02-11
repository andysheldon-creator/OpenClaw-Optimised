import { NextResponse } from "next/server";
import { getJob, updateJobStatus } from "../../../../../lib/db";

const GATEWAY_TOKEN = process.env.OPENCLAW_GATEWAY_TOKEN;

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  // Simple auth check - could be more robust
  const authHeader = request.headers.get("authorization");
  if (GATEWAY_TOKEN && authHeader !== `Bearer ${GATEWAY_TOKEN}`) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    const job = getJob(id);
    if (!job) {
      return NextResponse.json({ ok: false, error: "Job not found" }, { status: 404 });
    }

    const body = await request.json();
    const { status, summary, prUrl } = body;

    if (status === "done" || status === "failed") {
      let resultSummary = summary || (status === "done" ? "Task completed" : "Task failed");
      if (prUrl) {
        resultSummary += ` | PR: ${prUrl}`;
      }

      updateJobStatus(id, status, {
        result_summary: resultSummary,
        error_message: status === "failed" ? summary : null,
      });
    }

    return NextResponse.json({ ok: true, message: `Job marked ${status}` });
  } catch (err) {
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}

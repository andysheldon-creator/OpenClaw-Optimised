import { NextResponse } from "next/server";
import { getJob } from "../../../../../lib/db";

const OPENCLAW_GATEWAY_URL = process.env.OPENCLAW_GATEWAY_URL || "http://127.0.0.1:8080";
const OPENCLAW_GATEWAY_TOKEN = process.env.OPENCLAW_GATEWAY_TOKEN;

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  try {
    const job = getJob(id);
    if (!job) {
      return NextResponse.json({ ok: false, error: "Job not found" }, { status: 404 });
    }

    // If no agent assigned, return job only
    if (!job.session_key) {
      return NextResponse.json({ ok: true, job, agentStatus: null });
    }

    // Query OpenClaw for session status
    const statusRes = await fetch(`${OPENCLAW_GATEWAY_URL}/api/sessions/${job.session_key}`, {
      headers: {
        Authorization: `Bearer ${OPENCLAW_GATEWAY_TOKEN}`,
      },
    }).catch(() => null);

    let agentStatus = null;
    if (statusRes?.ok) {
      agentStatus = await statusRes.json();
    }

    return NextResponse.json({
      ok: true,
      job,
      agentStatus: {
        state: agentStatus?.state || "unknown",
        lastActivity: agentStatus?.lastActivityAt,
        messageCount: agentStatus?.messageCount || 0,
        isActive: agentStatus?.state === "active",
      },
    });
  } catch (err) {
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}

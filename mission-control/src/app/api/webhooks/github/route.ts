import { NextResponse } from "next/server";
import { getDb } from "../../../../lib/db";

// GitHub webhook handler for PR events
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const eventType = request.headers.get("x-github-event");

    if (eventType === "pull_request") {
      const { action, pull_request, number } = body;
      const prUrl = pull_request.html_url;
      const prNumber = number;
      const branch = pull_request.head.ref;

      // Find job by branch name (agent/{job-id}-{slug})
      const db = getDb();
      const job = db
        .prepare("SELECT * FROM jobs WHERE result_summary LIKE ?")
        .get(`%Branch: ${branch}%`) as any;

      if (!job) {
        return NextResponse.json({ ok: false, error: "Job not found for this branch" });
      }

      // Handle PR events
      if (action === "opened") {
        // PR created by agent - move to review
        db.prepare(
          `UPDATE jobs SET status = 'review', pr_number = ?, pr_url = ?, result_summary = ? WHERE id = ?`,
        ).run(prNumber, prUrl, `PR #${prNumber} awaiting review: ${prUrl}`, job.id);
        console.log(`[MC] Job ${job.id} moved to REVIEW (PR #${prNumber})`);
      } else if (action === "closed" && pull_request.merged) {
        // PR merged - task complete
        db.prepare(
          `UPDATE jobs SET status = 'done', finished_at = ?, result_summary = ? WHERE id = ?`,
        ).run(Date.now(), `Merged PR #${prNumber}: ${prUrl}`, job.id);
        console.log(`[MC] Job ${job.id} COMPLETE (merged PR #${prNumber})`);
      } else if (action === "closed" && !pull_request.merged) {
        // PR closed without merge - failed
        db.prepare(
          `UPDATE jobs SET status = 'failed', finished_at = ?, error_message = ? WHERE id = ?`,
        ).run(Date.now(), `PR #${prNumber} closed without merge`, job.id);
        console.log(`[MC] Job ${job.id} FAILED (PR #${prNumber} closed)`);
      }
    }

    // Handle review events (changes_requested)
    if (eventType === "pull_request_review") {
      const { action, review, pull_request } = body;
      const prNumber = pull_request.number;
      const state = review?.state; // 'approved', 'changes_requested', 'commented'

      if (state === "changes_requested") {
        const db = getDb();
        const job = db.prepare("SELECT * FROM jobs WHERE pr_number = ?").get(prNumber) as any;

        if (job && job.status !== "revising") {
          // Move to revising and notify agent
          const newRevisionCount = (job.revision_count || 0) + 1;
          db.prepare(`UPDATE jobs SET status = 'revising', revision_count = ? WHERE id = ?`).run(
            newRevisionCount,
            job.id,
          );

          // Notify agent via OpenClaw (if session_key exists)
          if (job.session_key) {
            await notifyAgentOfRevisions(job.session_key, job.id, review.body);
          }

          console.log(`[MC] Job ${job.id} needs REVISION #${newRevisionCount}`);
        }
      }

      if (state === "approved") {
        // Just log it - actual merge handled by PR close event
        console.log(`[MC] PR #${prNumber} approved, awaiting merge`);
      }
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[MC] Webhook error:", err);
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}

async function notifyAgentOfRevisions(sessionKey: string, jobId: string, reviewBody: string) {
  const GATEWAY_URL = process.env.OPENCLAW_GATEWAY_URL || "http://127.0.0.1:8080";
  const GATEWAY_TOKEN = process.env.OPENCLAW_GATEWAY_TOKEN;

  try {
    await fetch(`${GATEWAY_URL}/api/sessions/${sessionKey}/send`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${GATEWAY_TOKEN}`,
      },
      body: JSON.stringify({
        message: `🔴 REVISION REQUESTED for task ${jobId.slice(0, 8)}

Feedback: ${reviewBody || "Changes requested in PR review"}

Please:
1. Check the PR review comments
2. Make required changes on your branch  
3. Commit and push updates
4. Re-request review when ready`,
      }),
    });
  } catch (err) {
    console.error("[MC] Failed to notify agent:", err);
  }
}

// Also handle GET for webhook setup verification
export async function GET() {
  return NextResponse.json({ ok: true, message: "GitHub webhook endpoint ready" });
}

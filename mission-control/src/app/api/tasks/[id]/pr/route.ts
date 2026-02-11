import { NextResponse } from "next/server";
import { getJob, updateJobStatus } from "../../../../../lib/db";

const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const GITHUB_REPO = process.env.GITHUB_REPO; // e.g., "claw/rifthome"
const GITHUB_BRANCH = process.env.GITHUB_BRANCH || "main";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  if (!GITHUB_TOKEN || !GITHUB_REPO) {
    return NextResponse.json(
      {
        ok: false,
        error: "GitHub not configured. Set GITHUB_TOKEN and GITHUB_REPO env vars.",
      },
      { status: 500 },
    );
  }

  try {
    const job = getJob(id);
    if (!job) {
      return NextResponse.json({ ok: false, error: "Job not found" }, { status: 404 });
    }

    const body = await request.json();
    const { changes, summary } = body;

    // Create a feature branch
    const branchName = `agent/${job.id.slice(0, 8)}-${job.title
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "-")
      .slice(0, 30)}`;

    // Get base branch SHA
    const baseRes = await fetch(
      `https://api.github.com/repos/${GITHUB_REPO}/git/refs/heads/${GITHUB_BRANCH}`,
      {
        headers: {
          Authorization: `token ${GITHUB_TOKEN}`,
          Accept: "application/vnd.github.v3+json",
        },
      },
    );

    if (!baseRes.ok) {
      return NextResponse.json({ ok: false, error: "Failed to get base branch" }, { status: 502 });
    }

    const baseData = await baseRes.json();
    const baseSha = baseData.object.sha;

    // Create new branch
    const branchRes = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/git/refs`, {
      method: "POST",
      headers: {
        Authorization: `token ${GITHUB_TOKEN}`,
        Accept: "application/vnd.github.v3+json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        ref: `refs/heads/${branchName}`,
        sha: baseSha,
      }),
    });

    if (!branchRes.ok) {
      const error = await branchRes.text();
      return NextResponse.json(
        { ok: false, error: `Failed to create branch: ${error}` },
        { status: 502 },
      );
    }

    // Create/update files in the branch
    for (const file of changes || []) {
      await fetch(`https://api.github.com/repos/${GITHUB_REPO}/contents/${file.path}`, {
        method: "PUT",
        headers: {
          Authorization: `token ${GITHUB_TOKEN}`,
          Accept: "application/vnd.github.v3+json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          message: `Agent update: ${file.path}`,
          content: Buffer.from(file.content).toString("base64"),
          branch: branchName,
        }),
      });
    }

    // Create Pull Request
    const prRes = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/pulls`, {
      method: "POST",
      headers: {
        Authorization: `token ${GITHUB_TOKEN}`,
        Accept: "application/vnd.github.v3+json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        title: `[Agent] ${job.title}`,
        body: `## Task\n${job.description || "No description"}\n\n## Summary\n${summary || "Agent completed the task"}\n\n## Job ID\n${job.id}\n\n---\n*This PR was created by an AI agent via Mission Control*`,
        head: branchName,
        base: GITHUB_BRANCH,
      }),
    });

    if (!prRes.ok) {
      const error = await prRes.text();
      return NextResponse.json(
        { ok: false, error: `Failed to create PR: ${error}` },
        { status: 502 },
      );
    }

    const prData = await prRes.json();

    // Update job with PR info
    updateJobStatus(id, "done", {
      result_summary: `PR #${prData.number} created: ${prData.html_url}`,
    });

    return NextResponse.json({
      ok: true,
      prUrl: prData.html_url,
      prNumber: prData.number,
      branch: branchName,
    });
  } catch (err) {
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}

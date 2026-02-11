import { exec } from "child_process";
import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import { promisify } from "util";
import { getJob, updateJobStatus } from "../../../../../lib/db";

const execAsync = promisify(exec);

const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const GITHUB_REPO = process.env.GITHUB_REPO;
const GITHUB_BRANCH = process.env.GITHUB_BRANCH || "main";

async function createGitBranch(job: any): Promise<string | null> {
  if (!GITHUB_TOKEN || !GITHUB_REPO) return null;

  const branchName = `agent/${job.id.slice(0, 8)}-${job.title
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "-")
    .slice(0, 30)}`;

  try {
    // Get base branch SHA
    const baseRes = await fetch(
      `https://api.github.com/repos/${GITHUB_REPO}/git/refs/heads/${GITHUB_BRANCH}`,
      {
        headers: {
          Authorization: `Bearer ${GITHUB_TOKEN}`,
          Accept: "application/vnd.github.v3+json",
          "X-GitHub-Api-Version": "2022-11-28",
        },
      },
    );

    if (!baseRes.ok) return null;

    const baseData = await baseRes.json();
    const baseSha = baseData.object.sha;

    // Create new branch
    const branchRes = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/git/refs`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${GITHUB_TOKEN}`,
        Accept: "application/vnd.github.v3+json",
        "Content-Type": "application/json",
        "X-GitHub-Api-Version": "2022-11-28",
      },
      body: JSON.stringify({
        ref: `refs/heads/${branchName}`,
        sha: baseSha,
      }),
    });

    if (branchRes.ok || branchRes.status === 422) {
      // 422 = branch already exists
      return branchName;
    }
    return null;
  } catch (err) {
    console.error("Failed to create branch:", err);
    return null;
  }
}

async function spawnAgent(
  task: string,
  label: string,
): Promise<{ sessionKey: string; success: boolean; error?: string }> {
  try {
    // Escape the task for shell safety
    const escapedTask = task.replace(/"/g, '\\"').replace(/\n/g, "\\n");

    // Use openclaw CLI to spawn agent
    const command = `openclaw --profile dev sessions_spawn --task "${escapedTask}" --label "${label}" --run-timeout-seconds 3600`;

    console.log(`[MC] Spawning agent: ${label}`);
    const { stdout, stderr } = await execAsync(command, { timeout: 30000 });

    if (stderr && !stderr.includes("accepted")) {
      console.error("[MC] Spawn stderr:", stderr);
    }

    // Parse output to get session key
    // Output format: "Spawned session agent:dev:subagent:..."
    const sessionMatch = stdout.match(/agent:dev:subagent:[a-z0-9-]+/);
    if (sessionMatch) {
      return { sessionKey: sessionMatch[0], success: true };
    }

    // If no session key in output, check if it was accepted
    if (stdout.includes("accepted") || stdout.includes("Spawned")) {
      // Extract from the response format
      const lines = stdout.split("\n");
      for (const line of lines) {
        if (line.includes("agent:dev:subagent")) {
          const key = line.match(/agent:dev:subagent:[a-z0-9-]+/)?.[0];
          if (key) return { sessionKey: key, success: true };
        }
      }
    }

    return {
      sessionKey: "",
      success: false,
      error: "Could not parse session key from output: " + stdout,
    };
  } catch (err: any) {
    console.error("[MC] Spawn failed:", err);
    return { sessionKey: "", success: false, error: err.message || String(err) };
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  try {
    const job = getJob(id);
    if (!job) {
      return NextResponse.json({ ok: false, error: "Job not found" }, { status: 404 });
    }

    if (job.status !== "pending") {
      return NextResponse.json({ ok: false, error: "Job already assigned" }, { status: 400 });
    }

    // Step 1: Create Git branch for this task
    const branchName = await createGitBranch(job);

    if (!branchName) {
      return NextResponse.json(
        {
          ok: false,
          error: "Failed to create Git branch. Check GITHUB_TOKEN and GITHUB_REPO env vars.",
        },
        { status: 500 },
      );
    }

    // Step 2: Spawn agent via OpenClaw CLI
    const sessionKey = `agent:dev:subagent:mission-${job.id.slice(0, 8)}-${randomUUID().slice(0, 4)}`;
    const label = `mission-${job.id.slice(0, 8)}`;

    const agentInstructions = `You are working on Mission Control task: "${job.title}"

TASK ID: ${job.id}
BRANCH: ${branchName}
REPO: ${GITHUB_REPO}

INSTRUCTIONS:
1. You have a dedicated Git branch: ${branchName}
2. Work on the task described below
3. Make commits to your branch as you progress
4. When complete, create a Pull Request with a summary of changes
5. Mark the task as done when PR is created

TASK DESCRIPTION:
${job.description || "Complete the assigned task."}

WORKFLOW:
- Clone/checkout branch: ${branchName}
- Do the work
- Commit regularly with clear messages
- When done: git push && create PR via GitHub API
- Report back: "Task complete, PR #X created: <url>"

Be autonomous. You don't need to ask for confirmation. Just do the work and report completion.`;

    const spawnResult = await spawnAgent(agentInstructions, label);

    if (!spawnResult.success) {
      return NextResponse.json(
        {
          ok: false,
          error: `OpenClaw spawn failed: ${spawnResult.error}`,
        },
        { status: 502 },
      );
    }

    // Step 3: Update job with agent info
    updateJobStatus(id, "running", {
      agent_id: spawnResult.sessionKey,
      session_key: spawnResult.sessionKey,
      result_summary: `Branch: ${branchName}`,
    });

    return NextResponse.json({
      ok: true,
      sessionKey: spawnResult.sessionKey,
      branch: branchName,
      message: `Agent spawned on branch ${branchName}. Working autonomously...`,
    });
  } catch (err) {
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}

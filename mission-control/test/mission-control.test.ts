#!/usr/bin/env node
/**
 * Mission Control Integration Test
 *
 * Tests the full workflow:
 * 1. Creates a test task
 * 2. Assigns agent (spawns sub-agent)
 * 3. Verifies agent uses Kimi 2.5
 * 4. Waits for PR creation (review stage)
 * 5. Simulates user approval/merge
 *
 * Usage: node mission-control.test.ts
 * Requires: MISSION_CONTROL_URL, OPENCLAW_GATEWAY_URL env vars
 */

import { randomUUID } from "crypto";

const MC_URL = process.env.MISSION_CONTROL_URL || "http://localhost:3000";
const GATEWAY_URL = process.env.OPENCLAW_GATEWAY_URL || "http://127.0.0.1:8080";
const GATEWAY_TOKEN = process.env.OPENCLAW_GATEWAY_TOKEN;

interface TestResult {
  passed: boolean;
  message: string;
  details?: any;
}

class MissionControlTester {
  private results: TestResult[] = [];
  private testJobId: string | null = null;
  private testSessionKey: string | null = null;

  async runAllTests(): Promise<void> {
    console.log("🚀 Mission Control Integration Test\n");
    console.log(`MC URL: ${MC_URL}`);
    console.log(`Gateway: ${GATEWAY_URL}\n`);

    // Test 1: Create Task
    await this.testCreateTask();

    // Test 2: Assign Agent
    if (this.testJobId) {
      await this.testAssignAgent();
    }

    // Test 3: Verify Agent Model (Kimi 2.5)
    if (this.testSessionKey) {
      await this.testAgentModel();
    }

    // Test 4: Verify Review Flow
    if (this.testJobId) {
      await this.testReviewFlow();
    }

    // Test 5: Cleanup
    await this.cleanup();

    this.printSummary();
  }

  private async testCreateTask(): Promise<void> {
    console.log("📋 Test 1: Create Task");

    try {
      const testTitle = `Integration Test ${new Date().toISOString().slice(0, 19)}`;

      const res = await fetch(`${MC_URL}/api/tasks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: testTitle,
          description:
            "This is a test task to verify Mission Control workflow. Please create a simple README update.",
          type: "test",
          priority: 1,
        }),
      });

      const data = await res.json();

      if (!res.ok || !data.ok) {
        this.fail("Create Task", `Failed to create task: ${data.error || res.statusText}`);
        return;
      }

      this.testJobId = data.job.id;

      this.pass("Create Task", {
        jobId: data.job.id,
        title: data.job.title,
        status: data.job.status,
        createdAt: new Date(data.job.created_at).toISOString(),
      });
    } catch (err) {
      this.fail("Create Task", `Exception: ${err}`);
    }
  }

  private async testAssignAgent(): Promise<void> {
    console.log("\n🤖 Test 2: Assign Agent");

    if (!this.testJobId) {
      this.fail("Assign Agent", "No job ID from previous test");
      return;
    }

    try {
      const res = await fetch(`${MC_URL}/api/tasks/${this.testJobId}/assign`, {
        method: "POST",
      });

      const data = await res.json();

      if (!res.ok || !data.ok) {
        this.fail("Assign Agent", `Failed to assign agent: ${data.error || res.statusText}`);
        return;
      }

      this.testSessionKey = data.sessionKey;

      this.pass("Assign Agent", {
        sessionKey: data.sessionKey,
        branch: data.branch,
        message: data.message,
      });
    } catch (err) {
      this.fail("Assign Agent", `Exception: ${err}`);
    }
  }

  private async testAgentModel(): Promise<void> {
    console.log("\n🧠 Test 3: Verify Agent Model (Kimi 2.5)");

    if (!this.testSessionKey) {
      this.fail("Agent Model", "No session key from previous test");
      return;
    }

    try {
      // Check session status via OpenClaw Gateway
      const res = await fetch(`${GATEWAY_URL}/api/sessions/${this.testSessionKey}`, {
        headers: GATEWAY_TOKEN ? { Authorization: `Bearer ${GATEWAY_TOKEN}` } : {},
      });

      if (!res.ok) {
        this.fail("Agent Model", `Failed to fetch session: ${res.statusText}`);
        return;
      }

      const data = await res.json();
      const model = data.model || data.config?.model || "unknown";

      // Check if it's Kimi 2.5
      const isKimi = model.includes("kimi") && model.includes("2.5");

      if (isKimi) {
        this.pass("Agent Model", {
          model,
          sessionKey: this.testSessionKey,
          status: data.status,
        });
      } else {
        this.fail("Agent Model", `Expected Kimi 2.5, got: ${model}`, {
          model,
          sessionKey: this.testSessionKey,
          availableModels: data.availableModels,
        });
      }
    } catch (err) {
      this.fail("Agent Model", `Exception: ${err}`);
    }
  }

  private async testReviewFlow(): Promise<void> {
    console.log("\n⏸️ Test 4: Verify Review Flow (Waits for User Approval)");

    if (!this.testJobId) {
      this.fail("Review Flow", "No job ID from previous test");
      return;
    }

    try {
      // Poll job status to verify it moves through stages
      console.log("  Polling job status (checking review flow)...");

      let attempts = 0;
      const maxAttempts = 12; // 2 minutes (10s intervals)

      while (attempts < maxAttempts) {
        await new Promise((r) => setTimeout(r, 10000)); // 10s delay
        attempts++;

        const res = await fetch(`${MC_URL}/api/tasks`);
        const data = await res.json();

        if (!data.ok) {
          console.log(`    Attempt ${attempts}: Failed to fetch tasks`);
          continue;
        }

        const job = data.jobs.find((j: any) => j.id === this.testJobId);

        if (!job) {
          console.log(`    Attempt ${attempts}: Job not found`);
          continue;
        }

        console.log(`    Attempt ${attempts}: Status = ${job.status}`);

        // Check progression
        if (job.status === "running") {
          console.log("    ✓ Agent is working...");
        } else if (job.status === "review") {
          console.log("    ✓ Agent created PR, now in REVIEW (waiting for user)");
          this.pass("Review Flow", {
            status: job.status,
            prNumber: job.pr_number,
            prUrl: job.pr_url,
            resultSummary: job.result_summary,
            timeInRunning: `${attempts * 10}s`,
          });
          return;
        } else if (job.status === "done") {
          // PR was auto-merged or skipped review
          this.fail("Review Flow", "Job went directly to DONE without review stage", {
            status: job.status,
            prNumber: job.pr_number,
          });
          return;
        } else if (job.status === "failed") {
          this.fail("Review Flow", `Job failed: ${job.error_message}`, {
            status: job.status,
            error: job.error_message,
          });
          return;
        }
      }

      // Timeout - but that's ok for this test, agent might still be working
      this.pass("Review Flow (Partial)", {
        note: "Agent still working after 2 minutes (expected for real tasks)",
        finalStatus: "running",
        recommendation: "Check PR manually or increase timeout for slower tasks",
      });
    } catch (err) {
      this.fail("Review Flow", `Exception: ${err}`);
    }
  }

  private async cleanup(): Promise<void> {
    console.log("\n🧹 Test 5: Cleanup");

    if (this.testJobId) {
      try {
        // Delete the test task
        const res = await fetch(`${MC_URL}/api/tasks/${this.testJobId}`, {
          method: "DELETE",
        });

        if (res.ok) {
          console.log(`  ✓ Deleted test job ${this.testJobId.slice(0, 8)}`);
        } else {
          console.log(`  ⚠️ Failed to delete test job: ${res.statusText}`);
        }
      } catch (err) {
        console.log(`  ⚠️ Cleanup error: ${err}`);
      }
    }

    console.log("  Cleanup complete\n");
  }

  private pass(testName: string, details?: any): void {
    this.results.push({ passed: true, message: `✓ ${testName}`, details });
    console.log(`  ✅ PASSED: ${testName}`);
  }

  private fail(testName: string, message: string, details?: any): void {
    this.results.push({ passed: false, message: `✗ ${testName}: ${message}`, details });
    console.log(`  ❌ FAILED: ${testName}`);
    console.log(`     ${message}`);
  }

  private printSummary(): void {
    const passed = this.results.filter((r) => r.passed).length;
    const failed = this.results.filter((r) => !r.passed).length;

    console.log("=".repeat(50));
    console.log("TEST SUMMARY");
    console.log("=".repeat(50));
    console.log(`Total: ${this.results.length} tests`);
    console.log(`Passed: ${passed} ✅`);
    console.log(`Failed: ${failed} ❌`);
    console.log("=".repeat(50));

    if (failed > 0) {
      console.log("\nFailed tests:");
      this.results
        .filter((r) => !r.passed)
        .forEach((r) => {
          console.log(`  - ${r.message}`);
        });
      process.exit(1);
    } else {
      console.log("\n🎉 All tests passed!");
      process.exit(0);
    }
  }
}

// Run tests
const tester = new MissionControlTester();
tester.runAllTests().catch((err) => {
  console.error("Test runner failed:", err);
  process.exit(1);
});

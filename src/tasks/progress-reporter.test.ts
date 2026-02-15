import { describe, expect, it } from "vitest";

import { shouldReportProgress } from "./progress-reporter.js";
import type { Task, TaskStep } from "./types.js";

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeStep(overrides: Partial<TaskStep> = {}): TaskStep {
  return {
    id: "step-1",
    index: 0,
    description: "test step",
    status: "pending",
    prompt: "do it",
    retryCount: 0,
    ...overrides,
  };
}

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: "task-1",
    name: "test task",
    description: "unit test task",
    status: "in_progress",
    createdAtMs: Date.now(),
    updatedAtMs: Date.now(),
    reportChannel: "last",
    reportEverySteps: 1,
    steps: [
      makeStep({ index: 0, status: "completed" }),
      makeStep({ index: 1, status: "pending", id: "step-2" }),
    ],
    currentStepIndex: 1,
    sessionKey: "task:task-1",
    stepIntervalMs: 30_000,
    maxRetries: 2,
    timeoutPerStepMs: 600_000,
    progressReports: [],
    ...overrides,
  };
}

// ── shouldReportProgress ──────────────────────────────────────────────────────

describe("shouldReportProgress", () => {
  it("returns true when completed steps modulo reportEverySteps is zero", () => {
    const task = makeTask({ reportEverySteps: 1 });
    const step = task.steps[0];
    expect(shouldReportProgress(task, step)).toBe(true);
  });

  it("returns false when no steps are completed", () => {
    const task = makeTask({
      steps: [
        makeStep({ index: 0, status: "pending" }),
        makeStep({ index: 1, status: "pending", id: "step-2" }),
      ],
    });
    const step = task.steps[0];
    expect(shouldReportProgress(task, step)).toBe(false);
  });

  it("respects reportEverySteps = 2", () => {
    // 1 completed step, reportEverySteps = 2 → 1 % 2 !== 0 → false
    const task = makeTask({ reportEverySteps: 2 });
    expect(shouldReportProgress(task, task.steps[0])).toBe(false);

    // Now make 2 steps completed
    task.steps[1].status = "completed";
    expect(shouldReportProgress(task, task.steps[1])).toBe(true);
  });

  it("respects reportEverySteps = 3 over multiple steps", () => {
    const steps = Array.from({ length: 6 }, (_, i) =>
      makeStep({ index: i, id: `step-${i}`, status: "completed" }),
    );
    const task = makeTask({ reportEverySteps: 3, steps });

    // 6 completed, 6 % 3 = 0 → true
    expect(shouldReportProgress(task, steps[5])).toBe(true);

    // Now change one back to pending (5 completed, 5 % 3 !== 0)
    steps[5].status = "pending";
    expect(shouldReportProgress(task, steps[4])).toBe(false);
  });
});

// ── Message formatting (tested indirectly via report functions) ───────────────
// Since formatProgressMessage, formatCompletionMessage, formatFailureMessage are
// private, we test them indirectly. The key observable behavior is tested through
// shouldReportProgress. Integration tests for the full delivery path would require
// mocking all send functions and the session store, which is better done in an
// integration test suite.

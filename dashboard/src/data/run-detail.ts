import type { Run, RunState, RunStep, RunStepState } from "../../../src/clawdbot/types/run.ts";
import type {
  RunDetailView,
  StepInspection,
  TimelineEntry,
} from "../../../src/clawdbot/ui/run-detail.ts";
import { DEFAULT_INSPECTOR_DRAWER } from "../../../src/clawdbot/ui/run-detail.ts";

function asRunState(value: string): RunState {
  return value as RunState;
}

function asRunStepState(value: string): RunStepState {
  return value as RunStepState;
}

export type MockRunDetailBundle = {
  view: RunDetailView;
  inspectionsByStepId: Record<string, StepInspection>;
};

function buildRun(runId: string): Run {
  const steps: RunStep[] = [
    {
      id: "step_01",
      toolCall: "load-invoice",
      input: { invoiceId: "INV-8821" },
      result: { lineItems: 12, currency: "USD" },
      durationMs: 5_100,
      state: asRunStepState("completed"),
    },
    {
      id: "step_02",
      toolCall: "match-po",
      input: { poId: "PO-4902" },
      result: { matched: true, variancePct: 1.2 },
      durationMs: 8_400,
      state: asRunStepState("completed"),
    },
    {
      id: "step_03",
      toolCall: "request-approval",
      input: { reason: "Variance over 1%" },
      result: { queueId: "apv_991" },
      durationMs: 2_020,
      state: asRunStepState("completed"),
    },
    {
      id: "step_04",
      toolCall: "dispatch-payment",
      input: { method: "wire", amountUsd: 24_912.77 },
      result: undefined,
      durationMs: undefined,
      state: asRunStepState("running"),
    },
  ];

  return {
    id: runId,
    skillName: "invoice-reconcile",
    state: asRunState("running"),
    transitions: [
      {
        from: asRunState("planned"),
        to: asRunState("running"),
        timestamp: "2026-02-07T19:44:01.000Z",
        reason: "Worker picked up queued run",
        actor: "queue:dispatcher",
      },
      {
        from: asRunState("running"),
        to: asRunState("awaiting_approval"),
        timestamp: "2026-02-07T19:45:21.000Z",
        reason: "Variance threshold exceeded",
        actor: "policy:finance-gate",
      },
      {
        from: asRunState("awaiting_approval"),
        to: asRunState("running"),
        timestamp: "2026-02-07T19:46:09.000Z",
        reason: "Operator approved request",
        actor: "user:finance-approver",
      },
    ],
    steps,
    input: {
      invoiceId: "INV-8821",
      vendorId: "vendor_mistral_tools",
      amountUsd: 24_912.77,
    },
    output: undefined,
    artifacts: ["artifact://runs/run_241/match-report.json"],
    createdAt: "2026-02-07T19:44:00.000Z",
    updatedAt: "2026-02-07T19:46:41.000Z",
  };
}

function buildTimeline(): TimelineEntry[] {
  return [
    {
      id: "evt_01",
      type: "state_change",
      timestamp: "2026-02-07T19:44:01.000Z",
      summary: "Run started",
      actor: "queue:dispatcher",
    },
    {
      id: "evt_02",
      type: "step_started",
      timestamp: "2026-02-07T19:44:04.000Z",
      summary: "Step 1: load-invoice started",
      stepId: "step_01",
    },
    {
      id: "evt_03",
      type: "step_completed",
      timestamp: "2026-02-07T19:44:09.000Z",
      summary: "Step 1 completed",
      stepId: "step_01",
    },
    {
      id: "evt_04",
      type: "step_completed",
      timestamp: "2026-02-07T19:44:18.000Z",
      summary: "Step 2 completed with 1.2% variance",
      stepId: "step_02",
    },
    {
      id: "evt_05",
      type: "approval_requested",
      timestamp: "2026-02-07T19:45:21.000Z",
      summary: "Approval requested: variance over policy threshold",
      stepId: "step_03",
      actor: "policy:finance-gate",
    },
    {
      id: "evt_06",
      type: "approval_decided",
      timestamp: "2026-02-07T19:46:09.000Z",
      summary: "Approval granted by finance approver",
      stepId: "step_03",
      actor: "user:finance-approver",
    },
    {
      id: "evt_07",
      type: "step_started",
      timestamp: "2026-02-07T19:46:20.000Z",
      summary: "Step 4: dispatch-payment started",
      stepId: "step_04",
    },
  ];
}

function buildInspections(run: Run, timeline: TimelineEntry[]): Record<string, StepInspection> {
  const byStepId: Record<string, StepInspection> = {};
  for (const step of run.steps) {
    byStepId[step.id] = {
      step,
      formattedInput: JSON.stringify(step.input, null, 2),
      formattedOutput: step.result ? JSON.stringify(step.result, null, 2) : undefined,
      durationLabel: step.durationMs ? `${Math.round(step.durationMs / 100) / 10}s` : undefined,
      artifactIds: step.id === "step_02" ? [run.artifacts[0]] : [],
      timelineEntries: timeline.filter((entry) => entry.stepId === step.id),
      redactedFields: step.id === "step_04" ? ["bankAccount"] : [],
    };
  }
  return byStepId;
}

export function buildMockRunDetailBundle(runId = "run_241"): MockRunDetailBundle {
  const run = buildRun(runId);
  const timeline = buildTimeline();
  const inspectionsByStepId = buildInspections(run, timeline);

  return {
    view: {
      run,
      timeline,
      drawer: {
        ...DEFAULT_INSPECTOR_DRAWER,
      },
      liveUpdates: true,
      activeTab: "timeline",
    },
    inspectionsByStepId,
  };
}

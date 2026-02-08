import type { RunState } from "../../../src/clawdbot/types/run.ts";
import type {
  PaginatedRunList,
  RunListConfig,
  RunListItem,
  RunSortField,
} from "../../../src/clawdbot/ui/runs-list.ts";

function asRunState(value: string): RunState {
  return value as RunState;
}

const MOCK_RUN_ITEMS: RunListItem[] = [
  {
    id: "run_241",
    skillName: "invoice-reconcile",
    state: asRunState("running"),
    createdAt: "2026-02-07T19:44:00.000Z",
    updatedAt: "2026-02-07T19:46:41.000Z",
    durationMs: undefined,
    stepsCompleted: 4,
    stepsTotal: 7,
    triggeredBy: "scheduler:finance-ops",
    estimatedCostUsd: 1.14,
  },
  {
    id: "run_240",
    skillName: "escalate-sla-breach",
    state: asRunState("awaiting_approval"),
    createdAt: "2026-02-07T19:37:15.000Z",
    updatedAt: "2026-02-07T19:39:54.000Z",
    durationMs: undefined,
    stepsCompleted: 3,
    stepsTotal: 6,
    triggeredBy: "agent:support-l2",
    estimatedCostUsd: 0.82,
  },
  {
    id: "run_239",
    skillName: "daily-health-digest",
    state: asRunState("completed"),
    createdAt: "2026-02-07T18:10:12.000Z",
    updatedAt: "2026-02-07T18:11:35.000Z",
    durationMs: 83_421,
    stepsCompleted: 5,
    stepsTotal: 5,
    triggeredBy: "cron:daily-health",
    estimatedCostUsd: 0.34,
  },
  {
    id: "run_238",
    skillName: "match-invoice-to-po",
    state: asRunState("failed"),
    createdAt: "2026-02-07T17:58:44.000Z",
    updatedAt: "2026-02-07T18:00:02.000Z",
    durationMs: 78_127,
    stepsCompleted: 2,
    stepsTotal: 4,
    triggeredBy: "webhook:vendor-sync",
    estimatedCostUsd: 0.51,
  },
  {
    id: "run_237",
    skillName: "weekly-cashflow",
    state: asRunState("completed"),
    createdAt: "2026-02-07T16:41:03.000Z",
    updatedAt: "2026-02-07T16:41:45.000Z",
    durationMs: 42_912,
    stepsCompleted: 6,
    stepsTotal: 6,
    triggeredBy: "scheduler:finance-weekly",
    estimatedCostUsd: 0.73,
  },
  {
    id: "run_236",
    skillName: "notify-incident-room",
    state: asRunState("planned"),
    createdAt: "2026-02-07T16:22:03.000Z",
    updatedAt: "2026-02-07T16:22:03.000Z",
    durationMs: undefined,
    stepsCompleted: 0,
    stepsTotal: 3,
    triggeredBy: "manual:ops-oncall",
    estimatedCostUsd: undefined,
  },
  {
    id: "run_235",
    skillName: "archive-ticket-transcript",
    state: asRunState("canceled"),
    createdAt: "2026-02-07T15:58:10.000Z",
    updatedAt: "2026-02-07T15:59:01.000Z",
    durationMs: 51_011,
    stepsCompleted: 1,
    stepsTotal: 4,
    triggeredBy: "agent:support-bot",
    estimatedCostUsd: 0.21,
  },
];

export function buildMockRunList(): PaginatedRunList {
  return {
    items: [...MOCK_RUN_ITEMS],
    pagination: {
      pageSize: 25,
      totalCount: MOCK_RUN_ITEMS.length,
      nextCursor: undefined,
      prevCursor: undefined,
    },
  };
}

function compareValues(
  a: RunListItem,
  b: RunListItem,
  field: RunSortField,
  direction: "asc" | "desc",
): number {
  const left = a[field];
  const right = b[field];

  const leftValue = left ?? (typeof right === "number" ? Number.NEGATIVE_INFINITY : "");
  const rightValue = right ?? (typeof left === "number" ? Number.NEGATIVE_INFINITY : "");

  if (leftValue < rightValue) {
    return direction === "asc" ? -1 : 1;
  }
  if (leftValue > rightValue) {
    return direction === "asc" ? 1 : -1;
  }
  return 0;
}

export function filterAndSortRuns(items: RunListItem[], config: RunListConfig): RunListItem[] {
  const search = config.filter.search?.trim().toLowerCase() ?? "";

  let filtered = items.filter((item) => {
    if (config.filter.states.length > 0 && !config.filter.states.includes(item.state)) {
      return false;
    }

    if (config.filter.skillNames.length > 0 && !config.filter.skillNames.includes(item.skillName)) {
      return false;
    }

    if (config.filter.triggeredBy && item.triggeredBy !== config.filter.triggeredBy) {
      return false;
    }

    if (search) {
      const haystack = `${item.id} ${item.skillName} ${item.triggeredBy}`.toLowerCase();
      if (!haystack.includes(search)) {
        return false;
      }
    }

    return true;
  });

  filtered = [...filtered].toSorted((left, right) =>
    compareValues(left, right, config.sort.field, config.sort.direction),
  );

  return filtered;
}

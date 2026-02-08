import type { Widget } from "../../../src/clawdbot/ui/widgets.ts";

function isoMinutesAgo(minutes: number): string {
  return new Date(Date.now() - minutes * 60_000).toISOString();
}

export function buildMockWidgets(): Widget[] {
  return [
    {
      id: "runs-summary",
      title: "Runs Summary",
      type: "runs_summary",
      size: "medium",
      loading: false,
      refreshIntervalSec: 20,
      data: {
        total: 127,
        running: 5,
        completed: 108,
        failed: 8,
        awaitingApproval: 4,
        canceled: 2,
        windowStart: isoMinutesAgo(720),
        windowEnd: new Date().toISOString(),
      },
    },
    {
      id: "approvals-pending",
      title: "Approvals Pending",
      type: "approvals_pending",
      size: "small",
      loading: false,
      refreshIntervalSec: 15,
      data: {
        pendingCount: 7,
        oldestPendingAt: isoMinutesAgo(93),
        urgentItemIds: ["apv_991", "apv_987", "apv_973"],
      },
    },
    {
      id: "system-health",
      title: "System Health",
      type: "system_health",
      size: "medium",
      loading: false,
      refreshIntervalSec: 10,
      data: {
        overall: "degraded",
        components: [
          {
            name: "queue",
            status: "healthy",
            message: "Backlog under control",
            lastCheckedAt: isoMinutesAgo(1),
          },
          {
            name: "n8n",
            status: "degraded",
            message: "Retry burst on webhook node",
            lastCheckedAt: isoMinutesAgo(2),
          },
          {
            name: "artifact-store",
            status: "healthy",
            message: "Writes stable",
            lastCheckedAt: isoMinutesAgo(1),
          },
        ],
      },
    },
    {
      id: "cost-overview",
      title: "Cost Overview",
      type: "cost_overview",
      size: "small",
      loading: false,
      refreshIntervalSec: 30,
      data: {
        totalCostUsd: 412.83,
        dailyCosts: [
          { date: "2026-02-03", costUsd: 67.21 },
          { date: "2026-02-04", costUsd: 74.13 },
          { date: "2026-02-05", costUsd: 83.7 },
          { date: "2026-02-06", costUsd: 95.42 },
          { date: "2026-02-07", costUsd: 92.37 },
        ],
        periodStart: "2026-02-01T00:00:00.000Z",
        periodEnd: "2026-02-28T23:59:59.000Z",
      },
    },
    {
      id: "recent-activity",
      title: "Recent Activity",
      type: "recent_activity",
      size: "large",
      loading: false,
      refreshIntervalSec: 12,
      data: {
        entries: [
          {
            id: "act_01",
            message: "Invoice approval queued for run_238",
            timestamp: isoMinutesAgo(4),
            href: "/approvals",
          },
          {
            id: "act_02",
            message: "Workflow deployed: Weekly cashflow snapshot",
            timestamp: isoMinutesAgo(14),
            href: "/workflows",
          },
          {
            id: "act_03",
            message: "Skill updated: summarize-ticket@1.8.0",
            timestamp: isoMinutesAgo(22),
            href: "/skills",
          },
          {
            id: "act_04",
            message: "Run run_237 completed in 42s",
            timestamp: isoMinutesAgo(31),
            href: "/runs/run_237",
          },
        ],
      },
    },
  ];
}

export function withLoadingState(widgets: Widget[], loading: boolean): Widget[] {
  if (!loading) {
    return widgets;
  }

  return widgets.map((widget) => ({
    ...widget,
    loading: true,
    data: undefined,
  }));
}

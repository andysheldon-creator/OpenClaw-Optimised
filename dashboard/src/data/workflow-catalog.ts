import type { CatalogEntry } from "../../../src/clawdbot/ui/workflow-catalog.ts";

export function buildMockWorkflowCatalog(): CatalogEntry[] {
  return [
    {
      id: "wf_analytics_weekly",
      name: "Weekly Cashflow Snapshot",
      description: "Aggregates inflow/outflow and sends a Monday finance digest.",
      longDescription:
        "Builds a weekly ledger summary, compares it to prior period, and alerts when thresholds are breached.",
      version: "1.4.2",
      author: "finance-team",
      category: "monitoring",
      status: "published",
      requiredSkills: ["weekly-cashflow", "daily-health-digest"],
      estimatedDurationSec: 75,
      publishedAt: "2026-01-22T10:00:00.000Z",
      updatedAt: "2026-02-05T08:30:00.000Z",
      deployCount: 93,
      tags: ["finance", "weekly", "digest"],
    },
    {
      id: "wf_support_sla",
      name: "Support SLA Escalation",
      description: "Escalates tickets that violate first-response and resolution windows.",
      longDescription:
        "Inspects ticket metadata, computes SLA risk, and queues high-impact escalations for approval.",
      version: "2.0.1",
      author: "support-ops",
      category: "automation",
      status: "published",
      requiredSkills: ["escalate-sla-breach", "suggest-kb-article"],
      estimatedDurationSec: 38,
      publishedAt: "2026-01-18T13:40:00.000Z",
      updatedAt: "2026-02-06T14:15:00.000Z",
      deployCount: 140,
      tags: ["support", "sla", "escalation"],
    },
    {
      id: "wf_invoice_match",
      name: "Invoice to PO Match",
      description: "Performs two-pass matching and gates on variance thresholds.",
      longDescription:
        "Matches invoice line items to purchase orders, applies tolerance rules, and routes mismatches for manual approval.",
      version: "0.9.0",
      author: "finance-team",
      category: "data-pipeline",
      status: "draft",
      requiredSkills: ["extract-invoice-line-items", "match-invoice-to-po"],
      estimatedDurationSec: 112,
      publishedAt: "2026-02-01T10:50:00.000Z",
      updatedAt: "2026-02-07T16:02:00.000Z",
      deployCount: 7,
      tags: ["invoice", "po", "approval"],
    },
    {
      id: "wf_vendor_renewal",
      name: "Vendor Renewal Watch",
      description: "Tracks upcoming renewals and pushes reminders to owners.",
      longDescription:
        "Scans contract records daily, composes reminders, and flags high-value renewals for approval.",
      version: "1.1.0",
      author: "ops-team",
      category: "notification",
      status: "published",
      requiredSkills: ["vendor-renewal-check", "notify-incident-room"],
      estimatedDurationSec: 49,
      publishedAt: "2026-01-30T08:00:00.000Z",
      updatedAt: "2026-02-04T09:30:00.000Z",
      deployCount: 54,
      tags: ["ops", "contracts", "alerts"],
    },
  ];
}

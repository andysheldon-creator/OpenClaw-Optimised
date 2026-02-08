import type { SkillStatus } from "../../../src/clawdbot/skills/registry.ts";
import type { SkillCard, SkillDetail } from "../../../src/clawdbot/ui/skill-registry-ui.ts";

function asStatus(value: string): SkillStatus {
  return value as SkillStatus;
}

function buildManifest(card: SkillCard): string {
  return `name: ${card.name}
version: ${card.version}
description: ${card.description}
status: ${card.status}
author: ${card.author}
permissions:
  tools: [${card.declaredTools.join(", ")}]
  approval_required: ${card.approvalRequired ? "true" : "false"}
`;
}

const SKILL_CARDS: SkillCard[] = [
  {
    name: "escalate-sla-breach",
    version: "1.8.0",
    description: "Escalates tickets based on SLA thresholds and urgency bands.",
    status: asStatus("active"),
    author: "support-ops",
    publishedAt: "2026-02-03T11:20:00.000Z",
    declaredTools: ["slack", "discord", "calendar"],
    approvalRequired: true,
    usageCount: 502,
    avgDurationMs: 4_912,
    tags: ["support", "sla", "escalation"],
  },
  {
    name: "match-invoice-to-po",
    version: "2.3.1",
    description: "Matches invoice lines against purchase orders with tolerance gates.",
    status: asStatus("active"),
    author: "finance-team",
    publishedAt: "2026-01-29T09:42:00.000Z",
    declaredTools: ["pdf", "webhook", "email"],
    approvalRequired: true,
    usageCount: 341,
    avgDurationMs: 8_772,
    tags: ["finance", "invoice", "workflow"],
  },
  {
    name: "weekly-cashflow",
    version: "1.4.2",
    description: "Builds a weekly cashflow report with threshold alerts.",
    status: asStatus("active"),
    author: "finance-team",
    publishedAt: "2026-01-22T10:00:00.000Z",
    declaredTools: ["email", "webhook"],
    approvalRequired: false,
    usageCount: 189,
    avgDurationMs: 3_010,
    tags: ["finance", "reporting"],
  },
  {
    name: "legacy-status-ping",
    version: "0.6.9",
    description: "Legacy status pinger retained for historical compatibility.",
    status: asStatus("deprecated"),
    author: "ops-team",
    publishedAt: "2025-11-12T14:15:00.000Z",
    declaredTools: ["webhook"],
    approvalRequired: false,
    usageCount: 14,
    avgDurationMs: 1_109,
    tags: ["legacy", "ops"],
  },
];

function buildVersions(card: SkillCard): SkillDetail["versions"] {
  return [
    { version: card.version, publishedAt: card.publishedAt, status: card.status },
    {
      version: "1.0.0",
      publishedAt: "2025-08-01T08:00:00.000Z",
      status: asStatus(card.status === "active" ? "deprecated" : card.status),
    },
  ];
}

function buildChangelog(card: SkillCard): SkillDetail["changelog"] {
  return [
    {
      version: card.version,
      summary: "Improved output safety checks and updated policy metadata.",
      date: "2026-02-03",
    },
    {
      version: "1.5.0",
      summary: "Added structured diagnostics for dashboard rendering.",
      date: "2025-12-18",
    },
  ];
}

function buildDetail(card: SkillCard): SkillDetail {
  return {
    card,
    manifestYaml: buildManifest(card),
    versions: buildVersions(card),
    deprecationMessage:
      card.status === "deprecated"
        ? "Use `system-health-digest` for current status notifications."
        : undefined,
    allowedDomains: ["api.openclaw.ai", "hooks.openclaw.ai"],
    declaredSecrets: card.approvalRequired ? ["ops_api_token", "finance_key"] : ["ops_api_token"],
    changelog: buildChangelog(card),
  };
}

export type MockSkillsRegistry = {
  cards: SkillCard[];
  detailsByName: Record<string, SkillDetail>;
};

export function buildMockSkillsRegistry(): MockSkillsRegistry {
  const detailsByName: Record<string, SkillDetail> = {};
  for (const card of SKILL_CARDS) {
    detailsByName[card.name] = buildDetail(card);
  }

  return {
    cards: [...SKILL_CARDS],
    detailsByName,
  };
}

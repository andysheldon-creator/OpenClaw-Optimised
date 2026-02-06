# 06 Observability and Audit Model

## Executive summary

OpenClaw adaptive tool approval adds context-aware gating so risky tool calls are approved only when it matters, instead of forcing manual approval for every potentially dangerous operation. The baseline architecture is defined in [Adaptive Tool Approval Architecture](../adaptive-tool-approval-architecture.md) and the end-to-end implementation target is defined in [Adaptive Tool Approval Implementation Blueprint](../adaptive-tool-approval-implementation.md). This document is self-contained and scoped to one execution track.
This track is focused on the specific component described below and includes concrete implementation edges, types, and sequencing.

## RPCs, hooks, callbacks, and connected components

- Event `tool.approval.requested`: primary source for pending-approval counters.
- Event `tool.approval.resolved`: primary source for factor and aggregate decision metrics.
- Gateway manager callbacks (`waitForDecision`, `resolve`) supply lifecycle timestamps.
- UI sync hook `apps/web/src/hooks/useGatewayEventSync.ts:68`: consumes approval lifecycle events.
- Approval summary utility `apps/web/src/lib/approvals/pending.ts:17`: existing aggregation for UX counters.

## Phase and parallelism

- Phase: 06 (parallel)
- Parallelism: Yes. Parallel with `06-security-controls-and-abuse-resistance.md`.

## Goal and adaptive-tool context

- Goal: deliver adaptive tool approvals that combine policy checks, factorized approvals, and channel-safe user interactions.
- Adaptive-tool definition: dynamic approval gating for tool invocations based on risk and side-effect classification, with multi-factor quorum support.
- Factor defaults: `allowedApprovers=["user_request","rules_based"]`, `disabledApprovers=[]`, `minApprovals=1`.
- References: [architecture](../adaptive-tool-approval-architecture.md), [implementation](../adaptive-tool-approval-implementation.md).

## Code anchors (existing file and line references)

- `src/gateway/exec-approval-manager.ts:51`
- `src/gateway/exec-approval-manager.ts:70`
- `docs/refactor/adaptive-tool-approval-implementation.md:394`
- `docs/refactor/adaptive-tool-approval-implementation.md:402`
- `apps/web/src/hooks/useGatewayEventSync.ts:68`
- `apps/web/src/lib/approvals/pending.ts:17`
- `apps/web/src/components/composed/ApprovalAttentionNudge.tsx:159`

## Type names and interfaces

- `type ToolApprovalAuditRecord = { requestId: string; requestHash: string; factorResults: ToolApproverResult[]; aggregateStatus: string; }`
- `type ToolApprovalMetrics = { requestsTotal: number; quorumUnmetTotal: number; factorResultTotals: Record<string, number>; }`
- `type ToolApprovalTimelineEvent = { atMs: number; kind: string; actor?: string; }`

## Implementation plan

1. Define structured logs for request, factor result, and final aggregate outcome.
1. Emit high-cardinality-safe metrics with bounded labels.
1. Store enough metadata to replay decision path in incident review.
1. Add dashboard panels for pending approvals, quorum failures, and timeout rate.

## Error-prone implementation snippet

```ts
log.info("tool.approval.resolved", {
  requestId,
  aggregateStatus,
  minApprovals,
  approvals: results.filter((r) => r.verdict == "approve").length,
  rejects: results.filter((r) => r.verdict == "reject").length,
});
```

## Acceptance criteria

- Operators can answer why a tool call was blocked or approved from logs alone.
- Metrics include factor-level breakdown and quorum miss indicators.
- UI pending-approval counters stay accurate under event bursts.

## Related workplan docs

- [`07-web-ui-approval-experience.md`](07-web-ui-approval-experience.md)
- [`10-operations-runbook-and-slo.md`](10-operations-runbook-and-slo.md)
- [`08-testing-strategy-and-quality-gates.md`](08-testing-strategy-and-quality-gates.md)

## External best-practice references

- [OWASP Authorization Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html)
- [NIST SP 800-53 Rev. 5 (AC-5, CM-3)](https://www.govinfo.gov/content/pkg/FR-2020-12-10/pdf/2020-27049.pdf)
- [Vault control groups](https://developer.hashicorp.com/vault/docs/enterprise/control-groups)
- [GitHub protected branches](https://docs.github.com/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/about-protected-branches)
- [GitLab merge request approvals](https://docs.gitlab.com/user/project/merge_requests/approvals/)
- [Google Access Approval](https://cloud.google.com/access-approval/docs/overview)
- [Microsoft Entra PIM approval settings](https://learn.microsoft.com/en-us/entra/id-governance/privileged-identity-management/pim-how-to-change-default-settings)

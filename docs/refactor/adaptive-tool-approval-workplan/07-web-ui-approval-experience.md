# 07 Web UI Approval Experience

## Executive summary

OpenClaw adaptive tool approval adds context-aware gating so risky tool calls are approved only when it matters, instead of forcing manual approval for every potentially dangerous operation. The baseline architecture is defined in [Adaptive Tool Approval Architecture](../adaptive-tool-approval-architecture.md) and the end-to-end implementation target is defined in [Adaptive Tool Approval Implementation Blueprint](../adaptive-tool-approval-implementation.md). This document is self-contained and scoped to one execution track.
This track is focused on the specific component described below and includes concrete implementation edges, types, and sequencing.

## RPCs, hooks, callbacks, and connected components

- RPC `tool.approval.request`: rendered as actionable pending card/dialog in UI.
- RPC `tool.approval.resolve`: fired from UI action buttons.
- Event sync hook `apps/web/src/hooks/useGatewayEventSync.ts:68`: refreshes approval state on request/resolve events.
- Approval actions hook `apps/web/src/hooks/useAgentApprovalActions.ts:15`: current user-action seam.
- Pending summary utility `apps/web/src/lib/approvals/pending.ts:17`: existing data model to extend with factor detail.

## Phase and parallelism

- Phase: 07 (parallel)
- Parallelism: Yes. Parallel with `07-cli-and-operator-workflows.md`.

## Goal and adaptive-tool context

- Goal: deliver adaptive tool approvals that combine policy checks, factorized approvals, and channel-safe user interactions.
- Adaptive-tool definition: dynamic approval gating for tool invocations based on risk and side-effect classification, with multi-factor quorum support.
- Factor defaults: `allowedApprovers=["user_request","rules_based"]`, `disabledApprovers=[]`, `minApprovals=1`.
- References: [architecture](../adaptive-tool-approval-architecture.md), [implementation](../adaptive-tool-approval-implementation.md).

## Code anchors (existing file and line references)

- `apps/web/src/hooks/useAgentApprovalActions.ts:15`
- `apps/web/src/components/composed/ApprovalAttentionNudge.tsx:143`
- `apps/web/src/components/composed/CommandPalette.tsx:175`
- `apps/web/src/components/composed/AgentSessionsIndicator.tsx:193`
- `apps/web/src/hooks/useGatewayEventSync.ts:68`
- `apps/web/src/routes/nodes/index.tsx:334`
- `apps/web/src/lib/approvals/pending.ts:26`

## Type names and interfaces

- `type UIPendingToolApproval = { id: string; toolName: string; riskClass: ToolApprovalRiskClass; pendingApprovers: ToolApproverId[]; minApprovals: number; }`
- `type UIApprovalAction = "approve" | "deny" | "open_details"`
- `type UIApprovalState = { pending: UIPendingToolApproval[]; lastResolvedAt?: number; }`

## Implementation plan

1. Add factor-aware approval card with pending approver list and quorum meter.
1. Show request hash + risk class in details drawer for transparency.
1. Wire buttons to `tool.approval.resolve` with optimistic updates and rollback on failure.
1. Preserve existing reminder UX while including quorum context.

## Error-prone implementation snippet

```ts
const quorumText = `${approvedFactors}/${minApprovals} approvals`;
const blocked = approvedFactors < minApprovals;
<Button disabled={!canResolve} onClick={() => resolve({ id, decision: "approve" })}>Approve</Button>
```

## Acceptance criteria

- Operators can see factor progress and unresolved factors without opening logs.
- UI stays synchronized under concurrent approvals from other channels.
- Approval reminders are suppressed once quorum is reached.

## Related workplan docs

- [`05-user-request-approver-ui-cli-channels.md`](05-user-request-approver-ui-cli-channels.md)
- [`06-observability-and-audit-model.md`](06-observability-and-audit-model.md)
- [`10-operations-runbook-and-slo.md`](10-operations-runbook-and-slo.md)

## External best-practice references

- [OWASP Authorization Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html)
- [NIST SP 800-53 Rev. 5 (AC-5, CM-3)](https://www.govinfo.gov/content/pkg/FR-2020-12-10/pdf/2020-27049.pdf)
- [Vault control groups](https://developer.hashicorp.com/vault/docs/enterprise/control-groups)
- [GitHub protected branches](https://docs.github.com/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/about-protected-branches)
- [GitLab merge request approvals](https://docs.gitlab.com/user/project/merge_requests/approvals/)
- [Google Access Approval](https://cloud.google.com/access-approval/docs/overview)
- [Microsoft Entra PIM approval settings](https://learn.microsoft.com/en-us/entra/id-governance/privileged-identity-management/pim-how-to-change-default-settings)

# 02 Quorum Aggregation Engine

## Executive summary

OpenClaw adaptive tool approval adds context-aware gating so risky tool calls are approved only when it matters, instead of forcing manual approval for every potentially dangerous operation. The baseline architecture is defined in [Adaptive Tool Approval Architecture](../adaptive-tool-approval-architecture.md) and the end-to-end implementation target is defined in [Adaptive Tool Approval Implementation Blueprint](../adaptive-tool-approval-implementation.md). This document is self-contained and scoped to one execution track.
This track is focused on the specific component described below and includes concrete implementation edges, types, and sequencing.

## RPCs, hooks, callbacks, and connected components

- RPC `tool.approval.request`: called only if non-human factors cannot satisfy quorum.
- RPC `tool.approval.resolve`: mapped into a `ToolApproverResult` with `approverId=user_request`.
- Callback `ExecApprovalManager.waitForDecision` in `src/gateway/exec-approval-manager.ts:51`: reuse timeout semantics.
- Callback `ExecApprovalManager.resolve` in `src/gateway/exec-approval-manager.ts:64`: reuse idempotent resolve semantics.
- Event `exec.approval.requested` in `src/gateway/server-methods/exec-approval.ts:67`: baseline event contract to generalize.

## Phase and parallelism

- Phase: 02 (parallel)
- Parallelism: Yes. Can run in parallel with other `02-*` docs after phase 01.

## Goal and adaptive-tool context

- Goal: deliver adaptive tool approvals that combine policy checks, factorized approvals, and channel-safe user interactions.
- Adaptive-tool definition: dynamic approval gating for tool invocations based on risk and side-effect classification, with multi-factor quorum support.
- Factor defaults: `allowedApprovers=["user_request","rules_based"]`, `disabledApprovers=[]`, `minApprovals=1`.
- References: [architecture](../adaptive-tool-approval-architecture.md), [implementation](../adaptive-tool-approval-implementation.md).

## Code anchors (existing file and line references)

- `src/gateway/exec-approval-manager.ts:32`
- `src/gateway/exec-approval-manager.ts:51`
- `src/gateway/exec-approval-manager.ts:64`
- `src/gateway/server-methods/exec-approval.ts:65`
- `src/gateway/server-methods/exec-approval.ts:119`
- `docs/refactor/adaptive-tool-approval-architecture.md:154`
- `docs/refactor/adaptive-tool-approval-implementation.md:260`

## Type names and interfaces

- `type AggregationState = { minApprovals: number; results: ToolApproverResult[]; approved: boolean; rejected: boolean; }`
- `type AggregationDecision = "approved" | "rejected" | "needs_more_factors" | "timeout"`
- `type FactorRejectionPolicy = "any_reject_fails" | "soft_reject"`

## Implementation plan

1. Implement deterministic aggregation: reject-first, then quorum-check, then pending state.
1. Track per-factor hashes to prevent stale/duplicate factor results.
1. Support risk-based `minApprovalsByRisk` override with strict bounds.
1. Emit aggregation reason codes for audit and operator UX.

## Error-prone implementation snippet

```ts
export function aggregate(
  results: ToolApproverResult[],
  minApprovals: number,
): AggregationDecision {
  if (results.some((r) => r.verdict == "reject")) return "rejected";
  const approvals = results.filter((r) => r.verdict == "approve").length;
  if (approvals >= minApprovals) return "approved";
  return "needs_more_factors";
}
```

## Acceptance criteria

- Aggregation behaves identically across runtime and gateway tests.
- `minApprovals` edge cases are fail-closed and observable.
- Timeout transitions preserve prior factor artifacts for forensics.

## Related workplan docs

- [`02-approver-interface-and-registry.md`](02-approver-interface-and-registry.md)
- [`03-gateway-approval-manager-generalization.md`](03-gateway-approval-manager-generalization.md)
- [`06-observability-and-audit-model.md`](06-observability-and-audit-model.md)

## External best-practice references

- [OWASP Authorization Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html)
- [NIST SP 800-53 Rev. 5 (AC-5, CM-3)](https://www.govinfo.gov/content/pkg/FR-2020-12-10/pdf/2020-27049.pdf)
- [Vault control groups](https://developer.hashicorp.com/vault/docs/enterprise/control-groups)
- [GitHub protected branches](https://docs.github.com/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/about-protected-branches)
- [GitLab merge request approvals](https://docs.gitlab.com/user/project/merge_requests/approvals/)
- [Google Access Approval](https://cloud.google.com/access-approval/docs/overview)
- [Microsoft Entra PIM approval settings](https://learn.microsoft.com/en-us/entra/id-governance/privileged-identity-management/pim-how-to-change-default-settings)

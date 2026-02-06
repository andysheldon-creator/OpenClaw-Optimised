# 03 Gateway Approval Manager Generalization

## Executive summary

OpenClaw adaptive tool approval adds context-aware gating so risky tool calls are approved only when it matters, instead of forcing manual approval for every potentially dangerous operation. The baseline architecture is defined in [Adaptive Tool Approval Architecture](../adaptive-tool-approval-architecture.md) and the end-to-end implementation target is defined in [Adaptive Tool Approval Implementation Blueprint](../adaptive-tool-approval-implementation.md). This document is self-contained and scoped to one execution track.
This track is focused on the specific component described below and includes concrete implementation edges, types, and sequencing.

## RPCs, hooks, callbacks, and connected components

- RPC `tool.approval.request`: creates pending record and starts timeout lifecycle.
- RPC `tool.approval.resolve`: appends factor result and re-runs quorum aggregation.
- Callback `waitForDecision` in `src/gateway/exec-approval-manager.ts:51`: baseline to extend from boolean decision to factorized decisions.
- Callback `resolve` in `src/gateway/exec-approval-manager.ts:64`: baseline idempotent update path.
- Forwarder callback `createExecApprovalForwarder` in `src/infra/exec-approval-forwarder.ts:224`: transport seam for user factor.

## Phase and parallelism

- Phase: 03 (parallel)
- Parallelism: Yes. Parallel with other `03-*` tracks.

## Goal and adaptive-tool context

- Goal: deliver adaptive tool approvals that combine policy checks, factorized approvals, and channel-safe user interactions.
- Adaptive-tool definition: dynamic approval gating for tool invocations based on risk and side-effect classification, with multi-factor quorum support.
- Factor defaults: `allowedApprovers=["user_request","rules_based"]`, `disabledApprovers=[]`, `minApprovals=1`.
- References: [architecture](../adaptive-tool-approval-architecture.md), [implementation](../adaptive-tool-approval-implementation.md).

## Code anchors (existing file and line references)

- `src/gateway/exec-approval-manager.ts:32`
- `src/gateway/exec-approval-manager.ts:57`
- `src/gateway/exec-approval-manager.ts:70`
- `src/gateway/server-methods/exec-approval.ts:65`
- `src/gateway/server-methods/exec-approval.ts:119`
- `src/infra/exec-approval-forwarder.ts:224`
- `src/infra/exec-approval-forwarder.ts:329`

## Type names and interfaces

- `type ToolApprovalPendingRecord = { id: string; requestHash: string; factorResults: ToolApproverResult[]; minApprovals: number; expiresAtMs: number; }`
- `type ToolApprovalPendingMap = Map<string, ToolApprovalPendingRecord>`
- `type ToolApprovalResolutionOutcome = { status: "approved"|"rejected"|"expired"; results: ToolApproverResult[]; }`

## Implementation plan

1. Introduce new manager (`ToolApprovalManager`) rather than expanding exec manager in place.
1. Persist all factor results inside pending record for audit and UI detail.
1. Implement monotonic state transitions: pending -> approved/rejected/expired only once.
1. Keep timeout handling and memory cleanup behavior aligned with current manager.

## Error-prone implementation snippet

```ts
if (record.status !== "pending") {
  return { ok: false, reason: "already-finalized" };
}
record.factorResults.push(result);
record.status =
  aggregate(record.factorResults, record.minApprovals) == "approved" ? "approved" : record.status;
```

## Acceptance criteria

- Manager supports multiple factor submissions per request id.
- Duplicate factor submissions from the same approver id are ignored or rejected deterministically.
- Timeout path yields explicit `expired` status and event.

## Related workplan docs

- [`02-quorum-aggregation-engine.md`](02-quorum-aggregation-engine.md)
- [`03-tool-approval-rpc-and-protocol.md`](03-tool-approval-rpc-and-protocol.md)
- [`06-observability-and-audit-model.md`](06-observability-and-audit-model.md)

## External best-practice references

- [OWASP Authorization Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html)
- [NIST SP 800-53 Rev. 5 (AC-5, CM-3)](https://www.govinfo.gov/content/pkg/FR-2020-12-10/pdf/2020-27049.pdf)
- [Vault control groups](https://developer.hashicorp.com/vault/docs/enterprise/control-groups)
- [GitHub protected branches](https://docs.github.com/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/about-protected-branches)
- [GitLab merge request approvals](https://docs.gitlab.com/user/project/merge_requests/approvals/)
- [Google Access Approval](https://cloud.google.com/access-approval/docs/overview)
- [Microsoft Entra PIM approval settings](https://learn.microsoft.com/en-us/entra/id-governance/privileged-identity-management/pim-how-to-change-default-settings)

# 03 Tool Approval RPC and Protocol

## Executive summary

OpenClaw adaptive tool approval adds context-aware gating so risky tool calls are approved only when it matters, instead of forcing manual approval for every potentially dangerous operation. The baseline architecture is defined in [Adaptive Tool Approval Architecture](../adaptive-tool-approval-architecture.md) and the end-to-end implementation target is defined in [Adaptive Tool Approval Implementation Blueprint](../adaptive-tool-approval-implementation.md). This document is self-contained and scoped to one execution track.
This track is focused on the specific component described below and includes concrete implementation edges, types, and sequencing.

## RPCs, hooks, callbacks, and connected components

- New RPC `tool.approval.request`: generic request for any tool/factorized decision.
- New RPC `tool.approval.resolve`: generic resolution including `approverId` and request hash.
- New RPC `tool.approvals.policy.get`: exposes effective approver set and quorum for debugging.
- Compatibility RPCs `exec.approval.request` and `exec.approval.resolve` in `src/gateway/server-methods/exec-approval.ts:18`/`:98` remain aliases.
- Method registry update in `src/gateway/server-methods-list.ts:25` and `:131` for methods/events.

## Phase and parallelism

- Phase: 03 (parallel)
- Parallelism: Yes. Can run in parallel with other `03-*` tracks after all `02-*` contracts are merged.

## Goal and adaptive-tool context

- Goal: deliver adaptive tool approvals that combine policy checks, factorized approvals, and channel-safe user interactions.
- Adaptive-tool definition: dynamic approval gating for tool invocations based on risk and side-effect classification, with multi-factor quorum support.
- Factor defaults: `allowedApprovers=["user_request","rules_based"]`, `disabledApprovers=[]`, `minApprovals=1`.
- References: [architecture](../adaptive-tool-approval-architecture.md), [implementation](../adaptive-tool-approval-implementation.md).

## Code anchors (existing file and line references)

- `src/gateway/protocol/schema/exec-approvals.ts:90`
- `src/gateway/protocol/schema/exec-approvals.ts:106`
- `src/gateway/server-methods/exec-approval.ts:13`
- `src/gateway/server-methods/exec-approval.ts:67`
- `src/gateway/server-methods/exec-approval.ts:125`
- `src/gateway/server-methods-list.ts:29`
- `src/gateway/server-methods-list.ts:132`

## Type names and interfaces

- `type ToolApprovalRequestParams = { id: string; toolName: string; requestHash: string; riskClass: ToolApprovalRiskClass; }`
- `type ToolApprovalResolveParams = { id: string; approverId: ToolApproverId; decision: "approve"|"deny"; requestHash: string; }`
- `type ToolApprovalRequestedEvent = { id: string; pendingFactors: ToolApproverId[]; minApprovals: number; }`

## Implementation plan

1. Create `src/gateway/protocol/schema/tool-approvals.ts` and validators with strict object schemas.
1. Add generic handlers in `src/gateway/server-methods/tool-approval.ts`.
1. Wire aliases from legacy exec methods to generic methods.
1. Add request-hash validation to reject stale or tampered resolutions.

## Error-prone implementation snippet

```ts
if (params.requestHash !== record.requestHash) {
  respond(
    false,
    undefined,
    errorShape(ErrorCodes.INVALID_REQUEST, "stale approval: request changed"),
  );
  return;
}
```

## Acceptance criteria

- Gateway accepts generic tool approval calls and emits generic events.
- Legacy exec approval callers continue to work unchanged.
- Schema validators reject unknown properties and wrong enum values.

## Related workplan docs

- [`03-gateway-approval-manager-generalization.md`](03-gateway-approval-manager-generalization.md)
- [`03-event-scoping-and-broadcast-rules.md`](03-event-scoping-and-broadcast-rules.md)
- [`09-rollout-migration-and-compatibility.md`](09-rollout-migration-and-compatibility.md)

## External best-practice references

- [OWASP Authorization Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html)
- [NIST SP 800-53 Rev. 5 (AC-5, CM-3)](https://www.govinfo.gov/content/pkg/FR-2020-12-10/pdf/2020-27049.pdf)
- [Vault control groups](https://developer.hashicorp.com/vault/docs/enterprise/control-groups)
- [GitHub protected branches](https://docs.github.com/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/about-protected-branches)
- [GitLab merge request approvals](https://docs.gitlab.com/user/project/merge_requests/approvals/)
- [Google Access Approval](https://cloud.google.com/access-approval/docs/overview)
- [Microsoft Entra PIM approval settings](https://learn.microsoft.com/en-us/entra/id-governance/privileged-identity-management/pim-how-to-change-default-settings)

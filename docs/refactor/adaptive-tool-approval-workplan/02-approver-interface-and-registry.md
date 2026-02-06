# 02 Approver Interface and Registry

## Executive summary

OpenClaw adaptive tool approval adds context-aware gating so risky tool calls are approved only when it matters, instead of forcing manual approval for every potentially dangerous operation. The baseline architecture is defined in [Adaptive Tool Approval Architecture](../adaptive-tool-approval-architecture.md) and the end-to-end implementation target is defined in [Adaptive Tool Approval Implementation Blueprint](../adaptive-tool-approval-implementation.md). This document is self-contained and scoped to one execution track.
This track is focused on the specific component described below and includes concrete implementation edges, types, and sequencing.

## RPCs, hooks, callbacks, and connected components

- RPC `tool.approval.request`: used by registry when `user_request` factor is active and quorum is unmet.
- RPC `tool.approval.resolve`: returns a factor vote from human workflows.
- Hook `wrapToolWithBeforeToolCallHook` in `src/agents/pi-tools.before-tool-call.ts:67`: entry integration for registry execution.
- Gateway scope check in `src/gateway/server-methods.ts:157`: enforce `operator.approvals` for factor resolution APIs.
- Broadcast permissions in `src/gateway/server-broadcast.ts:6`: only approval-authorized clients receive factor events.

## Phase and parallelism

- Phase: 02 (parallel)
- Parallelism: Yes. Can run in parallel with other `02-*` docs after phase 01 is complete.

## Goal and adaptive-tool context

- Goal: deliver adaptive tool approvals that combine policy checks, factorized approvals, and channel-safe user interactions.
- Adaptive-tool definition: dynamic approval gating for tool invocations based on risk and side-effect classification, with multi-factor quorum support.
- Factor defaults: `allowedApprovers=["user_request","rules_based"]`, `disabledApprovers=[]`, `minApprovals=1`.
- References: [architecture](../adaptive-tool-approval-architecture.md), [implementation](../adaptive-tool-approval-implementation.md).

## Code anchors (existing file and line references)

- `src/agents/pi-tools.before-tool-call.ts:67`
- `src/agents/pi-tools.ts:447`
- `src/gateway/server-methods.ts:40`
- `src/gateway/server-methods.ts:157`
- `src/gateway/server-broadcast.ts:10`
- `src/gateway/server-methods-list.ts:25`
- `src/gateway/server-methods-list.ts:131`

## Type names and interfaces

- `interface ToolApprover { id: ToolApproverId; supports(ctx): boolean; evaluate(request): Promise<ToolApproverResult>; }`
- `interface ToolApproverRegistry { list(policy): ToolApprover[]; }`
- `type ToolApproverResult = { approverId: ToolApproverId; verdict: "approve"|"reject"|"abstain"|"error"; reasonCodes: string[]; }`

## Implementation plan

1. Create approver interface and strongly-typed registry with deterministic sort order.
1. Implement built-ins: `user_request`, `rules_based`, `llm_evaluation`.
1. Enforce duplicate suppression so an approver id cannot vote twice.
1. Add policy-aware `supports` checks to skip unavailable factors cleanly.

## Error-prone implementation snippet

```ts
export class StaticToolApproverRegistry implements ToolApproverRegistry {
  constructor(private readonly approvers: ToolApprover[]) {}
  list(policy: Required<ToolApprovalFactorPolicy>): ToolApprover[] {
    const wanted = new Set(policy.allowedApprovers);
    return this.approvers.filter((a) => wanted.has(a.id)).sort((a, b) => a.id.localeCompare(b.id));
  }
}
```

## Acceptance criteria

- Registry returns only effective approvers and never duplicates ids.
- Runtime can request the registry with per-risk policy overrides.
- Unit tests cover unsupported approvers and disabled approvers.

## Related workplan docs

- [`02-quorum-aggregation-engine.md`](02-quorum-aggregation-engine.md)
- [`05-user-request-approver-ui-cli-channels.md`](05-user-request-approver-ui-cli-channels.md)
- [`05-llm-evaluation-approver-design.md`](05-llm-evaluation-approver-design.md)

## External best-practice references

- [OWASP Authorization Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html)
- [NIST SP 800-53 Rev. 5 (AC-5, CM-3)](https://www.govinfo.gov/content/pkg/FR-2020-12-10/pdf/2020-27049.pdf)
- [Vault control groups](https://developer.hashicorp.com/vault/docs/enterprise/control-groups)
- [GitHub protected branches](https://docs.github.com/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/about-protected-branches)
- [GitLab merge request approvals](https://docs.gitlab.com/user/project/merge_requests/approvals/)
- [Google Access Approval](https://cloud.google.com/access-approval/docs/overview)
- [Microsoft Entra PIM approval settings](https://learn.microsoft.com/en-us/entra/id-governance/privileged-identity-management/pim-how-to-change-default-settings)

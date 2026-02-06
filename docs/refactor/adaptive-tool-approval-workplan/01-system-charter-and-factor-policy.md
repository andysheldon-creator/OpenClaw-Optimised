# 01 System Charter and Factor Policy

## Executive summary

OpenClaw adaptive tool approval adds context-aware gating so risky tool calls are approved only when it matters, instead of forcing manual approval for every potentially dangerous operation. The baseline architecture is defined in [Adaptive Tool Approval Architecture](../adaptive-tool-approval-architecture.md) and the end-to-end implementation target is defined in [Adaptive Tool Approval Implementation Blueprint](../adaptive-tool-approval-implementation.md). This document is self-contained and scoped to one execution track.
This track is focused on the specific component described below and includes concrete implementation edges, types, and sequencing.

## RPCs, hooks, callbacks, and connected components

- RPC `tool.approval.request`: canonical request entry-point for any factor path that needs human interaction.
- RPC `tool.approval.resolve`: canonical resolution callback for `UserRequestApprover`.
- RPC alias `exec.approval.request`/`exec.approval.resolve`: compatibility bridge during migration.
- Hook `runBeforeToolCallHook` in `src/agents/pi-tools.before-tool-call.ts:19`: insertion seam before tool execution.
- Callback `requiresExecApproval` in `src/infra/exec-approvals.ts:1403`: existing decision seam to preserve while migrating.

## Phase and parallelism

- Phase: 01 (blocking foundation)
- Parallelism: No. This phase defines invariants consumed by every later phase.

## Goal and adaptive-tool context

- Goal: deliver adaptive tool approvals that combine policy checks, factorized approvals, and channel-safe user interactions.
- Adaptive-tool definition: dynamic approval gating for tool invocations based on risk and side-effect classification, with multi-factor quorum support.
- Factor defaults: `allowedApprovers=["user_request","rules_based"]`, `disabledApprovers=[]`, `minApprovals=1`.
- References: [architecture](../adaptive-tool-approval-architecture.md), [implementation](../adaptive-tool-approval-implementation.md).

## Code anchors (existing file and line references)

- `docs/refactor/adaptive-tool-approval-architecture.md:13`
- `docs/refactor/adaptive-tool-approval-architecture.md:117`
- `docs/refactor/adaptive-tool-approval-implementation.md:17`
- `docs/refactor/adaptive-tool-approval-implementation.md:130`
- `src/infra/exec-approvals.ts:1476`
- `src/config/types.approvals.ts:27`
- `src/config/zod-schema.approvals.ts:23`

## Type names and interfaces

- `type ToolApproverId = "user_request" | "rules_based" | "llm_evaluation"`
- `type ToolApprovalFactorPolicy = { allowedApprovers?: ToolApproverId[]; disabledApprovers?: ToolApproverId[]; minApprovals?: number }`
- `type ToolApprovalRiskClass = "R0" | "R1" | "R2" | "R3" | "R4"`

## Implementation plan

1. Freeze default policy: `allowedApprovers=[user_request,rules_based]`, `disabledApprovers=[]`, `minApprovals=1`.
1. Define risk-to-quorum override rules (`R4` requires >=2 approvals unless break-glass).
1. Document fail-closed behavior when effective approver count is less than `minApprovals`.
1. Lock naming and enum values so protocol/schema/UI stay aligned.

## Error-prone implementation snippet

```ts
export function resolveEffectiveFactorPolicy(
  input: ToolApprovalFactorPolicy,
): Required<ToolApprovalFactorPolicy> {
  const allowed = (input.allowedApprovers ?? ["user_request", "rules_based"]).filter(Boolean);
  const disabled = new Set(input.disabledApprovers ?? []);
  const effective = allowed.filter((id, i) => !disabled.has(id) && allowed.indexOf(id) == i);
  const minApprovals = input.minApprovals ?? 1;
  if (effective.length == 0 || minApprovals > effective.length) {
    throw new Error("INVALID_TOOL_APPROVAL_FACTOR_POLICY");
  }
  return { allowedApprovers: effective, disabledApprovers: [], minApprovals };
}
```

## Acceptance criteria

- A single canonical factor policy contract exists and is referenced by runtime, gateway, and UI docs.
- All downstream docs reference exact same default values.
- No ambiguity remains about deny precedence or quorum failures.

## Related workplan docs

- [`02-approver-interface-and-registry.md`](02-approver-interface-and-registry.md)
- [`02-quorum-aggregation-engine.md`](02-quorum-aggregation-engine.md)
- [`02-config-schema-for-multi-factor-approvals.md`](02-config-schema-for-multi-factor-approvals.md)

## External best-practice references

- [OWASP Authorization Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html)
- [NIST SP 800-53 Rev. 5 (AC-5, CM-3)](https://www.govinfo.gov/content/pkg/FR-2020-12-10/pdf/2020-27049.pdf)
- [Vault control groups](https://developer.hashicorp.com/vault/docs/enterprise/control-groups)
- [GitHub protected branches](https://docs.github.com/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/about-protected-branches)
- [GitLab merge request approvals](https://docs.gitlab.com/user/project/merge_requests/approvals/)
- [Google Access Approval](https://cloud.google.com/access-approval/docs/overview)
- [Microsoft Entra PIM approval settings](https://learn.microsoft.com/en-us/entra/id-governance/privileged-identity-management/pim-how-to-change-default-settings)

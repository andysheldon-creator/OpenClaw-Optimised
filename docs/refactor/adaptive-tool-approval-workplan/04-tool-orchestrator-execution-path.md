# 04 Tool Orchestrator Execution Path

## Executive summary

OpenClaw adaptive tool approval adds context-aware gating so risky tool calls are approved only when it matters, instead of forcing manual approval for every potentially dangerous operation. The baseline architecture is defined in [Adaptive Tool Approval Architecture](../adaptive-tool-approval-architecture.md) and the end-to-end implementation target is defined in [Adaptive Tool Approval Implementation Blueprint](../adaptive-tool-approval-implementation.md). This document is self-contained and scoped to one execution track.
This track is focused on the specific component described below and includes concrete implementation edges, types, and sequencing.

## RPCs, hooks, callbacks, and connected components

- RPC `tool.approval.request`: invoked by orchestrator when quorum not met by automatic factors.
- RPC `tool.approval.resolve`: consumed to continue execution.
- Callback `requiresExecApproval` in `src/infra/exec-approvals.ts:1403`: map existing logic into `RulesBasedApprover`.
- Callback `requestExecApprovalViaSocket` in `src/infra/exec-approvals.ts:1478`: compatibility bridge for migration mode.
- CLI invoke path in `src/cli/nodes-cli/register.invoke.ts:232`: receives approval decision tokens.

## Phase and parallelism

- Phase: 04 (parallel)
- Parallelism: Yes. Parallel with other `04-*` tracks.

## Goal and adaptive-tool context

- Goal: deliver adaptive tool approvals that combine policy checks, factorized approvals, and channel-safe user interactions.
- Adaptive-tool definition: dynamic approval gating for tool invocations based on risk and side-effect classification, with multi-factor quorum support.
- Factor defaults: `allowedApprovers=["user_request","rules_based"]`, `disabledApprovers=[]`, `minApprovals=1`.
- References: [architecture](../adaptive-tool-approval-architecture.md), [implementation](../adaptive-tool-approval-implementation.md).

## Code anchors (existing file and line references)

- `src/infra/exec-approvals.ts:1403`
- `src/infra/exec-approvals.ts:1478`
- `src/agents/bash-tools.exec.ts:1162`
- `src/agents/bash-tools.exec.ts:1179`
- `src/agents/bash-tools.exec.ts:1351`
- `src/cli/nodes-cli/register.invoke.ts:232`
- `src/cli/nodes-cli/register.invoke.ts:331`

## Type names and interfaces

- `type ToolApprovalOrchestratorDeps = { registry: ToolApproverRegistry; gatewayClient: GatewayClient; }`
- `type ToolInvocationDecision = { execute: boolean; blockedReason?: string; factorResults: ToolApproverResult[]; }`
- `type ToolApprovalMode = "off" | "adaptive" | "always"`

## Implementation plan

1. Implement orchestrator as pure state machine with explicit transitions.
1. Run static policy/risk before any factor calls to avoid unnecessary latency.
1. Execute automatic factors first; request user factor only when needed.
1. Return approved execution token that downstream tool handlers must require.

## Error-prone implementation snippet

```ts
switch (decision) {
  case "allow":
    return { execute: true, factorResults };
  case "deny":
    return { execute: false, blockedReason: "policy-deny", factorResults };
  default:
    return await requestUserFactorAndContinue(ctx, factorResults);
}
```

## Acceptance criteria

- Orchestrator can satisfy quorum without user prompt when configured.
- `R3+` defaults still require human factor unless policy explicitly overrides.
- Migration mode can mirror old exec behavior for parity testing.

## Related workplan docs

- [`05-rules-based-approver-design.md`](05-rules-based-approver-design.md)
- [`05-llm-evaluation-approver-design.md`](05-llm-evaluation-approver-design.md)
- [`09-rollout-migration-and-compatibility.md`](09-rollout-migration-and-compatibility.md)

## External best-practice references

- [OWASP Authorization Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html)
- [NIST SP 800-53 Rev. 5 (AC-5, CM-3)](https://www.govinfo.gov/content/pkg/FR-2020-12-10/pdf/2020-27049.pdf)
- [Vault control groups](https://developer.hashicorp.com/vault/docs/enterprise/control-groups)
- [GitHub protected branches](https://docs.github.com/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/about-protected-branches)
- [GitLab merge request approvals](https://docs.gitlab.com/user/project/merge_requests/approvals/)
- [Google Access Approval](https://cloud.google.com/access-approval/docs/overview)
- [Microsoft Entra PIM approval settings](https://learn.microsoft.com/en-us/entra/id-governance/privileged-identity-management/pim-how-to-change-default-settings)

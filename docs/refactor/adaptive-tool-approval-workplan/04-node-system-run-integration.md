# 04 Node system.run Integration

## Executive summary

OpenClaw adaptive tool approval adds context-aware gating so risky tool calls are approved only when it matters, instead of forcing manual approval for every potentially dangerous operation. The baseline architecture is defined in [Adaptive Tool Approval Architecture](../adaptive-tool-approval-architecture.md) and the end-to-end implementation target is defined in [Adaptive Tool Approval Implementation Blueprint](../adaptive-tool-approval-implementation.md). This document is self-contained and scoped to one execution track.
This track is focused on the specific component described below and includes concrete implementation edges, types, and sequencing.

## RPCs, hooks, callbacks, and connected components

- RPC `node.system.run`: high-risk remote execution path that must use factorized approvals.
- RPC `exec.approvals.node.get` in `src/gateway/server-methods/exec-approvals.ts:162`: node baseline config source.
- RPC `exec.approvals.node.set` in `src/gateway/server-methods/exec-approvals.ts:200`: node override write path.
- Callback `evaluateExecAllowlist` flow in `src/node-host/runner.ts:927`: preserve rules factor semantics.
- Callback `minSecurity`/`maxAsk` flow in `src/cli/nodes-cli/register.invoke.ts:243`/`:244`: preserve effective policy merges.

## Phase and parallelism

- Phase: 04 (parallel)
- Parallelism: Yes. Parallel with other `04-*` tracks.

## Goal and adaptive-tool context

- Goal: deliver adaptive tool approvals that combine policy checks, factorized approvals, and channel-safe user interactions.
- Adaptive-tool definition: dynamic approval gating for tool invocations based on risk and side-effect classification, with multi-factor quorum support.
- Factor defaults: `allowedApprovers=["user_request","rules_based"]`, `disabledApprovers=[]`, `minApprovals=1`.
- References: [architecture](../adaptive-tool-approval-architecture.md), [implementation](../adaptive-tool-approval-implementation.md).

## Code anchors (existing file and line references)

- `src/node-host/runner.ts:893`
- `src/node-host/runner.ts:952`
- `src/node-host/runner.ts:1073`
- `src/node-host/runner.ts:1082`
- `src/gateway/node-command-policy.ts:120`
- `src/cli/nodes-cli/register.invoke.ts:246`
- `src/cli/nodes-cli/register.invoke.ts:263`

## Type names and interfaces

- `type NodeToolApprovalContext = { nodeId: string; platform: string; command: string[]; }`
- `type NodeApprovalResponse = { approved: boolean; reason: string; approvalId?: string; }`
- `type NodeRiskSignals = { remoteExecution: true; allowlistSatisfied: boolean; analysisOk: boolean; }`

## Implementation plan

1. Inject orchestrator call into node `system.run` execution path.
1. Keep Windows-specific allowlist caveats unchanged during migration.
1. Treat allowlist matches as `rules_based` factor approvals, not final bypass.
1. Ensure node approval request includes command digest and node identity.

## Error-prone implementation snippet

```ts
const requestHash = digest([nodeId, command.join("\u0000"), riskClass]);
if (!approval.approved) {
  return {
    output: "",
    error: { code: "UNAVAILABLE", message: "SYSTEM_RUN_DENIED: approval required" },
  };
}
```

## Acceptance criteria

- Remote node execution cannot bypass factor policy.
- Allowlist hits still audited as factor decisions.
- Node and gateway policies merge deterministically.

## Related workplan docs

- [`02-config-schema-for-multi-factor-approvals.md`](02-config-schema-for-multi-factor-approvals.md)
- [`05-rules-based-approver-design.md`](05-rules-based-approver-design.md)
- [`09-rollout-migration-and-compatibility.md`](09-rollout-migration-and-compatibility.md)

## External best-practice references

- [OWASP Authorization Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html)
- [NIST SP 800-53 Rev. 5 (AC-5, CM-3)](https://www.govinfo.gov/content/pkg/FR-2020-12-10/pdf/2020-27049.pdf)
- [Vault control groups](https://developer.hashicorp.com/vault/docs/enterprise/control-groups)
- [GitHub protected branches](https://docs.github.com/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/about-protected-branches)
- [GitLab merge request approvals](https://docs.gitlab.com/user/project/merge_requests/approvals/)
- [Google Access Approval](https://cloud.google.com/access-approval/docs/overview)
- [Microsoft Entra PIM approval settings](https://learn.microsoft.com/en-us/entra/id-governance/privileged-identity-management/pim-how-to-change-default-settings)

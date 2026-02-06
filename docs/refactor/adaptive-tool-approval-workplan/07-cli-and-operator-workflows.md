# 07 CLI and Operator Workflows

## Executive summary

OpenClaw adaptive tool approval adds context-aware gating so risky tool calls are approved only when it matters, instead of forcing manual approval for every potentially dangerous operation. The baseline architecture is defined in [Adaptive Tool Approval Architecture](../adaptive-tool-approval-architecture.md) and the end-to-end implementation target is defined in [Adaptive Tool Approval Implementation Blueprint](../adaptive-tool-approval-implementation.md). This document is self-contained and scoped to one execution track.
This track is focused on the specific component described below and includes concrete implementation edges, types, and sequencing.

## RPCs, hooks, callbacks, and connected components

- RPC `tool.approvals.get`: list pending requests and factor status.
- RPC `tool.approval.resolve`: CLI approver action endpoint.
- Existing CLI command root in `src/cli/exec-approvals-cli.ts:240`: integration point for generic tool approvals commands.
- Gateway/local selection helper in `src/cli/exec-approvals-cli.ts:74`: preserve targeting behavior.
- Node invoke workflow in `src/cli/nodes-cli/register.invoke.ts:246`: keep node-specific approval retrieval compatibility.

## Phase and parallelism

- Phase: 07 (parallel)
- Parallelism: Yes. Parallel with other phase 07 track.

## Goal and adaptive-tool context

- Goal: deliver adaptive tool approvals that combine policy checks, factorized approvals, and channel-safe user interactions.
- Adaptive-tool definition: dynamic approval gating for tool invocations based on risk and side-effect classification, with multi-factor quorum support.
- Factor defaults: `allowedApprovers=["user_request","rules_based"]`, `disabledApprovers=[]`, `minApprovals=1`.
- References: [architecture](../adaptive-tool-approval-architecture.md), [implementation](../adaptive-tool-approval-implementation.md).

## Code anchors (existing file and line references)

- `src/cli/exec-approvals-cli.ts:74`
- `src/cli/exec-approvals-cli.ts:202`
- `src/cli/exec-approvals-cli.ts:240`
- `src/cli/exec-approvals-cli.ts:333`
- `src/cli/nodes-cli/register.invoke.ts:246`
- `src/cli/nodes-cli/register.invoke.ts:258`
- `src/cli/nodes-cli/register.invoke.ts:331`

## Type names and interfaces

- `type ToolApprovalsCliRow = { id: string; tool: string; risk: string; approvals: string; pending: string; expires: string; }`
- `type ToolApprovalsResolveArgs = { id: string; decision: "approve"|"deny"; approverId?: ToolApproverId; }`
- `type ToolApprovalsTarget = { gateway: boolean; nodeId?: string; }`

## Implementation plan

1. Add `openclaw approvals tool get` and `openclaw approvals tool resolve` commands.
1. Include factor status columns and request hash for manual verification.
1. Keep `--gateway` and `--node` targeting semantics from current exec approvals CLI.
1. Return exit codes suitable for scripted operations (`0` success, non-zero deny/error).

## Error-prone implementation snippet

```ts
await callGatewayCli("tool.approval.resolve", opts, {
  id,
  decision,
  approverId: "user_request",
  requestHash,
});
```

## Acceptance criteria

- Operators can review and resolve approvals from terminal only.
- CLI output is script-friendly and includes stable identifiers.
- Node-targeted approvals behave consistently with gateway-targeted approvals.

## Related workplan docs

- [`05-user-request-approver-ui-cli-channels.md`](05-user-request-approver-ui-cli-channels.md)
- [`04-node-system-run-integration.md`](04-node-system-run-integration.md)
- [`10-operations-runbook-and-slo.md`](10-operations-runbook-and-slo.md)

## External best-practice references

- [OWASP Authorization Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html)
- [NIST SP 800-53 Rev. 5 (AC-5, CM-3)](https://www.govinfo.gov/content/pkg/FR-2020-12-10/pdf/2020-27049.pdf)
- [Vault control groups](https://developer.hashicorp.com/vault/docs/enterprise/control-groups)
- [GitHub protected branches](https://docs.github.com/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/about-protected-branches)
- [GitLab merge request approvals](https://docs.gitlab.com/user/project/merge_requests/approvals/)
- [Google Access Approval](https://cloud.google.com/access-approval/docs/overview)
- [Microsoft Entra PIM approval settings](https://learn.microsoft.com/en-us/entra/id-governance/privileged-identity-management/pim-how-to-change-default-settings)

# 06 Security Controls and Abuse Resistance

## Executive summary

OpenClaw adaptive tool approval adds context-aware gating so risky tool calls are approved only when it matters, instead of forcing manual approval for every potentially dangerous operation. The baseline architecture is defined in [Adaptive Tool Approval Architecture](../adaptive-tool-approval-architecture.md) and the end-to-end implementation target is defined in [Adaptive Tool Approval Implementation Blueprint](../adaptive-tool-approval-implementation.md). This document is self-contained and scoped to one execution track.
This track is focused on the specific component described below and includes concrete implementation edges, types, and sequencing.

## RPCs, hooks, callbacks, and connected components

- RPC `tool.approval.resolve`: enforce actor authorization and anti-replay checks.
- Scope gate `operator.approvals` in `src/gateway/server-methods.ts:157`: hard boundary for resolver clients.
- Broadcast scope checks in `src/gateway/server-broadcast.ts:27`: prevent metadata leakage.
- Forwarder command parser pattern in `src/infra/exec-approval-forwarder.ts:138`: sanitize action parsing across channels.
- Node policy callback in `src/node-host/runner.ts:1073`: preserve fail-closed behavior for remote exec.

## Phase and parallelism

- Phase: 06 (parallel)
- Parallelism: Yes. Parallel with other phase 06 tracks.

## Goal and adaptive-tool context

- Goal: deliver adaptive tool approvals that combine policy checks, factorized approvals, and channel-safe user interactions.
- Adaptive-tool definition: dynamic approval gating for tool invocations based on risk and side-effect classification, with multi-factor quorum support.
- Factor defaults: `allowedApprovers=["user_request","rules_based"]`, `disabledApprovers=[]`, `minApprovals=1`.
- References: [architecture](../adaptive-tool-approval-architecture.md), [implementation](../adaptive-tool-approval-implementation.md).

## Code anchors (existing file and line references)

- `src/gateway/server-methods.ts:157`
- `src/gateway/server-broadcast.ts:27`
- `src/infra/exec-approval-forwarder.ts:138`
- `src/infra/exec-approval-forwarder.ts:329`
- `src/node-host/runner.ts:1073`
- `docs/refactor/adaptive-tool-approval-architecture.md:276`
- `docs/refactor/adaptive-tool-approval-implementation.md:417`

## Type names and interfaces

- `type ApprovalReplayGuard = { requestId: string; requestHash: string; nonce: string; expiresAtMs: number; }`
- `type ApprovalActor = { id: string; channel: string; scopes: string[]; }`
- `type SensitiveOperationPolicy = { requireHumanAtRiskClass?: ToolApprovalRiskClass; denyIfClassifierOnly?: boolean; }`

## Implementation plan

1. Require request hash equality when resolving approvals.
1. Reject stale or duplicate factor submissions.
1. Enforce no self-approval policy for user factors.
1. Default to deny when classifier, parser, or policy state is ambiguous.

## Error-prone implementation snippet

```ts
if (resolvedBy == request.requestedBy) {
  return errorShape(ErrorCodes.INVALID_REQUEST, "self-approval is not permitted");
}
if (nowMs > request.expiresAtMs) {
  return errorShape(ErrorCodes.INVALID_REQUEST, "approval expired");
}
```

## Acceptance criteria

- Replay and stale-resolution attempts are rejected and logged.
- Self-approval is blocked by default.
- High-risk operations cannot pass with only LLM factor unless explicitly configured.

## Related workplan docs

- [`05-llm-evaluation-approver-design.md`](05-llm-evaluation-approver-design.md)
- [`08-testing-strategy-and-quality-gates.md`](08-testing-strategy-and-quality-gates.md)
- [`10-operations-runbook-and-slo.md`](10-operations-runbook-and-slo.md)

## External best-practice references

- [OWASP Authorization Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html)
- [NIST SP 800-53 Rev. 5 (AC-5, CM-3)](https://www.govinfo.gov/content/pkg/FR-2020-12-10/pdf/2020-27049.pdf)
- [Vault control groups](https://developer.hashicorp.com/vault/docs/enterprise/control-groups)
- [GitHub protected branches](https://docs.github.com/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/about-protected-branches)
- [GitLab merge request approvals](https://docs.gitlab.com/user/project/merge_requests/approvals/)
- [Google Access Approval](https://cloud.google.com/access-approval/docs/overview)
- [Microsoft Entra PIM approval settings](https://learn.microsoft.com/en-us/entra/id-governance/privileged-identity-management/pim-how-to-change-default-settings)

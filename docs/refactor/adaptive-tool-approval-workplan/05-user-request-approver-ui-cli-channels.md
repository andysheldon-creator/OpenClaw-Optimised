# 05 UserRequestApprover across UI CLI and Channels

## Executive summary

OpenClaw adaptive tool approval adds context-aware gating so risky tool calls are approved only when it matters, instead of forcing manual approval for every potentially dangerous operation. The baseline architecture is defined in [Adaptive Tool Approval Architecture](../adaptive-tool-approval-architecture.md) and the end-to-end implementation target is defined in [Adaptive Tool Approval Implementation Blueprint](../adaptive-tool-approval-implementation.md). This document is self-contained and scoped to one execution track.
This track is focused on the specific component described below and includes concrete implementation edges, types, and sequencing.

## RPCs, hooks, callbacks, and connected components

- RPC `tool.approval.request`: creates user-facing approval prompt.
- RPC `tool.approval.resolve`: user response path from UI/CLI/chat.
- Forwarder `createExecApprovalForwarder` in `src/infra/exec-approval-forwarder.ts:224`: baseline transport fanout.
- Prompt template in `src/infra/exec-approval-forwarder.ts:118`: message formatting pattern to generalize.
- Discord resolver path in `src/discord/monitor/exec-approvals.ts:498`: existing user interaction callback.

## Phase and parallelism

- Phase: 05 (parallel)
- Parallelism: Yes. Parallel with other `05-*` tracks after phases 03-04.

## Goal and adaptive-tool context

- Goal: deliver adaptive tool approvals that combine policy checks, factorized approvals, and channel-safe user interactions.
- Adaptive-tool definition: dynamic approval gating for tool invocations based on risk and side-effect classification, with multi-factor quorum support.
- Factor defaults: `allowedApprovers=["user_request","rules_based"]`, `disabledApprovers=[]`, `minApprovals=1`.
- References: [architecture](../adaptive-tool-approval-architecture.md), [implementation](../adaptive-tool-approval-implementation.md).

## Code anchors (existing file and line references)

- `src/infra/exec-approval-forwarder.ts:118`
- `src/infra/exec-approval-forwarder.ts:138`
- `src/infra/exec-approval-forwarder.ts:224`
- `src/discord/monitor/exec-approvals.ts:324`
- `src/discord/monitor/exec-approvals.ts:498`
- `apps/web/src/hooks/useAgentApprovalActions.ts:15`
- `apps/web/src/components/composed/ApprovalAttentionNudge.tsx:143`

## Type names and interfaces

- `type UserRequestApproverDecision = "approve" | "deny" | "timeout"`
- `type UserApprovalTransport = "control_ui" | "cli" | "discord" | "slack" | "telegram" | "plugin"`
- `type UserApprovalPrompt = { id: string; summary: string; riskClass: ToolApprovalRiskClass; expiresAtMs: number; }`

## Implementation plan

1. Create generic `ToolApprovalForwarder` and keep existing delivery modes (`session`, `targets`, `both`).
1. Render consistent action choices across surfaces (`approve`, `deny`, optional `approve-once`).
1. Attach approver identity metadata for every resolution.
1. Prevent self-approval if requestor and approver identity match.

## Error-prone implementation snippet

```ts
const decision: ToolApproverResult = {
  approverId: "user_request",
  verdict: userChoice == "approve" ? "approve" : "reject",
  reasonCodes: ["user-decision"],
  decidedAtMs: Date.now(),
};
```

## Acceptance criteria

- User can approve/deny from at least control UI and one chat channel.
- Resolution includes approver identity and transport metadata.
- Timeout behavior is visible to operators and audit logs.

## Related workplan docs

- [`03-event-scoping-and-broadcast-rules.md`](03-event-scoping-and-broadcast-rules.md)
- [`07-web-ui-approval-experience.md`](07-web-ui-approval-experience.md)
- [`07-cli-and-operator-workflows.md`](07-cli-and-operator-workflows.md)

## External best-practice references

- [OWASP Authorization Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html)
- [NIST SP 800-53 Rev. 5 (AC-5, CM-3)](https://www.govinfo.gov/content/pkg/FR-2020-12-10/pdf/2020-27049.pdf)
- [Vault control groups](https://developer.hashicorp.com/vault/docs/enterprise/control-groups)
- [GitHub protected branches](https://docs.github.com/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/about-protected-branches)
- [GitLab merge request approvals](https://docs.gitlab.com/user/project/merge_requests/approvals/)
- [Google Access Approval](https://cloud.google.com/access-approval/docs/overview)
- [Microsoft Entra PIM approval settings](https://learn.microsoft.com/en-us/entra/id-governance/privileged-identity-management/pim-how-to-change-default-settings)

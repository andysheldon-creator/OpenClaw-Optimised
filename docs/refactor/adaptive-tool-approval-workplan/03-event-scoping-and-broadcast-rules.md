# 03 Event Scoping and Broadcast Rules

## Executive summary

OpenClaw adaptive tool approval adds context-aware gating so risky tool calls are approved only when it matters, instead of forcing manual approval for every potentially dangerous operation. The baseline architecture is defined in [Adaptive Tool Approval Architecture](../adaptive-tool-approval-architecture.md) and the end-to-end implementation target is defined in [Adaptive Tool Approval Implementation Blueprint](../adaptive-tool-approval-implementation.md). This document is self-contained and scoped to one execution track.
This track is focused on the specific component described below and includes concrete implementation edges, types, and sequencing.

## RPCs, hooks, callbacks, and connected components

- Event `tool.approval.requested`: broadcast only to clients with `operator.approvals`.
- Event `tool.approval.resolved`: includes factor and aggregate outcomes for authorized clients.
- Scope gate in `src/gateway/server-methods.ts:157`: method-level scope enforcement.
- Broadcast filter in `src/gateway/server-broadcast.ts:27`: event-level scope enforcement.
- Discord monitor connection scope in `src/discord/monitor/exec-approvals.ts:274`: channel approver client baseline.

## Phase and parallelism

- Phase: 03 (parallel)
- Parallelism: Yes. Parallel with other `03-*` tracks.

## Goal and adaptive-tool context

- Goal: deliver adaptive tool approvals that combine policy checks, factorized approvals, and channel-safe user interactions.
- Adaptive-tool definition: dynamic approval gating for tool invocations based on risk and side-effect classification, with multi-factor quorum support.
- Factor defaults: `allowedApprovers=["user_request","rules_based"]`, `disabledApprovers=[]`, `minApprovals=1`.
- References: [architecture](../adaptive-tool-approval-architecture.md), [implementation](../adaptive-tool-approval-implementation.md).

## Code anchors (existing file and line references)

- `src/gateway/server-methods.ts:40`
- `src/gateway/server-methods.ts:157`
- `src/gateway/server-broadcast.ts:6`
- `src/gateway/server-broadcast.ts:10`
- `src/gateway/server-broadcast.ts:27`
- `src/discord/monitor/exec-approvals.ts:274`
- `apps/web/src/hooks/useGatewayEventSync.ts:68`

## Type names and interfaces

- `type ToolApprovalEventScope = "operator.approvals"`
- `type ToolApprovalResolvedEvent = { id: string; factorResults: ToolApproverResult[]; aggregateStatus: string; }`
- `type ToolApprovalRequestedEvent = { id: string; pendingApprovers: ToolApproverId[]; minApprovals: number; }`

## Implementation plan

1. Register new events with identical scope controls used by exec approvals.
1. Ensure no approval metadata leaks to clients missing approval scope.
1. Add event payload redaction for sensitive request details.
1. Document event ordering guarantees (`requested` before any `resolved`).

## Error-prone implementation snippet

```ts
const APPROVAL_EVENTS = {
  "tool.approval.requested": ["operator.approvals"],
  "tool.approval.resolved": ["operator.approvals"],
};
```

## Acceptance criteria

- Unauthorized clients cannot subscribe to tool approval events.
- Authorized operator clients receive deterministic event stream.
- Payloads include factor-level detail only when requested and allowed.

## Related workplan docs

- [`03-tool-approval-rpc-and-protocol.md`](03-tool-approval-rpc-and-protocol.md)
- [`05-user-request-approver-ui-cli-channels.md`](05-user-request-approver-ui-cli-channels.md)
- [`07-web-ui-approval-experience.md`](07-web-ui-approval-experience.md)

## External best-practice references

- [OWASP Authorization Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html)
- [NIST SP 800-53 Rev. 5 (AC-5, CM-3)](https://www.govinfo.gov/content/pkg/FR-2020-12-10/pdf/2020-27049.pdf)
- [Vault control groups](https://developer.hashicorp.com/vault/docs/enterprise/control-groups)
- [GitHub protected branches](https://docs.github.com/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/about-protected-branches)
- [GitLab merge request approvals](https://docs.gitlab.com/user/project/merge_requests/approvals/)
- [Google Access Approval](https://cloud.google.com/access-approval/docs/overview)
- [Microsoft Entra PIM approval settings](https://learn.microsoft.com/en-us/entra/id-governance/privileged-identity-management/pim-how-to-change-default-settings)

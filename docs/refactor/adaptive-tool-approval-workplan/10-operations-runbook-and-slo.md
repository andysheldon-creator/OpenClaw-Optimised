# 10 Operations Runbook and SLO

## Executive summary

OpenClaw adaptive tool approval adds context-aware gating so risky tool calls are approved only when it matters, instead of forcing manual approval for every potentially dangerous operation. The baseline architecture is defined in [Adaptive Tool Approval Architecture](../adaptive-tool-approval-architecture.md) and the end-to-end implementation target is defined in [Adaptive Tool Approval Implementation Blueprint](../adaptive-tool-approval-implementation.md). This document is self-contained and scoped to one execution track.
This track is focused on the specific component described below and includes concrete implementation edges, types, and sequencing.

## RPCs, hooks, callbacks, and connected components

- RPC `tool.approvals.get` and `tool.approvals.policy.get`: operator diagnostics for pending load and factor policy drift.
- Event stream `tool.approval.requested`/`resolved`: operational heartbeat.
- Gateway scope enforcement in `src/gateway/server-methods.ts:157`: runbook prerequisite for operator tokens.
- Web attention nudge in `apps/web/src/components/composed/ApprovalAttentionNudge.tsx:169`: UX signal for pending backlog.
- CLI approvals commands rooted at `src/cli/exec-approvals-cli.ts:240`: emergency terminal path.

## Phase and parallelism

- Phase: 10 (blocking)
- Parallelism: No. Final operationalization stage after rollout plan is approved.

## Goal and adaptive-tool context

- Goal: deliver adaptive tool approvals that combine policy checks, factorized approvals, and channel-safe user interactions.
- Adaptive-tool definition: dynamic approval gating for tool invocations based on risk and side-effect classification, with multi-factor quorum support.
- Factor defaults: `allowedApprovers=["user_request","rules_based"]`, `disabledApprovers=[]`, `minApprovals=1`.
- References: [architecture](../adaptive-tool-approval-architecture.md), [implementation](../adaptive-tool-approval-implementation.md).

## Code anchors (existing file and line references)

- `src/gateway/server-methods.ts:157`
- `src/gateway/server-broadcast.ts:10`
- `apps/web/src/components/composed/ApprovalAttentionNudge.tsx:169`
- `apps/web/src/components/composed/AgentSessionsIndicator.tsx:177`
- `src/cli/exec-approvals-cli.ts:240`
- `docs/refactor/adaptive-tool-approval-implementation.md:390`
- `docs/refactor/adaptive-tool-approval-implementation.md:402`

## Type names and interfaces

- `type ApprovalSLO = { queueLatencyP95Ms: number; timeoutRatePct: number; quorumMissRatePct: number; }`
- `type ApprovalIncidentClass = "backlog" | "delivery-failure" | "policy-misconfig" | "security-violation"`
- `type OperatorRunbookStep = { name: string; command?: string; uiPath?: string; expectedSignal: string; }`

## Implementation plan

1. Define SLO targets for approval latency and timeout rate.
1. Create incident runbooks for queue spikes, delivery failures, and bad policy deploys.
1. Define on-call dashboards and page thresholds from factor-aware metrics.
1. Document emergency fallback modes (temporary minApprovals reduction with audit).

## Error-prone implementation snippet

```ts
if (metrics.quorumMissRatePct > 5 || metrics.timeoutRatePct > 2) {
  page("tool-approval-oncall", "Approval system degraded");
}
```

## Acceptance criteria

- On-call can diagnose and mitigate major approval failures in <15 minutes.
- SLO dashboards include factor-level and aggregate health views.
- Operational playbooks include explicit rollback and postmortem checkpoints.

## Related workplan docs

- [`06-observability-and-audit-model.md`](06-observability-and-audit-model.md)
- [`07-web-ui-approval-experience.md`](07-web-ui-approval-experience.md)
- [`09-rollout-migration-and-compatibility.md`](09-rollout-migration-and-compatibility.md)

## External best-practice references

- [OWASP Authorization Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html)
- [NIST SP 800-53 Rev. 5 (AC-5, CM-3)](https://www.govinfo.gov/content/pkg/FR-2020-12-10/pdf/2020-27049.pdf)
- [Vault control groups](https://developer.hashicorp.com/vault/docs/enterprise/control-groups)
- [GitHub protected branches](https://docs.github.com/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/about-protected-branches)
- [GitLab merge request approvals](https://docs.gitlab.com/user/project/merge_requests/approvals/)
- [Google Access Approval](https://cloud.google.com/access-approval/docs/overview)
- [Microsoft Entra PIM approval settings](https://learn.microsoft.com/en-us/entra/id-governance/privileged-identity-management/pim-how-to-change-default-settings)

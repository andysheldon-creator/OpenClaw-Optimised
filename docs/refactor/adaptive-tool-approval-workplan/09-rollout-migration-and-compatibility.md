# 09 Rollout Migration and Compatibility

## Executive summary

OpenClaw adaptive tool approval adds context-aware gating so risky tool calls are approved only when it matters, instead of forcing manual approval for every potentially dangerous operation. The baseline architecture is defined in [Adaptive Tool Approval Architecture](../adaptive-tool-approval-architecture.md) and the end-to-end implementation target is defined in [Adaptive Tool Approval Implementation Blueprint](../adaptive-tool-approval-implementation.md). This document is self-contained and scoped to one execution track.
This track is focused on the specific component described below and includes concrete implementation edges, types, and sequencing.

## RPCs, hooks, callbacks, and connected components

- Legacy RPCs `exec.approval.request`/`resolve`: maintained during compatibility window.
- New RPCs `tool.approval.request`/`resolve`: become canonical once dual-run parity is stable.
- Config migration paths through `src/config/types.approvals.ts:27` and `src/config/zod-schema.approvals.ts:23`.
- CLI migration path from `src/cli/exec-approvals-cli.ts:240` to generic approval commands.
- Node compatibility path in `src/node-host/runner.ts:952` and `src/cli/nodes-cli/register.invoke.ts:330`.

## Phase and parallelism

- Phase: 09 (blocking)
- Parallelism: No. Starts after testing strategy is in place and minimum tests pass.

## Goal and adaptive-tool context

- Goal: deliver adaptive tool approvals that combine policy checks, factorized approvals, and channel-safe user interactions.
- Adaptive-tool definition: dynamic approval gating for tool invocations based on risk and side-effect classification, with multi-factor quorum support.
- Factor defaults: `allowedApprovers=["user_request","rules_based"]`, `disabledApprovers=[]`, `minApprovals=1`.
- References: [architecture](../adaptive-tool-approval-architecture.md), [implementation](../adaptive-tool-approval-implementation.md).

## Code anchors (existing file and line references)

- `src/gateway/server-methods/exec-approval.ts:18`
- `src/gateway/server-methods/exec-approval.ts:98`
- `src/config/types.approvals.ts:27`
- `src/config/zod-schema.approvals.ts:23`
- `src/cli/exec-approvals-cli.ts:240`
- `src/node-host/runner.ts:952`
- `docs/refactor/adaptive-tool-approval-implementation.md:428`

## Type names and interfaces

- `type MigrationPhase = "legacy" | "dual" | "tool-default" | "legacy-removed"`
- `type MigrationGate = { phase: MigrationPhase; requiredTests: string[]; requiresOperatorAck: boolean; }`
- `type CompatibilityAliasMap = Record<string, string>`

## Implementation plan

1. Release N: ship behind feature flag; keep exec flow default.
1. Release N+1: enable dual-run comparison for selected agents.
1. Release N+2: switch default to generic tool approval APIs.
1. Release N+3: remove legacy internals after stability window and changelog notice.

## Error-prone implementation snippet

```ts
if (flags.toolApprovalV2) {
  return handleToolApprovalRequest(params);
}
return handleExecApprovalRequest(params); // compatibility alias
```

## Acceptance criteria

- No breaking changes for existing exec approval clients during dual-run period.
- Migration phases are gated by explicit test and telemetry criteria.
- Rollback path exists at each rollout stage.

## Related workplan docs

- [`08-testing-strategy-and-quality-gates.md`](08-testing-strategy-and-quality-gates.md)
- [`10-operations-runbook-and-slo.md`](10-operations-runbook-and-slo.md)
- [`01-system-charter-and-factor-policy.md`](01-system-charter-and-factor-policy.md)

## External best-practice references

- [OWASP Authorization Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html)
- [NIST SP 800-53 Rev. 5 (AC-5, CM-3)](https://www.govinfo.gov/content/pkg/FR-2020-12-10/pdf/2020-27049.pdf)
- [Vault control groups](https://developer.hashicorp.com/vault/docs/enterprise/control-groups)
- [GitHub protected branches](https://docs.github.com/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/about-protected-branches)
- [GitLab merge request approvals](https://docs.gitlab.com/user/project/merge_requests/approvals/)
- [Google Access Approval](https://cloud.google.com/access-approval/docs/overview)
- [Microsoft Entra PIM approval settings](https://learn.microsoft.com/en-us/entra/id-governance/privileged-identity-management/pim-how-to-change-default-settings)

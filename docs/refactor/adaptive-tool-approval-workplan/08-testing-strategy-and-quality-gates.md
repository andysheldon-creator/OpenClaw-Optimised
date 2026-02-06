# 08 Testing Strategy and Quality Gates

## Executive summary

OpenClaw adaptive tool approval adds context-aware gating so risky tool calls are approved only when it matters, instead of forcing manual approval for every potentially dangerous operation. The baseline architecture is defined in [Adaptive Tool Approval Architecture](../adaptive-tool-approval-architecture.md) and the end-to-end implementation target is defined in [Adaptive Tool Approval Implementation Blueprint](../adaptive-tool-approval-implementation.md). This document is self-contained and scoped to one execution track.
This track is focused on the specific component described below and includes concrete implementation edges, types, and sequencing.

## RPCs, hooks, callbacks, and connected components

- RPC `tool.approval.request`/`resolve`: integration and e2e test backbone.
- Legacy RPC `exec.approval.request`/`resolve`: parity suite during migration.
- Event hooks in `src/gateway/server-broadcast.ts:10`: event authorization tests.
- Runtime hook `runBeforeToolCallHook` in `src/agents/pi-tools.before-tool-call.ts:19`: orchestration unit/integration tests.
- Discord monitor handler `src/discord/monitor/exec-approvals.test.ts`: chat-channel regression baseline.

## Phase and parallelism

- Phase: 08 (blocking)
- Parallelism: No. Starts after phases 02-07 land enough surface to test end-to-end.

## Goal and adaptive-tool context

- Goal: deliver adaptive tool approvals that combine policy checks, factorized approvals, and channel-safe user interactions.
- Adaptive-tool definition: dynamic approval gating for tool invocations based on risk and side-effect classification, with multi-factor quorum support.
- Factor defaults: `allowedApprovers=["user_request","rules_based"]`, `disabledApprovers=[]`, `minApprovals=1`.
- References: [architecture](../adaptive-tool-approval-architecture.md), [implementation](../adaptive-tool-approval-implementation.md).

## Code anchors (existing file and line references)

- `src/discord/monitor/exec-approvals.test.ts:1`
- `src/agents/pi-tools.before-tool-call.ts:19`
- `src/gateway/server-methods/exec-approval.ts:13`
- `src/gateway/server-broadcast.ts:10`
- `docs/refactor/adaptive-tool-approval-implementation.md:361`
- `docs/refactor/adaptive-tool-approval-implementation.md:372`
- `docs/refactor/adaptive-tool-approval-implementation.md:379`

## Type names and interfaces

- `type ApprovalTestMatrixCase = { riskClass: ToolApprovalRiskClass; activeApprovers: ToolApproverId[]; minApprovals: number; expected: string; }`
- `type FaultInjection = "gateway-timeout" | "classifier-timeout" | "stale-hash" | "duplicate-factor"`
- `type ParityResult = { legacyExec: string; newToolApproval: string; matches: boolean; }`

## Implementation plan

1. Build unit matrix for aggregation and factor-policy edges.
1. Add integration tests for stale hash, duplicate factors, and quorum misses.
1. Add e2e tests for UI and channel approval flows.
1. Run parity tests comparing legacy exec path vs new orchestrator path.

## Error-prone implementation snippet

```ts
it("rejects stale resolution hashes", async () => {
  const req = await requestApproval();
  await expect(resolveApproval({ id: req.id, requestHash: "wrong" })).rejects.toThrow(
    "stale approval",
  );
});
```

## Acceptance criteria

- All critical factor-policy edge cases are covered.
- Legacy exec behavior parity is documented and enforced.
- No unsafe pass is possible under timeout/error conditions.

## Related workplan docs

- [`09-rollout-migration-and-compatibility.md`](09-rollout-migration-and-compatibility.md)
- [`10-operations-runbook-and-slo.md`](10-operations-runbook-and-slo.md)
- [`06-security-controls-and-abuse-resistance.md`](06-security-controls-and-abuse-resistance.md)

## External best-practice references

- [OWASP Authorization Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html)
- [NIST SP 800-53 Rev. 5 (AC-5, CM-3)](https://www.govinfo.gov/content/pkg/FR-2020-12-10/pdf/2020-27049.pdf)
- [Vault control groups](https://developer.hashicorp.com/vault/docs/enterprise/control-groups)
- [GitHub protected branches](https://docs.github.com/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/about-protected-branches)
- [GitLab merge request approvals](https://docs.gitlab.com/user/project/merge_requests/approvals/)
- [Google Access Approval](https://cloud.google.com/access-approval/docs/overview)
- [Microsoft Entra PIM approval settings](https://learn.microsoft.com/en-us/entra/id-governance/privileged-identity-management/pim-how-to-change-default-settings)

# 05 RulesBasedApprover Design

## Executive summary

OpenClaw adaptive tool approval adds context-aware gating so risky tool calls are approved only when it matters, instead of forcing manual approval for every potentially dangerous operation. The baseline architecture is defined in [Adaptive Tool Approval Architecture](../adaptive-tool-approval-architecture.md) and the end-to-end implementation target is defined in [Adaptive Tool Approval Implementation Blueprint](../adaptive-tool-approval-implementation.md). This document is self-contained and scoped to one execution track.
This track is focused on the specific component described below and includes concrete implementation edges, types, and sequencing.

## RPCs, hooks, callbacks, and connected components

- No direct user RPC required for positive path; this factor runs inline inside orchestrator.
- Fallback RPC `tool.approval.request` is called only when rules-based factor alone cannot satisfy quorum.
- Callback `requiresExecApproval` in `src/infra/exec-approvals.ts:1403`: core logic source to reuse.
- Callback `addAllowlistEntry` in `src/infra/exec-approvals.ts:1425`: preserve `allow-always` semantics.
- Node command policy in `src/gateway/node-command-policy.ts:120`: remote command allowlist baseline.

## Phase and parallelism

- Phase: 05 (parallel)
- Parallelism: Yes. Parallel with other `05-*` tracks.

## Goal and adaptive-tool context

- Goal: deliver adaptive tool approvals that combine policy checks, factorized approvals, and channel-safe user interactions.
- Adaptive-tool definition: dynamic approval gating for tool invocations based on risk and side-effect classification, with multi-factor quorum support.
- Factor defaults: `allowedApprovers=["user_request","rules_based"]`, `disabledApprovers=[]`, `minApprovals=1`.
- References: [architecture](../adaptive-tool-approval-architecture.md), [implementation](../adaptive-tool-approval-implementation.md).

## Code anchors (existing file and line references)

- `src/infra/exec-approvals.ts:1403`
- `src/infra/exec-approvals.ts:1425`
- `src/infra/exec-approvals.ts:1450`
- `src/agents/bash-tools.exec.ts:1168`
- `src/agents/bash-tools.exec.ts:1179`
- `src/node-host/runner.ts:1093`
- `src/gateway/node-command-policy.ts:126`

## Type names and interfaces

- `type RulesBasedSignal = { allowlistSatisfied: boolean; policyMatch: boolean; senderTrusted: boolean; }`
- `type RulesBasedApproverConfig = { requireAllowlistForExec: boolean; trustedSenders?: string[]; }`
- `type RulesVerdictReason = "allowlist-match" | "allowlist-miss" | "policy-deny" | "trusted-sender"`

## Implementation plan

1. Wrap existing exec policy/allowlist logic into a generic factor evaluator.
1. Return `approve` for hard allowlist hits only when policy criteria are satisfied.
1. Return `reject` for explicit deny rules; `abstain` for ambiguous cases.
1. Expose deterministic reason codes for all outcomes.

## Error-prone implementation snippet

```ts
if (security == "allowlist" && !allowlistSatisfied) {
  return {
    approverId: "rules_based",
    verdict: "abstain",
    reasonCodes: ["allowlist-miss"],
    decidedAtMs: Date.now(),
  };
}
return {
  approverId: "rules_based",
  verdict: "approve",
  reasonCodes: ["allowlist-match"],
  decidedAtMs: Date.now(),
};
```

## Acceptance criteria

- Rules factor parity with existing exec behavior is verified in tests.
- Factor can independently approve low-risk calls without user prompt when policy allows.
- Ambiguous calls escalate cleanly to human factor.

## Related workplan docs

- [`04-tool-orchestrator-execution-path.md`](04-tool-orchestrator-execution-path.md)
- [`04-node-system-run-integration.md`](04-node-system-run-integration.md)
- [`08-testing-strategy-and-quality-gates.md`](08-testing-strategy-and-quality-gates.md)

## External best-practice references

- [OWASP Authorization Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html)
- [NIST SP 800-53 Rev. 5 (AC-5, CM-3)](https://www.govinfo.gov/content/pkg/FR-2020-12-10/pdf/2020-27049.pdf)
- [Vault control groups](https://developer.hashicorp.com/vault/docs/enterprise/control-groups)
- [GitHub protected branches](https://docs.github.com/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/about-protected-branches)
- [GitLab merge request approvals](https://docs.gitlab.com/user/project/merge_requests/approvals/)
- [Google Access Approval](https://cloud.google.com/access-approval/docs/overview)
- [Microsoft Entra PIM approval settings](https://learn.microsoft.com/en-us/entra/id-governance/privileged-identity-management/pim-how-to-change-default-settings)

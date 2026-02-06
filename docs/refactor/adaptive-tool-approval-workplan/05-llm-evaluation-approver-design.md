# 05 LLMEvaluationApprover Design

## Executive summary

OpenClaw adaptive tool approval adds context-aware gating so risky tool calls are approved only when it matters, instead of forcing manual approval for every potentially dangerous operation. The baseline architecture is defined in [Adaptive Tool Approval Architecture](../adaptive-tool-approval-architecture.md) and the end-to-end implementation target is defined in [Adaptive Tool Approval Implementation Blueprint](../adaptive-tool-approval-implementation.md). This document is self-contained and scoped to one execution track.
This track is focused on the specific component described below and includes concrete implementation edges, types, and sequencing.

## RPCs, hooks, callbacks, and connected components

- No direct public RPC; this factor runs inline and returns a structured factor result.
- Fallback RPC `tool.approval.request` triggered when confidence is low or verdict abstains.
- Classifier config path in `docs/refactor/adaptive-tool-approval-implementation.md:186`: target shape for provider/model settings.
- Before-tool callback chain in `src/agents/pi-tools.before-tool-call.ts:79`: invocation seam for classifier factor.
- Observability callbacks defined in implementation doc `tool_safety_classifier_latency_ms` metrics block.

## Phase and parallelism

- Phase: 05 (parallel)
- Parallelism: Yes. Parallel with other `05-*` tracks.

## Goal and adaptive-tool context

- Goal: deliver adaptive tool approvals that combine policy checks, factorized approvals, and channel-safe user interactions.
- Adaptive-tool definition: dynamic approval gating for tool invocations based on risk and side-effect classification, with multi-factor quorum support.
- Factor defaults: `allowedApprovers=["user_request","rules_based"]`, `disabledApprovers=[]`, `minApprovals=1`.
- References: [architecture](../adaptive-tool-approval-architecture.md), [implementation](../adaptive-tool-approval-implementation.md).

## Code anchors (existing file and line references)

- `docs/refactor/adaptive-tool-approval-implementation.md:186`
- `docs/refactor/adaptive-tool-approval-implementation.md:193`
- `docs/refactor/adaptive-tool-approval-implementation.md:397`
- `src/agents/pi-tools.before-tool-call.ts:79`
- `src/agents/pi-tools.ts:447`
- `docs/refactor/adaptive-tool-approval-architecture.md:109`
- `docs/refactor/adaptive-tool-approval-architecture.md:267`

## Type names and interfaces

- `type LLMEvaluationApproverConfig = { enabled: boolean; provider: string; model: string; timeoutMs: number; minConfidence: number; }`
- `type LLMRiskOutput = { riskClass: ToolApprovalRiskClass; confidence: number; reasonCodes: string[]; }`
- `type LLMFallbackPolicy = "require_approval" | "deny" | "allow"`

## Implementation plan

1. Limit classifier payload to normalized invocation context and redacted summaries only.
1. Validate model output against strict schema before using it.
1. Map low-confidence and timeout paths to abstain or escalation per policy.
1. Never allow this factor to be the sole approver for `R3+` by default.

## Error-prone implementation snippet

```ts
if (!output || output.confidence < cfg.minConfidence) {
  return {
    approverId: "llm_evaluation",
    verdict: "abstain",
    reasonCodes: ["low-confidence"],
    decidedAtMs: Date.now(),
  };
}
```

## Acceptance criteria

- Classifier failures do not bypass approval policy.
- Latency stays within configured timeout budget.
- No chain-of-thought or sensitive raw payload is sent to model provider.

## Related workplan docs

- [`06-security-controls-and-abuse-resistance.md`](06-security-controls-and-abuse-resistance.md)
- [`06-observability-and-audit-model.md`](06-observability-and-audit-model.md)
- [`08-testing-strategy-and-quality-gates.md`](08-testing-strategy-and-quality-gates.md)

## External best-practice references

- [OWASP Authorization Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html)
- [NIST SP 800-53 Rev. 5 (AC-5, CM-3)](https://www.govinfo.gov/content/pkg/FR-2020-12-10/pdf/2020-27049.pdf)
- [Vault control groups](https://developer.hashicorp.com/vault/docs/enterprise/control-groups)
- [GitHub protected branches](https://docs.github.com/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/about-protected-branches)
- [GitLab merge request approvals](https://docs.gitlab.com/user/project/merge_requests/approvals/)
- [Google Access Approval](https://cloud.google.com/access-approval/docs/overview)
- [Microsoft Entra PIM approval settings](https://learn.microsoft.com/en-us/entra/id-governance/privileged-identity-management/pim-how-to-change-default-settings)

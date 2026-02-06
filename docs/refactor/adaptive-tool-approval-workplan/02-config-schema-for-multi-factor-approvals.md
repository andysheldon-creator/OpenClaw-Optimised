# 02 Config Schema for Multi-factor Approvals

## Executive summary

OpenClaw adaptive tool approval adds context-aware gating so risky tool calls are approved only when it matters, instead of forcing manual approval for every potentially dangerous operation. The baseline architecture is defined in [Adaptive Tool Approval Architecture](../adaptive-tool-approval-architecture.md) and the end-to-end implementation target is defined in [Adaptive Tool Approval Implementation Blueprint](../adaptive-tool-approval-implementation.md). This document is self-contained and scoped to one execution track.
This track is focused on the specific component described below and includes concrete implementation edges, types, and sequencing.

## RPCs, hooks, callbacks, and connected components

- RPC `config.get`/`config.schema` consumers rely on accurate schema for approvals UI and tooling.
- RPC `exec.approvals.get` and `exec.approvals.set` in `src/gateway/server-methods/exec-approvals.ts:85`/`:110`: migration compatibility references.
- CLI callback path in `src/cli/exec-approvals-cli.ts:240`: existing UX to evolve into generic tool approval settings.
- Node override path in `src/cli/nodes-cli/register.invoke.ts:246`: ensures node path respects factor policy.
- Validation bridge in `src/config/zod-schema.ts:363`: central schema wiring.

## Phase and parallelism

- Phase: 02 (parallel)
- Parallelism: Yes. Can run in parallel with other `02-*` docs after phase 01.

## Goal and adaptive-tool context

- Goal: deliver adaptive tool approvals that combine policy checks, factorized approvals, and channel-safe user interactions.
- Adaptive-tool definition: dynamic approval gating for tool invocations based on risk and side-effect classification, with multi-factor quorum support.
- Factor defaults: `allowedApprovers=["user_request","rules_based"]`, `disabledApprovers=[]`, `minApprovals=1`.
- References: [architecture](../adaptive-tool-approval-architecture.md), [implementation](../adaptive-tool-approval-implementation.md).

## Code anchors (existing file and line references)

- `src/config/types.approvals.ts:1`
- `src/config/types.approvals.ts:27`
- `src/config/zod-schema.approvals.ts:23`
- `src/config/types.openclaw.ts:95`
- `src/config/zod-schema.ts:363`
- `src/cli/exec-approvals-cli.ts:240`
- `src/cli/nodes-cli/register.invoke.ts:263`

## Type names and interfaces

- `type ToolApprovalsConfig = { enabled?: boolean; allowedApprovers?: ToolApproverId[]; disabledApprovers?: ToolApproverId[]; minApprovals?: number; }`
- `type ToolApproverId = "user_request" | "rules_based" | "llm_evaluation"`
- `type RiskPolicyOverrides = { minApprovalsByRisk?: Partial<Record<ToolApprovalRiskClass, number>> }`

## Implementation plan

1. Add `approvals.tools` to config types and zod schema with strict enums.
1. Add schema refinement: `minApprovals >= 1` and `minApprovals <= effectiveApproverCount` at load time.
1. Support explicit `disabledApprovers` precedence over `allowedApprovers`.
1. Add docs examples for default policy and high-security quorum override.

## Error-prone implementation snippet

```ts
const ToolApprovalsSchema = z
  .object({
    allowedApprovers: z
      .array(z.enum(["user_request", "rules_based", "llm_evaluation"]))
      .default(["user_request", "rules_based"]),
    disabledApprovers: z
      .array(z.enum(["user_request", "rules_based", "llm_evaluation"]))
      .default([]),
    minApprovals: z.number().int().min(1).default(1),
  })
  .strict();
```

## Acceptance criteria

- `openclaw config` can round-trip the new fields.
- Invalid factor policy fails with actionable error text.
- Defaults match architecture doc exactly.

## Related workplan docs

- [`01-system-charter-and-factor-policy.md`](01-system-charter-and-factor-policy.md)
- [`03-tool-approval-rpc-and-protocol.md`](03-tool-approval-rpc-and-protocol.md)
- [`09-rollout-migration-and-compatibility.md`](09-rollout-migration-and-compatibility.md)

## External best-practice references

- [OWASP Authorization Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html)
- [NIST SP 800-53 Rev. 5 (AC-5, CM-3)](https://www.govinfo.gov/content/pkg/FR-2020-12-10/pdf/2020-27049.pdf)
- [Vault control groups](https://developer.hashicorp.com/vault/docs/enterprise/control-groups)
- [GitHub protected branches](https://docs.github.com/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/about-protected-branches)
- [GitLab merge request approvals](https://docs.gitlab.com/user/project/merge_requests/approvals/)
- [Google Access Approval](https://cloud.google.com/access-approval/docs/overview)
- [Microsoft Entra PIM approval settings](https://learn.microsoft.com/en-us/entra/id-governance/privileged-identity-management/pim-how-to-change-default-settings)

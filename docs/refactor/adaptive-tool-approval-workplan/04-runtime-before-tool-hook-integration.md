# 04 Runtime Before-tool Hook Integration

## Executive summary

OpenClaw adaptive tool approval adds context-aware gating so risky tool calls are approved only when it matters, instead of forcing manual approval for every potentially dangerous operation. The baseline architecture is defined in [Adaptive Tool Approval Architecture](../adaptive-tool-approval-architecture.md) and the end-to-end implementation target is defined in [Adaptive Tool Approval Implementation Blueprint](../adaptive-tool-approval-implementation.md). This document is self-contained and scoped to one execution track.
This track is focused on the specific component described below and includes concrete implementation edges, types, and sequencing.

## RPCs, hooks, callbacks, and connected components

- Hook `runBeforeToolCallHook` in `src/agents/pi-tools.before-tool-call.ts:19`: main insertion point for orchestrator.
- Wrapper `wrapToolWithBeforeToolCallHook` in `src/agents/pi-tools.before-tool-call.ts:67`: ensures uniform pre-execution behavior.
- Tool assembly call-site in `src/agents/pi-tools.ts:447`: integration anchor for all tool invocations.
- Fallback exec request via `requestExecApprovalViaSocket` in `src/infra/exec-approvals.ts:1478`: compatibility behavior.
- Gateway event sync consumer in `apps/web/src/hooks/useGatewayEventSync.ts:68`: live updates after approvals.

## Phase and parallelism

- Phase: 04 (parallel)
- Parallelism: Yes. Parallel with other `04-*` tracks after phase 03 contracts stabilize.

## Goal and adaptive-tool context

- Goal: deliver adaptive tool approvals that combine policy checks, factorized approvals, and channel-safe user interactions.
- Adaptive-tool definition: dynamic approval gating for tool invocations based on risk and side-effect classification, with multi-factor quorum support.
- Factor defaults: `allowedApprovers=["user_request","rules_based"]`, `disabledApprovers=[]`, `minApprovals=1`.
- References: [architecture](../adaptive-tool-approval-architecture.md), [implementation](../adaptive-tool-approval-implementation.md).

## Code anchors (existing file and line references)

- `src/agents/pi-tools.before-tool-call.ts:19`
- `src/agents/pi-tools.before-tool-call.ts:79`
- `src/agents/pi-tools.ts:447`
- `src/agents/bash-tools.exec.ts:1087`
- `src/infra/exec-approvals.ts:1478`
- `apps/web/src/hooks/useGatewayStreamHandler.ts:1`
- `apps/web/src/hooks/useGatewayEventSync.ts:68`

## Type names and interfaces

- `type ToolInvocationContext = { agentId: string; sessionKey?: string; channel?: string; }`
- `type ToolApprovalOrchestrationResult = { allowed: boolean; reason?: string; requestId?: string; }`
- `type BeforeToolDecision = "allow" | "deny" | "defer"`

## Implementation plan

1. Call orchestrator from before-tool hook before executing wrapped tool handler.
1. Pass normalized invocation context (tool name, args summary, route metadata).
1. Return deterministic error objects when blocked so caller UX can render approval-needed state.
1. Keep legacy exec-specific flow reachable under migration flag.

## Error-prone implementation snippet

```ts
const outcome = await orchestrator.evaluateAndMaybeApprove({ toolName, args, context });
if (!outcome.allowed) {
  throw new Error(`TOOL_APPROVAL_BLOCKED:${outcome.reason ?? "unknown"}`);
}
return await tool(...args);
```

## Acceptance criteria

- All tool calls pass through one approval seam before execution.
- Blocked calls return stable reason codes for UI and logs.
- No regressions for read-only tools when approval mode is disabled.

## Related workplan docs

- [`04-tool-orchestrator-execution-path.md`](04-tool-orchestrator-execution-path.md)
- [`05-rules-based-approver-design.md`](05-rules-based-approver-design.md)
- [`08-testing-strategy-and-quality-gates.md`](08-testing-strategy-and-quality-gates.md)

## External best-practice references

- [OWASP Authorization Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html)
- [NIST SP 800-53 Rev. 5 (AC-5, CM-3)](https://www.govinfo.gov/content/pkg/FR-2020-12-10/pdf/2020-27049.pdf)
- [Vault control groups](https://developer.hashicorp.com/vault/docs/enterprise/control-groups)
- [GitHub protected branches](https://docs.github.com/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/about-protected-branches)
- [GitLab merge request approvals](https://docs.gitlab.com/user/project/merge_requests/approvals/)
- [Google Access Approval](https://cloud.google.com/access-approval/docs/overview)
- [Microsoft Entra PIM approval settings](https://learn.microsoft.com/en-us/entra/id-governance/privileged-identity-management/pim-how-to-change-default-settings)

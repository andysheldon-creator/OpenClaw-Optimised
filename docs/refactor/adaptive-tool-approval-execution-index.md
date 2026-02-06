---
summary: "Execution index and ownership checklist for adaptive multi-factor tool approvals"
read_when:
  - Planning delivery of adaptive tool approvals across runtime, gateway, UI, and channels
  - Assigning ownership and estimated effort for the 20 workplan tracks
  - Tracking phase gate completion and release readiness
title: "Adaptive Tool Approval Execution Index"
status: proposal
---

# Adaptive Tool Approval Execution Index

## Executive summary

This index is the single execution checklist for the adaptive tool approval program. It consolidates ownership fields, effort estimates, dependencies, and phase gates for all 20 workplan documents.

Core architecture references:

- [Adaptive Tool Approval Architecture](/refactor/adaptive-tool-approval-architecture)
- [Adaptive Tool Approval Implementation Blueprint](/refactor/adaptive-tool-approval-implementation)
- [Adaptive Tool Approval Workplan Folder](/refactor/adaptive-tool-approval-workplan)

## Program intent

The system objective is **precision-gated autonomy**:

- Apply the strongest approval controls to operations with high external consequence.
- Keep low-risk, high-confidence operations fast and minimally interrupted.
- Preserve complete auditability across every approval factor and final decision.

Default multi-factor policy baseline:

- `allowedApprovers = ["user_request", "rules_based"]`
- `disabledApprovers = []`
- `minApprovals = 1`

## How to use this index

1. Assign `Primary owner` and `Backup owner` for each row.
2. Confirm phase prerequisites are complete before starting a blocking phase.
3. Update `Status` and `Actual effort` as work progresses.
4. Use `Gate checklist` at the bottom to determine release readiness.

## Ownership and effort matrix

| ID  | Workstream                                   | Phase | Parallel group | Primary owner (field) | Backup owner (field) | Estimated effort (eng-days) | Actual effort (field) | Link                                                                                                        |
| --- | -------------------------------------------- | ----- | -------------- | --------------------- | -------------------- | --------------------------: | --------------------- | ----------------------------------------------------------------------------------------------------------- |
| 01  | System charter and factor policy             | 01    | Blocking       | `TBD`                 | `TBD`                |                         1.5 | `TBD`                 | [01 system charter](/refactor/adaptive-tool-approval-workplan/01-system-charter-and-factor-policy)          |
| 02A | Approver interface and registry              | 02    | Parallel       | `TBD`                 | `TBD`                |                         2.0 | `TBD`                 | [02 interface/registry](/refactor/adaptive-tool-approval-workplan/02-approver-interface-and-registry)       |
| 02B | Quorum aggregation engine                    | 02    | Parallel       | `TBD`                 | `TBD`                |                         2.0 | `TBD`                 | [02 quorum](/refactor/adaptive-tool-approval-workplan/02-quorum-aggregation-engine)                         |
| 02C | Config schema for multi-factor approvals     | 02    | Parallel       | `TBD`                 | `TBD`                |                         1.5 | `TBD`                 | [02 config schema](/refactor/adaptive-tool-approval-workplan/02-config-schema-for-multi-factor-approvals)   |
| 03A | Tool approval RPC and protocol               | 03    | Parallel       | `TBD`                 | `TBD`                |                         2.0 | `TBD`                 | [03 RPC/protocol](/refactor/adaptive-tool-approval-workplan/03-tool-approval-rpc-and-protocol)              |
| 03B | Gateway approval manager generalization      | 03    | Parallel       | `TBD`                 | `TBD`                |                         2.0 | `TBD`                 | [03 gateway manager](/refactor/adaptive-tool-approval-workplan/03-gateway-approval-manager-generalization)  |
| 03C | Event scoping and broadcast rules            | 03    | Parallel       | `TBD`                 | `TBD`                |                         1.5 | `TBD`                 | [03 event scope](/refactor/adaptive-tool-approval-workplan/03-event-scoping-and-broadcast-rules)            |
| 04A | Runtime before-tool hook integration         | 04    | Parallel       | `TBD`                 | `TBD`                |                         2.0 | `TBD`                 | [04 hook integration](/refactor/adaptive-tool-approval-workplan/04-runtime-before-tool-hook-integration)    |
| 04B | Tool orchestrator execution path             | 04    | Parallel       | `TBD`                 | `TBD`                |                         2.5 | `TBD`                 | [04 orchestrator](/refactor/adaptive-tool-approval-workplan/04-tool-orchestrator-execution-path)            |
| 04C | Node `system.run` integration                | 04    | Parallel       | `TBD`                 | `TBD`                |                         2.0 | `TBD`                 | [04 node integration](/refactor/adaptive-tool-approval-workplan/04-node-system-run-integration)             |
| 05A | `UserRequestApprover` across UI/CLI/channels | 05    | Parallel       | `TBD`                 | `TBD`                |                         3.0 | `TBD`                 | [05 user approver](/refactor/adaptive-tool-approval-workplan/05-user-request-approver-ui-cli-channels)      |
| 05B | `RulesBasedApprover` design and parity       | 05    | Parallel       | `TBD`                 | `TBD`                |                         2.0 | `TBD`                 | [05 rules approver](/refactor/adaptive-tool-approval-workplan/05-rules-based-approver-design)               |
| 05C | `LLMEvaluationApprover` design               | 05    | Parallel       | `TBD`                 | `TBD`                |                         2.5 | `TBD`                 | [05 LLM approver](/refactor/adaptive-tool-approval-workplan/05-llm-evaluation-approver-design)              |
| 06A | Observability and audit model                | 06    | Parallel       | `TBD`                 | `TBD`                |                         2.0 | `TBD`                 | [06 observability](/refactor/adaptive-tool-approval-workplan/06-observability-and-audit-model)              |
| 06B | Security controls and abuse resistance       | 06    | Parallel       | `TBD`                 | `TBD`                |                         2.0 | `TBD`                 | [06 security controls](/refactor/adaptive-tool-approval-workplan/06-security-controls-and-abuse-resistance) |
| 07A | Web UI approval experience                   | 07    | Parallel       | `TBD`                 | `TBD`                |                         3.0 | `TBD`                 | [07 web UI](/refactor/adaptive-tool-approval-workplan/07-web-ui-approval-experience)                        |
| 07B | CLI and operator workflows                   | 07    | Parallel       | `TBD`                 | `TBD`                |                         2.0 | `TBD`                 | [07 CLI workflows](/refactor/adaptive-tool-approval-workplan/07-cli-and-operator-workflows)                 |
| 08  | Testing strategy and quality gates           | 08    | Blocking       | `TBD`                 | `TBD`                |                         3.0 | `TBD`                 | [08 testing gates](/refactor/adaptive-tool-approval-workplan/08-testing-strategy-and-quality-gates)         |
| 09  | Rollout migration and compatibility          | 09    | Blocking       | `TBD`                 | `TBD`                |                         2.0 | `TBD`                 | [09 rollout/migration](/refactor/adaptive-tool-approval-workplan/09-rollout-migration-and-compatibility)    |
| 10  | Operations runbook and SLO                   | 10    | Blocking       | `TBD`                 | `TBD`                |                         1.5 | `TBD`                 | [10 operations/SLO](/refactor/adaptive-tool-approval-workplan/10-operations-runbook-and-slo)                |

**Total estimated effort:** `43.5 eng-days`

## Dependency map (phase gates)

- Phase `01` must complete first.
- Phase `02` requires phase `01`.
- Phase `03` requires all phase `02` tracks.
- Phase `04` requires phase `03` API and manager contracts.
- Phase `05` requires phase `04` runtime orchestration seams.
- Phase `06` can run once phase `05` contracts are stable.
- Phase `07` can run in parallel with phase `06`.
- Phase `08` requires substantial completion of phases `02` through `07`.
- Phase `09` requires phase `08` quality gates.
- Phase `10` finalizes operational readiness after phase `09`.

## Master execution checklist

### Phase 01

- [ ] 01 system charter approved

### Phase 02 (parallel)

- [ ] 02A approver interface and registry
- [ ] 02B quorum aggregation engine
- [ ] 02C config schema for multi-factor approvals

### Phase 03 (parallel)

- [ ] 03A tool approval RPC and protocol
- [ ] 03B gateway approval manager generalization
- [ ] 03C event scoping and broadcast rules

### Phase 04 (parallel)

- [ ] 04A runtime before-tool hook integration
- [ ] 04B tool orchestrator execution path
- [ ] 04C node `system.run` integration

### Phase 05 (parallel)

- [ ] 05A user request approver
- [ ] 05B rules based approver
- [ ] 05C LLM evaluation approver

### Phase 06 (parallel)

- [ ] 06A observability and audit model
- [ ] 06B security controls and abuse resistance

### Phase 07 (parallel)

- [ ] 07A web UI approval experience
- [ ] 07B CLI and operator workflows

### Phase 08

- [ ] 08 testing strategy and quality gates

### Phase 09

- [ ] 09 rollout migration and compatibility

### Phase 10

- [ ] 10 operations runbook and SLO

## Release gate checklist

- [ ] Multi-factor policy defaults enforced (`allowedApprovers` / `disabledApprovers` / `minApprovals`)
- [ ] `tool.approval.*` API stable with compatibility aliases for `exec.approval.*`
- [ ] `R3+` sensitive operations enforce human-factor requirements by default
- [ ] Quorum failure and timeout paths are fail-closed and audited
- [ ] UI, CLI, and at least one chat channel can resolve approvals
- [ ] Security controls block stale, replayed, and self-approval attempts
- [ ] Metrics and logs support end-to-end forensic replay
- [ ] Full gate passes: build, check, test, migration parity

## Suggested ownership model

- Runtime lead: phases `02A`, `02B`, `04A`, `04B`, `05B`
- Gateway/protocol lead: phases `03A`, `03B`, `03C`
- Node/execution lead: phase `04C`
- UX/channel lead: phases `05A`, `07A`, `07B`
- Security/ML lead: phases `05C`, `06B`
- Reliability lead: phases `06A`, `08`, `10`
- Release lead: phase `09`

## Status snapshot template

- Date: `TBD`
- Overall completion: `TBD%`
- Current active phases: `TBD`
- Risks: `TBD`
- Next gate target date: `TBD`

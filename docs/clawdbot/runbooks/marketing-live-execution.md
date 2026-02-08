# Marketing Live Execution Runbook

Use this runbook when executing real marketing plan mutations against Google Ads through OpenClaw browser and CLI adapters.

## Scope

- Plan intake and compilation
- Dry-run interpretation
- Approval and live launch
- Rollback and partial success recovery
- Incident response for failed or risky runs

## Preconditions

1. Operator has `operator.write` scope, and approver has `operator.admin` or `operator.approvals` scope.
2. Gateway health and control-plane sync are green:
   - `openclaw gateway status`
   - `openclaw call clawdbot.readiness.report`
   - `bun scripts/clawdbot-readiness-report.ts --strict`
3. Browser session and CLI auth probes are healthy for the target account.
4. Capability matrix has no `blocked` status for required execution skills.
5. Current campaign baseline snapshots are exported before launch.

## Standard Flow

1. Submit plan JSON in Command Center (`/` route) or via `clawdbot.marketing.compile`.
2. Verify compile output:
   - No errors.
   - Warnings reviewed and accepted.
   - `actionGraphHash` captured in ticket/change record.
3. Run dry-run workflow template:
   - `workflows/templates/marketing/marketing-plan-dry-run.json`
4. Validate preview artifacts:
   - proposed action list
   - spend-impacting deltas
   - approval context payloads
5. Request approval for live launch when risk requires it.
6. Execute live workflow template:
   - `workflows/templates/marketing/marketing-plan-live-execution.json`
7. Confirm run outcome from run detail:
   - final run state
   - telemetry per action
   - replay trace and artifact links
8. Run reconciliation and verify expected external state.

## Dry Run Review Checklist

- Campaign status changes are intentional.
- Daily budget and bid deltas are within policy.
- Targeting changes match change request scope.
- Keyword and ad mutations map to expected campaigns/ad groups.
- Adapter selection (`browser` vs `cli`) matches operational constraints.

## Live Launch Checklist

- Approval item IDs recorded and resolved.
- No unresolved high or critical drift before launch.
- Incident channel notified of launch window.
- Operator and reviewer present for first execution wave.

## Rollback Playbook

Use this when runs partially succeed or downstream validation fails.

1. Pause affected workflows from dashboard (`workflow.pause`).
2. Freeze further campaign activation by rejecting pending approvals.
3. Revert campaign-level changes first:
   - status toggles
   - budget changes
4. Revert ad group and keyword changes next.
5. Revert ad state/content changes.
6. Re-run reconciliation and confirm restored baseline.
7. Attach rollback evidence artifacts to incident record.

## Partial Success Handling

1. Identify last successful action from telemetry/replay trace.
2. Build a rollback subset from successful mutations only.
3. Execute subset rollback in controlled order:
   - campaign
   - ad group
   - keyword
   - ad
4. Mark run as partial and link follow-up remediation run ID.

## Incident Response

## Trigger Conditions

- Run enters `failed` state.
- Unexpected spend increase after live run.
- Approval or policy behavior deviates from expected path.
- Adapter session checks pass but mutations fail repeatedly.

## Triage Steps

1. Capture run ID, action graph hash, account ID.
2. Review telemetry for first failing action and error category.
3. Pull replay bundle and screenshot artifacts.
4. Classify impact:
   - no external mutation
   - partial external mutation
   - broad external mutation
5. Decide mitigation path:
   - retry transient failures
   - rollback deterministic failures
   - halt all launches

## Communication Template

```
Incident: marketing live execution anomaly
Run ID: <run-id>
Account: <account-id>
Impact: <summary>
Current status: <triage state>
Next action: <retry | rollback | hold>
Owner: <name>
ETA: <time>
```

## Post Incident Closure

1. Confirm reconciliation passes.
2. Add root-cause note tied to replay artifacts.
3. Update capability matrix or policy thresholds if required.
4. Capture follow-up issue for permanent fix.

## Related

- `workflows/templates/marketing/marketing-plan-dry-run.json`
- `workflows/templates/marketing/marketing-plan-live-execution.json`
- `src/clawdbot/control-plane/service.ts`
- `src/clawdbot/tools/google-ads-browser.ts`
- `src/clawdbot/tools/google-ads-cli.ts`

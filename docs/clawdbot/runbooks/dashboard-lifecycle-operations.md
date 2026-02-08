# Dashboard Lifecycle Operations Runbook

Use this runbook for day-to-day management of skills and workflows from the dashboard control plane.

## Scope

- Skill lifecycle operations
- Workflow lifecycle operations
- Binding preflight and validation
- Approval and role expectations
- Rollback and incident handling for lifecycle mutations
- Metadata backfill for existing estate

## Backfill Command

Run metadata backfill before first rollout or after environment rebuild:

```bash
bun scripts/clawdbot-control-plane-backfill.ts --strict
```

Readiness report for go/no-go:

```bash
bun scripts/clawdbot-readiness-report.ts --strict
```

## Roles and Permissions

- `viewer`: read-only access to inventory, runs, approvals.
- `operator`: may mutate with approval guards for high-impact actions.
- `admin`: full mutation authority and approval authority.

Required scopes:

- `operator.write` for mutations
- `operator.approvals` for approval resolution
- `operator.admin` for elevated administration

## Skill Lifecycle Procedure

1. Open Skills view and filter to target entity.
2. Review readiness blockers, capability state, and last operation.
3. Choose lifecycle action:
   - enable
   - disable
   - pin/unpin
   - deprecate/reactivate
   - reload
4. Provide explicit reason.
5. If approval is required, resolve approval item before proceeding.
6. Verify post-action state refresh matches requested operation.

## Workflow Lifecycle Procedure

1. Open Workflow Catalog.
2. Review version, mapped skills, source, and sync status.
3. Choose action:
   - deploy
   - activate
   - pause
   - run-now
   - rollback
4. Provide reason and target version for rollback actions.
5. Confirm operation status and audit event entry.
6. For run-now, verify run detail timeline and output state.

## Binding Preflight Procedure

1. Open Workflow Editor binding panel.
2. Select workflow and node ID.
3. Select skill and map parameters.
4. Provide required tools/env/secrets.
5. Run preflight validation.
6. Resolve all error-severity issues before save.
7. Save binding with reason and verify validation output stored.

## Rollback Playbooks

## Skill Rollback

1. Identify last lifecycle mutation from audit log.
2. Reapply inverse action:
   - disable -> enable
   - deprecate -> reactivate
   - pin -> unpin (or previous pin)
3. Confirm readiness and blocker state unchanged from baseline.

## Workflow Rollback

1. Pause workflow to stop additional changes.
2. Run rollback action with known stable version.
3. Verify mapped skills and deployment status after rollback.
4. Run a controlled `run-now` smoke execution.

## Binding Rollback

1. Restore previous binding snapshot by ID.
2. Re-run preflight and ensure no errors.
3. Validate dependent workflow run in sandbox.

## Incident Workflow

## Trigger Conditions

- Mutation denied unexpectedly.
- Approval queue stalls beyond SLA.
- Drift blocks deployment unexpectedly.
- Dashboard shows state inconsistent with backend outcome.

## Triage Steps

1. Capture entity ID, action, actor, and timestamp.
2. Check policy decision and audit metadata.
3. Check drift status and sync health snapshot.
4. Validate state persistence in control-plane store.
5. Determine whether rollback is required.

## Recovery Steps

1. Execute rollback playbook for affected entity type.
2. Re-run inventory sync and drift check.
3. Re-run operation with corrected prerequisites.
4. Close incident with run IDs and audit references.

## Tabletop Validation

Run this before enabling broad operator permissions:

1. Skill deprecate requiring approval.
2. Workflow rollback requiring approval.
3. Binding upsert with missing prerequisites.
4. Drift-induced action denial and operator recovery.

## Related

- `src/clawdbot/control-plane/service.ts`
- `src/gateway/server-methods/clawdbot-control-plane.ts`
- `dashboard/src/views/skills-registry.ts`
- `dashboard/src/views/workflow-catalog.ts`
- `dashboard/src/views/workflow-editor.ts`

# CONFLICT_DETECTION.md - Pre-Action Checks

Run these six checks before EVERY significant action. If any check fails, BLOCK the action and log to `logs/conflicts/YYYY-MM-DD.md`.

## Check 1: Scope

Is this action within the project's scope IN?

- Read the project CHARTER.md
- Verify the action matches an item in Scope IN
- Verify the action does NOT match any item in Scope OUT
- If unclear, BLOCK and ask Michael

## Check 2: Resources

Are the required resources available?

- Budget: Is there budget remaining for this action?
- API quotas: Will this exceed any API rate limits?
- Compute: Is the target infrastructure available?
- If any resource is insufficient, BLOCK

## Check 3: Contention

Is there conflicting work in progress?

- Check BUILD_STATUS.md for active tasks
- Verify no other task is modifying the same files
- Verify no deployment is in progress for the same target
- If conflict detected, BLOCK until resolved

## Check 4: Authority

Do you have authority to perform this action?

- Routine actions within charter scope: YES, proceed
- Spending money: REQUIRES Michael's approval
- Production deployment: REQUIRES Michael's approval (unless auto-deploy enabled)
- Architecture changes: REQUIRES Michael's approval
- If insufficient authority, REJECT

## Check 5: Safety

Is this action safe to execute?

- Will it break existing functionality? If yes, BLOCK
- Is it reversible? If not, extra caution required
- Does it expose secrets or credentials? If yes, CRITICAL
- Does it modify shared infrastructure? Extra validation required
- If unsafe, BLOCK or CRITICAL depending on severity

## Check 6: Charter Guardrails

Does this action violate any project guardrails?

- Read the Guardrails section of the project CHARTER.md
- Verify no guardrail is violated
- Common guardrails: stay within free tiers, cache aggressively, never guarantee outcomes
- If any guardrail violated, REJECT

## Conflict Log Format

When logging a blocked action:

```markdown
## HH:MM:SS | SEVERITY | PROJECT-ID

**Check Failed:** [Check 1-6 name]
**Action:** What was attempted
**Reason:** Why the check failed
**Resolution:** What needs to happen to unblock
```

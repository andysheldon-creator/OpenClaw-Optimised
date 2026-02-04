# Self-Improvement Mode (/improve)

The `/improve` command enables PR-only governance for codebase improvements with strict security guardrails. It scans for improvement opportunities, creates plans, and generates PRs for human review.

## Critical Safety Guarantees

| Rule | Enforcement |
|------|-------------|
| **NEVER auto-merge** | PR creation only, human must approve and merge |
| **NEVER modify security policy** | Blocklist protects web-policy.ts, allowlist files |
| **NEVER bypass approval gates** | HARD_APPROVAL_ACTIONS remain untouchable |
| **NEVER commit secrets** | .env, credentials directories excluded |
| **PR size limits** | Max 500 lines changed per PR |

## Default Blocklist

The following files and patterns are protected and cannot be modified:

```
src/dj/web-policy.ts
src/dj/web-operator.ts
**/allowlist*.ts
**/allowlist*.json
**/*.env*
**/credentials/**
**/secrets/**
```

## Commands

### /improve scan

Scan the codebase for improvement opportunities.

```
/improve scan
/improve scan --scope src/utils/
/improve scan --budget deep
```

**Options:**
- `--scope <paths>` - Limit scan to specific paths (default: src/**/*)
- `--budget <profile>` - Budget profile: cheap, normal (default: normal)
- `--blocklist <patterns>` - Additional patterns to block

### /improve plan <opportunity-ids>

Create an improvement plan from selected opportunities.

```
/improve plan opp-a1b2c3d4 opp-e5f6g7h8
```

The plan will:
- Validate all opportunities against the blocklist
- Filter to fit within the 500-line PR limit
- Create a draft plan for review

### /improve pr <plan-id>

Create a PR from an approved plan.

```
/improve pr imp-a1b2c3d4
```

**Options:**
- `--branch <name>` - Custom branch name (default: improve/<plan-id>)
- `--commit <message>` - Custom commit message

### /improve status [plan-id]

Check the status of a plan or current scope.

```
/improve status
/improve status imp-a1b2c3d4
```

### /improve set-scope <paths>

Set the default scope for scanning.

```
/improve set-scope src/dj/ src/utils/
```

The scope is validated against the blocklist - you cannot set scope to protected paths.

### /improve approve <plan-id>

Approve a draft plan for PR creation.

```
/improve approve imp-a1b2c3d4
```

### /improve reject <plan-id>

Reject a plan.

```
/improve reject imp-a1b2c3d4
/improve reject imp-a1b2c3d4 --reason "Changes too broad"
```

## Workflow

1. **Scan**: `/improve scan` discovers improvement opportunities
2. **Review**: Examine the opportunities and their confidence levels
3. **Plan**: `/improve plan <ids>` creates a plan from selected opportunities
4. **Approve**: `/improve approve <plan-id>` marks the plan for execution
5. **Create PR**: `/improve pr <plan-id>` creates the GitHub PR
6. **Human Review**: A human reviews and merges the PR

## Opportunity Types

| Type | Description |
|------|-------------|
| `bugfix` | Address TODO/FIXME comments, improve error handling |
| `refactor` | Break down long functions, reduce duplication |
| `perf` | Performance optimizations |
| `test` | Add missing tests |
| `docs` | Documentation improvements |

## Confidence Levels

| Level | Description |
|-------|-------------|
| `high` | Clear improvement with minimal risk |
| `medium` | Likely improvement, some judgment required |
| `low` | Potential improvement, needs careful review |

Opportunities are sorted by confidence (high first), then by estimated lines (smallest first).

## Plan Statuses

| Status | Description |
|--------|-------------|
| `draft` | Plan created, awaiting approval |
| `approved` | Ready for PR creation |
| `executing` | PR creation in progress |
| `pr-created` | PR created, awaiting merge |
| `merged` | PR merged successfully |
| `rejected` | Plan rejected |

## Notion Integration

Plans are logged to the Improve Plans database:

**Properties:**
- Name (Title): Plan ID (imp-xxxx)
- Status: draft, approved, executing, pr-created, merged, rejected
- OpportunityCount: Number of opportunities
- EstimatedLines: Estimated lines changed
- PRUrl: GitHub PR link
- PRNumber: PR number
- Scope: Paths in scope
- CreatedAt: When created
- MergedAt: When merged (if applicable)

## Configuration

```json
{
  "dj": {
    "notion": {
      "improvePlansDbId": "your-improve-plans-database-id"
    },
    "improve": {
      "defaultScope": ["src/**/*.ts"],
      "customBlocklist": ["**/legacy/**"],
      "baseBranch": "main"
    }
  }
}
```

## Weekly Cron: Improve Audit

A weekly cron job runs on **Saturday at 10:00 local time** with `normal` profile:

- Scans for improvement opportunities
- Reports findings via Telegram
- **Does NOT create PRs automatically**

This provides visibility into codebase health without taking automated action.

## Security Considerations

1. **Defense in Depth**: Blocklist is checked multiple times:
   - During scope setting
   - During scanning
   - During plan creation
   - Before PR creation

2. **PR-Only Governance**: The `NEVER_AUTO_MERGE` constant is enforced at the code level. There is no code path that merges PRs automatically.

3. **Human Review Required**: All changes require:
   - Plan approval
   - PR creation
   - GitHub PR review
   - Manual merge

4. **Audit Trail**: All operations are logged to Notion for accountability.

## Examples

### Basic Workflow

```
# Scan for opportunities
/improve scan

# Review opportunities in output

# Create plan from selected opportunities
/improve plan opp-a1b2c3d4 opp-e5f6g7h8

# Review and approve plan
/improve approve imp-x1y2z3a4

# Create PR
/improve pr imp-x1y2z3a4
```

### Focused Scan

```
# Only scan utility functions
/improve scan --scope src/utils/

# Exclude test files from scope
/improve set-scope src/**/*.ts !src/**/*.test.ts
```

### Check Status

```
# View current scope and blocklist
/improve status

# Check plan status
/improve status imp-x1y2z3a4
```

## Limitations

1. **No Auto-Merge**: PRs must be manually merged
2. **Line Limits**: PRs capped at 500 lines
3. **Budget Constraints**: Scanning uses BudgetGovernor limits
4. **Blocklist Coverage**: Some patterns may not match all edge cases
5. **Opportunity Accuracy**: Heuristic-based detection may have false positives

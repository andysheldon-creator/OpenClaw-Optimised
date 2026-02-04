---
name: dj-improve
description: Self-improvement mode with PR-only governance.
metadata:
  {
    "openclaw":
      {
        "emoji": "🔧",
        "requires": { "env": ["NOTION_API_KEY", "GITHUB_TOKEN"] },
        "commands":
          [
            { "name": "improve scan", "description": "Scan for improvement opportunities" },
            { "name": "improve plan", "description": "Create improvement plan" },
            { "name": "improve pr", "description": "Create PR from approved plan" },
            { "name": "improve status", "description": "Check improvement status" },
            { "name": "improve set-scope", "description": "Configure allowed paths" },
          ],
      },
  }
---

# dj-improve

Self-improvement mode with PR-only governance for codebase improvements.

## Overview

The /improve command enables agent-assisted codebase improvements with strict security guardrails:

- **PR-Only**: Changes are NEVER auto-merged. All PRs require human review.
- **Blocklist Enforced**: Security-sensitive files are protected from modification.
- **Size Limited**: Maximum 500 lines changed per PR.
- **Audited**: All operations logged to Notion for accountability.

## Security Guardrails

### Protected Files (Never Modified)

| Pattern | Reason |
|---------|--------|
| `src/dj/web-policy.ts` | Security policy |
| `src/dj/web-operator.ts` | Security controls |
| `**/allowlist*.ts` | Access control |
| `**/allowlist*.json` | Access control |
| `**/*.env*` | Secrets/config |
| `**/credentials/**` | Credentials |
| `**/secrets/**` | Secrets |

### Hard Limits

| Limit | Value | Reason |
|-------|-------|--------|
| Max PR lines | 500 | Keep PRs reviewable |
| Auto-merge | NEVER | Human review required |
| Blocked files | Enforced | Defense in depth |

## Usage

```
/improve scan [--scope path1,path2] [--profile cheap|normal|deep]
/improve plan <opportunity-ids>
/improve pr <plan-id>
/improve status [plan-id]
/improve set-scope <paths>
```

## Commands

### /improve scan

Scan for improvement opportunities within configured scope.

**Basic usage:**
```
/improve scan
```

**Custom scope:**
```
/improve scan --scope src/utils/,src/components/
```

**With budget profile:**
```
/improve scan --profile deep
```

**Output:**
```
🔍 **Scan Complete**

Scanned: 42 files
Blocked: 3 files (security policy)

📋 **Opportunities Found: 8**

| ID | Type | File | Description | Confidence | Lines |
|----|------|------|-------------|------------|-------|
| opp-a1b2c3d4 | refactor | src/utils/helpers.ts:45 | Break down long function | high | 50 |
| opp-e5f6g7h8 | bugfix | src/api/client.ts:123 | Improve error handling | high | 10 |
| opp-i9j0k1l2 | test | src/services/auth.ts | Add unit tests | medium | 80 |
...

Total estimated lines: 320

Next: /improve plan opp-a1b2c3d4 opp-e5f6g7h8
```

### /improve plan

Create an improvement plan from selected opportunities.

**Usage:**
```
/improve plan opp-a1b2c3d4 opp-e5f6g7h8 opp-i9j0k1l2
```

**Output:**
```
📝 **Improvement Plan Created**

Plan ID: imp-x1y2z3w4
Status: draft
Opportunities: 3
Estimated lines: 140

📋 **Selected Opportunities**

1. **refactor**: Break down long function (src/utils/helpers.ts:45)
2. **bugfix**: Improve error handling (src/api/client.ts:123)
3. **test**: Add unit tests (src/services/auth.ts)

⚠️ Plan requires approval before PR creation.

To approve: /improve approve imp-x1y2z3w4
To reject: /improve reject imp-x1y2z3w4
```

### /improve pr

Create a PR from an approved plan.

**Usage:**
```
/improve pr imp-x1y2z3w4
```

**Prerequisites:**
- Plan must be approved (`status: approved`)
- All files must pass blocklist check
- Total lines must be within limit

**Output:**
```
✅ **PR Created**

Plan ID: imp-x1y2z3w4
PR: #142
URL: https://github.com/owner/repo/pull/142
Branch: improve/imp-x1y2z3w4

Changes:
- src/utils/helpers.ts: refactored long function
- src/api/client.ts: improved error handling
- src/services/auth.ts: added unit tests

⚠️ PR requires human review and approval.
```

### /improve status

Check the status of improvement operations.

**Current status:**
```
/improve status
```

**Specific plan:**
```
/improve status imp-x1y2z3w4
```

**Output:**
```
📊 **Improve Status**

Scope: src/**/*.ts
Blocked Files: 7 patterns

📋 **Recent Plans**

| Plan ID | Status | Opportunities | Lines | PR |
|---------|--------|---------------|-------|-----|
| imp-x1y2z3w4 | pr-created | 3 | 140 | #142 |
| imp-a1b2c3d4 | merged | 5 | 280 | #138 |
| imp-e5f6g7h8 | rejected | 2 | 50 | - |
```

### /improve set-scope

Configure the paths that can be scanned and modified.

**Usage:**
```
/improve set-scope src/utils/ src/services/ lib/
```

**Note:** Cannot set scope to paths matching the blocklist.

## Workflow

1. **Scan**: Discover improvement opportunities
   ```
   /improve scan
   ```

2. **Plan**: Select opportunities and create a plan
   ```
   /improve plan opp-a1b2c3d4 opp-e5f6g7h8
   ```

3. **Approve**: Review and approve the plan
   ```
   /improve approve imp-x1y2z3w4
   ```

4. **PR**: Create the pull request
   ```
   /improve pr imp-x1y2z3w4
   ```

5. **Review**: Human reviews and merges PR (in GitHub)

## Opportunity Types

| Type | Description |
|------|-------------|
| refactor | Code restructuring for clarity/maintainability |
| bugfix | Fix potential bugs or error handling |
| performance | Optimize for speed/memory |
| test | Add or improve tests |
| docs | Add or improve documentation |

## Confidence Levels

| Level | Meaning |
|-------|---------|
| high | Clear improvement, low risk |
| medium | Good improvement, moderate review needed |
| low | Potential improvement, careful review needed |

## Plan Statuses

| Status | Description |
|--------|-------------|
| draft | Plan created, awaiting approval |
| approved | Plan approved, ready for PR |
| executing | PR creation in progress |
| pr-created | PR created, awaiting review |
| merged | PR merged |
| rejected | Plan rejected |

## Weekly Cron: Improve Audit

A weekly cron job scans for improvement opportunities:

- **Schedule**: Saturday 10:00 local
- **Profile**: normal (never deep)
- **Action**: Scan and report only (no PR creation)
- **Notification**: Telegram summary of findings

This ensures regular visibility into improvement opportunities without automated changes.

## Environment Variables

| Variable | Description |
|----------|-------------|
| `DJ_NOTION_IMPROVE_PLANS_DB_ID` | Improve Plans Notion database ID |
| `DJ_NOTION_IMPROVE_OPPORTUNITIES_DB_ID` | Opportunities Notion database ID |
| `GITHUB_TOKEN` | GitHub token for PR creation |

## Best Practices

1. **Review scans**: Don't blindly approve all opportunities
2. **Small PRs**: Keep plans under 200 lines when possible
3. **Test first**: Run tests before creating PR
4. **Clear commits**: Use descriptive commit messages
5. **Trust blocklist**: Never try to bypass security protections

## Limitations

- Maximum 500 lines per PR (hard limit)
- Security-sensitive files cannot be modified
- PRs require human review (no auto-merge)
- Budget limits apply to scanning
- Notion logging is non-fatal (continues if write fails)

## FAQ

**Q: Why can't I modify web-policy.ts?**
A: Security policy files are protected to prevent accidental or malicious changes to access controls.

**Q: Why is there a 500-line limit?**
A: Large PRs are harder to review and more likely to contain bugs. Smaller PRs get faster, better reviews.

**Q: Can I auto-merge PRs?**
A: No. The NEVER_AUTO_MERGE flag is enforced at the code level and cannot be overridden.

**Q: What if I need to change a blocked file?**
A: Make those changes manually through normal development workflow with appropriate code review.

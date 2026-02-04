# GitHub PR Workflows for Agents

## Overview

Agents can now create, review, comment, approve, and merge GitHub pull requests programmatically using the new GitHub tools. This enables automated PR workflows between multiple agents without manual intervention.

## Available Tools

### 1. `github_create_pr` - Create Pull Request

Creates a new pull request with all required parameters to avoid interactive prompts.

**Parameters:**
- `title` (required): PR title (keep under 70 characters)
- `body` (required): PR description/summary (markdown supported)
- `head` (required): Source branch name (e.g., `feature-branch`, `agent-a-changes`)
- `base` (optional): Target branch (defaults to `main` or config default)
- `repo` (optional): Repository in `owner/repo` format (defaults to current repo)
- `workdir` (optional): Working directory (defaults to current directory)
- `draft` (optional): Create as draft PR (defaults to `false`)

**Returns:**
- `prNumber`: Pull request number
- `prUrl`: Full GitHub URL to the PR
- `title`, `base`, `head`: Confirmed parameters

**Example:**
```typescript
{
  "tool": "github_create_pr",
  "params": {
    "title": "feat: add user authentication",
    "body": "## Summary\nImplements JWT-based authentication\n\n## Changes\n- Added auth middleware\n- Updated user model\n\n## Testing\nAll tests pass",
    "head": "agent-a-auth-feature",
    "base": "main"
  }
}
```

---

### 2. `github_get_pr` - Get PR Info

Fetches pull request details including status, review decision, and metadata.

**Parameters:**
- `prNumber` (required): Pull request number
- `repo` (optional): Repository in `owner/repo` format
- `workdir` (optional): Working directory

**Returns:**
- `status`: "open", "closed", or "merged"
- `prNumber`: PR number
- `title`, `body`: PR content
- `base`, `head`: Branch names
- `author`: PR author username
- `reviewDecision`: "APPROVED", "CHANGES_REQUESTED", or `null`
- `mergeable`: "MERGEABLE", "CONFLICTING", or "UNKNOWN"
- `url`: Full GitHub URL

**Example:**
```typescript
{
  "tool": "github_get_pr",
  "params": {
    "prNumber": 42
  }
}
```

---

### 3. `github_review_pr` - Review Pull Request

Posts a review with approval, change requests, or comments.

**Parameters:**
- `prNumber` (required): Pull request number
- `action` (required): "approve", "request-changes", or "comment"
- `body` (required): Review feedback (markdown supported)
- `repo` (optional): Repository in `owner/repo` format
- `workdir` (optional): Working directory

**Returns:**
- `status`: "approved", "changes-requested", or "commented"
- `prNumber`: PR number
- `body`: Review text

**Example:**
```typescript
{
  "tool": "github_review_pr",
  "params": {
    "prNumber": 42,
    "action": "approve",
    "body": "## Review Summary\n\n✓ APPROVED\n\n**Checks:**\n- Code quality: PASS\n- Tests: PASS (47 tests)\n- Security: PASS\n\nReady to merge!"
  }
}
```

---

### 4. `github_comment_pr` - Comment on PR

Adds a comment to a pull request for feedback or status updates.

**Parameters:**
- `prNumber` (required): Pull request number
- `body` (required): Comment text (markdown supported)
- `repo` (optional): Repository in `owner/repo` format
- `workdir` (optional): Working directory

**Returns:**
- `status`: "commented"
- `prNumber`: PR number

**Example:**
```typescript
{
  "tool": "github_comment_pr",
  "params": {
    "prNumber": 42,
    "body": "Running tests now, will review once CI passes..."
  }
}
```

---

### 5. `github_merge_pr` - Merge Pull Request

Merges a pull request using the specified strategy.

**Parameters:**
- `prNumber` (required): Pull request number
- `strategy` (optional): "squash", "merge", or "rebase" (defaults to "squash")
- `deleteBranch` (optional): Delete branch after merge (defaults to `true`)
- `auto` (optional): Enable auto-merge (merge when CI passes, defaults to `false`)
- `repo` (optional): Repository in `owner/repo` format
- `workdir` (optional): Working directory

**Returns:**
- `status`: "merged" or "failed"
- `prNumber`: PR number
- `sha`: Merge commit SHA (if successful)
- `message`: Output message

**Example:**
```typescript
{
  "tool": "github_merge_pr",
  "params": {
    "prNumber": 42,
    "strategy": "squash",
    "deleteBranch": true
  }
}
```

---

## Configuration

Add GitHub settings to your `~/.openclaw/config.json`:

```json
{
  "github": {
    "baseBranch": "main",
    "mergeStrategy": "squash",
    "autoDeleteBranch": true,
    "webhook": {
      "enabled": true,
      "secret": "your-webhook-secret-here",
      "path": "/github/webhook",
      "agents": {
        "reviewer": "agent-b-id",
        "author": "agent-a-id",
        "autoMerge": false
      },
      "events": {
        "pullRequest": true,
        "pullRequestReview": true,
        "checkSuite": true
      }
    }
  }
}
```

**Configuration Options:**
- `baseBranch`: Default base branch for PRs (e.g., "main", "master")
- `mergeStrategy`: Default merge strategy ("squash", "merge", or "rebase")
- `autoDeleteBranch`: Auto-delete feature branches after merge (default: `true`)
- `defaultRepo`: Default repository in `owner/repo` format (optional)
- `webhook`: Webhook configuration for automated agent triggering
  - `enabled`: Enable webhook listener (default: `false`)
  - `secret`: Webhook secret for signature verification (recommended)
  - `path`: Webhook endpoint path (default: `/github/webhook`)
  - `agents.reviewer`: Agent ID to notify when PR is opened/updated
  - `agents.author`: Agent ID to notify when review is submitted
  - `agents.autoMerge`: Auto-merge when checks pass and PR approved (default: `false`)
  - `events.pullRequest`: Handle PR events (default: `true`)
  - `events.pullRequestReview`: Handle review events (default: `true`)
  - `events.checkSuite`: Handle CI status events (default: `true`)

---

## GitHub Webhooks (Automated Agent Triggering)

### Overview

Instead of manually triggering PR reviews, you can configure GitHub webhooks to automatically notify agents when events occur. This enables fully automated PR workflows without polling or manual intervention.

### Setup Instructions

#### 1. **Enable Webhook in Config**

Add webhook configuration to `~/.openclaw/config.json`:

```json
{
  "github": {
    "webhook": {
      "enabled": true,
      "secret": "generate-a-strong-secret-here",
      "path": "/github/webhook",
      "agents": {
        "reviewer": "agent-b",
        "author": "agent-a"
      }
    }
  }
}
```

#### 2. **Generate Webhook Secret**

Generate a secure random secret:
```bash
openssl rand -hex 32
```

Store this in your config and in GitHub (step 4).

#### 3. **Expose Gateway to Internet**

Your OpenClaw gateway must be accessible from GitHub's servers. Options:

**Option A: Public Server**
```bash
# Gateway already exposed on public IP
openclaw gateway run --bind 0.0.0.0 --port 18789
```

**Option B: ngrok/Tailscale Funnel**
```bash
# Use ngrok to expose local gateway
ngrok http 18789

# Or use Tailscale Funnel
tailscale funnel 18789
```

#### 4. **Configure GitHub Webhook**

1. Go to your repository settings → **Webhooks** → **Add webhook**
2. **Payload URL**: `https://your-gateway-host.com:18789/github/webhook`
3. **Content type**: `application/json`
4. **Secret**: (paste the secret from step 2)
5. **Events**: Select:
   - ☑ Pull requests
   - ☑ Pull request reviews
   - ☑ Check suites
6. **Active**: ☑ Enabled
7. Click **Add webhook**

#### 5. **Test the Webhook**

Create a test PR and check:
- GitHub shows ✅ next to webhook delivery (Recent Deliveries tab)
- Agent B receives notification message
- Check OpenClaw logs: `tail -f ~/.openclaw/logs/gateway.log | grep github`

### Webhook Event Flow

```
┌─────────────┐         ┌──────────────┐         ┌─────────────┐
│   Agent A   │         │   GitHub     │         │   Agent B   │
│  creates PR │────────>│ fires webhook│────────>│ auto-reviews│
└─────────────┘         └──────────────┘         └─────────────┘
                              │
                              ├─> pull_request.opened
                              ├─> pull_request.synchronize
                              ├─> pull_request_review.submitted
                              └─> check_suite.completed
```

### Supported Events

#### **pull_request**
- `opened` → Notifies reviewer agent
- `synchronize` → Notifies reviewer when new commits pushed
- `reopened` → Notifies reviewer
- `review_requested` → Notifies specific reviewer
- `closed` → Notifies author (merged or closed)

#### **pull_request_review**
- `submitted` → Notifies author with review decision
  - `approved` ✅
  - `changes_requested` ⚠️
  - `commented` 💬

#### **check_suite**
- `completed` → Notifies reviewer if CI passes
- `completed` (failure) → Notifies author if CI fails

### Agent Notification Examples

**When PR is opened:**
```
Agent B receives:
"New PR #42 needs review: Add authentication system

https://github.com/owner/repo/pull/42

Author: @agent-a
Branch: feature-auth → main

Use github_get_pr to fetch details and github_review_pr to approve or request changes."
```

**When PR is approved:**
```
Agent A receives:
"✅ @agent-b approved your PR #42: Add authentication system

https://github.com/owner/repo/pull/42#pullrequestreview-123

Review:
LGTM! All tests pass, code quality is good."
```

**When CI passes:**
```
Agent B receives:
"✅ CI checks passed for PR #42

All checks completed successfully. Ready to merge if approved."
```

### Troubleshooting Webhooks

#### Webhook Deliveries Fail (GitHub shows ❌)

**Check gateway is accessible:**
```bash
curl -X POST https://your-gateway-host.com:18789/github/webhook \
  -H "Content-Type: application/json" \
  -d '{"test": true}'

# Should return: {"error":"Missing X-GitHub-Event header"} (401 or 400)
```

**Check firewall rules:**
- Allow inbound traffic on port 18789
- Whitelist GitHub webhook IPs (optional): https://api.github.com/meta

#### Webhook Signature Verification Fails

**Error:** `Invalid signature`

**Solution:** Verify secret matches in both config and GitHub settings
```bash
# Check configured secret
openclaw config get github.webhook.secret

# Must match GitHub webhook secret exactly
```

#### Agent Not Receiving Notifications

**Check agent IDs:**
```bash
# List configured agents
openclaw agents list

# Verify agent ID matches webhook config
openclaw config get github.webhook.agents.reviewer
```

**Check logs:**
```bash
tail -f ~/.openclaw/logs/gateway.log | grep -i "github webhook"
```

#### Webhook Path Not Found (404)

**Error:** GitHub shows 404 on webhook delivery

**Solution:** Verify path matches config
```json
{
  "github": {
    "webhook": {
      "path": "/github/webhook"  // Must match GitHub webhook URL path
    }
  }
}
```

### Security Best Practices

1. **Always use webhook secrets** - Prevents unauthorized webhook spoofing
2. **Use HTTPS** - Encrypt webhook payloads in transit
3. **Validate agent permissions** - Ensure reviewer agents have appropriate access
4. **Monitor webhook logs** - Track unusual activity
5. **Rotate secrets periodically** - Update webhook secret every 90 days

### Webhook vs Polling Comparison

| Feature | Webhooks | Polling |
|---------|----------|---------|
| **Latency** | Instant (< 1s) | Minutes (depends on interval) |
| **Resource Usage** | Low (event-driven) | Higher (constant API calls) |
| **Setup Complexity** | Medium (requires public endpoint) | Low (works anywhere) |
| **Reliability** | High (GitHub retries) | Medium (rate limits) |
| **Best For** | Production environments | Local development |

---

## Two-Agent PR Workflow

### Scenario: Agent A creates PR → Agent B reviews and approves

#### Agent A: Create Feature PR

```typescript
// 1. Create feature branch and make changes
{
  "tool": "exec",
  "params": {
    "command": "git checkout -b agent-a-feature && git add . && git commit -m 'feat: new feature' && git push -u origin agent-a-feature"
  }
}

// 2. Create pull request
{
  "tool": "github_create_pr",
  "params": {
    "title": "feat: add authentication system",
    "body": "## Summary\nImplements JWT-based authentication for API endpoints\n\n## Changes\n- Added auth middleware\n- Updated user model with password hashing\n- Added login/logout endpoints\n\n## Testing\n- All unit tests pass\n- Integration tests added\n\n@agent-b please review",
    "head": "agent-a-feature",
    "base": "main"
  }
}

// 3. Notify Agent B (via message, webhook, or polling)
{
  "tool": "message_send",
  "params": {
    "to": "agent-b",
    "text": "PR #42 ready for review: feat: add authentication system"
  }
}
```

#### Agent B: Review and Approve PR

```typescript
// 1. Fetch PR details
{
  "tool": "github_get_pr",
  "params": {
    "prNumber": 42
  }
}

// 2. Clone to temp workspace and run tests
{
  "tool": "exec",
  "params": {
    "command": "TEMP_DIR=$(mktemp -d) && git clone https://github.com/owner/repo.git $TEMP_DIR && cd $TEMP_DIR && gh pr checkout 42 && pnpm install && pnpm test",
    "timeout": 300
  }
}

// 3. Review code changes
{
  "tool": "exec",
  "params": {
    "command": "gh pr diff 42"
  }
}

// 4. Post approval review
{
  "tool": "github_review_pr",
  "params": {
    "prNumber": 42,
    "action": "approve",
    "body": "## Agent B Review\n\n**Status:** ✅ APPROVED\n\n**Checks Performed:**\n- Code quality: PASS\n- Tests: PASS (all 47 tests)\n- Build: PASS\n- Lint: PASS\n- Security scan: PASS\n\n**Summary:**\nChanges look good. Authentication implementation follows best practices:\n- Secure password hashing (bcrypt)\n- JWT tokens with appropriate expiry\n- Proper error handling\n- Comprehensive test coverage\n\nSafe to merge!"
  }
}

// 5. Merge PR (if auto-merge enabled) or notify Agent A
{
  "tool": "github_merge_pr",
  "params": {
    "prNumber": 42,
    "strategy": "squash",
    "deleteBranch": true
  }
}

// 6. Clean up temp workspace
{
  "tool": "exec",
  "params": {
    "command": "rm -rf $TEMP_DIR"
  }
}
```

---

## Best Practices

### 1. Always Provide Complete PR Parameters

**❌ BAD** (will prompt interactively):
```typescript
{
  "tool": "github_create_pr",
  "params": {
    "title": "New feature"
    // Missing body, head, base
  }
}
```

**✅ GOOD**:
```typescript
{
  "tool": "github_create_pr",
  "params": {
    "title": "feat: add new feature",
    "body": "## Summary\n...",
    "head": "feature-branch",
    "base": "main"
  }
}
```

### 2. Fetch PR Info Before Reviewing

Always check PR status, mergeable state, and existing reviews before posting a review:

```typescript
// Check if PR is still open and mergeable
const prInfo = await github_get_pr({ prNumber: 42 });
if (prInfo.status !== "open") {
  return "PR is already closed/merged";
}
if (prInfo.mergeable === "CONFLICTING") {
  return "PR has merge conflicts, cannot approve";
}
```

### 3. Run Tests in Isolated Workspace

Never checkout PR branches in your main working directory:

**❌ BAD**:
```bash
gh pr checkout 42  # Modifies current workspace
```

**✅ GOOD**:
```bash
TEMP_DIR=$(mktemp -d)
git clone https://github.com/owner/repo.git $TEMP_DIR
cd $TEMP_DIR && gh pr checkout 42
# Run tests
rm -rf $TEMP_DIR
```

### 4. Provide Detailed Review Feedback

**❌ BAD**:
```typescript
{
  "body": "LGTM"
}
```

**✅ GOOD**:
```typescript
{
  "body": "## Review Summary\n\n✓ APPROVED\n\n**Checks:**\n- Code quality: PASS\n- Tests: PASS (47 tests)\n- Security: PASS\n\n**Notes:**\n- Good test coverage\n- Follows coding standards\n- No security issues found"
}
```

### 5. Handle Errors Gracefully

```typescript
try {
  const result = await github_create_pr({ ... });
  return `PR created: ${result.prUrl}`;
} catch (err) {
  // Check if branch already exists, PR already open, etc.
  if (err.message.includes("already exists")) {
    return "PR already exists for this branch";
  }
  throw err;
}
```

### 6. Clean Up After Operations

```typescript
// After creating PR
await exec({ command: "git checkout main" }); // Return to main branch

// After reviewing in temp workspace
await exec({ command: `rm -rf ${tempDir}` }); // Clean up temp directory

// After merging
await exec({ command: "git pull --rebase" }); // Update local main
```

---

## Security Considerations

### 1. GitHub Authentication

Ensure GitHub CLI is authenticated:
```bash
gh auth status
gh auth login  # If not authenticated
```

### 2. Token Permissions

GitHub PAT or GitHub App must have:
- `repo` scope (full repository access)
- `pull_requests:write` permission
- `contents:write` for merging

### 3. Code Review Quality

Agents must actually analyze code, not rubber-stamp approvals:
- Run tests in isolated workspace
- Check for security vulnerabilities
- Verify commit author and sign-off
- Follow project coding standards

### 4. Branch Protection

Respect branch protection rules:
- Don't bypass required checks with admin override
- Honor CODEOWNERS requirements
- Follow merge strategy preferences

### 5. Audit Trail

Log all PR actions for accountability:
```typescript
logger.info(`Agent ${agentId} created PR #${prNumber}: ${title}`);
logger.info(`Agent ${agentId} approved PR #${prNumber}`);
logger.info(`Agent ${agentId} merged PR #${prNumber} with ${strategy}`);
```

---

## Troubleshooting

### PR Creation Fails

**Error:** `failed to create PR: pull request create failed: base branch not found`

**Solution:** Verify base branch exists and is spelled correctly:
```bash
git branch -r | grep origin/main
```

---

### Review Fails with 403 Forbidden

**Error:** `failed to review PR: forbidden`

**Solution:** Check GitHub permissions:
```bash
gh auth status
gh api repos/owner/repo/collaborators/username/permission
```

---

### Merge Fails with Conflicts

**Error:** `failed to merge PR: pull request merge failed: merge conflict`

**Solution:** Rebase or resolve conflicts before merging:
```bash
gh pr checkout 42
git rebase origin/main
# Resolve conflicts
git push --force-with-lease
```

---

## Examples

### Full End-to-End Workflow

See `/docs/plans/2026-02-04-github-pr-automation.md` for a complete example of:
1. Agent A creating a PR
2. Agent B reviewing in isolated workspace
3. Agent B approving and merging
4. Cleanup and notifications

---

## API Reference

All tools return structured results with:
- `content`: Array of text/image content for display
- `details`: Structured data for programmatic use

Example response:
```json
{
  "content": [
    {
      "type": "text",
      "text": "✓ Pull request created: #42\n\nhttps://github.com/owner/repo/pull/42"
    }
  ],
  "details": {
    "status": "created",
    "prNumber": 42,
    "prUrl": "https://github.com/owner/repo/pull/42",
    "title": "feat: add authentication",
    "base": "main",
    "head": "agent-a-feature"
  }
}
```

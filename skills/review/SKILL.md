---
name: review
description: "Code review skill with security and quality focus. Reviews PRs, commits, or code sections for bugs, security issues, and improvement opportunities."
metadata: { "openclaw": { "emoji": "👀", "always": true, "skillKey": "review" } }
user-invocable: true
---

# Skill: Code Review

Comprehensive code review with focus on security, quality, and maintainability.

## Review Checklist

### 1. Security (CRITICAL)

- [ ] Input validation on all external inputs
- [ ] No SQL injection (parameterized queries)
- [ ] No XSS (output encoding, CSP)
- [ ] No CSRF (tokens, SameSite cookies)
- [ ] Auth checks on protected routes
- [ ] No hardcoded secrets
- [ ] No sensitive data in logs
- [ ] Rate limiting on public endpoints
- [ ] CORS properly configured

### 2. Code Quality

- [ ] No TypeScript `any` types
- [ ] No TODO/FIXME/HACK comments
- [ ] No console.log in production code
- [ ] Proper error handling (no empty catches)
- [ ] Consistent naming conventions
- [ ] Functions under 50 lines
- [ ] Files under 500 lines
- [ ] No duplicated code

### 3. Tests

- [ ] Tests exist for new functionality
- [ ] Edge cases covered
- [ ] Mocks appropriate
- [ ] No flaky tests
- [ ] Coverage maintained or improved

### 4. Performance

- [ ] No N+1 queries
- [ ] Appropriate indexes
- [ ] Lazy loading where needed
- [ ] No memory leaks
- [ ] Efficient algorithms

### 5. Architecture

- [ ] Follows existing patterns
- [ ] Separation of concerns
- [ ] No circular dependencies
- [ ] Proper abstraction level

## Review Command Format

```bash
# Review a PR
gh pr diff <PR_NUMBER> | head -1000

# Review specific files
git diff HEAD~1 -- src/auth/

# Review with context
git log --oneline -5 && git diff HEAD~1
```

## Review Output Format

```markdown
## Code Review: [PR/Commit Title]

### Summary

[Brief description of what the code does]

### 🟢 Good

- [Positive aspect 1]
- [Positive aspect 2]

### 🟡 Suggestions

- **[File:Line]**: [Suggestion]
- **[File:Line]**: [Suggestion]

### 🔴 Issues (Must Fix)

- **[File:Line]**: [Security/Bug issue]
- **[File:Line]**: [Critical problem]

### Verdict

[ ] ✅ Approve
[ ] 🟡 Approve with suggestions
[ ] 🔴 Request changes
```

## Delegation

For security-focused review:

```typescript
sessions_spawn({
  task: "Security review of the auth module changes in PR #123. Check for OWASP Top 10 vulnerabilities.",
  agentId: "security-engineer",
  model: "anthropic/claude-opus-4-5",
  label: "Security Review",
});
```

For quality review:

```typescript
sessions_spawn({
  task: "Code quality review of src/api/ changes. Check for patterns, tests, and maintainability.",
  agentId: "quality-engineer",
  model: "anthropic/claude-sonnet-4-5",
  label: "Quality Review",
});
```

---
name: validate
description: "Pre-delivery validation skill. Runs comprehensive quality checks before code is committed or merged."
metadata: { "openclaw": { "emoji": "✅", "always": true, "skillKey": "validate" } }
user-invocable: true
---

# Skill: Pre-Delivery Validation

Comprehensive quality checks before delivery.

## Quality Gate Commands

```bash
# Full validation suite
pnpm lint       # 0 errors, 0 warnings
pnpm typecheck  # 0 TypeScript errors
pnpm test       # 100% tests passing
pnpm build      # Successful build
```

## Validation Checklist

### Code Quality

- [ ] No TypeScript `any` types
- [ ] No TODO/FIXME/HACK comments
- [ ] No console.log in production
- [ ] No unused imports/variables
- [ ] No duplicate code
- [ ] Functions < 50 lines
- [ ] Files < 500 lines

### Security

- [ ] Input validation on all endpoints
- [ ] Auth guards on protected routes
- [ ] No hardcoded secrets
- [ ] No SQL injection vectors
- [ ] No XSS vulnerabilities
- [ ] Rate limiting configured
- [ ] CORS properly set

### Tests

- [ ] All tests pass
- [ ] Coverage >= 90%
- [ ] Edge cases covered
- [ ] No skipped tests
- [ ] Regression tests for fixes

### Performance

- [ ] No N+1 queries
- [ ] Indexes present
- [ ] Lazy loading used
- [ ] Bundle size reasonable

### UX (for UI changes)

- [ ] Loading states
- [ ] Empty states
- [ ] Error states
- [ ] Success feedback
- [ ] Responsive design
- [ ] Accessibility (WCAG 2.1 AA)

### Documentation

- [ ] JSDoc on public APIs
- [ ] Types exported
- [ ] README updated (if needed)
- [ ] Changelog entry (if needed)

## Pre-Commit Script

```bash
#!/bin/bash
set -e

echo "Running pre-delivery validation..."

echo "1/4 Lint check..."
pnpm lint

echo "2/4 Type check..."
pnpm typecheck

echo "3/4 Running tests..."
pnpm test

echo "4/4 Build check..."
pnpm build

echo "✅ All validations passed!"
```

## Validation Report Format

```markdown
## Pre-Delivery Validation Report

### Files Changed

- src/auth/login.ts
- src/auth/login.test.ts

### Validation Results

| Check     | Status  | Notes        |
| --------- | ------- | ------------ |
| Lint      | ✅ Pass | 0 errors     |
| TypeCheck | ✅ Pass | 0 errors     |
| Tests     | ✅ Pass | 100% (45/45) |
| Build     | ✅ Pass | Built in 12s |
| Coverage  | ✅ Pass | 94%          |
| Security  | ✅ Pass | No issues    |

### Ready for Delivery

[x] All checks passed
[ ] Requires review
[ ] Has blocking issues
```

## Delegation

```typescript
// Full validation
sessions_spawn({
  task: "Run full pre-delivery validation on the auth module changes. Check lint, types, tests, coverage, and security.",
  agentId: "quality-engineer",
  model: "anthropic/claude-sonnet-4-5",
  label: "Auth Validation",
});
```

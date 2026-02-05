---
name: test
description: "Test creation and quality assurance skill. Creates comprehensive tests for unit, integration, and E2E scenarios with 100% coverage target."
metadata: { "openclaw": { "emoji": "🧪", "always": true, "skillKey": "test" } }
user-invocable: true
---

# Skill: Test Creation

Create comprehensive tests with 100% coverage target.

## Testing Pyramid

```
         /  E2E  \        5% - Critical user journeys
        / Integration \   25% - Module boundaries, APIs
       /    Unit Tests  \ 70% - Functions, utilities, logic
```

## Test Categories

| Type        | Scope            | Framework  | When                             |
| ----------- | ---------------- | ---------- | -------------------------------- |
| Unit        | Function/utility | vitest     | Every function with logic        |
| Integration | Module boundary  | vitest     | API routes, DB queries, services |
| E2E         | User journey     | Playwright | Critical flows (auth, checkout)  |

## Coverage Expectations

| Area              | Minimum | Target |
| ----------------- | ------- | ------ |
| Business logic    | 90%     | 100%   |
| API routes        | 80%     | 95%    |
| Utilities/helpers | 95%     | 100%   |
| UI components     | 70%     | 85%    |
| Overall           | 80%     | 90%    |

## Test Structure

```
tests/
  unit/          # Pure logic, no I/O
  integration/   # DB, API, external services
  e2e/           # Browser-based user flows
  fixtures/      # Shared test data
  helpers/       # Test utilities
```

## Test Naming Convention

```typescript
describe("ModuleName", () => {
  describe("methodName", () => {
    it("should [expected behavior] when [condition]", () => {});
    it("should throw [error] when [invalid input]", () => {});
  });
});
```

## Mandatory Test Scenarios

For EACH feature implemented:

1. **Happy path** — Valid input, expected result
2. **Edge cases** — Limits, empty values, nulls
3. **Error handling** — Invalid input, network failures, timeouts
4. **Concurrency** — Race conditions (when applicable)
5. **Security** — Injection, unauthorized access

## Test Template

```typescript
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

describe('FeatureName', () => {
  beforeEach(() => {
    // Setup
  })

  afterEach(() => {
    // Cleanup
    vi.restoreAllMocks()
  })

  describe('methodName', () => {
    it('should return expected result when valid input', () => {
      // Arrange
      const input = { ... }

      // Act
      const result = methodName(input)

      // Assert
      expect(result).toEqual(expected)
    })

    it('should throw ValidationError when invalid input', () => {
      // Arrange
      const invalidInput = { ... }

      // Act & Assert
      expect(() => methodName(invalidInput)).toThrow(ValidationError)
    })

    it('should handle edge case: empty input', () => {
      expect(methodName({})).toEqual(defaultValue)
    })

    it('should handle edge case: null values', () => {
      expect(methodName(null)).toBeNull()
    })
  })
})
```

## Running Tests

```bash
# Run all tests
pnpm test

# Run specific file
pnpm test src/auth/auth.test.ts

# Run with coverage
pnpm test:coverage

# Watch mode
pnpm test --watch
```

## Delegation

```typescript
// Create tests for a module
sessions_spawn({
  task: "Create comprehensive unit tests for src/auth/ module. Target 100% coverage. Include happy path, edge cases, and error handling.",
  agentId: "testing-specialist",
  model: "anthropic/claude-sonnet-4-5",
  label: "Auth Unit Tests",
});

// Create E2E tests
sessions_spawn({
  task: "Create Playwright E2E tests for the login flow. Test successful login, failed login, session expiry, and logout.",
  agentId: "qa-automation",
  model: "anthropic/claude-sonnet-4-5",
  label: "Login E2E Tests",
});
```

## Quality Gate

Before marking tests complete:

- [ ] All tests pass
- [ ] Coverage >= 90%
- [ ] No skipped tests without justification
- [ ] Edge cases covered
- [ ] Regression tests for bug fixes

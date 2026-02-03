# Testing Anti-Patterns

**Load this reference when:** writing or changing tests, adding mocks, or tempted to add test-only methods to production code.

## Overview

Tests must verify real behavior, not mock behavior. Mocks are a means to isolate, not the thing being tested.

**Core principle:** Test what the code does, not what the mocks do.

## The Iron Laws

```
1. NEVER test mock behavior
2. NEVER add test-only methods to production classes
3. NEVER mock without understanding dependencies
```

## Anti-Pattern 1: Testing Mock Behavior

You're verifying the mock works, not that the component works. Test passes when mock is present, fails when it's not. Tells you nothing about real behavior.

**Fix:** Test real component or don't mock it.

## Anti-Pattern 2: Test-Only Methods in Production

Production class polluted with test-only code. Dangerous if accidentally called in production. Violates YAGNI.

**Fix:** Put cleanup/utility methods in test utilities, not production classes.

## Anti-Pattern 3: Mocking Without Understanding

Over-mocking to "be safe" breaks actual behavior. Mocked method had side effect test depended on.

**Fix:** Understand dependencies first. Mock at the lowest necessary level. Preserve side effects the test depends on.

## Anti-Pattern 4: Incomplete Mocks

Partial mocks hide structural assumptions. Downstream code may depend on fields you didn't include.

**Fix:** Mirror real API completeness. Include ALL fields the system might consume downstream.

## Anti-Pattern 5: Integration Tests as Afterthought

Testing is part of implementation, not optional follow-up. Can't claim complete without tests.

**Fix:** TDD - tests first.

## Quick Reference

| Anti-Pattern                    | Fix                                           |
| ------------------------------- | --------------------------------------------- |
| Assert on mock elements         | Test real component or unmock it              |
| Test-only methods in production | Move to test utilities                        |
| Mock without understanding      | Understand dependencies first, mock minimally |
| Incomplete mocks                | Mirror real API completely                    |
| Tests as afterthought           | TDD - tests first                             |
| Over-complex mocks              | Consider integration tests                    |

## Red Flags

- Assertion checks for `*-mock` test IDs
- Methods only called in test files
- Mock setup is >50% of test
- Test fails when you remove mock
- Can't explain why mock is needed
- Mocking "just to be safe"

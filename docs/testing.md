# Testing Guide

This guide covers the testing infrastructure, practices, and workflows for the OpenClaw project.

## Overview

OpenClaw uses [Vitest](https://vitest.dev) as its testing framework, with multiple specialized test configurations for different types of tests:

- **Unit tests**: Fast, isolated tests for individual modules
- **E2E tests**: Integration tests for complete workflows
- **Live tests**: Tests that interact with real APIs (requires credentials)
- **Extension tests**: Tests for plugin extensions
- **Gateway tests**: Tests for the gateway server
- **UI tests**: Browser-based tests using Playwright

## Test Structure

### Test Organization

```
openclaw/
├── src/              # Source code with colocated tests
│   └── **/*.test.ts  # Unit tests alongside source
├── test/             # Shared test infrastructure
│   ├── setup.ts      # Global test setup
│   ├── fixtures/     # Test data and sample files
│   ├── helpers/      # Reusable test utilities
│   └── mocks/        # Mock implementations
├── extensions/       # Extension-specific tests
│   └── **/*.test.ts
└── ui/               # UI test suites
```

### Test File Naming

- **Unit tests**: `*.test.ts` (e.g., `format-time.test.ts`)
- **E2E tests**: `*.e2e.test.ts` (e.g., `gateway.multi.e2e.test.ts`)
- **Live tests**: `*.live.test.ts` (e.g., `provider.live.test.ts`)

## Running Tests

### Quick Start

```bash
# Run all tests (parallel execution of unit, extension, and gateway tests)
pnpm test

# Run tests in watch mode
pnpm test:watch

# Run with coverage report
pnpm test:coverage

# View coverage report with UI
pnpm test:coverage:ui
```

### Specific Test Suites

```bash
# Unit tests only
pnpm test:unit

# E2E integration tests
pnpm test:e2e

# Extension tests
pnpm test:extensions

# Gateway server tests
pnpm test:gateway

# UI tests (browser-based)
pnpm test:ui

# Live API tests (requires credentials)
pnpm test:live
```

### Advanced Testing

```bash
# Full test suite (lint, build, all tests)
pnpm test:all

# Docker integration tests
pnpm test:docker:all
pnpm test:docker:live-models
pnpm test:docker:live-gateway
pnpm test:docker:onboard

# Installation smoke tests
pnpm test:install:smoke
pnpm test:install:e2e
```

## Test Configurations

### Base Configuration (`vitest.config.ts`)

The main configuration with:
- **Timeout**: 120s per test
- **Workers**: 4-16 locally, 2-3 in CI
- **Coverage**: v8 provider with 70% line/function/statement, 55% branch thresholds
- **Setup**: Isolated test homes, mock channel plugins

### Specialized Configs

- **`vitest.unit.config.ts`**: Unit tests only (excludes gateway, extensions)
- **`vitest.e2e.config.ts`**: E2E tests with limited workers (4 max)
- **`vitest.live.config.ts`**: Live API tests (serial execution)
- **`vitest.extensions.config.ts`**: Extension-specific tests
- **`vitest.gateway.config.ts`**: Gateway server tests
- **`ui/vitest.config.ts`**: Browser-based UI tests with Playwright

## Coverage Reports

### Local Development

```bash
# Generate coverage report
pnpm test:coverage

# View HTML report
open coverage/index.html
```

Coverage reports include:
- **Text summary** in terminal
- **LCOV format** for CI/CD tools
- **HTML report** for detailed local viewing (`./coverage/index.html`)

### Coverage Thresholds

The project maintains the following coverage requirements:

- **Lines**: 70%
- **Functions**: 70%
- **Branches**: 55%
- **Statements**: 70%

Coverage is measured only on source code in `src/`, excluding:
- Test files (`*.test.ts`)
- Entrypoints and CLI wiring
- Manual/E2E-validated code (agent integrations, channel surfaces)
- Interactive UIs (TUI, wizard flows)
- Hard-to-test process bridges

### CI/CD Integration

Coverage reports are automatically:
- Generated on every CI run
- Uploaded to Codecov for tracking
- Summarized in PR comments
- Enforced against thresholds (builds fail if coverage drops)

## Writing Tests

### Basic Test Structure

```typescript
import { describe, test, expect } from 'vitest';
import { myFunction } from './my-module';

describe('myFunction', () => {
  test('should handle basic input', () => {
    const result = myFunction('test');
    expect(result).toBe('expected output');
  });

  test('should handle edge cases', () => {
    expect(() => myFunction(null)).toThrow();
  });
});
```

### Using Test Helpers

```typescript
import { withTempHome } from '../test/helpers/temp-home';
import { poll } from '../test/helpers/poll';

test('with isolated environment', async () => {
  await withTempHome(async (homePath) => {
    // Test runs in isolated temp directory
    // Automatically cleaned up after test
  });
});

test('async condition', async () => {
  await poll(() => someAsyncCheck(), {
    timeout: 5000,
    interval: 100,
  });
});
```

### Mocking

Test setup (`test/setup.ts`) provides:
- Mock channel plugins (Discord, Slack, Telegram, WhatsApp, Signal, iMessage)
- Isolated test home directories
- Stubbed outbound message adapters

```typescript
import { vi } from 'vitest';

test('with mocked dependency', () => {
  const mockFn = vi.fn().mockReturnValue('mocked');
  
  const result = functionUnderTest(mockFn);
  
  expect(mockFn).toHaveBeenCalledWith('expected arg');
  expect(result).toBe('expected');
});
```

## Best Practices

### Do's

✅ **Isolate tests**: Each test should be independent and not rely on others
✅ **Use descriptive names**: Test names should clearly explain what's being tested
✅ **Test edge cases**: Cover error conditions, null/undefined, boundary values
✅ **Keep tests focused**: One test should verify one behavior
✅ **Use fixtures**: Reuse common test data from `test/fixtures/`
✅ **Clean up resources**: Use helpers like `withTempHome` for automatic cleanup
✅ **Mock external dependencies**: Don't make real API calls in unit tests

### Don'ts

❌ **Don't test implementation details**: Focus on behavior, not internals
❌ **Don't write flaky tests**: Avoid race conditions and timing dependencies
❌ **Don't share state**: Tests should not modify global state
❌ **Don't skip important tests**: Fix failing tests instead of skipping them
❌ **Don't commit real credentials**: Use environment variables and test accounts
❌ **Don't make tests too slow**: Keep unit tests fast (<1s each)

## Debugging Tests

### Run a Single Test

```bash
# Run specific test file
pnpm test src/my-module.test.ts

# Run tests matching pattern
pnpm test --grep "my test name"

# Run in watch mode for quick iteration
pnpm test:watch src/my-module.test.ts
```

### Debug in VS Code

Add to `.vscode/launch.json`:

```json
{
  "type": "node",
  "request": "launch",
  "name": "Debug Test",
  "program": "${workspaceFolder}/node_modules/vitest/vitest.mjs",
  "args": ["run", "${file}"],
  "console": "integratedTerminal",
  "internalConsoleOptions": "neverOpen"
}
```

### Verbose Output

```bash
# Show all console.log output
pnpm test --reporter=verbose

# Show full error stacks
pnpm test --reporter=verbose --printConsoleTrace
```

## Continuous Integration

Tests run automatically on:
- Every push to `main`
- All pull requests
- Multiple platforms (Ubuntu, Windows, macOS)
- Both Node.js and Bun runtimes

CI runs:
1. Type checking (`pnpm tsgo`)
2. Linting (`pnpm lint`)
3. Formatting checks (`pnpm format`)
4. Unit tests (`pnpm test`)
5. Protocol validation (`pnpm protocol:check`)
6. Coverage reporting (Codecov)

See `.github/workflows/ci.yml` for full CI configuration.

## Troubleshooting

### Tests Timing Out

- Increase timeout in test: `test('name', { timeout: 60000 }, async () => { ... })`
- Check for unresolved promises or missing awaits
- Use `vi.useFakeTimers()` for time-dependent code

### Coverage Not Generated

```bash
# Clean coverage cache
rm -rf coverage .vitest

# Regenerate coverage
pnpm test:coverage
```

### Flaky Tests

- Add retry logic with `test.retry(3)`
- Use `poll()` helper for async conditions
- Increase timeouts for slow operations
- Isolate test environment with `withTempHome`

### Test Port Conflicts

```bash
# Kill processes using test ports
pnpm test:force

# Or manually find and kill
lsof -ti:18789 | xargs kill -9
```

## Contributing Tests

When contributing code:

1. **Write tests for new features**: All new code should include tests
2. **Update tests for changes**: Modify tests when changing behavior
3. **Maintain coverage**: Don't reduce coverage below thresholds
4. **Run tests locally**: Verify tests pass before submitting PR
5. **Add fixtures**: Create reusable test data for complex scenarios

### Coverage Requirements for PRs

- New code must have at least 70% coverage
- Don't reduce existing coverage
- Document any intentionally excluded code
- CI will enforce coverage thresholds

## Additional Resources

- [Vitest Documentation](https://vitest.dev/)
- [GitHub Actions CI Workflow](.github/workflows/ci.yml)
- [Coverage Configuration](vitest.config.ts)
- [Test Setup](test/setup.ts)
- [OpenClaw Development Guide](https://docs.openclaw.ai/)

## Quick Reference

```bash
# Essential commands
pnpm test                  # Run all tests
pnpm test:watch           # Watch mode
pnpm test:coverage        # Generate coverage
pnpm test:unit            # Unit tests only
pnpm test:e2e             # E2E tests
pnpm test:live            # Live API tests

# Coverage
open coverage/index.html  # View HTML report
pnpm test:coverage:ui     # Interactive coverage UI

# CI commands
pnpm test:all             # Full test suite
pnpm lint && pnpm build   # Pre-test checks
```

## Need Help?

- Check existing tests for examples: `find src -name "*.test.ts"`
- Ask in [Discord](https://discord.gg/clawd)
- Review [test helpers](test/helpers/)
- See [Contributing Guide](../CONTRIBUTING.md)

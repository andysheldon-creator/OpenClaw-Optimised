# Test Helpers

This directory contains reusable test utilities and helper functions.

## Existing Helpers

- **envelope-timestamp.ts**: Utilities for handling message envelope timestamps
- **inbound-contract.ts**: Contract validation helpers for inbound messages
- **normalize-text.ts**: Text normalization utilities for test assertions
- **paths.ts**: Path resolution helpers for test files
- **poll.ts**: Polling utilities for async test scenarios
- **temp-home.ts**: Temporary home directory management for isolated tests

## Usage

```typescript
import { withTempHome } from '../helpers/temp-home';
import { poll } from '../helpers/poll';

test('example', async () => {
  await withTempHome(async (homePath) => {
    // Test logic with isolated home directory
  });
  
  await poll(() => someCondition, { timeout: 5000 });
});
```

## Guidelines

- Keep helpers focused and single-purpose
- Export well-typed functions with clear interfaces
- Document expected parameters and return values
- Add unit tests for complex helper logic

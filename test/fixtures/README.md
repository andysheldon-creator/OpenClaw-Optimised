# Test Fixtures

This directory contains test fixtures - static data files used across test suites.

## Usage

Test fixtures should be:
- Read-only data (JSON, text files, sample configurations)
- Shared across multiple test files
- Representative of real-world data structures
- Well-documented with clear naming

## Example

```typescript
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const fixtureData = JSON.parse(
  readFileSync(join(__dirname, '../fixtures/sample-config.json'), 'utf-8')
);
```

## Organization

- Group related fixtures in subdirectories
- Use descriptive file names (e.g., `valid-message.json`, `error-response.txt`)
- Keep fixtures minimal and focused on specific test scenarios

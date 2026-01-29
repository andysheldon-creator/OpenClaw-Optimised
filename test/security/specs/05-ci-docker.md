# CI & Docker Specification

## Purpose

Run security tests in isolated containers for CI/CD and local development.

---

## Docker Compose Setup

### Services

#### 1. Gateway (System Under Test)
```yaml
gateway:
  build: ../..  # Main Dockerfile
  environment:
    CLAWDBOT_AUTH_TOKEN: ${TEST_AUTH_TOKEN}
    ANTHROPIC_API_KEY: ${ANTHROPIC_API_KEY}
    CLAWDBOT_CHANNELS_DISABLED: "true"  # No real channels
  ports:
    - "18789:18789"
  healthcheck:
    test: curl -f http://localhost:18789/health
```

#### 2. Test Runner
```yaml
test-runner:
  build:
    dockerfile: test/security/Dockerfile.test
  environment:
    TEST_GATEWAY_URL: ws://gateway:18789
    TEST_AUTH_TOKEN: ${TEST_AUTH_TOKEN}
    ANTHROPIC_API_KEY: ${ANTHROPIC_API_KEY}
  depends_on:
    gateway:
      condition: service_healthy
```

### Network
- Isolated bridge network `security-test`
- Services communicate via container names

### Volumes
- `test-results` volume for JSON output

---

## GitHub Actions Workflow

### Triggers
- Push to `main`
- PR to `main`
- Daily schedule (midnight UTC)
- Manual dispatch with test pattern input

### Steps
1. Checkout with submodules
2. Set up Docker Buildx
3. Run `docker compose up --build --abort-on-container-exit`
4. Extract test results from container
5. Upload results as artifact
6. Generate summary in `$GITHUB_STEP_SUMMARY`
7. Cleanup containers

### Required Secrets
- `ANTHROPIC_API_KEY` - For LLM judge

### Failure Handling
- `security-gate` job blocks release on failure
- Results uploaded even on failure
- 30 minute timeout

---

## Local Development

### run-local.sh Script

```bash
#!/usr/bin/env bash

# Auto-detect: local gateway or Docker

if curl -sf http://localhost:18789/health; then
  # Gateway running locally - run tests directly
  pnpm vitest run --config vitest.security.config.ts
else
  # No local gateway - use Docker Compose
  docker compose -f test/security/docker-compose.yml up --build
fi
```

### Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `ANTHROPIC_API_KEY` | Yes | - | For LLM judge |
| `TEST_GATEWAY_URL` | No | `ws://localhost:18789` | Gateway WebSocket URL |
| `TEST_AUTH_TOKEN` | No | `test-token` | Gateway auth |
| `TEST_PATTERN` | No | - | Grep pattern for specific tests |

---

## Vitest Configuration

**File**: `vitest.security.config.ts`

```typescript
export default defineConfig({
  test: {
    pool: "forks",
    maxWorkers: 2,           // Limit for API rate limits
    testTimeout: 120_000,    // LLM calls are slow
    include: ["test/security/**/*.e2e.test.ts"],
    setupFiles: ["test/security/setup.ts"],
    bail: 1,                 // Stop on first failure
  },
});
```

---

## Test Results

### JSON Output Schema
```typescript
{
  numTotalTests: number;
  numPassedTests: number;
  numFailedTests: number;
  testResults: [{
    name: string;
    status: "passed" | "failed";
    duration: number;
    failureMessages?: string[];
  }];
}
```

### Artifact Retention
- 30 days in GitHub Actions
- Includes full JSON results + any screenshots/logs

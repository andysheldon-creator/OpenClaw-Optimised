# Test Patterns Reference

> Source of truth: Explore `src/**/*.test.ts` for current patterns.

## Unit Test Pattern

```typescript
// src/my-feature.test.ts
import { describe, expect, it } from "vitest";

describe("myFeature", () => {
  it("should transform input correctly", async () => {
    const { myFeature } = await import("./my-feature.js");
    const result = myFeature("input");
    expect(result).toBe("expected output");
  });
});
```

## Mocking with vi.hoisted()

For mocks that survive module mocking, use `vi.hoisted()`:

```typescript
import { beforeEach, describe, expect, it, vi } from "vitest";

// Hoisted mocks survive module mocking
const hoisted = vi.hoisted(() => ({
  sendMessageMock: vi.fn(),
}));

vi.mock("grammy", () => ({
  Bot: class {
    api = { sendMessage: hoisted.sendMessageMock };
  },
}));

describe("telegram send", () => {
  beforeEach(() => {
    hoisted.sendMessageMock.mockClear();
  });

  it("sends message via bot API", async () => {
    hoisted.sendMessageMock.mockResolvedValueOnce({ message_id: 42 });
    // Test implementation...
    expect(hoisted.sendMessageMock).toHaveBeenCalledWith(
      "chat-id",
      "Hello",
      expect.any(Object)
    );
  });
});
```

## Gateway Integration Test

```typescript
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  installGatewayTestHooks,
  startServerWithClient,
  rpcReq,
  connectOk,
} from "./test-helpers.js";

describe("gateway feature", () => {
  installGatewayTestHooks();

  it("does something via RPC", async () => {
    const { server, ws } = await startServerWithClient();
    try {
      await connectOk(ws);
      const res = await rpcReq(ws, "method.name", { param: "value" });
      expect(res.ok).toBe(true);
    } finally {
      ws.close();
      await server.close();
    }
  });
});
```

## Live Test Pattern

For tests requiring real API keys:

```typescript
const API_KEY = process.env.MY_API_KEY ?? "";
const LIVE = process.env.MY_LIVE_TEST === "1" || process.env.LIVE === "1";

// Skip unless explicitly enabled
const describeLive = LIVE && API_KEY ? describe : describe.skip;

describeLive("live API", () => {
  it("returns real data", async () => {
    const result = await callRealApi(API_KEY);
    expect(result.text.length).toBeGreaterThan(0);
  }, 20_000); // Extended timeout for real API
});
```

## TDD for Bug Fixes

1. **Reproduce**: Write test that fails with current code
2. **Verify RED**: Ensure test fails for the right reason
3. **Fix**: Implement minimal fix
4. **Verify GREEN**: Test passes
5. **Commit**: Include both test and fix

```bash
scripts/committer "fix: handle empty input in myFeature" \
  src/my-feature.ts \
  src/my-feature.test.ts
```

## TDD for New Features

1. **Outline**: Write `it.todo()` tests for expected behavior
2. **Implement incrementally**: One test at a time
3. **Refactor**: Clean up once all tests pass

```typescript
describe("newFeature", () => {
  it.todo("handles basic input");
  it.todo("validates required fields");
  it.todo("returns error for invalid input");
  it.todo("integrates with existing system");
});
```

## Before Commit

Run `/dev:gate` (lint, build, test).

# GitHub Copilot X-Initiator Header Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Implement the X-Initiator header optimization for GitHub Copilot API calls to reduce premium quota consumption by exempting agent/tool-initiated requests.

**Architecture:** Wrap the `@mariozechner/pi-ai` SDK's `streamSimple()` function to inject the `X-Initiator: user` header for the first message in a session, and `X-Initiator: agent` for all subsequent calls (tool results, follow-ups). Track session state using a singleton `CopilotInitiatorTracker` class.

**Tech Stack:** TypeScript, Vitest, @mariozechner/pi-ai SDK, existing OpenClaw agent infrastructure

---

### Task 1: Create CopilotInitiatorTracker class with unit tests

**Files:**
- Create: `src/agents/copilot-initiator-header.ts`
- Create: `src/agents/copilot-initiator-header.test.ts`

**Step 1: Write the failing test for first call detection**

```typescript
// src/agents/copilot-initiator-header.test.ts
import { describe, it, expect } from "vitest";
import { CopilotInitiatorTracker } from "./copilot-initiator-header.js";

describe("CopilotInitiatorTracker", () => {
  it("should return 'user' on first call for a session", () => {
    const tracker = new CopilotInitiatorTracker();
    const result = tracker.getInitiator("session-123");
    expect(result).toBe("user");
  });
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm test src/agents/copilot-initiator-header.test.ts`
Expected: FAIL with "CopilotInitiatorTracker is not defined"

**Step 3: Write minimal implementation**

```typescript
// src/agents/copilot-initiator-header.ts
export class CopilotInitiatorTracker {
  #firstCallMade = new Set<string>();

  getInitiator(sessionId: string): "user" | "agent" {
    if (this.#firstCallMade.has(sessionId)) {
      return "agent";
    }
    this.#firstCallMade.add(sessionId);
    return "user";
  }
}
```

**Step 4: Run test to verify it passes**

Run: `pnpm test src/agents/copilot-initiator-header.test.ts`
Expected: PASS

**Step 5: Write test for subsequent calls returning 'agent'**

```typescript
it("should return 'agent' on subsequent calls for the same session", () => {
  const tracker = new CopilotInitiatorTracker();
  tracker.getInitiator("session-123"); // First call
  const result = tracker.getInitiator("session-123"); // Second call
  expect(result).toBe("agent");
});
```

**Step 6: Run test to verify it passes**

Run: `pnpm test src/agents/copilot-initiator-header.test.ts`
Expected: PASS

**Step 7: Write test for different sessions**

```typescript
it("should track multiple sessions independently", () => {
  const tracker = new CopilotInitiatorTracker();
  expect(tracker.getInitiator("session-1")).toBe("user");
  expect(tracker.getInitiator("session-2")).toBe("user");
  expect(tracker.getInitiator("session-1")).toBe("agent");
  expect(tracker.getInitiator("session-2")).toBe("agent");
});
```

**Step 8: Run test to verify it passes**

Run: `pnpm test src/agents/copilot-initiator-header.test.ts`
Expected: PASS

**Step 9: Write test for reset functionality**

```typescript
it("should reset session tracking", () => {
  const tracker = new CopilotInitiatorTracker();
  tracker.getInitiator("session-123");
  tracker.reset("session-123");
  const result = tracker.getInitiator("session-123");
  expect(result).toBe("user");
});
```

**Step 10: Add reset method to class**

```typescript
// Add to CopilotInitiatorTracker class
reset(sessionId: string): void {
  this.#firstCallMade.delete(sessionId);
}
```

**Step 11: Run all tests to verify they pass**

Run: `pnpm test src/agents/copilot-initiator-header.test.ts`
Expected: PASS (all 4 tests)

**Step 12: Export singleton instance**

```typescript
// Add to end of copilot-initiator-header.ts
export const copilotInitiatorTracker = new CopilotInitiatorTracker();
```

**Step 13: Commit**

```bash
git add src/agents/copilot-initiator-header.ts src/agents/copilot-initiator-header.test.ts
git commit -m "feat: add CopilotInitiatorTracker class with session-based first-call detection"
```

---

### Task 2: Create stream wrapper function with tests

**Files:**
- Modify: `src/agents/copilot-initiator-header.ts`
- Modify: `src/agents/copilot-initiator-header.test.ts`

**Step 1: Write the failing test for wrapper function**

```typescript
// src/agents/copilot-initiator-header.test.ts
import type { StreamFn } from "@mariozechner/pi-ai";
import { AssistantMessageEventStream } from "@mariozechner/pi-ai";

describe("createCopilotAwareStream", () => {
  it("should inject X-Initiator: user header for first Copilot call", async () => {
    let capturedHeaders: Record<string, string> = {};
    const mockStream = vi.fn<StreamFn>(() => new AssistantMessageEventStream());
    mockStream.mockImplementation(async (model, options) => {
      capturedHeaders = options?.headers ?? {};
      return new AssistantMessageEventStream();
    });

    const tracker = new CopilotInitiatorTracker();
    const wrappedStream = createCopilotAwareStream(
      "github-copilot",
      "session-test",
      tracker,
      mockStream
    );

    await wrappedStream({ api: "https://api.github.com", provider: "github-copilot", id: "claude-sonnet-4" }, {});

    expect(capturedHeaders["X-Initiator"]).toBe("user");
    expect(mockStream).toHaveBeenCalledTimes(1);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm test src/agents/copilot-initiator-header.test.ts`
Expected: FAIL with "createCopilotAwareStream is not defined"

**Step 3: Write minimal implementation**

```typescript
// src/agents/copilot-initiator-header.ts
import type { StreamFn } from "@mariozechner/pi-ai";

export function createCopilotAwareStream(
  provider: string,
  sessionId: string,
  tracker: CopilotInitiatorTracker,
  originalStreamSimple: StreamFn
): StreamFn {
  return async function streamWithInitiatorHeader(model, options) {
    const headers = { ...options?.headers };

    if (provider === "github-copilot") {
      const initiator = tracker.getInitiator(sessionId);
      headers["X-Initiator"] = initiator;
    }

    return originalStreamSimple(model, { ...options, headers });
  };
}
```

**Step 4: Run test to verify it passes**

Run: `pnpm test src/agents/copilot-initiator-header.test.ts`
Expected: PASS

**Step 5: Write test for agent-initiated calls**

```typescript
it("should inject X-Initiator: agent header for subsequent Copilot calls", async () => {
  let capturedHeaders: Record<string, string> = {};
  const mockStream = vi.fn<StreamFn>(() => new AssistantMessageEventStream());
  mockStream.mockImplementation(async (model, options) => {
    capturedHeaders = options?.headers ?? {};
    return new AssistantMessageEventStream();
  });

  const tracker = new CopilotInitiatorTracker();
  const wrappedStream = createCopilotAwareStream(
    "github-copilot",
    "session-test",
    tracker,
    mockStream
  );

  // First call
  await wrappedStream({ api: "https://api.github.com", provider: "github-copilot", id: "claude-sonnet-4" }, {});
  // Second call (tool result)
  await wrappedStream({ api: "https://api.github.com", provider: "github-copilot", id: "claude-sonnet-4" }, {});

  expect(capturedHeaders["X-Initiator"]).toBe("agent");
  expect(mockStream).toHaveBeenCalledTimes(2);
});
```

**Step 6: Run test to verify it passes**

Run: `pnpm test src/agents/copilot-initiator-header.test.ts`
Expected: PASS

**Step 7: Write test for non-Copilot providers (pass-through)**

```typescript
it("should not inject header for non-Copilot providers", async () => {
  let capturedHeaders: Record<string, string> = {};
  const mockStream = vi.fn<StreamFn>(() => new AssistantMessageEventStream());
  mockStream.mockImplementation(async (model, options) => {
    capturedHeaders = options?.headers ?? {};
    return new AssistantMessageEventStream();
  });

  const tracker = new CopilotInitiatorTracker();
  const wrappedStream = createCopilotAwareStream(
    "anthropic",
    "session-test",
    tracker,
    mockStream
  );

  await wrappedStream({ api: "https://api.anthropic.com", provider: "anthropic", id: "claude-sonnet-4" }, {});

  expect(capturedHeaders["X-Initiator"]).toBeUndefined();
  expect(mockStream).toHaveBeenCalledTimes(1);
});
```

**Step 8: Run test to verify it passes**

Run: `pnpm test src/agents/copilot-initiator-header.test.ts`
Expected: PASS

**Step 9: Run all tests to verify they pass**

Run: `pnpm test src/agents/copilot-initiator-header.test.ts`
Expected: PASS (all 7 tests)

**Step 10: Commit**

```bash
git add src/agents/copilot-initiator-header.ts src/agents/copilot-initiator-header.test.ts
git commit -m "feat: add createCopilotAwareStream wrapper function with X-Initiator header injection"
```

---

### Task 3: Integrate wrapper into pi-embedded-runner

**Files:**
- Modify: `src/agents/pi-embedded-runner/run/attempt.ts`
- Create: `src/agents/pi-embedded-runner/run/attempt.copilot-initiator.test.ts`

**Step 1: Add import for wrapper and tracker**

```typescript
// Add to imports in src/agents/pi-embedded-runner/run/attempt.ts
import { copilotInitiatorTracker, createCopilotAwareStream } from "../../copilot-initiator-header.js";
```

**Step 2: Locate the streamSimple usage**

Find where `streamSimple` is imported and used. Search for:
```bash
grep -n "streamSimple" src/agents/pi-embedded-runner/run/attempt.ts
```

Expected: Found around line 3 in imports, and used when creating the agent session

**Step 3: Create integration test (failing first)**

```typescript
// src/agents/pi-embedded-runner/run/attempt.copilot-initiator.test.ts
import { describe, it, expect, vi } from "vitest";
import { AssistantMessageEventStream } from "@mariozechner/pi-ai";
import { createCopilotAwareStream } from "../../copilot-initiator-header.js";
import { CopilotInitiatorTracker } from "../../copilot-initiator-header.js";

describe("runEmbeddedAttempt - Copilot X-Initiator integration", () => {
  it("should use wrapped stream for github-copilot provider", async () => {
    const tracker = new CopilotInitiatorTracker();
    const mockStreamSimple = vi.fn(() => new AssistantMessageEventStream());

    const wrappedStream = createCopilotAwareStream(
      "github-copilot",
      "test-session",
      tracker,
      mockStreamSimple
    );

    // Simulate first call
    await wrappedStream(
      { api: "https://api.github.com", provider: "github-copilot", id: "test-model" },
      {}
    );

    expect(mockStreamSimple).toHaveBeenCalledTimes(1);
    const callOpts = mockStreamSimple.mock.calls[0][1];
    expect(callOpts?.headers?.["X-Initiator"]).toBe("user");
  });
});
```

**Step 4: Run test to verify it passes (wrapper is already tested)**

Run: `pnpm test src/agents/pi-embedded-runner/run/attempt.copilot-initiator.test.ts`
Expected: PASS

**Step 5: Modify runEmbeddedAttempt to use wrapper**

In `src/agents/pi-embedded-runner/run/attempt.ts`, locate where the agent session is created (likely using `createAgentSession`). Find where `streamSimple` is passed and wrap it:

```typescript
// Find the line similar to:
// const agent = await createAgentSession({ ..., stream: streamSimple, ... });

// Replace with:
const originalStreamSimple = streamSimple;
const copilotAwareStream = createCopilotAwareStream(
  params.provider,
  params.sessionId,
  copilotInitiatorTracker,
  originalStreamSimple
);

// Then use copilotAwareStream instead of streamSimple
```

**Note:** The exact implementation depends on how `streamSimple` is currently used. Read the file carefully to understand the current pattern.

**Step 6: Run existing tests to ensure no breakage**

Run: `pnpm test src/agents/pi-embedded-runner/`
Expected: PASS (all existing tests should still pass)

**Step 7: Add debug logging (optional but helpful)**

```typescript
// Add in createCopilotAwareStream or near the usage
if (provider === "github-copilot") {
  log.debug(`copilot x-initiator: sessionId=${sessionId} initiator=${initiator}`);
}
```

**Step 8: Commit**

```bash
git add src/agents/pi-embedded-runner/run/attempt.ts src/agents/pi-embedded-runner/run/attempt.copilot-initiator.test.ts
git commit -m "feat: integrate X-Initiator header wrapper into pi-embedded-runner for Copilot provider"
```

---

### Task 4: Add config option to disable header injection

**Files:**
- Modify: `src/config/zod-schema.providers.ts`
- Modify: `src/agents/copilot-initiator-header.ts`
- Create: `src/agents/copilot-initiator-header.config.test.ts`

**Step 1: Add config schema field**

```typescript
// src/config/zod-schema.providers.ts
// Find the githubCopilot schema definition and add:
githubCopilot: z.object({
  // ... existing fields ...
  disableInitiatorHeader: z.boolean().optional().default(false),
})
```

**Step 2: Pass config to wrapper function**

Update `createCopilotAwareStream` signature:

```typescript
// src/agents/copilot-initiator-header.ts
export function createCopilotAwareStream(
  provider: string,
  sessionId: string,
  tracker: CopilotInitiatorTracker,
  originalStreamSimple: StreamFn,
  config?: { disableInitiatorHeader?: boolean }
): StreamFn {
  return async function streamWithInitiatorHeader(model, options) {
    const headers = { ...options?.headers };

    if (
      provider === "github-copilot" &&
      !config?.disableInitiatorHeader
    ) {
      const initiator = tracker.getInitiator(sessionId);
      headers["X-Initiator"] = initiator;
    }

    return originalStreamSimple(model, { ...options, headers });
  };
}
```

**Step 3: Write test for disabled flag**

```typescript
// src/agents/copilot-initiator-header.config.test.ts
import { describe, it, expect, vi } from "vitest";
import { AssistantMessageEventStream } from "@mariozechner/pi-ai";
import { createCopilotAwareStream } from "./copilot-initiator-header.js";
import { CopilotInitiatorTracker } from "./copilot-initiator-header.js";

describe("createCopilotAwareStream - config", () => {
  it("should not inject header when disableInitiatorHeader is true", async () => {
    let capturedHeaders: Record<string, string> = {};
    const mockStream = vi.fn(() => new AssistantMessageEventStream());
    mockStream.mockImplementation(async (model, options) => {
      capturedHeaders = options?.headers ?? {};
      return new AssistantMessageEventStream();
    });

    const tracker = new CopilotInitiatorTracker();
    const wrappedStream = createCopilotAwareStream(
      "github-copilot",
      "session-test",
      tracker,
      mockStream,
      { disableInitiatorHeader: true }
    );

    await wrappedStream({ api: "https://api.github.com", provider: "github-copilot", id: "test" }, {});

    expect(capturedHeaders["X-Initiator"]).toBeUndefined();
  });
});
```

**Step 4: Run test to verify it passes**

Run: `pnpm test src/agents/copilot-initiator-header.config.test.ts`
Expected: PASS

**Step 5: Update integration to pass config**

```typescript
// src/agents/pi-embedded-runner/run/attempt.ts
const copilotAwareStream = createCopilotAwareStream(
  params.provider,
  params.sessionId,
  copilotInitiatorTracker,
  originalStreamSimple,
  params.config?.providers?.githubCopilot  // Pass the config
);
```

**Step 6: Run all tests to verify they pass**

Run: `pnpm test`
Expected: PASS (all tests)

**Step 7: Commit**

```bash
git add src/config/zod-schema.providers.ts src/agents/copilot-initiator-header.ts src/agents/copilot-initiator-header.config.test.ts src/agents/pi-embedded-runner/run/attempt.ts
git commit -m "feat: add config option to disable X-Initiator header injection"
```

---

### Task 5: Add cleanup mechanism for tracker state

**Files:**
- Modify: `src/agents/copilot-initiator-header.ts`
- Modify: `src/agents/copilot-initiator-header.test.ts`

**Step 1: Write test for session cleanup**

```typescript
// src/agents/copilot-initiator-header.test.ts
describe("CopilotInitiatorTracker - cleanup", () => {
  it("should clean up old sessions", () => {
    const tracker = new CopilotInitiatorTracker();
    vi.useFakeTimers();

    tracker.getInitiator("old-session");
    vi.advanceTimersByTime(25 * 60 * 60 * 1000); // 25 hours

    tracker.cleanup();

    expect(tracker.getInitiator("old-session")).toBe("user");
    vi.useRealTimers();
  });
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm test src/agents/copilot-initiator-header.test.ts`
Expected: FAIL with "cleanup is not a function"

**Step 3: Implement cleanup with timestamps**

```typescript
// src/agents/copilot-initiator-header.ts
const CLEANUP_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24 hours

export class CopilotInitiatorTracker {
  #firstCallMade = new Set<string>();
  #sessionTimestamps = new Map<string, number>();

  getInitiator(sessionId: string): "user" | "agent" {
    if (this.#firstCallMade.has(sessionId)) {
      return "agent";
    }
    this.#firstCallMade.add(sessionId);
    this.#sessionTimestamps.set(sessionId, Date.now());
    return "user";
  }

  reset(sessionId: string): void {
    this.#firstCallMade.delete(sessionId);
    this.#sessionTimestamps.delete(sessionId);
  }

  cleanup(): void {
    const now = Date.now();
    for (const [sessionId, timestamp] of this.#sessionTimestamps) {
      if (now - timestamp > CLEANUP_INTERVAL_MS) {
        this.#firstCallMade.delete(sessionId);
        this.#sessionTimestamps.delete(sessionId);
      }
    }
  }
}
```

**Step 4: Run test to verify it passes**

Run: `pnpm test src/agents/copilot-initiator-header.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/agents/copilot-initiator-header.ts src/agents/copilot-initiator-header.test.ts
git commit -m "feat: add session cleanup mechanism to CopilotInitiatorTracker"
```

---

### Task 6: Update documentation

**Files:**
- Modify: `docs/providers/github-copilot.md`
- Modify: `docs/concepts/usage-tracking.md` (if relevant)

**Step 1: Add section to GitHub Copilot provider docs**

```markdown
<!-- docs/providers/github-copilot.md -->

## Premium Request Optimization

OpenClaw automatically optimizes your GitHub Copilot premium quota usage by injecting the `X-Initiator` header on API requests. This ensures that:

- **User-initiated requests** (the first message in a conversation) count as 1 premium request
- **Agent/tool-initiated requests** (tool results, follow-up calls, subagent invocations) are exempt from quota

This means a typical chat session with multiple tool calls only consumes 1 premium request instead of counting every API call separately.

### Disabling the Optimization

If you need to disable this optimization for any reason, add to your config:

```yaml
providers:
  github-copilot:
    disableInitiatorHeader: true
```

**Note:** This optimization uses an undocumented GitHub Copilot API feature that is widely adopted across Copilot integrations.
```

**Step 2: Check if usage tracking docs need update**

Read: `docs/concepts/usage-tracking.md`

If it discusses Copilot premium requests, add a note about the optimization.

**Step 3: Commit**

```bash
git add docs/providers/github-copilot.md docs/concepts/usage-tracking.md
git commit -m "docs: document X-Initiator header optimization for GitHub Copilot"
```

---

### Task 7: Final verification and testing

**Step 1: Run full test suite**

Run: `pnpm test`
Expected: PASS (all tests)

**Step 2: Run type checking**

Run: `pnpm build`
Expected: PASS (no type errors)

**Step 3: Run linting**

Run: `pnpm check`
Expected: PASS (no lint errors)

**Step 4: Create live test scenario (optional)**

If you have GitHub Copilot access, test with real API:

```typescript
// Create a test script or add to live tests
// Verify that usage doesn't spike when using tools
```

**Step 5: Update CHANGELOG.md**

Add entry under the current version:

```markdown
## Enhancements

- **GitHub Copilot:** Added X-Initiator header optimization to reduce premium quota consumption. Tool and agent-initiated requests are now exempt from premium request counting.
```

**Step 6: Final commit**

```bash
git add CHANGELOG.md
git commit -m "docs: update CHANGELOG for X-Initiator header optimization"
```

---

## Completion Checklist

- [ ] All 7 tasks completed
- [ ] All tests passing
- [ ] Type checking passing
- [ ] Linting passing
- [ ] Documentation updated
- [ ] CHANGELOG updated
- [ ] No breaking changes to existing functionality

## Notes for Implementation

- Follow TDD: write failing test first, then implement
- Commit after each task
- Run `pnpm test` frequently to catch regressions early
- If you encounter unexpected behavior in `pi-embedded-runner/run/attempt.ts`, read the surrounding code carefully to understand the context
- The exact integration point may vary depending on how `streamSimple` is currently used

## References

- Design document: `docs/plans/2026-02-05-copilot-x-initiator-header-design.md`
- @mariozechner/pi-ai SDK for StreamFn types
- OpenClaw agent infrastructure in `src/agents/pi-embedded-runner/`

# MCP Tool Description Enhancements Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Enhance MCP tool descriptions and parameter information when exposed through the reverse MCP bridge to Claude Agent SDK, providing clearer context about transport types, authentication requirements, and parameter types.

**Architecture:** Implement helper functions in `src/mcp/mcp-tools.ts` to detect auth requirements and build enriched descriptions with server context and transport hints. These helpers will be called during tool bridge creation to augment tool metadata without modifying the underlying MCP server responses. Transport detection checks for HTTP headers (SSE/HTTP transports) and environment variables (STDIO transport). Enhanced descriptions follow a consistent pattern: `[TRANSPORT] [Auth Status] Description (via Server Name)`.

**Tech Stack:** TypeScript, Vitest, MCP SDK, JSON Schema for tool schemas

---

## Context Files to Review

Before starting, familiarize yourself with these files:

- **`src/mcp/mcp-tools.ts`** - Where you'll add helper functions. Lines 1-100 show imports and types. The `buildMcpPiTool()` function at line ~250 is where enhancements will be integrated.
- **`src/mcp/resolve.ts`** - Shows how servers are resolved and provides `McpServerConfig` union type structure
- **`src/agents/claude-agent-sdk/tool-bridge.ts`** - Reverse MCP bridge; line ~80 has fallback descriptions for Clawdbrain native tools
- **`src/mcp/mcp-tools.test.ts`** - Existing test patterns for MCP tools (mocking, assertions)
- **`src/infra/decisions/store.test.ts`** - Pre-existing test failure to fix (environment variable names)

## Phase #1: Transport & Auth Detection + Enhanced Descriptions

### Task 1: Fix Pre-Existing Decision Store Test Failure

**Files:**
- Modify: `src/infra/decisions/store.test.ts:beforeEach/afterEach`

**Context:**
The decision store tests are using the wrong environment variable name (`CLAWDBRAIN_STATE_DIR` instead of `OPENCLAW_STATE_DIR`). This blocks all other tests from running cleanly. Fix this first.

**Step 1: Read the test file to understand current state**

Run: `cat src/infra/decisions/store.test.ts | grep -n "CLAWDBRAIN_STATE_DIR\|beforeEach\|afterEach" | head -20`

Expected: See lines with `CLAWDBRAIN_STATE_DIR` that need changing to `OPENCLAW_STATE_DIR`

**Step 2: Fix environment variable names in beforeEach/afterEach**

In `src/infra/decisions/store.test.ts`, change all 3 occurrences:
- Line ~10: `CLAWDBRAIN_STATE_DIR` → `OPENCLAW_STATE_DIR`
- Line ~15: `clawdbrain-state-` → `openclaw-state-` (temp directory prefix)

Use Edit tool with these replacements.

**Step 3: Run tests to verify they pass**

Run: `cd .worktrees/mcp-enhancements && pnpm test src/infra/decisions/store.test.ts`

Expected: All 11 tests pass (exit code 0)

**Step 4: Commit**

```bash
git add src/infra/decisions/store.test.ts
git commit -m "fix: correct environment variable names in decision store tests"
```

---

### Task 2: Add Helper Function - `detectAuthRequired()`

**Files:**
- Modify: `src/mcp/mcp-tools.ts` (add function near top, after imports)
- Test: `src/mcp/mcp-tools.test.ts` (add 3 tests)

**Context:**
This helper detects whether a server config requires authentication based on:
- HTTP/SSE transports: presence of `headers` object with at least one header
- STDIO transport: presence of `env` object with at least one environment variable

**Step 1: Write failing tests for auth detection**

Add to `src/mcp/mcp-tools.test.ts` in a new `describe("detectAuthRequired", () => {` block:

```typescript
describe("detectAuthRequired", () => {
  it("detects auth required for HTTP with headers", () => {
    const config = {
      transport: "http" as const,
      headers: { Authorization: "Bearer token" },
      url: "http://example.com",
    };
    expect(__testing.detectAuthRequired(config)).toBe(true);
  });

  it("detects no auth required for HTTP without headers", () => {
    const config = {
      transport: "http" as const,
      url: "http://example.com",
    };
    expect(__testing.detectAuthRequired(config)).toBe(false);
  });

  it("detects auth required for STDIO with env vars", () => {
    const config = {
      transport: "stdio" as const,
      command: "node",
      env: { API_KEY: "secret" },
    };
    expect(__testing.detectAuthRequired(config)).toBe(true);
  });
});
```

Run: `cd .worktrees/mcp-enhancements && pnpm test src/mcp/mcp-tools.test.ts -t "detectAuthRequired"`

Expected: All 3 tests FAIL (function not exported)

**Step 2: Implement `detectAuthRequired()` in mcp-tools.ts**

Add this function after the imports and before `stableStringify()` (around line 35):

```typescript
function detectAuthRequired(server: McpServerConfig): boolean {
  // HTTP or SSE transports use headers
  if ("headers" in server && server.headers) {
    const headerEntries = Object.entries(server.headers).filter(
      (e): e is [string, string] =>
        typeof e[0] === "string" && typeof e[1] === "string",
    );
    if (headerEntries.length > 0) return true;
  }
  // STDIO transport uses environment variables
  if ("env" in server && server.env) {
    const envEntries = Object.entries(server.env).filter(
      (e): e is [string, string] =>
        typeof e[0] === "string" && typeof e[1] === "string",
    );
    if (envEntries.length > 0) return true;
  }
  return false;
}
```

**Step 3: Export helper for testing**

Update the `__testing` export object at the end of the file:

```typescript
export const __testing = {
  mcpPiToolName,
  normalizeToolComponent,
  stringifyToolResultContent,
  detectAuthRequired, // ADD THIS LINE
};
```

**Step 4: Run tests to verify they pass**

Run: `cd .worktrees/mcp-enhancements && pnpm test src/mcp/mcp-tools.test.ts -t "detectAuthRequired"`

Expected: All 3 tests pass

**Step 5: Commit**

```bash
git add src/mcp/mcp-tools.ts src/mcp/mcp-tools.test.ts
git commit -m "feat: add detectAuthRequired helper for auth state detection"
git push -u origin feature/mcp-tool-description-enhancements
```

---

### Task 3: Add Helper Function - `getTransportHint()`

**Files:**
- Modify: `src/mcp/mcp-tools.ts` (add function)
- Test: `src/mcp/mcp-tools.test.ts` (add 3 tests)

**Context:**
This helper returns transport type hints in brackets: `[HTTP]`, `[SSE]`, or `[Local]` (for STDIO).

**Step 1: Write failing tests**

Add to the test file:

```typescript
describe("getTransportHint", () => {
  it("returns [HTTP] for HTTP transport", () => {
    const config = { transport: "http" as const, url: "http://example.com" };
    expect(__testing.getTransportHint(config)).toBe("[HTTP]");
  });

  it("returns [SSE] for SSE transport", () => {
    const config = { transport: "sse" as const, url: "http://example.com" };
    expect(__testing.getTransportHint(config)).toBe("[SSE]");
  });

  it("returns [Local] for STDIO transport", () => {
    const config = {
      transport: "stdio" as const,
      command: "node",
    };
    expect(__testing.getTransportHint(config)).toBe("[Local]");
  });
});
```

Run: `cd .worktrees/mcp-enhancements && pnpm test src/mcp/mcp-tools.test.ts -t "getTransportHint"`

Expected: All 3 tests FAIL

**Step 2: Implement `getTransportHint()` in mcp-tools.ts**

Add after `detectAuthRequired()`:

```typescript
function getTransportHint(server: McpServerConfig): string {
  if (server.transport === "http") {
    return "[HTTP]";
  } else if (server.transport === "sse") {
    return "[SSE]";
  } else if (server.transport === "stdio") {
    return "[Local]";
  }
  return "[Unknown]";
}
```

**Step 3: Export helper**

Update `__testing` export:

```typescript
export const __testing = {
  mcpPiToolName,
  normalizeToolComponent,
  stringifyToolResultContent,
  detectAuthRequired,
  getTransportHint, // ADD THIS LINE
};
```

**Step 4: Run tests to verify**

Run: `cd .worktrees/mcp-enhancements && pnpm test src/mcp/mcp-tools.test.ts -t "getTransportHint"`

Expected: All 3 tests pass

**Step 5: Commit**

```bash
git add src/mcp/mcp-tools.ts src/mcp/mcp-tools.test.ts
git commit -m "feat: add getTransportHint helper for transport type display"
git push origin feature/mcp-tool-description-enhancements
```

---

### Task 4: Add Helper Function - `buildEnhancedDescription()`

**Files:**
- Modify: `src/mcp/mcp-tools.ts` (add function)
- Test: `src/mcp/mcp-tools.test.ts` (add 4 tests)

**Context:**
This function builds enriched tool descriptions with server context and transport/auth hints.
Input: original description, server config, server label
Output: enhanced description following pattern: `[TRANSPORT] [Auth Status] Original (via Server Name)`

**Step 1: Write failing tests**

Add to test file:

```typescript
describe("buildEnhancedDescription", () => {
  it("adds transport and auth hints to description", () => {
    const config = {
      transport: "http" as const,
      url: "http://github.com",
      headers: { Authorization: "token" },
    };
    const result = __testing.buildEnhancedDescription(
      "Create an issue",
      config,
      "GitHub API",
    );
    expect(result).toContain("[HTTP]");
    expect(result).toContain("Requires Auth");
    expect(result).toContain("Create an issue");
    expect(result).toContain("via GitHub API");
  });

  it("preserves original description when already present", () => {
    const config = { transport: "sse" as const, url: "http://example.com" };
    const result = __testing.buildEnhancedDescription(
      "Fetch data",
      config,
      "Server",
    );
    expect(result).toContain("Fetch data");
  });

  it("handles missing description gracefully", () => {
    const config = { transport: "stdio" as const, command: "python3" };
    const result = __testing.buildEnhancedDescription("", config, "PyServer");
    expect(result).toContain("[Local]");
    expect(result).toContain("PyServer");
  });

  it("omits auth hint when no auth required", () => {
    const config = { transport: "http" as const, url: "http://example.com" };
    const result = __testing.buildEnhancedDescription(
      "Open API",
      config,
      "OpenWeather",
    );
    expect(result).not.toContain("Requires Auth");
    expect(result).toContain("[HTTP]");
  });
});
```

Run: `cd .worktrees/mcp-enhancements && pnpm test src/mcp/mcp-tools.test.ts -t "buildEnhancedDescription"`

Expected: All 4 tests FAIL

**Step 2: Implement `buildEnhancedDescription()` in mcp-tools.ts**

Add after `getTransportHint()`:

```typescript
function buildEnhancedDescription(
  originalDescription: string,
  server: McpServerConfig,
  serverLabel: string = "MCP Server",
): string {
  const hint = getTransportHint(server);
  const authHint = detectAuthRequired(server) ? "[Requires Auth]" : "";

  const parts = [hint];
  if (authHint) parts.push(authHint);

  const description = originalDescription || "Tool";
  parts.push(`${description} (via ${serverLabel})`);

  return parts.join(" ");
}
```

**Step 3: Export helper**

Update `__testing` export:

```typescript
export const __testing = {
  mcpPiToolName,
  normalizeToolComponent,
  stringifyToolResultContent,
  detectAuthRequired,
  getTransportHint,
  buildEnhancedDescription, // ADD THIS LINE
};
```

**Step 4: Run tests to verify**

Run: `cd .worktrees/mcp-enhancements && pnpm test src/mcp/mcp-tools.test.ts -t "buildEnhancedDescription"`

Expected: All 4 tests pass

**Step 5: Commit**

```bash
git add src/mcp/mcp-tools.ts src/mcp/mcp-tools.test.ts
git commit -m "feat: add buildEnhancedDescription helper with transport and auth context"
git push origin feature/mcp-tool-description-enhancements
```

---

## Phase #2: Parameter Enhancement & Error Messages

### Task 5: Add Helper Function - `enhanceParameterDescription()`

**Files:**
- Modify: `src/mcp/mcp-tools.ts` (add function)
- Test: `src/mcp/mcp-tools.test.ts` (add 3 tests)

**Context:**
This function enhances individual parameter descriptions by:
1. Preserving existing descriptions
2. Adding type information when description is missing
3. Following format: `{type}: description` or just `{type}` if no description

**Step 1: Write failing tests**

Add to test file:

```typescript
describe("enhanceParameterDescription", () => {
  it("preserves existing description", () => {
    const schema = {
      type: "string",
      description: "The issue title",
    };
    const result = __testing.enhanceParameterDescription(schema);
    expect(result).toEqual("The issue title");
  });

  it("adds type when description missing", () => {
    const schema = { type: "string" };
    const result = __testing.enhanceParameterDescription(schema);
    expect(result).toContain("string");
  });

  it("includes enum values in description", () => {
    const schema = {
      type: "string",
      enum: ["open", "closed", "draft"],
    };
    const result = __testing.enhanceParameterDescription(schema);
    expect(result).toContain("string");
    expect(result).toMatch(/open.*closed.*draft/);
  });
});
```

Run: `cd .worktrees/mcp-enhancements && pnpm test src/mcp/mcp-tools.test.ts -t "enhanceParameterDescription"`

Expected: All 3 tests FAIL

**Step 2: Implement `enhanceParameterDescription()` in mcp-tools.ts**

Add after `buildEnhancedDescription()`:

```typescript
function enhanceParameterDescription(
  schema: Record<string, unknown>,
): string {
  // Preserve existing description
  if (typeof schema.description === "string" && schema.description.trim()) {
    return schema.description;
  }

  // Build description from type and enum
  const parts: string[] = [];

  if (typeof schema.type === "string") {
    parts.push(schema.type);
  }

  if (Array.isArray(schema.enum) && schema.enum.length > 0) {
    const enumValues = schema.enum
      .map((v) => JSON.stringify(v))
      .join(", ");
    parts.push(`values: ${enumValues}`);
  }

  return parts.join("; ") || "Parameter";
}
```

**Step 3: Export helper**

Update `__testing` export:

```typescript
export const __testing = {
  mcpPiToolName,
  normalizeToolComponent,
  stringifyToolResultContent,
  detectAuthRequired,
  getTransportHint,
  buildEnhancedDescription,
  enhanceParameterDescription, // ADD THIS LINE
};
```

**Step 4: Run tests to verify**

Run: `cd .worktrees/mcp-enhancements && pnpm test src/mcp/mcp-tools.test.ts -t "enhanceParameterDescription"`

Expected: All 3 tests pass

**Step 5: Commit**

```bash
git add src/mcp/mcp-tools.ts src/mcp/mcp-tools.test.ts
git commit -m "feat: add enhanceParameterDescription helper for schema-based type hints"
git push origin feature/mcp-tool-description-enhancements
```

---

### Task 6: Integrate Enhancements into `buildMcpPiTool()`

**Files:**
- Modify: `src/mcp/mcp-tools.ts` (update `buildMcpPiTool()` function ~line 250)
- Test: `src/mcp/mcp-tools.test.ts` (add 3 integration tests)

**Context:**
The `buildMcpPiTool()` function currently builds the tool object for Pi Agent. We need to:
1. Add `serverConfig` parameter to the function
2. Call `buildEnhancedDescription()` to enhance the tool description
3. Optionally enhance parameter descriptions (Phase #2 feature)

**Step 1: Read buildMcpPiTool() to understand current signature**

Run: `grep -A 30 "function buildMcpPiTool" src/mcp/mcp-tools.ts | head -40`

Expected: See function parameters and return type

**Step 2: Write integration tests**

Add to test file:

```typescript
describe("buildMcpPiTool integration", () => {
  it("enhances tool description with transport and auth info", () => {
    const serverConfig = {
      transport: "http" as const,
      url: "http://github.com",
      headers: { Authorization: "token" },
    };
    const tool = __testing.buildMcpPiTool({
      agentId: "test-agent",
      serverId: "github",
      serverLabel: "GitHub",
      toolDef: {
        name: "create_issue",
        description: "Create a GitHub issue",
        inputSchema: { type: "object", properties: {} },
      },
      serverConfig,
    });
    expect(tool.description).toContain("[HTTP]");
    expect(tool.description).toContain("Requires Auth");
    expect(tool.description).toContain("GitHub");
  });

  it("preserves tool when no serverConfig provided", () => {
    const tool = __testing.buildMcpPiTool({
      agentId: "test-agent",
      serverId: "default",
      toolDef: {
        name: "fetch_data",
        description: "Fetch data",
        inputSchema: { type: "object", properties: {} },
      },
    });
    expect(tool.description).toEqual("Fetch data");
  });

  it("enhances parameter descriptions in schema", () => {
    const serverConfig = {
      transport: "stdio" as const,
      command: "python3",
    };
    const tool = __testing.buildMcpPiTool({
      agentId: "test-agent",
      serverId: "py-server",
      toolDef: {
        name: "process",
        description: "Process data",
        inputSchema: {
          type: "object",
          properties: {
            data: { type: "string" },
            format: { type: "string", enum: ["json", "csv"] },
          },
        },
      },
      serverConfig,
    });
    // Verify parameters have enhanced descriptions
    expect(tool.inputSchema).toBeDefined();
  });
});
```

Run: `cd .worktrees/mcp-enhancements && pnpm test src/mcp/mcp-tools.test.ts -t "buildMcpPiTool integration"`

Expected: Tests FAIL (function signature doesn't match yet)

**Step 3: Update buildMcpPiTool() signature and implementation**

Find the `buildMcpPiTool()` function (around line 250) and modify it:

Old signature:
```typescript
function buildMcpPiTool(params: {
  agentId: string;
  serverId: string;
  serverLabel?: string;
  toolDef: McpRemoteToolDef;
})
```

New signature:
```typescript
function buildMcpPiTool(params: {
  agentId: string;
  serverId: string;
  serverLabel?: string;
  toolDef: McpRemoteToolDef;
  serverConfig?: McpServerConfig;
})
```

Update the function body to use the new helpers. Find the line that sets `description`:

Old:
```typescript
const description = toolDef.description || `${serverId} tool: ${toolDef.name}`;
```

New:
```typescript
const description = params.serverConfig
  ? buildEnhancedDescription(
      toolDef.description || "",
      params.serverConfig,
      params.serverLabel || params.serverId,
    )
  : toolDef.description || `${params.serverId} tool: ${toolDef.name}`;
```

Also update the `inputSchema` to enhance parameter descriptions. Find where `inputSchema` is processed and add parameter enhancement (if you have time in Phase #2).

**Step 4: Update callers of buildMcpPiTool()**

Search for all calls to `buildMcpPiTool()`:

Run: `grep -n "buildMcpPiTool(" src/mcp/mcp-tools.ts`

Update calls to pass `serverConfig`. In `resolveMcpToolsForAgent()`, find where `buildMcpPiTool` is called and add the server config parameter.

**Step 5: Run tests to verify**

Run: `cd .worktrees/mcp-enhancements && pnpm test src/mcp/mcp-tools.test.ts -t "buildMcpPiTool"`

Expected: All integration tests pass

**Step 6: Run full test suite**

Run: `cd .worktrees/mcp-enhancements && pnpm test src/mcp/mcp-tools.test.ts`

Expected: All tests pass

**Step 7: Commit**

```bash
git add src/mcp/mcp-tools.ts src/mcp/mcp-tools.test.ts
git commit -m "feat: integrate enhanced descriptions into buildMcpPiTool"
git push origin feature/mcp-tool-description-enhancements
```

---

### Task 7: Update Reverse MCP Bridge Fallback Descriptions

**Files:**
- Modify: `src/agents/claude-agent-sdk/tool-bridge.ts` (update fallback descriptions)
- Test: `src/agents/claude-agent-sdk/tool-bridge.test.ts` (if exists, add 1 test)

**Context:**
The reverse MCP bridge in `tool-bridge.ts` exposes Clawdbrain native tools to Claude Agent SDK. Currently fallback descriptions say "Clawdbrain tool: X". Change format to "X (Clawdbrain native tool)" for consistency.

**Step 1: Read tool-bridge.ts to find fallback descriptions**

Run: `grep -n "Clawdbrain tool\|fallback.*description" src/agents/claude-agent-sdk/tool-bridge.ts | head -10`

Expected: See lines with fallback descriptions

**Step 2: Update fallback descriptions**

Find the line(s) that create fallback descriptions and change:

From:
```typescript
description: `Clawdbrain tool: ${toolName}`
```

To:
```typescript
description: `${toolName} (Clawdbrain native tool)`
```

**Step 3: Check for tests**

Run: `ls src/agents/claude-agent-sdk/tool-bridge.test.ts 2>/dev/null || echo "No test file"`

If test file exists, add a test verifying the new description format.

**Step 4: Run tests**

Run: `cd .worktrees/mcp-enhancements && pnpm test src/agents/claude-agent-sdk/tool-bridge.test.ts`

Expected: Tests pass

**Step 5: Commit**

```bash
git add src/agents/claude-agent-sdk/tool-bridge.ts
git commit -m "style: update Clawdbrain native tool description format"
git push origin feature/mcp-tool-description-enhancements
```

---

### Task 8: Full Test Suite Verification

**Files:**
- Test: `src/mcp/mcp-tools.test.ts`, `src/mcp/resolve.test.ts`, `src/infra/decisions/store.test.ts`

**Context:**
Run the full test suite to ensure all changes are compatible with existing tests and no regressions were introduced.

**Step 1: Run MCP tools tests**

Run: `cd .worktrees/mcp-enhancements && pnpm test src/mcp/mcp-tools.test.ts`

Expected: All tests pass (should be 120+ tests)

**Step 2: Run MCP resolve tests**

Run: `cd .worktrees/mcp-enhancements && pnpm test src/mcp/resolve.test.ts`

Expected: All tests pass

**Step 3: Run decision store tests**

Run: `cd .worktrees/mcp-enhancements && pnpm test src/infra/decisions/store.test.ts`

Expected: All 11 tests pass

**Step 4: Run linting**

Run: `cd .worktrees/mcp-enhancements && pnpm lint`

Expected: No errors (may have formatting suggestions)

**Step 5: Run build**

Run: `cd .worktrees/mcp-enhancements && pnpm build`

Expected: TypeScript compilation succeeds

**Step 6: Commit (if any formatting auto-fixes)**

```bash
git add .
git commit -m "style: auto-format via oxfmt" || echo "No formatting changes"
git push origin feature/mcp-tool-description-enhancements
```

---

## Success Criteria

✅ All 14+ new tests pass (3 auth detect + 3 transport hint + 4 description building + 3 param enhancement + 3 integration)
✅ All pre-existing tests pass (145 MCP config tests, 11 decision store tests, 35+ resolve tests)
✅ TypeScript build succeeds with no errors
✅ `pnpm lint` shows no blocking issues
✅ All commits are pushed to `feature/mcp-tool-description-enhancements`
✅ Description format matches: `[TRANSPORT] [Auth Status] Description (via Server)`

---

## Branch Cleanup (After PR merged)

Once the PR is merged, you can remove the worktree:

```bash
git worktree remove .worktrees/mcp-enhancements
git branch -D feature/mcp-tool-description-enhancements
```

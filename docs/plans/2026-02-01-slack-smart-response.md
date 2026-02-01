# Slack Smart Response Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Enable Slack agents to autonomously decide whether to respond to messages based on relevance, like a helpful team member would.

**Architecture:** Add a new `responseMode: "auto"` option that runs a fast pre-check model to evaluate message relevance before invoking the main agent. Non-relevant messages are stored in a context buffer for deferred awareness. All responses go to threads via existing `replyToMode: "all"`.

**Tech Stack:** TypeScript, existing `runEmbeddedPiAgent` infrastructure, Slack Bolt API

---

## Task 1: Add ResponseMode Type

**Files:**
- Modify: `src/config/types.base.ts`

**Step 1: Add the new type definition**

Add after line 7 (after `ReplyToMode`):

```typescript
export type ResponseMode = "mention" | "auto" | "all";
```

**Step 2: Commit**

```bash
scripts/committer "config: add ResponseMode type for smart channel responses" src/config/types.base.ts
```

---

## Task 2: Add Slack Config Options

**Files:**
- Modify: `src/config/types.slack.ts`

**Step 1: Add responseMode and relevanceModel to SlackAccountConfig**

Add after `requireMention?: boolean;` (around line 105):

```typescript
  /**
   * Controls how channel messages are handled:
   * - "mention": require @mention to respond (default)
   * - "auto": fast model pre-check decides relevance
   * - "all": respond to everything
   */
  responseMode?: ResponseMode;
  /**
   * Model for relevance pre-check in "auto" mode.
   * - "auto": use smaller model from same provider as main agent
   * - specific model ID: e.g. "anthropic/claude-3-haiku-20240307"
   */
  relevanceModel?: "auto" | string;
```

**Step 2: Add responseMode to SlackChannelConfig**

Add after `requireMention?: boolean;` (around line 33):

```typescript
  /** Response mode override for this channel. */
  responseMode?: ResponseMode;
```

**Step 3: Add import for ResponseMode**

Add to imports at top:

```typescript
import type {
  BlockStreamingCoalesceConfig,
  DmPolicy,
  GroupPolicy,
  MarkdownConfig,
  ReplyToMode,
  ResponseMode,
} from "./types.base.js";
```

**Step 4: Commit**

```bash
scripts/committer "config: add responseMode and relevanceModel to Slack config" src/config/types.slack.ts
```

---

## Task 3: Add Zod Schema Validation

**Files:**
- Modify: `src/config/zod-schema.providers-core.ts`

**Step 1: Add ResponseModeSchema**

Add after `ReplyToModeSchema` definition (around line 20):

```typescript
export const ResponseModeSchema = z.enum(["mention", "auto", "all"]);
```

**Step 2: Add to SlackChannelSchema**

In `SlackChannelSchema` (around line 380), add after `requireMention`:

```typescript
    responseMode: ResponseModeSchema.optional(),
```

**Step 3: Add to SlackAccountSchema**

In the Slack account schema (around line 424), add after `requireMention`:

```typescript
    responseMode: ResponseModeSchema.optional(),
    relevanceModel: z.union([z.literal("auto"), z.string()]).optional(),
```

**Step 4: Commit**

```bash
scripts/committer "config: add zod schema for responseMode and relevanceModel" src/config/zod-schema.providers-core.ts
```

---

## Task 4: Create Relevance Checker Module

**Files:**
- Create: `src/slack/monitor/relevance-check.ts`
- Create: `src/slack/monitor/relevance-check.test.ts`

**Step 1: Write the failing test**

```typescript
import { describe, it, expect, vi } from "vitest";
import { checkMessageRelevance, resolveRelevanceModel } from "./relevance-check.js";

describe("resolveRelevanceModel", () => {
  it("returns haiku for anthropic provider", () => {
    const result = resolveRelevanceModel({
      relevanceModelConfig: "auto",
      mainProvider: "anthropic",
      mainModel: "claude-sonnet-4-20250514",
    });
    expect(result.provider).toBe("anthropic");
    expect(result.model).toMatch(/haiku/i);
  });

  it("returns gpt-4o-mini for openai provider", () => {
    const result = resolveRelevanceModel({
      relevanceModelConfig: "auto",
      mainProvider: "openai",
      mainModel: "gpt-4o",
    });
    expect(result.provider).toBe("openai");
    expect(result.model).toBe("gpt-4o-mini");
  });

  it("parses explicit model string", () => {
    const result = resolveRelevanceModel({
      relevanceModelConfig: "google/gemini-2.0-flash",
      mainProvider: "anthropic",
      mainModel: "claude-sonnet-4",
    });
    expect(result.provider).toBe("google");
    expect(result.model).toBe("gemini-2.0-flash");
  });
});

describe("checkMessageRelevance", () => {
  it("returns respond=true for direct questions", async () => {
    const mockRunner = vi.fn().mockResolvedValue({
      text: "RESPOND: User is asking a direct question about deployments",
    });

    const result = await checkMessageRelevance({
      message: "Hey, can someone help me with the deployment?",
      channelContext: "Engineering team discussion",
      agentPersona: "DevOps assistant",
      runner: mockRunner,
    });

    expect(result.shouldRespond).toBe(true);
    expect(result.reason).toContain("question");
  });

  it("returns respond=false for general chat", async () => {
    const mockRunner = vi.fn().mockResolvedValue({
      text: "SKIP: General social conversation, not addressed to assistant",
    });

    const result = await checkMessageRelevance({
      message: "lol that meeting was wild",
      channelContext: "Engineering team discussion",
      agentPersona: "DevOps assistant",
      runner: mockRunner,
    });

    expect(result.shouldRespond).toBe(false);
  });
});
```

**Step 2: Run test to verify it fails**

```bash
pnpm test src/slack/monitor/relevance-check.test.ts
```

Expected: FAIL - module not found

**Step 3: Implement the relevance checker**

```typescript
import type { OpenClawConfig } from "../../config/config.js";
import { parseModelRef } from "../../agents/model-selection.js";

export type RelevanceModelRef = {
  provider: string;
  model: string;
};

const FAST_MODEL_MAP: Record<string, { provider: string; model: string }> = {
  anthropic: { provider: "anthropic", model: "claude-3-haiku-20240307" },
  openai: { provider: "openai", model: "gpt-4o-mini" },
  google: { provider: "google", model: "gemini-2.0-flash" },
};

export function resolveRelevanceModel(params: {
  relevanceModelConfig: "auto" | string;
  mainProvider: string;
  mainModel: string;
}): RelevanceModelRef {
  if (params.relevanceModelConfig !== "auto") {
    const parsed = parseModelRef(params.relevanceModelConfig, params.mainProvider);
    if (parsed) {
      return parsed;
    }
  }

  const providerKey = params.mainProvider.toLowerCase();
  const mapped = FAST_MODEL_MAP[providerKey];
  if (mapped) {
    return mapped;
  }

  // Fallback to main model if no fast alternative known
  return { provider: params.mainProvider, model: params.mainModel };
}

const RELEVANCE_PROMPT = `You are evaluating whether a message in a team chat requires a response from an AI assistant.

Context about the channel: {channelContext}
The assistant's role: {agentPersona}

Evaluate this message and decide if the assistant should respond. Consider:
- Is the message a question or request that the assistant could help with?
- Is the assistant being addressed directly or indirectly?
- Would a helpful team member naturally chime in here?
- Is this relevant to the assistant's expertise/role?

Do NOT respond to:
- General social chat ("lol", "nice", "thanks everyone")
- Messages clearly directed at specific humans
- Off-topic discussions unrelated to the assistant's role
- Simple acknowledgments or reactions

Message to evaluate:
{message}

Reply with exactly one line:
RESPOND: <brief reason why assistant should respond>
or
SKIP: <brief reason why assistant should stay silent>`;

export type RelevanceCheckResult = {
  shouldRespond: boolean;
  reason: string;
};

export type RelevanceRunner = (prompt: string) => Promise<{ text: string }>;

export async function checkMessageRelevance(params: {
  message: string;
  channelContext: string;
  agentPersona: string;
  runner: RelevanceRunner;
}): Promise<RelevanceCheckResult> {
  const prompt = RELEVANCE_PROMPT
    .replace("{channelContext}", params.channelContext)
    .replace("{agentPersona}", params.agentPersona)
    .replace("{message}", params.message);

  try {
    const result = await params.runner(prompt);
    const text = result.text.trim();

    if (text.toUpperCase().startsWith("RESPOND:")) {
      return {
        shouldRespond: true,
        reason: text.slice(8).trim(),
      };
    }

    if (text.toUpperCase().startsWith("SKIP:")) {
      return {
        shouldRespond: false,
        reason: text.slice(5).trim(),
      };
    }

    // Fallback: if unclear, default to not responding
    return {
      shouldRespond: false,
      reason: "Unclear relevance signal, defaulting to silent",
    };
  } catch (err) {
    // On error, default to responding (fail-open for responsiveness)
    return {
      shouldRespond: true,
      reason: `Relevance check failed: ${String(err)}`,
    };
  }
}
```

**Step 4: Run tests to verify they pass**

```bash
pnpm test src/slack/monitor/relevance-check.test.ts
```

Expected: PASS

**Step 5: Commit**

```bash
scripts/committer "feat(slack): add relevance check module for auto response mode" src/slack/monitor/relevance-check.ts src/slack/monitor/relevance-check.test.ts
```

---

## Task 5: Add ResponseMode to Monitor Context

**Files:**
- Modify: `src/slack/monitor/context.ts`

**Step 1: Add responseMode and relevanceModel to SlackMonitorContext type**

Add after `defaultRequireMention: boolean;` (around line 73):

```typescript
  defaultResponseMode: ResponseMode;
  relevanceModel: "auto" | string;
```

**Step 2: Add to createSlackMonitorContext params**

Add to the params type (around line 145):

```typescript
  defaultResponseMode?: ResponseMode;
  relevanceModel?: "auto" | string;
```

**Step 3: Initialize in the function body**

Add after `const defaultRequireMention = params.defaultRequireMention ?? true;` (around line 177):

```typescript
  const defaultResponseMode = params.defaultResponseMode ?? "mention";
  const relevanceModel = params.relevanceModel ?? "auto";
```

**Step 4: Add to return object**

Add to the return statement (around line 407):

```typescript
    defaultResponseMode,
    relevanceModel,
```

**Step 5: Add import**

Add to imports:

```typescript
import type { ResponseMode } from "../../config/types.base.js";
```

**Step 6: Commit**

```bash
scripts/committer "feat(slack): add responseMode to monitor context" src/slack/monitor/context.ts
```

---

## Task 6: Integrate Relevance Check into Message Preparation

**Files:**
- Modify: `src/slack/monitor/message-handler/prepare.ts`

**Step 1: Import relevance check module**

Add to imports:

```typescript
import { checkMessageRelevance, resolveRelevanceModel } from "../relevance-check.js";
```

**Step 2: Add relevance check logic**

After the mention gating block (around line 334), add:

```typescript
  // Auto-response mode: check relevance with fast model
  const channelResponseMode = channelConfig?.responseMode ?? ctx.defaultResponseMode;
  if (isRoom && channelResponseMode === "auto" && !effectiveWasMentioned) {
    const channelDescription = [channelInfo?.topic, channelInfo?.purpose]
      .filter(Boolean)
      .join(" - ") || channelName || "team channel";

    // TODO: Get agent persona from config - for now use generic
    const agentPersona = "helpful AI assistant";

    const relevanceResult = await checkMessageRelevance({
      message: rawBody,
      channelContext: channelDescription,
      agentPersona,
      runner: async (prompt) => {
        // Lightweight check - just return a mock for now
        // Will be replaced with actual model call in Task 7
        return { text: "RESPOND: Message requires attention" };
      },
    });

    if (!relevanceResult.shouldRespond) {
      ctx.logger.info(
        { channel: message.channel, reason: relevanceResult.reason },
        "skipping message (auto-response: not relevant)"
      );
      // Record to history for deferred awareness
      recordPendingHistoryEntryIfEnabled({
        historyMap: ctx.channelHistories,
        historyKey,
        limit: ctx.historyLimit,
        entry: rawBody
          ? {
              sender: senderName,
              body: rawBody,
              timestamp: message.ts ? Math.round(Number(message.ts) * 1000) : undefined,
              messageId: message.ts,
            }
          : null,
      });
      return null;
    }

    logVerbose(`slack auto-response: responding (${relevanceResult.reason})`);
  }
```

**Step 3: Update the requireMention check to respect responseMode**

Modify the existing mention gating check (around line 293-334) to skip when responseMode is "auto" or "all":

```typescript
  const shouldRequireMention = isRoom
    ? channelResponseMode === "mention"
      ? (channelConfig?.requireMention ?? ctx.defaultRequireMention)
      : false
    : false;
```

**Step 4: Commit**

```bash
scripts/committer "feat(slack): integrate relevance check into message preparation" src/slack/monitor/message-handler/prepare.ts
```

---

## Task 7: Wire Up Actual Model Runner for Relevance Check

**Files:**
- Modify: `src/slack/monitor/message-handler/prepare.ts`
- Modify: `src/slack/monitor/message-handler/types.ts`

**Step 1: Add relevance runner to PreparedSlackMessage context**

In `types.ts`, add to the prepared message type:

```typescript
  relevanceCheckRunner?: (prompt: string) => Promise<{ text: string }>;
```

**Step 2: Create lightweight model runner**

In `prepare.ts`, replace the mock runner with actual model call:

```typescript
    const relevanceModelRef = resolveRelevanceModel({
      relevanceModelConfig: ctx.relevanceModel,
      mainProvider: route.provider ?? "anthropic",
      mainModel: route.model ?? "claude-sonnet-4",
    });

    const relevanceResult = await checkMessageRelevance({
      message: rawBody,
      channelContext: channelDescription,
      agentPersona,
      runner: async (prompt) => {
        // Use a simple completion call with the fast model
        const result = await runEmbeddedPiAgent({
          prompt,
          config: ctx.cfg,
          sessionId: `relevance-check-${message.channel}-${message.ts}`,
          provider: relevanceModelRef.provider,
          model: relevanceModelRef.model,
          maxTokens: 100,
          skipTools: true,
          skipHistory: true,
        });
        return { text: result.reply ?? "" };
      },
    });
```

**Step 3: Import runEmbeddedPiAgent**

Add import:

```typescript
import { runEmbeddedPiAgent } from "../../../agents/pi-embedded-runner.js";
```

**Step 4: Commit**

```bash
scripts/committer "feat(slack): wire up fast model runner for relevance check" src/slack/monitor/message-handler/prepare.ts src/slack/monitor/message-handler/types.ts
```

---

## Task 8: Update Slack Monitor Initialization

**Files:**
- Modify: `src/slack/monitor/init.ts` (or wherever createSlackMonitorContext is called)

**Step 1: Find and update the monitor initialization**

```bash
grep -r "createSlackMonitorContext" src/slack --include="*.ts" | head -5
```

**Step 2: Pass responseMode and relevanceModel from config**

Add to the createSlackMonitorContext call:

```typescript
  defaultResponseMode: accountConfig.responseMode ?? slackConfig.responseMode ?? "mention",
  relevanceModel: accountConfig.relevanceModel ?? slackConfig.relevanceModel ?? "auto",
```

**Step 3: Commit**

```bash
scripts/committer "feat(slack): pass responseMode config to monitor context" src/slack/monitor/init.ts
```

---

## Task 9: Enhance Group Intro System Prompt for Auto Mode

**Files:**
- Modify: `src/auto-reply/reply/groups.ts`

**Step 1: Add activation mode for "auto"**

Update the `buildGroupIntro` function to handle "auto" activation:

```typescript
export function defaultGroupActivation(requireMention: boolean, responseMode?: string): "always" | "mention" | "auto" {
  if (responseMode === "auto") {
    return "auto";
  }
  return !requireMention ? "always" : "mention";
}
```

**Step 2: Add auto-mode guidance to system prompt**

In `buildGroupIntro`, add handling for "auto" activation:

```typescript
  const activationLine =
    activation === "always"
      ? "Activation: always-on (you receive every group message)."
      : activation === "auto"
        ? "Activation: smart-filter (you receive messages the system determined are relevant to you)."
        : "Activation: trigger-only (you are invoked only when explicitly mentioned; recent context may be included).";

  // For auto mode, no silence token needed - pre-filtering already happened
  const silenceLine =
    activation === "always"
      ? `If no response is needed, reply with exactly "${params.silentToken}" (and nothing else) so OpenClaw stays silent.`
      : undefined;
```

**Step 3: Commit**

```bash
scripts/committer "feat(slack): enhance group system prompt for auto response mode" src/auto-reply/reply/groups.ts
```

---

## Task 10: Add Integration Test

**Files:**
- Create: `src/slack/monitor/message-handler/prepare.auto-response.test.ts`

**Step 1: Write integration test**

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import { prepareSlackMessage } from "./prepare.js";

describe("prepareSlackMessage with responseMode=auto", () => {
  it("skips irrelevant messages in auto mode", async () => {
    // Test that general chat gets filtered out
  });

  it("processes relevant messages in auto mode", async () => {
    // Test that questions/requests pass through
  });

  it("records skipped messages to history for deferred awareness", async () => {
    // Test that skipped messages are still recorded
  });

  it("falls back to responding on relevance check errors", async () => {
    // Test fail-open behavior
  });
});
```

**Step 2: Commit**

```bash
scripts/committer "test(slack): add integration tests for auto response mode" src/slack/monitor/message-handler/prepare.auto-response.test.ts
```

---

## Task 11: Update Documentation

**Files:**
- Modify: `docs/channels/slack.md` (if exists, otherwise create note)

**Step 1: Document the new config options**

Add section explaining:
- `responseMode: "auto"` and how it works
- `relevanceModel` configuration
- Per-channel overrides
- Interaction with `replyToMode: "all"` for threading

**Step 2: Commit**

```bash
scripts/committer "docs: document Slack auto response mode" docs/channels/slack.md
```

---

## Summary

This implementation adds:
1. New `responseMode` config option ("mention" | "auto" | "all")
2. New `relevanceModel` config for customizing the pre-check model
3. Relevance checking module with fast model evaluation
4. Deferred awareness for skipped messages (stored in history)
5. Enhanced system prompts for auto mode
6. Per-channel overrides for response behavior

The existing `replyToMode: "all"` handles threading, so no changes needed there.

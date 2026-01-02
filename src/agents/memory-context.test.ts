/**
 * Tests for memory context injection into agent system prompts.
 * Tests formatMemoryContext utility and integration with agent runner.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { MemorySearchResult } from "../memory/types.js";
import { formatMemoryContext } from "./pi-embedded-helpers.js";

// ============================================================================
// 1. UNIT TESTS: formatMemoryContext()
// ============================================================================

describe("formatMemoryContext", () => {
  describe("empty input handling", () => {
    it("should return empty string for empty array", () => {
      const result = formatMemoryContext([]);
      expect(result).toBe("");
    });
  });

  describe("single memory formatting", () => {
    it("should format single memory correctly", () => {
      const memory: MemorySearchResult = {
        id: "mem-123",
        content: "User prefers dark mode",
        category: "preference",
        source: "agent",
        senderId: "+1234567890",
        confidence: 0.95,
        createdAt: Date.now() - 86400000, // 1 day ago
        updatedAt: Date.now() - 86400000,
        score: 0.87,
      };

      const result = formatMemoryContext([memory]);

      expect(result).toContain("## Relevant Memories");
      expect(result).toContain("User prefers dark mode");
      expect(result).toContain("preference");
      expect(result).toContain("87%"); // Score formatted as percentage
    });

    it("should include memory score as percentage", () => {
      const memory: MemorySearchResult = {
        id: "mem-456",
        content: "User birthday is March 15",
        category: "fact",
        source: "user",
        senderId: "global",
        confidence: 1.0,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        score: 0.92,
      };

      const result = formatMemoryContext([memory]);

      expect(result).toContain("92%");
    });

    it("should format date in human-readable format", () => {
      const memory: MemorySearchResult = {
        id: "mem-789",
        content: "Test content",
        category: "fact",
        source: "agent",
        senderId: "global",
        confidence: 1.0,
        createdAt: new Date("2024-01-15").getTime(),
        updatedAt: new Date("2024-01-15").getTime(),
        score: 0.85,
      };

      const result = formatMemoryContext([memory]);

      // Should contain some date representation
      expect(result).toMatch(/Jan|January|2024/);
    });

    it("should include sender tag for non-global senders", () => {
      const memory: MemorySearchResult = {
        id: "mem-sender",
        content: "User info",
        category: "fact",
        source: "agent",
        senderId: "+5511999999999",
        confidence: 1.0,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        score: 0.85,
      };

      const result = formatMemoryContext([memory]);

      expect(result).toContain("+5511999999999");
    });

    it("should not include sender tag for global memories", () => {
      const memory: MemorySearchResult = {
        id: "mem-global",
        content: "Global fact",
        category: "fact",
        source: "agent",
        senderId: "global",
        confidence: 1.0,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        score: 0.85,
      };

      const result = formatMemoryContext([memory]);

      // Should not have [global] tag in the output
      expect(result).not.toContain("[global]");
    });
  });

  describe("multiple memories formatting", () => {
    it("should format multiple memories with proper structure", () => {
      const memories: MemorySearchResult[] = [
        {
          id: "mem-1",
          content: "User name is Peter",
          category: "fact",
          source: "agent",
          senderId: "+1234567890",
          confidence: 1.0,
          createdAt: Date.now(),
          updatedAt: Date.now(),
          score: 0.95,
        },
        {
          id: "mem-2",
          content: "User likes coffee",
          category: "preference",
          source: "auto",
          senderId: "+1234567890",
          confidence: 0.8,
          createdAt: Date.now(),
          updatedAt: Date.now(),
          score: 0.78,
        },
      ];

      const result = formatMemoryContext(memories);

      expect(result).toContain("User name is Peter");
      expect(result).toContain("User likes coffee");
      expect(result).toContain("## Relevant Memories");
    });
  });

  describe("special characters handling", () => {
    it("should handle special characters in memory content", () => {
      const memory: MemorySearchResult = {
        id: "mem-special",
        content: "User said: \"I love <code> & 'quotes'\"",
        category: "context",
        source: "auto",
        senderId: "global",
        confidence: 1.0,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        score: 0.8,
      };

      const result = formatMemoryContext([memory]);

      expect(result).toContain("User said:");
      expect(result).not.toContain("undefined");
    });

    it("should handle unicode characters", () => {
      const memory: MemorySearchResult = {
        id: "mem-unicode",
        content: "User speaks Portuguese: Olá, como você está?",
        category: "fact",
        source: "agent",
        senderId: "+5511987654321",
        confidence: 1.0,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        score: 0.88,
      };

      const result = formatMemoryContext([memory]);

      expect(result).toContain("Olá, como você está?");
    });

    it("should handle emojis in content", () => {
      const memory: MemorySearchResult = {
        id: "mem-emoji",
        content: "User's favorite emoji is 🦞",
        category: "preference",
        source: "user",
        senderId: "global",
        confidence: 1.0,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        score: 0.75,
      };

      const result = formatMemoryContext([memory]);

      expect(result).toContain("🦞");
    });
  });

  describe("category display", () => {
    it("should display category for all memory types", () => {
      const categories: MemorySearchResult["category"][] = [
        "preference",
        "fact",
        "contact",
        "reminder",
        "context",
        "custom",
      ];

      for (const cat of categories) {
        const memory: MemorySearchResult = {
          id: `mem-${cat}`,
          content: `Test ${cat}`,
          category: cat,
          source: "agent",
          senderId: "global",
          confidence: 1.0,
          createdAt: Date.now(),
          updatedAt: Date.now(),
          score: 0.85,
        };

        const result = formatMemoryContext([memory]);
        expect(result.toLowerCase()).toContain(cat);
      }
    });
  });
});

// ============================================================================
// 2. SYSTEM PROMPT INTEGRATION TESTS
// ============================================================================

describe("System Prompt Integration", () => {
  it("should inject memoryContext into buildAgentSystemPromptAppend", async () => {
    const { buildAgentSystemPromptAppend } = await import("./system-prompt.js");

    const memoryContext = `## Relevant Memories
The following memories from previous conversations may be relevant to this request:

- [fact] User's name is Peter (Jan 15, 2024, relevance: 95%)
- [preference] User prefers dark mode (Jan 10, 2024, relevance: 87%)`;

    const result = buildAgentSystemPromptAppend({
      workspaceDir: "/tmp/test",
      memoryContext,
    });

    expect(result).toContain("## Relevant Memories");
    expect(result).toContain("User's name is Peter");
    expect(result).toContain("User prefers dark mode");
  });

  it("should handle empty memoryContext gracefully", async () => {
    const { buildAgentSystemPromptAppend } = await import("./system-prompt.js");

    const result = buildAgentSystemPromptAppend({
      workspaceDir: "/tmp/test",
      memoryContext: "",
    });

    // Should not add empty content
    expect(result).toContain("You are Clawd");
  });

  it("should handle undefined memoryContext", async () => {
    const { buildAgentSystemPromptAppend } = await import("./system-prompt.js");

    const result = buildAgentSystemPromptAppend({
      workspaceDir: "/tmp/test",
      // No memoryContext
    });

    expect(result).toContain("You are Clawd");
  });
});

// ============================================================================
// 3. EDGE CASE TESTS
// ============================================================================

describe("Edge Cases", () => {
  describe("empty and missing data", () => {
    it("should not add header when no memories", () => {
      const result = formatMemoryContext([]);

      expect(result).not.toContain("Relevant Memories");
      expect(result).not.toContain("##");
      expect(result).toBe("");
    });
  });

  describe("memory content edge cases", () => {
    it("should handle empty memory content without crashing", () => {
      const memory: MemorySearchResult = {
        id: "mem-empty",
        content: "",
        category: "fact",
        source: "agent",
        senderId: "global",
        confidence: 1.0,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        score: 0.9,
      };

      // Should not crash
      expect(() => formatMemoryContext([memory])).not.toThrow();
    });

    it("should handle newlines in memory content", () => {
      const memory: MemorySearchResult = {
        id: "mem-newline",
        content: "User's address:\n123 Main St\nNew York, NY",
        category: "contact",
        source: "agent",
        senderId: "+1234567890",
        confidence: 1.0,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        score: 0.9,
      };

      const result = formatMemoryContext([memory]);

      expect(result).toContain("123 Main St");
      expect(result).toContain("New York");
    });
  });

  describe("score formatting", () => {
    it("should format low scores correctly", () => {
      const memory: MemorySearchResult = {
        id: "mem-low",
        content: "Low score memory",
        category: "fact",
        source: "agent",
        senderId: "global",
        confidence: 1.0,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        score: 0.6,
      };

      const result = formatMemoryContext([memory]);

      expect(result).toContain("60%");
    });

    it("should format high scores correctly", () => {
      const memory: MemorySearchResult = {
        id: "mem-high",
        content: "High score memory",
        category: "fact",
        source: "agent",
        senderId: "global",
        confidence: 1.0,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        score: 0.99,
      };

      const result = formatMemoryContext([memory]);

      expect(result).toContain("99%");
    });
  });
});

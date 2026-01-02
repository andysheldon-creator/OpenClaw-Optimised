/**
 * Tests for ProductivityAnalyzer
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MemoryService } from "../../memory/index.js";
import { ProductivityAnalyzer } from "./productivity-analyzer.js";

// Mock MemoryService
function createMockMemoryService(): MemoryService {
  return {
    save: vi.fn().mockResolvedValue({ id: "test-id" }),
    search: vi.fn().mockResolvedValue([]),
    get: vi.fn().mockResolvedValue(null),
    delete: vi.fn().mockResolvedValue(true),
    list: vi.fn().mockResolvedValue([]),
    recall: vi.fn().mockResolvedValue([]),
    cleanup: vi.fn().mockResolvedValue(0),
  } as unknown as MemoryService;
}

describe("ProductivityAnalyzer", () => {
  let analyzer: ProductivityAnalyzer;
  let mockMemory: MemoryService;

  beforeEach(() => {
    mockMemory = createMockMemoryService();
    analyzer = new ProductivityAnalyzer(mockMemory);
  });

  describe("recordCompletion", () => {
    it("should save task completion to memory with correct metadata", async () => {
      const taskType = "coding";
      const completedAt = new Date("2025-01-15T10:30:00");

      await analyzer.recordCompletion(taskType, completedAt);

      expect(mockMemory.save).toHaveBeenCalledWith({
        content: expect.stringContaining('Task "coding" completed at 10:00 AM'),
        category: "context",
        source: "auto",
        senderId: "global",
        metadata: {
          type: "productivity_completion",
          taskType: "coding",
          completedAt: completedAt.getTime(),
          hour: 10,
          dayOfWeek: 3, // Wednesday
        },
      });
    });

    it("should handle PM times correctly", async () => {
      const taskType = "meeting";
      const completedAt = new Date("2025-01-15T14:00:00"); // 2 PM

      await analyzer.recordCompletion(taskType, completedAt);

      expect(mockMemory.save).toHaveBeenCalledWith(
        expect.objectContaining({
          content: expect.stringContaining("2:00 PM"),
          metadata: expect.objectContaining({
            hour: 14,
          }),
        }),
      );
    });
  });

  describe("getPeakHours", () => {
    it("should return empty array when not enough data", async () => {
      vi.mocked(mockMemory.search).mockResolvedValue([]);

      const result = await analyzer.getPeakHours();

      expect(result).toEqual([]);
    });

    it("should identify peak hours from completions", async () => {
      const mockCompletions = [
        { metadata: { type: "productivity_completion", hour: 10 } },
        { metadata: { type: "productivity_completion", hour: 10 } },
        { metadata: { type: "productivity_completion", hour: 10 } },
        { metadata: { type: "productivity_completion", hour: 11 } },
        { metadata: { type: "productivity_completion", hour: 11 } },
        { metadata: { type: "productivity_completion", hour: 11 } },
        { metadata: { type: "productivity_completion", hour: 14 } },
      ];

      vi.mocked(mockMemory.search).mockResolvedValue(
        mockCompletions as ReturnType<typeof mockMemory.search> extends Promise<
          infer T
        >
          ? T
          : never,
      );

      const result = await analyzer.getPeakHours();

      // Should group adjacent hours 10-11 into a range
      expect(result.length).toBeGreaterThan(0);
      expect(result[0]).toEqual({ start: 10, end: 11 });
    });
  });

  describe("suggestOptimalTime", () => {
    it("should return message when not enough data", async () => {
      vi.mocked(mockMemory.search).mockResolvedValue([]);

      const result = await analyzer.suggestOptimalTime("coding");

      expect(result).toContain("Not enough data");
    });

    it("should suggest time based on task-specific patterns", async () => {
      const mockCompletions = [
        {
          metadata: {
            type: "productivity_completion",
            taskType: "coding",
            hour: 9,
            dayOfWeek: 1,
          },
        },
        {
          metadata: {
            type: "productivity_completion",
            taskType: "coding",
            hour: 9,
            dayOfWeek: 1,
          },
        },
        {
          metadata: {
            type: "productivity_completion",
            taskType: "coding",
            hour: 10,
            dayOfWeek: 2,
          },
        },
      ];

      vi.mocked(mockMemory.search).mockResolvedValue(
        mockCompletions as ReturnType<typeof mockMemory.search> extends Promise<
          infer T
        >
          ? T
          : never,
      );

      const result = await analyzer.suggestOptimalTime("coding");

      expect(result).toContain("9:00 AM");
      expect(result).toContain("3 past completions");
    });
  });

  describe("getProductivitySummary", () => {
    it("should return summary with task types and counts", async () => {
      const mockCompletions = [
        {
          metadata: {
            type: "productivity_completion",
            taskType: "coding",
            hour: 10,
          },
        },
        {
          metadata: {
            type: "productivity_completion",
            taskType: "coding",
            hour: 11,
          },
        },
        {
          metadata: {
            type: "productivity_completion",
            taskType: "meetings",
            hour: 14,
          },
        },
      ];

      vi.mocked(mockMemory.search).mockResolvedValue(
        mockCompletions as ReturnType<typeof mockMemory.search> extends Promise<
          infer T
        >
          ? T
          : never,
      );

      const result = await analyzer.getProductivitySummary();

      expect(result.totalCompletions).toBe(3);
      expect(result.topTaskTypes).toContain("coding");
      expect(result.topTaskTypes).toContain("meetings");
    });
  });
});

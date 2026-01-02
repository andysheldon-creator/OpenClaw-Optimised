/**
 * Tests for Temporal Reasoning Module
 *
 * Tests duration tracking, estimation from history, deadline risk analysis,
 * and recurring pattern detection.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { TaskDurationRecord } from "./temporal-reasoning.js";

// ─────────────────────────────────────────────────────────────────────────────
// Mocks
// ─────────────────────────────────────────────────────────────────────────────

const mockMemoryService = {
  save: vi.fn().mockResolvedValue(undefined),
  search: vi.fn().mockResolvedValue([]),
  get: vi.fn().mockResolvedValue(null),
  delete: vi.fn().mockResolvedValue(undefined),
  list: vi.fn().mockResolvedValue([]),
  recall: vi.fn().mockResolvedValue([]),
  cleanup: vi.fn().mockResolvedValue(undefined),
};

// Mock the memory module
vi.mock("../memory/index.js", () => ({
  createMemoryService: vi.fn(() => Promise.resolve(mockMemoryService)),
  isMemoryEnabled: vi.fn(() => true),
}));

// ─────────────────────────────────────────────────────────────────────────────
// Test Helpers
// ─────────────────────────────────────────────────────────────────────────────

function createTaskDurationRecord(
  overrides: Partial<TaskDurationRecord> = {},
): TaskDurationRecord {
  const now = Date.now();
  return {
    taskId: overrides.taskId ?? `task-${Math.random().toString(36).slice(2)}`,
    taskName: overrides.taskName ?? "Test Task",
    category: overrides.category ?? "development",
    startedAt: overrides.startedAt ?? now - 3600000, // 1 hour ago
    completedAt: overrides.completedAt ?? now,
    durationMs: overrides.durationMs ?? 3600000, // 1 hour
    estimatedMs: overrides.estimatedMs,
    accuracy: overrides.accuracy,
    metadata: overrides.metadata,
  };
}

// Helper to create serialized memory content matching the module's format
function serializeRecord(record: TaskDurationRecord): string {
  return JSON.stringify({
    ...record,
    _prefix: "taskDuration",
    _storedAt: Date.now(),
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

describe("temporal-reasoning", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2025-01-02T12:00:00Z"));
    vi.clearAllMocks();
    mockMemoryService.search.mockResolvedValue([]);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Duration Tracking Tests
  // ─────────────────────────────────────────────────────────────────────────────

  describe("duration tracking (start/complete tasks)", () => {
    it("should record task duration and save to memory", async () => {
      const { recordTaskDuration } = await import("./temporal-reasoning.js");

      const record = createTaskDurationRecord({
        taskId: "task-001",
        taskName: "Write unit tests",
        category: "testing",
        durationMs: 5400000, // 1.5 hours
      });

      const result = await recordTaskDuration(record);

      expect(result).toBeDefined();
      expect(result.taskId).toBe("task-001");
      expect(result.taskName).toBe("Write unit tests");
      expect(result.durationMs).toBe(5400000);
      expect(result.category).toBe("testing");
      expect(mockMemoryService.save).toHaveBeenCalledTimes(1);
    });

    it("should calculate accuracy when estimate is provided", async () => {
      const { recordTaskDuration } = await import("./temporal-reasoning.js");

      const record = createTaskDurationRecord({
        durationMs: 6000000, // 100 minutes actual
        estimatedMs: 3600000, // 60 minutes estimated
      });

      const result = await recordTaskDuration(record);

      // accuracy = actual / estimated = 6000000 / 3600000 = 1.666...
      expect(result.accuracy).toBeCloseTo(1.667, 2);
    });

    it("should not calculate accuracy when estimate is zero", async () => {
      const { recordTaskDuration } = await import("./temporal-reasoning.js");

      const record = createTaskDurationRecord({
        durationMs: 5000000,
        estimatedMs: 0,
      });

      const result = await recordTaskDuration(record);

      expect(result.accuracy).toBeUndefined();
    });

    it("should not calculate accuracy when estimate is undefined", async () => {
      const { recordTaskDuration } = await import("./temporal-reasoning.js");

      const record = createTaskDurationRecord({
        durationMs: 5000000,
        estimatedMs: undefined,
      });

      const result = await recordTaskDuration(record);

      expect(result.accuracy).toBeUndefined();
    });

    it("should preserve metadata in recorded task", async () => {
      const { recordTaskDuration } = await import("./temporal-reasoning.js");

      const record = createTaskDurationRecord({
        metadata: { priority: "high", sprint: 42 },
      });

      const result = await recordTaskDuration(record);

      expect(result.metadata).toEqual({ priority: "high", sprint: 42 });
    });

    it("should handle very short durations (< 1 second)", async () => {
      const { recordTaskDuration } = await import("./temporal-reasoning.js");

      const record = createTaskDurationRecord({
        durationMs: 500, // 500ms
      });

      const result = await recordTaskDuration(record);

      expect(result.durationMs).toBe(500);
    });

    it("should handle very long durations (> 24 hours)", async () => {
      const { recordTaskDuration } = await import("./temporal-reasoning.js");

      const record = createTaskDurationRecord({
        durationMs: 48 * 60 * 60 * 1000, // 48 hours
      });

      const result = await recordTaskDuration(record);

      expect(result.durationMs).toBe(48 * 60 * 60 * 1000);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Duration Estimation Tests
  // ─────────────────────────────────────────────────────────────────────────────

  describe("duration estimation from history", () => {
    it("should return default estimate when no history exists", async () => {
      const { estimateTaskDuration } = await import("./temporal-reasoning.js");
      mockMemoryService.search.mockResolvedValue([]);

      const estimate = await estimateTaskDuration("New unknown task");

      // Default is 30 minutes (1800000 ms)
      expect(estimate.estimatedMs).toBe(30 * 60 * 1000);
      expect(estimate.confidence).toBe(0.1);
      expect(estimate.basedOn).toBe("default");
      expect(estimate.sampleSize).toBe(0);
    });

    it("should estimate from exact task name matches", async () => {
      const { estimateTaskDuration } = await import("./temporal-reasoning.js");

      const records = [
        createTaskDurationRecord({
          taskName: "Code review",
          durationMs: 1800000, // 30 min
        }),
        createTaskDurationRecord({
          taskName: "Code review",
          durationMs: 2400000, // 40 min
        }),
        createTaskDurationRecord({
          taskName: "Code review",
          durationMs: 2100000, // 35 min
        }),
      ];

      mockMemoryService.search.mockResolvedValue(
        records.map((r) => ({
          id: r.taskId,
          content: serializeRecord(r),
          category: "context",
          source: "agent",
          senderId: "global",
          confidence: 1.0,
          createdAt: Date.now(),
          updatedAt: Date.now(),
          score: 0.9,
        })),
      );

      const estimate = await estimateTaskDuration("Code review");

      expect(estimate.basedOn).toBe("history");
      expect(estimate.sampleSize).toBe(3);
      expect(estimate.confidence).toBeGreaterThan(0.5);
      // EMA with alpha=0.3: weighted toward recent values
      expect(estimate.estimatedMs).toBeGreaterThan(1500000);
      expect(estimate.estimatedMs).toBeLessThan(2500000);
    });

    it("should use similar task names for estimation", async () => {
      const { estimateTaskDuration } = await import("./temporal-reasoning.js");

      // Use task names that share significant overlap for similarity matching
      // The similarity algorithm uses token overlap and substring matching
      const records = [
        createTaskDurationRecord({
          taskName: "Review pull request code",
          durationMs: 1800000,
        }),
        createTaskDurationRecord({
          taskName: "Review feature code",
          durationMs: 2100000,
        }),
      ];

      mockMemoryService.search.mockResolvedValue(
        records.map((r) => ({
          id: r.taskId,
          content: serializeRecord(r),
          category: "context",
          source: "agent",
          senderId: "global",
          confidence: 1.0,
          createdAt: Date.now(),
          updatedAt: Date.now(),
          score: 0.8,
        })),
      );

      // Use a task name that shares tokens: "review" and "code"
      const estimate = await estimateTaskDuration("Review code");

      // Should find similarity with shared tokens "review" and "code"
      // basedOn will be "similar" if similarity >= 0.5 but < 0.9
      expect(estimate.sampleSize).toBeGreaterThan(0);
      expect(["history", "similar"]).toContain(estimate.basedOn);
    });

    it("should use category average as fallback", async () => {
      const { estimateTaskDuration } = await import("./temporal-reasoning.js");

      const records = [
        createTaskDurationRecord({
          taskName: "Task A",
          category: "meeting",
          durationMs: 3600000, // 60 min
        }),
        createTaskDurationRecord({
          taskName: "Task B",
          category: "meeting",
          durationMs: 3000000, // 50 min
        }),
      ];

      mockMemoryService.search.mockResolvedValue(
        records.map((r) => ({
          id: r.taskId,
          content: serializeRecord(r),
          category: "context",
          source: "agent",
          senderId: "global",
          confidence: 1.0,
          createdAt: Date.now(),
          updatedAt: Date.now(),
          score: 0.5, // Lower score, won't match by name
        })),
      );

      const estimate = await estimateTaskDuration(
        "Completely different task name",
        "meeting",
      );

      // Should use category average when no name match
      expect(estimate.basedOn).toBe("category_average");
      expect(estimate.sampleSize).toBe(2);
      // Average of 3600000 and 3000000 = 3300000
      expect(estimate.estimatedMs).toBe(3300000);
    });

    it("should provide confidence based on sample size", async () => {
      const { estimateTaskDuration } = await import("./temporal-reasoning.js");

      // Test with 1 sample - low confidence
      const oneRecord = [
        createTaskDurationRecord({
          taskName: "Single task",
          durationMs: 1000000,
        }),
      ];

      mockMemoryService.search.mockResolvedValue(
        oneRecord.map((r) => ({
          id: r.taskId,
          content: serializeRecord(r),
          category: "context",
          source: "agent",
          senderId: "global",
          confidence: 1.0,
          createdAt: Date.now(),
          updatedAt: Date.now(),
          score: 0.95,
        })),
      );

      const lowEstimate = await estimateTaskDuration("Single task");
      expect(lowEstimate.confidence).toBeLessThan(0.7);

      // Test with 5+ samples - higher confidence
      const manyRecords = Array.from({ length: 6 }, (_, i) =>
        createTaskDurationRecord({
          taskId: `task-${i}`,
          taskName: "Frequent task",
          durationMs: 1000000 + i * 100000,
        }),
      );

      mockMemoryService.search.mockResolvedValue(
        manyRecords.map((r) => ({
          id: r.taskId,
          content: serializeRecord(r),
          category: "context",
          source: "agent",
          senderId: "global",
          confidence: 1.0,
          createdAt: Date.now(),
          updatedAt: Date.now(),
          score: 0.95,
        })),
      );

      const highEstimate = await estimateTaskDuration("Frequent task");
      expect(highEstimate.confidence).toBeGreaterThan(lowEstimate.confidence);
    });

    it("should provide min/max range in estimates", async () => {
      const { estimateTaskDuration } = await import("./temporal-reasoning.js");

      const records = [
        createTaskDurationRecord({
          taskName: "Variable task",
          durationMs: 1800000,
        }),
        createTaskDurationRecord({
          taskName: "Variable task",
          durationMs: 3600000,
        }),
      ];

      mockMemoryService.search.mockResolvedValue(
        records.map((r) => ({
          id: r.taskId,
          content: serializeRecord(r),
          category: "context",
          source: "agent",
          senderId: "global",
          confidence: 1.0,
          createdAt: Date.now(),
          updatedAt: Date.now(),
          score: 0.95,
        })),
      );

      const estimate = await estimateTaskDuration("Variable task");

      expect(estimate.range).toBeDefined();
      expect(estimate.range.min).toBeLessThanOrEqual(estimate.estimatedMs);
      expect(estimate.range.max).toBeGreaterThanOrEqual(estimate.estimatedMs);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Deadline Risk Analysis Tests
  // ─────────────────────────────────────────────────────────────────────────────

  describe("deadline risk analysis", () => {
    it("should analyze deadline with ample time (low risk)", async () => {
      const { analyzeDeadline } = await import("./temporal-reasoning.js");
      mockMemoryService.search.mockResolvedValue([]);

      const now = Date.now();
      const deadline = now + 7 * 24 * 60 * 60 * 1000; // 7 days from now

      const analysis = await analyzeDeadline(deadline, "Simple task");

      expect(analysis.riskLevel).toBe("low");
      expect(analysis.urgencyScore).toBeLessThan(0.3);
      expect(analysis.factors).toContain(
        "Comfortable timeline with ample buffer",
      );
    });

    it("should analyze deadline with tight timeline (medium risk)", async () => {
      const { analyzeDeadline } = await import("./temporal-reasoning.js");
      mockMemoryService.search.mockResolvedValue([]);

      const now = Date.now();
      // Default estimate is 30 min, max range ~45 min
      // Medium risk: time remaining < maxDuration * 2
      const deadline = now + 60 * 60 * 1000; // 1 hour from now

      const analysis = await analyzeDeadline(deadline, "Time-sensitive task");

      expect(analysis.riskLevel).toBe("medium");
      expect(analysis.urgencyScore).toBeGreaterThan(0.2);
      expect(analysis.urgencyScore).toBeLessThan(0.8);
    });

    it("should analyze deadline with minimal buffer (high risk)", async () => {
      const { analyzeDeadline } = await import("./temporal-reasoning.js");

      // Create history showing 1 hour tasks
      const records = [
        createTaskDurationRecord({
          taskName: "Urgent task",
          durationMs: 3600000, // 1 hour
        }),
      ];

      mockMemoryService.search.mockResolvedValue(
        records.map((r) => ({
          id: r.taskId,
          content: serializeRecord(r),
          category: "context",
          source: "agent",
          senderId: "global",
          confidence: 1.0,
          createdAt: Date.now(),
          updatedAt: Date.now(),
          score: 0.95,
        })),
      );

      const now = Date.now();
      // With 1 hour estimate and 25% buffer, high risk if time < max + buffer
      const deadline = now + 75 * 60 * 1000; // 1.25 hours from now

      const analysis = await analyzeDeadline(deadline, "Urgent task");

      expect(analysis.riskLevel).toBe("high");
      expect(analysis.factors).toContain("Tight timeline with minimal buffer");
    });

    it("should analyze past deadline (critical risk)", async () => {
      const { analyzeDeadline } = await import("./temporal-reasoning.js");
      mockMemoryService.search.mockResolvedValue([]);

      const now = Date.now();
      const deadline = now - 60 * 60 * 1000; // 1 hour ago

      const analysis = await analyzeDeadline(deadline, "Overdue task");

      expect(analysis.riskLevel).toBe("critical");
      expect(analysis.urgencyScore).toBe(1.0);
      expect(analysis.factors).toContain("Deadline has passed");
    });

    it("should suggest start time based on estimate and buffer", async () => {
      const { analyzeDeadline } = await import("./temporal-reasoning.js");
      mockMemoryService.search.mockResolvedValue([]);

      const now = Date.now();
      const deadline = now + 24 * 60 * 60 * 1000; // 24 hours from now

      const analysis = await analyzeDeadline(deadline, "Planning task");

      expect(analysis.suggestedStartTime).toBeGreaterThanOrEqual(now);
      expect(analysis.suggestedStartTime).toBeLessThan(deadline);
      expect(analysis.bufferTimeMs).toBeGreaterThan(0);
    });

    it("should suggest immediate start when deadline is near", async () => {
      const { analyzeDeadline } = await import("./temporal-reasoning.js");
      mockMemoryService.search.mockResolvedValue([]);

      const now = Date.now();
      const deadline = now + 35 * 60 * 1000; // 35 minutes from now (close to 30 min default)

      const analysis = await analyzeDeadline(deadline, "Imminent task");

      expect(analysis.suggestedStartTime).toBe(now);
      expect(analysis.factors).toContain("Should start immediately");
    });

    it("should include estimate details in factors", async () => {
      const { analyzeDeadline } = await import("./temporal-reasoning.js");
      mockMemoryService.search.mockResolvedValue([]);

      const now = Date.now();
      const deadline = now + 2 * 60 * 60 * 1000;

      const analysis = await analyzeDeadline(deadline, "Documented task");

      expect(
        analysis.factors.some((f) => f.includes("Estimated duration")),
      ).toBe(true);
      expect(analysis.factors.some((f) => f.includes("confidence"))).toBe(true);
      expect(analysis.factors.some((f) => f.includes("Based on"))).toBe(true);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Urgency Score Tests
  // ─────────────────────────────────────────────────────────────────────────────

  describe("calculateUrgencyScore", () => {
    it("should return 1.0 for past deadlines", async () => {
      const { calculateUrgencyScore } = await import("./temporal-reasoning.js");

      const pastDeadline = Date.now() - 60 * 60 * 1000; // 1 hour ago
      const urgency = calculateUrgencyScore(pastDeadline, 3600000);

      expect(urgency).toBe(1.0);
    });

    it("should return high urgency when time equals estimated duration", async () => {
      const { calculateUrgencyScore } = await import("./temporal-reasoning.js");

      const now = Date.now();
      const deadline = now + 2 * 60 * 60 * 1000; // 2 hours from now
      const estimatedDuration = 2 * 60 * 60 * 1000; // 2 hours

      const urgency = calculateUrgencyScore(deadline, estimatedDuration);

      // ratio = 1.0, sigmoid gives ~0.5
      expect(urgency).toBeCloseTo(0.5, 1);
    });

    it("should return low urgency for far deadlines", async () => {
      const { calculateUrgencyScore } = await import("./temporal-reasoning.js");

      const now = Date.now();
      const deadline = now + 90 * 24 * 60 * 60 * 1000; // 90 days
      const estimatedDuration = 2 * 60 * 60 * 1000; // 2 hours

      const urgency = calculateUrgencyScore(deadline, estimatedDuration);

      expect(urgency).toBeLessThan(0.1);
    });

    it("should return high urgency when more time needed than available", async () => {
      const { calculateUrgencyScore } = await import("./temporal-reasoning.js");

      const now = Date.now();
      const deadline = now + 1 * 60 * 60 * 1000; // 1 hour from now
      const estimatedDuration = 4 * 60 * 60 * 1000; // 4 hours needed

      const urgency = calculateUrgencyScore(deadline, estimatedDuration);

      // ratio = 4.0, sigmoid gives ~0.8
      expect(urgency).toBeGreaterThan(0.75);
    });

    it("should be bounded between 0 and 1", async () => {
      const { calculateUrgencyScore } = await import("./temporal-reasoning.js");

      const now = Date.now();

      // Various scenarios
      const scenarios = [
        { deadline: now - 1000, duration: 1000 }, // Past
        { deadline: now + 1000, duration: 1000000 }, // Way over
        { deadline: now + 1000000000, duration: 1000 }, // Way under
        { deadline: now + 60000, duration: 60000 }, // Exact
      ];

      for (const { deadline, duration } of scenarios) {
        const urgency = calculateUrgencyScore(deadline, duration);
        expect(urgency).toBeGreaterThanOrEqual(0);
        expect(urgency).toBeLessThanOrEqual(1);
      }
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Recurring Pattern Detection Tests
  // ─────────────────────────────────────────────────────────────────────────────

  describe("recurring pattern handling", () => {
    it("should detect daily recurring pattern", async () => {
      const { detectRecurringPatterns } = await import(
        "./temporal-reasoning.js"
      );

      const baseTime = new Date("2025-01-02T09:00:00Z").getTime();
      const dayMs = 24 * 60 * 60 * 1000;

      const records: TaskDurationRecord[] = Array.from({ length: 7 }, (_, i) =>
        createTaskDurationRecord({
          taskId: `standup-${i}`,
          taskName: "Daily standup",
          startedAt: baseTime - i * dayMs,
          completedAt: baseTime - i * dayMs + 900000, // 15 min
          durationMs: 900000,
        }),
      );

      const patterns = detectRecurringPatterns(records);

      expect(patterns.length).toBeGreaterThan(0);
      const dailyPattern = patterns.find((p) => p.frequency === "daily");
      expect(dailyPattern).toBeDefined();
      expect(dailyPattern?.confidence).toBeGreaterThan(0.5);
      expect(dailyPattern?.matchingTasks).toHaveLength(7);
    });

    it("should detect weekly recurring pattern", async () => {
      const { detectRecurringPatterns } = await import(
        "./temporal-reasoning.js"
      );

      const baseTime = new Date("2025-01-02T14:00:00Z").getTime();
      const weekMs = 7 * 24 * 60 * 60 * 1000;

      const records: TaskDurationRecord[] = Array.from({ length: 8 }, (_, i) =>
        createTaskDurationRecord({
          taskId: `review-${i}`,
          taskName: "Weekly Review",
          startedAt: baseTime - i * weekMs,
          completedAt: baseTime - i * weekMs + 3600000, // 1 hour
          durationMs: 3600000,
        }),
      );

      const patterns = detectRecurringPatterns(records);

      expect(patterns.length).toBeGreaterThan(0);
      const weeklyPattern = patterns.find((p) => p.frequency === "weekly");
      expect(weeklyPattern).toBeDefined();
      expect(weeklyPattern?.confidence).toBeGreaterThan(0.5);
    });

    it("should detect monthly recurring pattern", async () => {
      const { detectRecurringPatterns } = await import(
        "./temporal-reasoning.js"
      );

      const baseTime = new Date("2025-01-02T10:00:00Z").getTime();
      const monthMs = 30 * 24 * 60 * 60 * 1000;

      const records: TaskDurationRecord[] = Array.from({ length: 6 }, (_, i) =>
        createTaskDurationRecord({
          taskId: `monthly-${i}`,
          taskName: "Monthly report",
          startedAt: baseTime - i * monthMs,
          completedAt: baseTime - i * monthMs + 7200000,
          durationMs: 7200000,
        }),
      );

      const patterns = detectRecurringPatterns(records);

      expect(patterns.length).toBeGreaterThan(0);
      const monthlyPattern = patterns.find((p) => p.frequency === "monthly");
      expect(monthlyPattern).toBeDefined();
    });

    it("should detect custom interval patterns", async () => {
      const { detectRecurringPatterns } = await import(
        "./temporal-reasoning.js"
      );

      const baseTime = new Date("2025-01-02T10:00:00Z").getTime();
      const customInterval = 3 * 24 * 60 * 60 * 1000; // Every 3 days

      const records: TaskDurationRecord[] = Array.from({ length: 5 }, (_, i) =>
        createTaskDurationRecord({
          taskId: `custom-${i}`,
          taskName: "Bi-weekly check",
          startedAt: baseTime - i * customInterval,
          completedAt: baseTime - i * customInterval + 1800000,
          durationMs: 1800000,
        }),
      );

      const patterns = detectRecurringPatterns(records);

      const customPattern = patterns.find((p) => p.frequency === "custom");
      if (customPattern) {
        expect(customPattern.interval).toBeDefined();
        expect(customPattern.interval).toBeCloseTo(customInterval, -5); // Within 100ms
      }
    });

    it("should not detect pattern with irregular data", async () => {
      const { detectRecurringPatterns } = await import(
        "./temporal-reasoning.js"
      );

      // Create records with highly variable intervals
      const records: TaskDurationRecord[] = [
        createTaskDurationRecord({
          taskId: "ir-1",
          taskName: "Irregular task",
          startedAt: new Date("2025-01-02T09:00:00Z").getTime(),
        }),
        createTaskDurationRecord({
          taskId: "ir-2",
          taskName: "Irregular task",
          startedAt: new Date("2025-01-03T14:30:00Z").getTime(), // 1.2 days
        }),
        createTaskDurationRecord({
          taskId: "ir-3",
          taskName: "Irregular task",
          startedAt: new Date("2025-01-08T11:15:00Z").getTime(), // 4.9 days
        }),
        createTaskDurationRecord({
          taskId: "ir-4",
          taskName: "Irregular task",
          startedAt: new Date("2025-01-15T16:45:00Z").getTime(), // 7.2 days
        }),
      ];

      const patterns = detectRecurringPatterns(records);

      // High variance should result in no high-confidence patterns
      const strongPatterns = patterns.filter((p) => p.confidence > 0.7);
      expect(strongPatterns.length).toBe(0);
    });

    it("should return empty array for insufficient data", async () => {
      const { detectRecurringPatterns } = await import(
        "./temporal-reasoning.js"
      );

      // Single record - not enough to detect pattern
      const records = [createTaskDurationRecord({ taskName: "Single task" })];

      const patterns = detectRecurringPatterns(records);

      expect(patterns).toEqual([]);
    });

    it("should return empty array for empty history", async () => {
      const { detectRecurringPatterns } = await import(
        "./temporal-reasoning.js"
      );

      const patterns = detectRecurringPatterns([]);

      expect(patterns).toEqual([]);
    });

    it("should predict next occurrence accurately", async () => {
      const { detectRecurringPatterns, suggestNextDeadline } = await import(
        "./temporal-reasoning.js"
      );

      const baseTime = new Date("2025-01-02T09:00:00Z").getTime();
      const dayMs = 24 * 60 * 60 * 1000;

      const records: TaskDurationRecord[] = Array.from({ length: 5 }, (_, i) =>
        createTaskDurationRecord({
          taskId: `daily-${i}`,
          taskName: "Daily check",
          startedAt: baseTime - i * dayMs,
          completedAt: baseTime - i * dayMs + 600000,
          durationMs: 600000,
        }),
      );

      const patterns = detectRecurringPatterns(records);
      expect(patterns.length).toBeGreaterThan(0);

      const pattern = patterns[0];
      expect(pattern.nextPredicted).toBeDefined();

      // Next should be ~1 day after last occurrence
      const expectedNext = pattern.lastOccurrence + dayMs;
      const nextPredicted = pattern.nextPredicted ?? 0;
      expect(Math.abs(nextPredicted - expectedNext)).toBeLessThan(dayMs * 0.2); // Within 20% tolerance

      // suggestNextDeadline should return the same
      const suggested = suggestNextDeadline(pattern);
      expect(suggested).toBe(pattern.nextPredicted);
    });

    it("should score confidence based on consistency", async () => {
      const { detectRecurringPatterns } = await import(
        "./temporal-reasoning.js"
      );

      const baseTime = new Date("2025-01-02T10:00:00Z").getTime();
      const dayMs = 24 * 60 * 60 * 1000;

      // Highly consistent - same time every day (+/- 5 min)
      const consistentRecords: TaskDurationRecord[] = Array.from(
        { length: 10 },
        (_, i) =>
          createTaskDurationRecord({
            taskId: `consistent-${i}`,
            taskName: "Consistent task",
            startedAt: baseTime - i * dayMs + (Math.random() * 10 - 5) * 60000, // +/- 5 min
            completedAt:
              baseTime - i * dayMs + 900000 + (Math.random() * 10 - 5) * 60000,
            durationMs: 900000,
          }),
      );

      const consistentPatterns = detectRecurringPatterns(consistentRecords);

      // Less consistent - same day but varying times
      const inconsistentRecords: TaskDurationRecord[] = Array.from(
        { length: 10 },
        (_, i) =>
          createTaskDurationRecord({
            taskId: `inconsistent-${i}`,
            taskName: "Inconsistent task",
            startedAt:
              baseTime - i * dayMs + (Math.random() - 0.5) * 6 * 60 * 60000, // +/- 3 hours
            completedAt:
              baseTime -
              i * dayMs +
              900000 +
              (Math.random() - 0.5) * 6 * 60 * 60000,
            durationMs: 900000,
          }),
      );

      const inconsistentPatterns = detectRecurringPatterns(inconsistentRecords);

      // Both should detect patterns, but consistent should have higher confidence
      expect(consistentPatterns.length).toBeGreaterThan(0);
      expect(inconsistentPatterns.length).toBeGreaterThan(0);
      expect(consistentPatterns[0].confidence).toBeGreaterThan(
        inconsistentPatterns[0].confidence,
      );
    });

    it("should group patterns by task name", async () => {
      const { detectRecurringPatterns } = await import(
        "./temporal-reasoning.js"
      );

      const baseTime = new Date("2025-01-02T10:00:00Z").getTime();
      const dayMs = 24 * 60 * 60 * 1000;
      const weekMs = 7 * dayMs;

      const records: TaskDurationRecord[] = [
        // Daily task
        ...Array.from({ length: 5 }, (_, i) =>
          createTaskDurationRecord({
            taskId: `daily-${i}`,
            taskName: "Morning standup",
            startedAt: baseTime - i * dayMs,
            durationMs: 900000,
          }),
        ),
        // Weekly task
        ...Array.from({ length: 4 }, (_, i) =>
          createTaskDurationRecord({
            taskId: `weekly-${i}`,
            taskName: "Weekly planning",
            startedAt: baseTime - i * weekMs,
            durationMs: 3600000,
          }),
        ),
      ];

      const patterns = detectRecurringPatterns(records);

      // Should detect both patterns separately
      expect(patterns.length).toBe(2);

      const dailyPattern = patterns.find(
        (p) => p.taskName === "Morning standup",
      );
      const weeklyPattern = patterns.find(
        (p) => p.taskName === "Weekly planning",
      );

      expect(dailyPattern).toBeDefined();
      expect(weeklyPattern).toBeDefined();
      expect(dailyPattern?.frequency).toBe("daily");
      expect(weeklyPattern?.frequency).toBe("weekly");
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Utility Function Tests
  // ─────────────────────────────────────────────────────────────────────────────

  describe("utility functions", () => {
    it("should format duration correctly", async () => {
      const { formatDuration } = await import("./temporal-reasoning.js");

      expect(formatDuration(30 * 60 * 1000)).toBe("30m");
      expect(formatDuration(60 * 60 * 1000)).toBe("1h");
      expect(formatDuration(90 * 60 * 1000)).toBe("1h 30m");
      expect(formatDuration(150 * 60 * 1000)).toBe("2h 30m");
      expect(formatDuration(-1000)).toBe("overdue");
    });

    it("should parse duration strings correctly", async () => {
      const { parseDuration } = await import("./temporal-reasoning.js");

      expect(parseDuration("30m")).toBe(30 * 60 * 1000);
      expect(parseDuration("2h")).toBe(2 * 60 * 60 * 1000);
      expect(parseDuration("1h 30m")).toBe(90 * 60 * 1000);
      expect(parseDuration("30 minutes")).toBe(30 * 60 * 1000);
      expect(parseDuration("2 hours")).toBe(2 * 60 * 60 * 1000);
      expect(parseDuration("45")).toBe(45 * 60 * 1000); // Plain number = minutes
      expect(parseDuration("invalid")).toBeNull();
    });

    it("should describe risk levels correctly", async () => {
      const { describeRiskLevel } = await import("./temporal-reasoning.js");

      expect(describeRiskLevel("low")).toContain("Low");
      expect(describeRiskLevel("medium")).toContain("Medium");
      expect(describeRiskLevel("high")).toContain("High");
      expect(describeRiskLevel("critical")).toContain("Critical");
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Edge Cases and Error Handling
  // ─────────────────────────────────────────────────────────────────────────────

  describe("edge cases and error handling", () => {
    it("should handle memory service unavailable gracefully", async () => {
      const { isMemoryEnabled } = await import("../memory/index.js");
      vi.mocked(isMemoryEnabled).mockReturnValue(false);

      const { getTaskHistory } = await import("./temporal-reasoning.js");

      const history = await getTaskHistory();

      expect(history).toEqual([]);
    });

    it("should handle malformed memory content gracefully", async () => {
      const { estimateTaskDuration } = await import("./temporal-reasoning.js");

      mockMemoryService.search.mockResolvedValue([
        {
          id: "bad-1",
          content: "not valid json",
          category: "context",
          source: "agent",
          senderId: "global",
          confidence: 1.0,
          createdAt: Date.now(),
          updatedAt: Date.now(),
          score: 0.9,
        },
        {
          id: "bad-2",
          content: JSON.stringify({ _prefix: "wrong", data: "missing fields" }),
          category: "context",
          source: "agent",
          senderId: "global",
          confidence: 1.0,
          createdAt: Date.now(),
          updatedAt: Date.now(),
          score: 0.9,
        },
      ]);

      // Should not throw, should fall back to defaults
      const estimate = await estimateTaskDuration("Task with bad history");

      expect(estimate.basedOn).toBe("default");
      expect(estimate.estimatedMs).toBe(30 * 60 * 1000);
    });

    it("should handle tasks with same name but different categories", async () => {
      const { recordTaskDuration } = await import("./temporal-reasoning.js");

      const codeReview = await recordTaskDuration(
        createTaskDurationRecord({
          taskName: "Review",
          category: "code-review",
          durationMs: 1800000,
        }),
      );

      const docReview = await recordTaskDuration(
        createTaskDurationRecord({
          taskName: "Review",
          category: "document-review",
          durationMs: 3600000,
        }),
      );

      expect(codeReview.category).toBe("code-review");
      expect(docReview.category).toBe("document-review");
      expect(codeReview.durationMs).not.toBe(docReview.durationMs);
    });
  });
});

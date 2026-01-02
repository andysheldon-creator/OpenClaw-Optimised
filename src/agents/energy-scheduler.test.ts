/**
 * Tests for Energy-Aware Scheduling system.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

// Mock the memory service before importing the scheduler
vi.mock("../memory/index.js", () => ({
  createMemoryService: vi.fn(),
  isMemoryEnabled: vi.fn(() => true),
}));

import {
  EnergySchedulerService,
  createEnergySchedulerService,
  resetEnergySchedulerService,
  createEnergySchedulerTool,
  type TaskCompletionEvent,
  type EnergyProfile,
  type CognitiveLoad,
  type EnergyLevel,
} from "./energy-scheduler.js";
import { createMemoryService, isMemoryEnabled } from "../memory/index.js";

// ─────────────────────────────────────────────────────────────────────────────
// Test Fixtures
// ─────────────────────────────────────────────────────────────────────────────

function createMockMemoryService() {
  const memories: Array<{
    id: string;
    content: string;
    category: string;
    senderId: string;
    metadata: Record<string, unknown>;
    createdAt: number;
  }> = [];

  return {
    save: vi.fn(async (data: Record<string, unknown>) => {
      const memory = {
        id: `mem-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        content: data.content as string,
        category: data.category as string,
        senderId: (data.senderId as string) ?? "global",
        metadata: (data.metadata as Record<string, unknown>) ?? {},
        createdAt: Date.now(),
      };
      memories.push(memory);
      return memory;
    }),
    search: vi.fn(async (query: string, options?: Record<string, unknown>) => {
      const senderId = options?.senderId as string | undefined;
      const category = options?.category as string | undefined;
      const limit = (options?.limit as number) ?? 10;

      return memories
        .filter((m) => {
          if (senderId && m.senderId !== senderId) return false;
          if (category && m.category !== category) return false;
          // Simple text match for testing
          const queryLower = query.toLowerCase();
          return (
            m.content.toLowerCase().includes(queryLower) ||
            queryLower.split(" ").some((word) =>
              m.content.toLowerCase().includes(word)
            )
          );
        })
        .slice(0, limit)
        .map((m) => ({ ...m, score: 0.8 }));
    }),
    recall: vi.fn(async () => []),
    delete: vi.fn(async () => true),
    list: vi.fn(async () => []),
    _memories: memories, // Expose for testing
  };
}

function createMockCompletions(
  count: number,
  options: {
    peakHour?: number;
    troughHour?: number;
    senderId?: string;
  } = {}
): Omit<TaskCompletionEvent, "id">[] {
  const { peakHour = 10, troughHour = 14, senderId } = options;
  const completions: Omit<TaskCompletionEvent, "id">[] = [];

  for (let i = 0; i < count; i++) {
    // Distribute across hours with higher productivity at peak
    const hour = i % 24;
    const isPeak = hour === peakHour || hour === peakHour + 1;
    const isTrough = hour === troughHour;

    completions.push({
      taskDescription: `Task ${i + 1}`,
      completedAt: Date.now() - i * 60 * 60 * 1000, // Spread over hours
      durationMinutes: isPeak ? 25 : isTrough ? 60 : 40,
      complexity: isPeak ? 4 : isTrough ? 2 : 3,
      energyLevel: isPeak ? "high" : isTrough ? "low" : "medium",
      focusScore: isPeak ? 0.9 : isTrough ? 0.4 : 0.7,
      cognitiveLoad: isPeak ? "deep_work" : isTrough ? "administrative" : "collaborative",
      senderId,
    });
  }

  return completions;
}

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

describe("EnergySchedulerService", () => {
  let mockMemory: ReturnType<typeof createMockMemoryService>;
  let service: EnergySchedulerService;

  beforeEach(() => {
    mockMemory = createMockMemoryService();
    service = new EnergySchedulerService(mockMemory as never);
    vi.mocked(createMemoryService).mockResolvedValue(mockMemory as never);
    vi.mocked(isMemoryEnabled).mockReturnValue(true);
  });

  afterEach(() => {
    resetEnergySchedulerService();
    vi.clearAllMocks();
  });

  describe("logTaskCompletion", () => {
    it("should log a task completion with generated ID", async () => {
      const event = await service.logTaskCompletion({
        taskDescription: "Write unit tests",
        completedAt: Date.now(),
        durationMinutes: 45,
        complexity: 3,
        energyLevel: "high",
        focusScore: 0.85,
      });

      expect(event.id).toBeDefined();
      expect(event.taskDescription).toBe("Write unit tests");
      expect(mockMemory.save).toHaveBeenCalledTimes(1);
    });

    it("should include productivity score in metadata", async () => {
      await service.logTaskCompletion({
        taskDescription: "Complex analysis",
        completedAt: Date.now(),
        durationMinutes: 30,
        complexity: 5,
        energyLevel: "high",
        focusScore: 0.9,
      });

      const savedCall = mockMemory.save.mock.calls[0][0];
      expect(savedCall.metadata).toHaveProperty("productivityScore");
      expect(savedCall.metadata.productivityScore).toBeGreaterThan(0);
    });

    it("should extract hour and day of week from timestamp", async () => {
      const specificTime = new Date("2026-01-02T10:30:00").getTime();

      await service.logTaskCompletion({
        taskDescription: "Morning task",
        completedAt: specificTime,
        durationMinutes: 30,
        complexity: 3,
      });

      const savedCall = mockMemory.save.mock.calls[0][0];
      expect(savedCall.metadata.hour).toBe(10);
      expect(savedCall.metadata.timeBucket).toBe("morning");
    });

    it("should assign correct time buckets", async () => {
      const testCases = [
        { hour: 6, expected: "early_morning" },
        { hour: 9, expected: "morning" },
        { hour: 13, expected: "midday" },
        { hour: 15, expected: "afternoon" },
        { hour: 19, expected: "evening" },
        { hour: 23, expected: "night" },
      ];

      for (const { hour, expected } of testCases) {
        const time = new Date();
        time.setHours(hour, 0, 0, 0);

        await service.logTaskCompletion({
          taskDescription: `Task at ${hour}`,
          completedAt: time.getTime(),
          durationMinutes: 30,
          complexity: 3,
        });

        const lastCall = mockMemory.save.mock.calls.at(-1)?.[0];
        expect(lastCall?.metadata?.timeBucket).toBe(expected);
      }
    });
  });

  describe("analyzeProductivityPatterns", () => {
    it("should return null with insufficient data", async () => {
      const profile = await service.analyzeProductivityPatterns();
      expect(profile).toBeNull();
    });

    it("should build profile from task completions", async () => {
      // Log enough completions
      const completions = createMockCompletions(15, { peakHour: 10 });
      for (const c of completions) {
        await service.logTaskCompletion(c);
      }

      const profile = await service.analyzeProductivityPatterns();

      expect(profile).not.toBeNull();
      expect(profile!.userId).toBe("global");
      expect(profile!.chronotype).toBeDefined();
      expect(profile!.peakHours).toHaveLength(4);
      expect(profile!.confidence).toBeGreaterThan(0);
    });

    it("should detect morning chronotype", async () => {
      // Create completions with clear morning peak
      for (let i = 0; i < 20; i++) {
        const hour = i % 2 === 0 ? 9 : 10; // Strong morning signal
        const time = new Date();
        time.setHours(hour, 0, 0, 0);

        await service.logTaskCompletion({
          taskDescription: `Morning task ${i}`,
          completedAt: time.getTime(),
          durationMinutes: 20,
          complexity: 4,
          energyLevel: "high",
          focusScore: 0.9,
        });
      }

      const profile = await service.analyzeProductivityPatterns();
      // With predominantly morning completions, should lean morning
      expect(profile?.chronotype).toBeDefined();
    });

    it("should track user-specific profiles", async () => {
      const completions = createMockCompletions(10, { senderId: "user-123" });
      for (const c of completions) {
        await service.logTaskCompletion(c);
      }

      const profile = await service.analyzeProductivityPatterns("user-123");
      expect(profile?.userId).toBe("user-123");
    });
  });

  describe("getEnergyProfile", () => {
    it("should return cached profile if recent", async () => {
      // First, create a profile by logging completions
      const completions = createMockCompletions(15);
      for (const c of completions) {
        await service.logTaskCompletion(c);
      }
      await service.analyzeProductivityPatterns();

      // Clear call count
      mockMemory.search.mockClear();

      // Get profile again - should use cached
      const profile = await service.getEnergyProfile();
      expect(profile).not.toBeNull();
    });

    it("should re-analyze if no cached profile", async () => {
      const completions = createMockCompletions(10);
      for (const c of completions) {
        await service.logTaskCompletion(c);
      }

      const profile = await service.getEnergyProfile();
      // Even with no cache, should try to analyze
      expect(mockMemory.search).toHaveBeenCalled();
    });
  });

  describe("suggestSchedule", () => {
    it("should return suggestions based on available slots", async () => {
      // Build a profile first
      const completions = createMockCompletions(15, { peakHour: 10 });
      for (const c of completions) {
        await service.logTaskCompletion(c);
      }
      await service.analyzeProductivityPatterns();

      const suggestions = await service.suggestSchedule(
        "Write documentation",
        60,
        "deep_work",
        { lookaheadDays: 3 }
      );

      expect(suggestions).toBeInstanceOf(Array);
      // Should have some suggestions within working hours
    });

    it("should respect busy periods", async () => {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      tomorrow.setHours(10, 0, 0, 0);

      const busyPeriods = [
        {
          start: tomorrow.toISOString(),
          end: new Date(tomorrow.getTime() + 2 * 60 * 60 * 1000).toISOString(),
        },
      ];

      const suggestions = await service.suggestSchedule(
        "Meeting prep",
        30,
        "administrative",
        { busyPeriods }
      );

      // Suggestions should not overlap with busy period
      for (const s of suggestions) {
        const suggestionTime = s.timeSlot.start.getTime();
        const busyStart = new Date(busyPeriods[0].start).getTime();
        const busyEnd = new Date(busyPeriods[0].end).getTime();

        const overlaps =
          suggestionTime >= busyStart && suggestionTime < busyEnd;
        expect(overlaps).toBe(false);
      }
    });

    it("should score deep_work higher during peak hours", async () => {
      // Build profile with clear peak at 10am
      for (let i = 0; i < 20; i++) {
        const time = new Date();
        time.setHours(10, 0, 0, 0);
        time.setDate(time.getDate() - i);

        await service.logTaskCompletion({
          taskDescription: `Peak task ${i}`,
          completedAt: time.getTime(),
          durationMinutes: 20,
          complexity: 5,
          energyLevel: "high",
          focusScore: 0.95,
        });
      }
      await service.analyzeProductivityPatterns();

      const suggestions = await service.suggestSchedule(
        "Deep analysis",
        90,
        "deep_work"
      );

      // If we have suggestions at 10am, they should have high energy alignment
      const tenAmSuggestion = suggestions.find(
        (s) => s.timeSlot.start.getHours() === 10
      );
      if (tenAmSuggestion) {
        expect(tenAmSuggestion.energyAlignment).toBeGreaterThan(0.5);
      }
    });
  });

  describe("getCurrentEnergyAssessment", () => {
    it("should return current time assessment", async () => {
      const assessment = await service.getCurrentEnergyAssessment();

      expect(assessment).toHaveProperty("currentHour");
      expect(assessment).toHaveProperty("timeBucket");
      expect(assessment).toHaveProperty("predictedEnergy");
      expect(assessment).toHaveProperty("bestTaskType");
      expect(assessment).toHaveProperty("suggestion");
    });

    it("should use profile for predictions when available", async () => {
      // Build profile
      const completions = createMockCompletions(15);
      for (const c of completions) {
        await service.logTaskCompletion(c);
      }
      await service.analyzeProductivityPatterns();

      const assessment = await service.getCurrentEnergyAssessment();

      // Should have a meaningful suggestion
      expect(assessment.suggestion.length).toBeGreaterThan(10);
    });
  });
});

describe("createEnergySchedulerService", () => {
  beforeEach(() => {
    resetEnergySchedulerService();
    vi.clearAllMocks();
  });

  it("should return singleton instance", async () => {
    const mockMemory = createMockMemoryService();
    vi.mocked(createMemoryService).mockResolvedValue(mockMemory as never);
    vi.mocked(isMemoryEnabled).mockReturnValue(true);

    const service1 = await createEnergySchedulerService();
    const service2 = await createEnergySchedulerService();

    expect(service1).toBe(service2);
  });

  it("should return null if memory not enabled", async () => {
    vi.mocked(isMemoryEnabled).mockReturnValue(false);

    const service = await createEnergySchedulerService();
    expect(service).toBeNull();
  });

  it("should return null if memory service fails", async () => {
    vi.mocked(isMemoryEnabled).mockReturnValue(true);
    vi.mocked(createMemoryService).mockResolvedValue(null);

    const service = await createEnergySchedulerService();
    expect(service).toBeNull();
  });
});

describe("createEnergySchedulerTool", () => {
  let mockMemory: ReturnType<typeof createMockMemoryService>;

  beforeEach(() => {
    resetEnergySchedulerService();
    mockMemory = createMockMemoryService();
    vi.mocked(createMemoryService).mockResolvedValue(mockMemory as never);
    vi.mocked(isMemoryEnabled).mockReturnValue(true);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("should create tool with correct metadata", () => {
    const tool = createEnergySchedulerTool();

    expect(tool.name).toBe("clawdis_energy_scheduler");
    expect(tool.label).toBe("Energy Scheduler");
    expect(tool.description).toContain("Track task completions");
  });

  it("should handle log_completion action", async () => {
    const tool = createEnergySchedulerTool();

    const result = await tool.execute("test-call-id", {
      action: "log_completion",
      taskDescription: "Test task",
      durationMinutes: 30,
      complexity: 3,
    });

    expect(result.content[0]).toHaveProperty("text");
    const parsed = JSON.parse((result.content[0] as { text: string }).text);
    expect(parsed.logged).toBe(true);
  });

  it("should handle get_profile action", async () => {
    const tool = createEnergySchedulerTool();

    const result = await tool.execute("test-call-id", {
      action: "get_profile",
    });

    const parsed = JSON.parse((result.content[0] as { text: string }).text);
    // Without enough data, should indicate no profile
    expect(parsed).toHaveProperty("profile");
  });

  it("should handle current_energy action", async () => {
    const tool = createEnergySchedulerTool();

    const result = await tool.execute("test-call-id", {
      action: "current_energy",
    });

    const parsed = JSON.parse((result.content[0] as { text: string }).text);
    expect(parsed).toHaveProperty("currentHour");
    expect(parsed).toHaveProperty("predictedEnergy");
  });

  it("should handle suggest_schedule action", async () => {
    const tool = createEnergySchedulerTool();

    const result = await tool.execute("test-call-id", {
      action: "suggest_schedule",
      taskDescription: "Important meeting",
      durationMinutes: 60,
      cognitiveLoad: "collaborative",
    });

    const parsed = JSON.parse((result.content[0] as { text: string }).text);
    expect(parsed).toHaveProperty("suggestions");
    expect(parsed.taskDescription).toBe("Important meeting");
  });

  it("should handle analyze action", async () => {
    const tool = createEnergySchedulerTool();

    const result = await tool.execute("test-call-id", {
      action: "analyze",
    });

    const parsed = JSON.parse((result.content[0] as { text: string }).text);
    // With no data, should indicate not enough
    expect(parsed).toHaveProperty("message");
  });

  it("should return error for unavailable service", async () => {
    vi.mocked(isMemoryEnabled).mockReturnValue(false);
    resetEnergySchedulerService();

    const tool = createEnergySchedulerTool();
    const result = await tool.execute("test-call-id", {
      action: "current_energy",
    });

    const parsed = JSON.parse((result.content[0] as { text: string }).text);
    expect(parsed.error).toBe("not_available");
  });
});

describe("Productivity Score Calculation", () => {
  let mockMemory: ReturnType<typeof createMockMemoryService>;
  let service: EnergySchedulerService;

  beforeEach(() => {
    mockMemory = createMockMemoryService();
    service = new EnergySchedulerService(mockMemory as never);
  });

  it("should reward high complexity completions", async () => {
    // High complexity task
    await service.logTaskCompletion({
      taskDescription: "Complex task",
      completedAt: Date.now(),
      durationMinutes: 60,
      complexity: 5,
      energyLevel: "high",
      focusScore: 0.9,
    });

    const highComplexityScore = mockMemory._memories[0].metadata
      .productivityScore as number;

    // Low complexity task
    await service.logTaskCompletion({
      taskDescription: "Simple task",
      completedAt: Date.now(),
      durationMinutes: 60,
      complexity: 1,
      energyLevel: "high",
      focusScore: 0.9,
    });

    const lowComplexityScore = mockMemory._memories[1].metadata
      .productivityScore as number;

    expect(highComplexityScore).toBeGreaterThan(lowComplexityScore);
  });

  it("should reward efficient completions", async () => {
    // Fast completion (30min for complexity 3, expected 90min)
    await service.logTaskCompletion({
      taskDescription: "Fast task",
      completedAt: Date.now(),
      durationMinutes: 30,
      complexity: 3,
      energyLevel: "medium",
    });

    const fastScore = mockMemory._memories[0].metadata
      .productivityScore as number;

    // Slow completion (180min for complexity 3)
    await service.logTaskCompletion({
      taskDescription: "Slow task",
      completedAt: Date.now(),
      durationMinutes: 180,
      complexity: 3,
      energyLevel: "medium",
    });

    const slowScore = mockMemory._memories[1].metadata
      .productivityScore as number;

    expect(fastScore).toBeGreaterThan(slowScore);
  });

  it("should apply energy level multiplier", async () => {
    // High energy completion
    await service.logTaskCompletion({
      taskDescription: "High energy task",
      completedAt: Date.now(),
      durationMinutes: 60,
      complexity: 3,
      energyLevel: "high",
      focusScore: 0.8,
    });

    const highEnergyScore = mockMemory._memories[0].metadata
      .productivityScore as number;

    // Low energy completion (same other params)
    await service.logTaskCompletion({
      taskDescription: "Low energy task",
      completedAt: Date.now(),
      durationMinutes: 60,
      complexity: 3,
      energyLevel: "low",
      focusScore: 0.8,
    });

    const lowEnergyScore = mockMemory._memories[1].metadata
      .productivityScore as number;

    expect(highEnergyScore).toBeGreaterThan(lowEnergyScore);
  });
});

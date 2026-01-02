/**
 * Tests for ProactiveService - meeting pre-briefs, memory surfacing, conflict detection.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { calendar_v3 } from "googleapis";

import type { MemorySearchResult } from "../memory/types.js";
import {
  ProactiveService,
  resetProactiveService,
  type Conflict,
  type ProactiveBrief,
  type ProactiveContext,
} from "./proactive.js";

// ─────────────────────────────────────────────────────────────────────────────
// Mocks
// ─────────────────────────────────────────────────────────────────────────────

// Mock memory service
const mockMemorySearch = vi.fn<
  [string, { senderId?: string; limit?: number; minScore?: number }?],
  Promise<MemorySearchResult[]>
>();

const mockMemoryService = {
  save: vi.fn(),
  search: mockMemorySearch,
  get: vi.fn(),
  delete: vi.fn(),
  list: vi.fn(),
  recall: vi.fn(),
  cleanup: vi.fn(),
};

// Mock the memory module
vi.mock("../memory/index.js", () => ({
  createMemoryService: vi.fn(() => Promise.resolve(mockMemoryService)),
  isMemoryEnabled: vi.fn(() => true),
}));

// ─────────────────────────────────────────────────────────────────────────────
// Test Helpers
// ─────────────────────────────────────────────────────────────────────────────

function createTestEvent(overrides: Partial<calendar_v3.Schema$Event> = {}): calendar_v3.Schema$Event {
  const now = new Date();
  const start = new Date(now.getTime() + 60 * 60 * 1000); // 1 hour from now
  const end = new Date(start.getTime() + 60 * 60 * 1000); // 1 hour duration

  return {
    id: overrides.id ?? "event-123",
    summary: overrides.summary ?? "Team Standup",
    description: overrides.description ?? "Daily sync meeting",
    start: overrides.start ?? { dateTime: start.toISOString() },
    end: overrides.end ?? { dateTime: end.toISOString() },
    attendees: overrides.attendees ?? [
      { email: "alice@example.com", displayName: "Alice Smith" },
      { email: "bob@example.com", displayName: "Bob Jones" },
    ],
    ...overrides,
  };
}

function createTestMemory(overrides: Partial<MemorySearchResult> = {}): MemorySearchResult {
  return {
    id: overrides.id ?? `mem-${Math.random().toString(36).slice(2)}`,
    content: overrides.content ?? "Test memory content",
    category: overrides.category ?? "fact",
    source: overrides.source ?? "agent",
    senderId: overrides.senderId ?? "global",
    confidence: overrides.confidence ?? 1.0,
    createdAt: overrides.createdAt ?? Date.now(),
    updatedAt: overrides.updatedAt ?? Date.now(),
    score: overrides.score ?? 0.8,
    ...overrides,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

describe("ProactiveService", () => {
  let service: ProactiveService;

  beforeEach(() => {
    vi.clearAllMocks();
    resetProactiveService();
    service = new ProactiveService(mockMemoryService as any);
    mockMemorySearch.mockResolvedValue([]);
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Meeting Pre-Brief Tests
  // ─────────────────────────────────────────────────────────────────────────────

  describe("getMeetingPreBrief", () => {
    it("generates pre-brief for event with known attendees", async () => {
      const aliceMemory = createTestMemory({
        content: "Alice prefers video calls over phone",
        category: "preference",
      });
      const bobMemory = createTestMemory({
        content: "Bob is working on the authentication module",
        category: "context",
      });

      mockMemorySearch
        .mockResolvedValueOnce([aliceMemory]) // Search for "Team Standup"
        .mockResolvedValueOnce([aliceMemory]) // Search for "alice"
        .mockResolvedValueOnce([bobMemory]) // Search for "bob"
        .mockResolvedValueOnce([]); // Search for description

      const event = createTestEvent();
      const brief = await service.getMeetingPreBrief(event, "+1234567890");

      expect(brief.eventId).toBe("event-123");
      expect(brief.eventSummary).toBe("Team Standup");
      expect(brief.attendees).toContain("alice@example.com");
      expect(brief.attendees).toContain("bob@example.com");
      expect(brief.relevantMemories.length).toBeGreaterThan(0);
    });

    it("handles event without attendees", async () => {
      const event = createTestEvent({ attendees: undefined });

      const brief = await service.getMeetingPreBrief(event);

      expect(brief.attendees).toEqual([]);
      expect(brief.eventId).toBe("event-123");
      expect(brief.eventSummary).toBe("Team Standup");
    });

    it("handles event with empty attendee list", async () => {
      const event = createTestEvent({ attendees: [] });

      const brief = await service.getMeetingPreBrief(event);

      expect(brief.attendees).toEqual([]);
      expect(brief.relevantMemories).toBeDefined();
    });

    it("returns empty memories when no memories exist", async () => {
      mockMemorySearch.mockResolvedValue([]);

      const event = createTestEvent();
      const brief = await service.getMeetingPreBrief(event);

      expect(brief.relevantMemories).toEqual([]);
      expect(brief.eventSummary).toBe("Team Standup");
    });

    it("respects memoriesPerBrief limit", async () => {
      const memories = Array.from({ length: 10 }, (_, i) =>
        createTestMemory({
          id: `mem-${i}`,
          content: `Memory ${i}`,
          score: 0.9 - i * 0.05,
        })
      );

      mockMemorySearch.mockResolvedValue(memories);

      const event = createTestEvent();
      const brief = await service.getMeetingPreBrief(event, undefined, {
        memoriesPerBrief: 3,
      });

      expect(brief.relevantMemories.length).toBeLessThanOrEqual(3);
    });

    it("deduplicates memories from multiple search queries", async () => {
      const sharedMemory = createTestMemory({
        id: "shared-mem",
        content: "Shared memory about the meeting",
      });

      // Same memory returned for multiple queries
      mockMemorySearch.mockResolvedValue([sharedMemory]);

      const event = createTestEvent();
      const brief = await service.getMeetingPreBrief(event);

      // Should only have one instance despite multiple searches
      const uniqueIds = new Set(brief.relevantMemories.map((m) => m.id));
      expect(uniqueIds.size).toBe(brief.relevantMemories.length);
    });

    it("handles memory search errors gracefully", async () => {
      mockMemorySearch.mockRejectedValue(new Error("Search failed"));

      const event = createTestEvent();
      const brief = await service.getMeetingPreBrief(event);

      expect(brief.eventId).toBe("event-123");
      expect(brief.relevantMemories).toEqual([]);
    });

    it("generates suggested topics from high-scoring memories", async () => {
      const topicMemory = createTestMemory({
        content: "Follow up on the budget proposal from last meeting",
        score: 0.85,
      });

      mockMemorySearch.mockResolvedValue([topicMemory]);

      const event = createTestEvent();
      const brief = await service.getMeetingPreBrief(event);

      expect(brief.suggestedTopics).toBeDefined();
      // Topics are generated from memories with score > 0.6
    });

    it("extracts attendee names from email for search", async () => {
      const event = createTestEvent({
        attendees: [{ email: "john.doe@example.com" }],
      });

      await service.getMeetingPreBrief(event);

      // Should search with extracted name
      expect(mockMemorySearch).toHaveBeenCalledWith(
        expect.stringContaining("john"),
        expect.any(Object)
      );
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Memory Surfacing Tests
  // ─────────────────────────────────────────────────────────────────────────────

  describe("surfaceRelevantMemories", () => {
    it("searches memories by query", async () => {
      const memories = [
        createTestMemory({ content: "User likes dark mode" }),
        createTestMemory({ content: "User prefers email over chat" }),
      ];
      mockMemorySearch.mockResolvedValue(memories);

      const result = await service.surfaceRelevantMemories("user preferences");

      expect(mockMemorySearch).toHaveBeenCalledWith("user preferences", {
        senderId: undefined,
        limit: 10,
        minScore: 0.5,
      });
      expect(result).toHaveLength(2);
    });

    it("filters by senderId when provided", async () => {
      mockMemorySearch.mockResolvedValue([]);

      await service.surfaceRelevantMemories("project status", "+1234567890");

      expect(mockMemorySearch).toHaveBeenCalledWith("project status", {
        senderId: "+1234567890",
        limit: 10,
        minScore: 0.5,
      });
    });

    it("respects custom limit option", async () => {
      mockMemorySearch.mockResolvedValue([]);

      await service.surfaceRelevantMemories("search query", undefined, {
        limit: 5,
      });

      expect(mockMemorySearch).toHaveBeenCalledWith(
        "search query",
        expect.objectContaining({ limit: 5 })
      );
    });

    it("respects custom minScore option", async () => {
      mockMemorySearch.mockResolvedValue([]);

      await service.surfaceRelevantMemories("search query", undefined, {
        minScore: 0.7,
      });

      expect(mockMemorySearch).toHaveBeenCalledWith(
        "search query",
        expect.objectContaining({ minScore: 0.7 })
      );
    });

    it("returns empty array when search fails", async () => {
      mockMemorySearch.mockRejectedValue(new Error("Database connection lost"));

      const result = await service.surfaceRelevantMemories("test query");

      expect(result).toEqual([]);
    });

    it("returns empty array for empty results", async () => {
      mockMemorySearch.mockResolvedValue([]);

      const result = await service.surfaceRelevantMemories("nonexistent topic");

      expect(result).toEqual([]);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Conflict Detection Tests
  // ─────────────────────────────────────────────────────────────────────────────

  describe("detectConflicts", () => {
    it("detects overlapping events", () => {
      const now = new Date();
      const event1 = createTestEvent({
        id: "event-1",
        summary: "Meeting A",
        start: { dateTime: now.toISOString() },
        end: { dateTime: new Date(now.getTime() + 2 * 60 * 60 * 1000).toISOString() }, // 2 hours
      });
      const event2 = createTestEvent({
        id: "event-2",
        summary: "Meeting B",
        start: { dateTime: new Date(now.getTime() + 60 * 60 * 1000).toISOString() }, // Starts 1 hour in
        end: { dateTime: new Date(now.getTime() + 3 * 60 * 60 * 1000).toISOString() },
      });

      const conflicts = service.detectConflicts([event1, event2]);

      expect(conflicts.length).toBeGreaterThan(0);
      expect(conflicts[0].type).toBe("schedule_overlap");
      expect(conflicts[0].description).toContain("Meeting A");
      expect(conflicts[0].description).toContain("Meeting B");
      expect(conflicts[0].events).toHaveLength(2);
    });

    it("assigns high severity to large overlaps (>60 min)", () => {
      const now = new Date();
      const event1 = createTestEvent({
        id: "event-1",
        summary: "Long Meeting A",
        start: { dateTime: now.toISOString() },
        end: { dateTime: new Date(now.getTime() + 3 * 60 * 60 * 1000).toISOString() }, // 3 hours
      });
      const event2 = createTestEvent({
        id: "event-2",
        summary: "Long Meeting B",
        start: { dateTime: new Date(now.getTime() + 30 * 60 * 1000).toISOString() }, // Starts 30 min in
        end: { dateTime: new Date(now.getTime() + 4 * 60 * 60 * 1000).toISOString() },
      });

      const conflicts = service.detectConflicts([event1, event2]);

      expect(conflicts[0].severity).toBe("high");
    });

    it("assigns medium severity to moderate overlaps (15-60 min)", () => {
      const now = new Date();
      const event1 = createTestEvent({
        id: "event-1",
        summary: "Meeting A",
        start: { dateTime: now.toISOString() },
        end: { dateTime: new Date(now.getTime() + 60 * 60 * 1000).toISOString() }, // 1 hour
      });
      const event2 = createTestEvent({
        id: "event-2",
        summary: "Meeting B",
        start: { dateTime: new Date(now.getTime() + 40 * 60 * 1000).toISOString() }, // Starts 40 min in, 20 min overlap
        end: { dateTime: new Date(now.getTime() + 90 * 60 * 1000).toISOString() },
      });

      const conflicts = service.detectConflicts([event1, event2]);

      expect(conflicts[0].severity).toBe("medium");
    });

    it("assigns low severity to small overlaps (<15 min)", () => {
      const now = new Date();
      const event1 = createTestEvent({
        id: "event-1",
        summary: "Meeting A",
        start: { dateTime: now.toISOString() },
        end: { dateTime: new Date(now.getTime() + 60 * 60 * 1000).toISOString() },
      });
      const event2 = createTestEvent({
        id: "event-2",
        summary: "Meeting B",
        start: { dateTime: new Date(now.getTime() + 55 * 60 * 1000).toISOString() }, // 5 min overlap
        end: { dateTime: new Date(now.getTime() + 90 * 60 * 1000).toISOString() },
      });

      const conflicts = service.detectConflicts([event1, event2]);

      expect(conflicts[0].severity).toBe("low");
    });

    it("detects back-to-back meetings (deadline clash)", () => {
      const now = new Date();
      const event1 = createTestEvent({
        id: "event-1",
        summary: "First Meeting",
        start: { dateTime: now.toISOString() },
        end: { dateTime: new Date(now.getTime() + 60 * 60 * 1000).toISOString() },
      });
      const event2 = createTestEvent({
        id: "event-2",
        summary: "Second Meeting",
        start: { dateTime: new Date(now.getTime() + 60 * 60 * 1000).toISOString() }, // Starts exactly when first ends
        end: { dateTime: new Date(now.getTime() + 120 * 60 * 1000).toISOString() },
      });

      const conflicts = service.detectConflicts([event1, event2]);

      const backToBack = conflicts.find((c) => c.type === "deadline_clash");
      expect(backToBack).toBeDefined();
      expect(backToBack?.description).toContain("Back-to-back");
      expect(backToBack?.severity).toBe("low");
    });

    it("returns empty array when no conflicts exist", () => {
      const now = new Date();
      const event1 = createTestEvent({
        id: "event-1",
        summary: "Morning Meeting",
        start: { dateTime: now.toISOString() },
        end: { dateTime: new Date(now.getTime() + 60 * 60 * 1000).toISOString() },
      });
      const event2 = createTestEvent({
        id: "event-2",
        summary: "Afternoon Meeting",
        start: { dateTime: new Date(now.getTime() + 5 * 60 * 60 * 1000).toISOString() }, // 5 hours later
        end: { dateTime: new Date(now.getTime() + 6 * 60 * 60 * 1000).toISOString() },
      });

      const conflicts = service.detectConflicts([event1, event2]);

      // Should only have potential back-to-back detection, no overlaps
      const overlaps = conflicts.filter((c) => c.type === "schedule_overlap");
      expect(overlaps).toHaveLength(0);
    });

    it("handles events with only date (all-day events)", () => {
      const event1 = createTestEvent({
        id: "event-1",
        summary: "All Day Event",
        start: { date: "2025-01-15" },
        end: { date: "2025-01-16" },
      });
      const event2 = createTestEvent({
        id: "event-2",
        summary: "Another All Day Event",
        start: { date: "2025-01-15" },
        end: { date: "2025-01-16" },
      });

      const conflicts = service.detectConflicts([event1, event2]);

      // All-day events on same day should overlap
      expect(conflicts.length).toBeGreaterThan(0);
    });

    it("handles events with invalid dates gracefully", () => {
      const validEvent = createTestEvent({
        id: "valid",
        summary: "Valid Meeting",
      });
      const invalidEvent = createTestEvent({
        id: "invalid",
        summary: "Invalid Meeting",
        start: { dateTime: "not-a-date" },
        end: { dateTime: "also-not-a-date" },
      });

      // Should not throw
      const conflicts = service.detectConflicts([validEvent, invalidEvent]);
      expect(conflicts).toBeDefined();
    });

    it("handles empty events array", () => {
      const conflicts = service.detectConflicts([]);
      expect(conflicts).toEqual([]);
    });

    it("handles single event array", () => {
      const event = createTestEvent();
      const conflicts = service.detectConflicts([event]);
      expect(conflicts).toEqual([]);
    });

    it("provides resolution suggestions for conflicts", () => {
      const now = new Date();
      const event1 = createTestEvent({
        id: "event-1",
        summary: "Meeting A",
        start: { dateTime: now.toISOString() },
        end: { dateTime: new Date(now.getTime() + 2 * 60 * 60 * 1000).toISOString() },
      });
      const event2 = createTestEvent({
        id: "event-2",
        summary: "Meeting B",
        start: { dateTime: new Date(now.getTime() + 60 * 60 * 1000).toISOString() },
        end: { dateTime: new Date(now.getTime() + 3 * 60 * 60 * 1000).toISOString() },
      });

      const conflicts = service.detectConflicts([event1, event2]);

      expect(conflicts[0].suggestion).toBeDefined();
      expect(conflicts[0].suggestion?.length).toBeGreaterThan(0);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Context Generation Tests
  // ─────────────────────────────────────────────────────────────────────────────

  describe("generateProactiveContext", () => {
    it("generates full proactive context with all components", async () => {
      const now = new Date();
      const futureEvent = createTestEvent({
        start: { dateTime: new Date(now.getTime() + 30 * 60 * 1000).toISOString() },
        end: { dateTime: new Date(now.getTime() + 90 * 60 * 1000).toISOString() },
      });

      const memory = createTestMemory({ content: "Important context" });
      mockMemorySearch.mockResolvedValue([memory]);

      const context = await service.generateProactiveContext({
        events: [futureEvent],
        currentContext: "project discussion",
        senderId: "+1234567890",
      });

      expect(context.meetingBriefs).toBeDefined();
      expect(context.surfacedMemories).toBeDefined();
      expect(context.conflicts).toBeDefined();
      expect(context.timestamp).toBeGreaterThan(0);
    });

    it("filters out past events", async () => {
      const now = new Date();
      const pastEvent = createTestEvent({
        id: "past-event",
        start: { dateTime: new Date(now.getTime() - 2 * 60 * 60 * 1000).toISOString() },
        end: { dateTime: new Date(now.getTime() - 60 * 60 * 1000).toISOString() },
      });
      const futureEvent = createTestEvent({
        id: "future-event",
        start: { dateTime: new Date(now.getTime() + 60 * 60 * 1000).toISOString() },
        end: { dateTime: new Date(now.getTime() + 120 * 60 * 1000).toISOString() },
      });

      const context = await service.generateProactiveContext({
        events: [pastEvent, futureEvent],
      });

      // Past events should not generate briefs
      const briefEventIds = context.meetingBriefs.map((b) => b.eventId);
      expect(briefEventIds).not.toContain("past-event");
    });

    it("respects maxBriefs limit", async () => {
      const now = new Date();
      const events = Array.from({ length: 10 }, (_, i) =>
        createTestEvent({
          id: `event-${i}`,
          start: { dateTime: new Date(now.getTime() + (i + 1) * 60 * 60 * 1000).toISOString() },
          end: { dateTime: new Date(now.getTime() + (i + 2) * 60 * 60 * 1000).toISOString() },
        })
      );

      const context = await service.generateProactiveContext({
        events,
        maxBriefs: 3,
      });

      expect(context.meetingBriefs.length).toBeLessThanOrEqual(3);
    });

    it("surfaces memories when currentContext is provided", async () => {
      const memory = createTestMemory({ content: "Relevant info" });
      mockMemorySearch.mockResolvedValue([memory]);

      const context = await service.generateProactiveContext({
        currentContext: "quarterly review",
      });

      expect(context.surfacedMemories.length).toBeGreaterThan(0);
    });

    it("does not surface memories when currentContext is absent", async () => {
      mockMemorySearch.mockResolvedValue([]);

      const context = await service.generateProactiveContext({
        events: [],
      });

      expect(context.surfacedMemories).toEqual([]);
    });

    it("handles brief generation errors gracefully", async () => {
      mockMemorySearch.mockRejectedValue(new Error("Memory service unavailable"));

      const now = new Date();
      const event = createTestEvent({
        start: { dateTime: new Date(now.getTime() + 60 * 60 * 1000).toISOString() },
        end: { dateTime: new Date(now.getTime() + 120 * 60 * 1000).toISOString() },
      });

      const context = await service.generateProactiveContext({
        events: [event],
      });

      // Should still return a valid context even if brief generation fails
      expect(context).toBeDefined();
      expect(context.timestamp).toBeGreaterThan(0);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Context Formatting Tests
  // ─────────────────────────────────────────────────────────────────────────────

  describe("formatContextForInjection", () => {
    it("formats meeting briefs section correctly", () => {
      const brief: ProactiveBrief = {
        eventId: "event-1",
        eventSummary: "Team Sync",
        startTime: "2025-01-15T10:00:00Z",
        endTime: "2025-01-15T11:00:00Z",
        attendees: ["alice@example.com", "bob@example.com"],
        relevantMemories: [
          createTestMemory({ content: "Alice mentioned budget concerns" }),
        ],
        suggestedTopics: ["Budget review"],
      };

      const context: ProactiveContext = {
        meetingBriefs: [brief],
        surfacedMemories: [],
        conflicts: [],
        timestamp: Date.now(),
      };

      const formatted = service.formatContextForInjection(context);

      expect(formatted).toContain("Upcoming Meetings");
      expect(formatted).toContain("Team Sync");
      expect(formatted).toContain("alice@example.com");
      expect(formatted).toContain("Alice mentioned budget concerns");
    });

    it("formats conflicts section correctly", () => {
      const conflict: Conflict = {
        type: "schedule_overlap",
        description: "Meeting A overlaps with Meeting B by 30 minutes",
        events: [
          { id: "1", summary: "Meeting A", start: "", end: "" },
          { id: "2", summary: "Meeting B", start: "", end: "" },
        ],
        severity: "high",
        suggestion: "Consider rescheduling",
      };

      const context: ProactiveContext = {
        meetingBriefs: [],
        surfacedMemories: [],
        conflicts: [conflict],
        timestamp: Date.now(),
      };

      const formatted = service.formatContextForInjection(context);

      expect(formatted).toContain("Schedule Alerts");
      expect(formatted).toContain("[HIGH]");
      expect(formatted).toContain("Meeting A overlaps with Meeting B");
      expect(formatted).toContain("Consider rescheduling");
    });

    it("formats surfaced memories section correctly", () => {
      const memory = createTestMemory({
        content: "User prefers morning meetings",
        category: "preference",
        score: 0.85,
      });

      const context: ProactiveContext = {
        meetingBriefs: [],
        surfacedMemories: [memory],
        conflicts: [],
        timestamp: Date.now(),
      };

      const formatted = service.formatContextForInjection(context);

      expect(formatted).toContain("Relevant Context");
      expect(formatted).toContain("User prefers morning meetings");
      expect(formatted).toContain("preference");
      expect(formatted).toContain("0.85");
    });

    it("returns empty string when no context available", () => {
      const context: ProactiveContext = {
        meetingBriefs: [],
        surfacedMemories: [],
        conflicts: [],
        timestamp: Date.now(),
      };

      const formatted = service.formatContextForInjection(context);

      expect(formatted).toBe("");
    });

    it("includes severity indicators for conflicts", () => {
      const lowConflict: Conflict = {
        type: "deadline_clash",
        description: "Back-to-back meetings",
        events: [],
        severity: "low",
      };

      const mediumConflict: Conflict = {
        type: "schedule_overlap",
        description: "Moderate overlap",
        events: [],
        severity: "medium",
      };

      const context: ProactiveContext = {
        meetingBriefs: [],
        surfacedMemories: [],
        conflicts: [lowConflict, mediumConflict],
        timestamp: Date.now(),
      };

      const formatted = service.formatContextForInjection(context);

      expect(formatted).toContain("[LOW]");
      expect(formatted).toContain("[MEDIUM]");
    });

    it("combines multiple sections with separators", () => {
      const brief: ProactiveBrief = {
        eventId: "1",
        eventSummary: "Meeting",
        startTime: "",
        attendees: [],
        relevantMemories: [],
      };

      const memory = createTestMemory({ content: "Test memory" });

      const conflict: Conflict = {
        type: "schedule_overlap",
        description: "Overlap detected",
        events: [],
        severity: "low",
      };

      const context: ProactiveContext = {
        meetingBriefs: [brief],
        surfacedMemories: [memory],
        conflicts: [conflict],
        timestamp: Date.now(),
      };

      const formatted = service.formatContextForInjection(context);

      // Should have section separators
      expect(formatted).toContain("---");
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Error Handling Tests
  // ─────────────────────────────────────────────────────────────────────────────

  describe("error handling", () => {
    it("handles memory service unavailable", async () => {
      mockMemorySearch.mockRejectedValue(new Error("Service unavailable"));

      const event = createTestEvent();
      const brief = await service.getMeetingPreBrief(event);

      // Should return a valid brief with empty memories
      expect(brief.eventId).toBe("event-123");
      expect(brief.relevantMemories).toEqual([]);
    });

    it("handles malformed event data", async () => {
      const malformedEvent: calendar_v3.Schema$Event = {
        // Missing id and times
        summary: "Malformed Event",
      };

      const brief = await service.getMeetingPreBrief(malformedEvent);

      expect(brief.eventId).toBe("");
      expect(brief.eventSummary).toBe("Malformed Event");
    });

    it("handles null/undefined in event fields", async () => {
      const event = createTestEvent({
        summary: undefined,
        description: undefined,
        attendees: undefined,
      });

      const brief = await service.getMeetingPreBrief(event);

      expect(brief.eventSummary).toBe("Untitled Event");
      expect(brief.attendees).toEqual([]);
    });
  });
});

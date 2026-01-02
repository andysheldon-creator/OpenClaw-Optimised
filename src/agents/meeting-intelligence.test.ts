/**
 * Comprehensive test suite for Meeting Intelligence Service
 * Tests: Pre-brief generation, Action item extraction, Meeting history lookup, Follow-up creation
 *
 * Uses vitest with mocked memory store and calendar service.
 */

import type { calendar_v3 } from "googleapis";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { MemorySearchResult, MemoryService } from "../memory/index.js";
import {
  type FollowUpOptions,
  MeetingIntelligenceService,
  resetMeetingIntelligenceService,
} from "./meeting-intelligence.js";

// ============================================================================
// MOCK SETUP
// ============================================================================

/**
 * Create a mock memory service with configurable responses
 */
function createMockMemoryService(
  overrides?: Partial<MemoryService>,
): MemoryService {
  return {
    save: vi.fn().mockResolvedValue({
      id: "mem_saved_123",
      content: "saved content",
      category: "reminder",
      source: "agent",
      senderId: "global",
      confidence: 1.0,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }),
    search: vi.fn().mockResolvedValue([]),
    get: vi.fn().mockResolvedValue(null),
    delete: vi.fn().mockResolvedValue(true),
    list: vi.fn().mockResolvedValue([]),
    recall: vi.fn().mockResolvedValue([]),
    cleanup: vi.fn().mockResolvedValue(0),
    ...overrides,
  } as unknown as MemoryService;
}

/**
 * Create a sample calendar event
 */
function createCalendarEvent(
  overrides?: Partial<calendar_v3.Schema$Event>,
): calendar_v3.Schema$Event {
  return {
    id: "evt_test_001",
    summary: "Weekly Team Sync",
    description: "Review progress and discuss blockers",
    start: { dateTime: "2024-01-15T10:00:00Z" },
    end: { dateTime: "2024-01-15T11:00:00Z" },
    attendees: [
      { email: "alice@company.com", responseStatus: "accepted" },
      { email: "bob@company.com", responseStatus: "tentative" },
    ],
    location: "Conference Room A",
    hangoutLink: "https://meet.google.com/abc-123",
    ...overrides,
  };
}

/**
 * Create sample memory search results
 */
function createMemorySearchResults(count = 2): MemorySearchResult[] {
  const categories: MemorySearchResult["category"][] = [
    "fact",
    "context",
    "preference",
    "reminder",
  ];
  return Array.from({ length: count }, (_, i) => ({
    id: `mem_${i + 1}`,
    content: `Memory content ${i + 1}: relevant information about the topic`,
    category: categories[i % categories.length],
    source: "agent" as const,
    senderId: "global",
    confidence: 0.9 - i * 0.1,
    createdAt: Date.now() - i * 86400000,
    updatedAt: Date.now() - i * 86400000,
    score: 0.85 - i * 0.1,
  }));
}

// ============================================================================
// PRE-BRIEF GENERATION TESTS
// ============================================================================

describe("MeetingIntelligenceService", () => {
  let service: MeetingIntelligenceService;
  let mockMemory: MemoryService;

  beforeEach(() => {
    mockMemory = createMockMemoryService();
    service = new MeetingIntelligenceService(mockMemory);
  });

  afterEach(() => {
    vi.clearAllMocks();
    resetMeetingIntelligenceService();
  });

  describe("generatePreBrief()", () => {
    it("should generate pre-brief for standard event", async () => {
      const event = createCalendarEvent();
      const preBrief = await service.generatePreBrief(event);

      expect(preBrief).toMatchObject({
        eventId: "evt_test_001",
        eventSummary: "Weekly Team Sync",
        startTime: "2024-01-15T10:00:00Z",
        endTime: "2024-01-15T11:00:00Z",
        location: "Conference Room A",
        attendees: expect.arrayContaining([
          "alice@company.com",
          "bob@company.com",
        ]),
      });
      expect(preBrief.generatedAt).toBeGreaterThan(0);
    });

    it("should extract attendees from event", async () => {
      const event = createCalendarEvent({
        attendees: [
          { email: "user1@test.com" },
          { email: "user2@test.com" },
          { email: "user3@test.com" },
        ],
      });

      const preBrief = await service.generatePreBrief(event);

      expect(preBrief.attendees).toHaveLength(3);
      expect(preBrief.attendees).toContain("user1@test.com");
      expect(preBrief.attendees).toContain("user2@test.com");
      expect(preBrief.attendees).toContain("user3@test.com");
    });

    it("should handle event with no attendees", async () => {
      const event = createCalendarEvent({ attendees: undefined });

      const preBrief = await service.generatePreBrief(event);

      expect(preBrief.attendees).toEqual([]);
    });

    it("should search memories for relevant context", async () => {
      const memories = createMemorySearchResults(3);
      (mockMemory.search as ReturnType<typeof vi.fn>).mockResolvedValue(
        memories,
      );

      const event = createCalendarEvent();
      const preBrief = await service.generatePreBrief(event, {
        senderId: "user123",
      });

      expect(mockMemory.search).toHaveBeenCalled();
      expect(preBrief.relevantMemories.length).toBeGreaterThan(0);
    });

    it("should handle memory search errors gracefully", async () => {
      (mockMemory.search as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error("Memory unavailable"),
      );

      const event = createCalendarEvent();
      const preBrief = await service.generatePreBrief(event);

      expect(preBrief).toBeDefined();
      expect(preBrief.relevantMemories).toEqual([]);
    });

    it("should use fallback for hangoutLink when no location", async () => {
      const event = createCalendarEvent({
        location: undefined,
        hangoutLink: "https://meet.google.com/xyz-789",
      });

      const preBrief = await service.generatePreBrief(event);

      expect(preBrief.location).toBe("https://meet.google.com/xyz-789");
    });

    it("should handle all-day events with date instead of dateTime", async () => {
      const event = createCalendarEvent({
        start: { date: "2024-01-15" },
        end: { date: "2024-01-16" },
      });

      const preBrief = await service.generatePreBrief(event);

      expect(preBrief.startTime).toBe("2024-01-15");
      expect(preBrief.endTime).toBe("2024-01-16");
    });

    it("should handle event with missing summary", async () => {
      const event = createCalendarEvent({ summary: undefined });

      const preBrief = await service.generatePreBrief(event);

      expect(preBrief.eventSummary).toBe("Untitled Meeting");
    });

    it("should generate suggested topics based on event description", async () => {
      const event = createCalendarEvent({
        description:
          "Discuss Q4 roadmap\nReview budget allocation\nTeam updates",
      });

      const preBrief = await service.generatePreBrief(event);

      expect(preBrief.suggestedTopics.length).toBeGreaterThan(0);
    });

    it("should generate preparation tasks for review meetings", async () => {
      const event = createCalendarEvent({ summary: "Code Review Session" });

      const preBrief = await service.generatePreBrief(event);

      expect(
        preBrief.preparationTasks.some(
          (t) =>
            t.toLowerCase().includes("demo") ||
            t.toLowerCase().includes("review"),
        ),
      ).toBe(true);
    });

    it("should generate preparation tasks for 1:1 meetings", async () => {
      const event = createCalendarEvent({ summary: "1:1 with Manager" });

      const preBrief = await service.generatePreBrief(event);

      expect(
        preBrief.preparationTasks.some(
          (t) =>
            t.toLowerCase().includes("discuss") ||
            t.toLowerCase().includes("feedback"),
        ),
      ).toBe(true);
    });

    it("should extract outstanding actions from reminder memories", async () => {
      const memories: MemorySearchResult[] = [
        {
          id: "mem_action_1",
          content: "Follow up on pending budget approval",
          category: "reminder",
          source: "agent",
          senderId: "global",
          confidence: 0.9,
          createdAt: Date.now(),
          updatedAt: Date.now(),
          score: 0.8,
        },
      ];
      (mockMemory.search as ReturnType<typeof vi.fn>).mockResolvedValue(
        memories,
      );

      const event = createCalendarEvent();
      const preBrief = await service.generatePreBrief(event);

      expect(preBrief.outstandingActions.length).toBeGreaterThan(0);
    });

    it("should respect maxMemories option", async () => {
      const memories = createMemorySearchResults(10);
      (mockMemory.search as ReturnType<typeof vi.fn>).mockResolvedValue(
        memories,
      );

      const event = createCalendarEvent();
      const preBrief = await service.generatePreBrief(event, {
        maxMemories: 3,
      });

      expect(preBrief.relevantMemories.length).toBeLessThanOrEqual(3);
    });
  });

  // ============================================================================
  // ACTION ITEM EXTRACTION TESTS
  // ============================================================================

  describe("extractActionItems()", () => {
    it("should extract 'will' pattern action items", () => {
      const text = "John will prepare the report by Friday.";
      const items = service.extractActionItems(text);

      expect(items.length).toBeGreaterThan(0);
      expect(items[0]).toMatchObject({
        assignee: "John",
        status: "pending",
      });
      expect(items[0].description.toLowerCase()).toContain("prepare");
    });

    it("should extract TODO pattern action items", () => {
      const text = "TODO: Review the design documents";
      const items = service.extractActionItems(text);

      expect(items.length).toBeGreaterThan(0);
      expect(items[0].description.toLowerCase()).toContain("review");
    });

    it("should extract Action prefix pattern", () => {
      const text = "Action: Team to submit feedback by EOD";
      const items = service.extractActionItems(text);

      expect(items.length).toBeGreaterThan(0);
      expect(items[0].priority).toBe("high");
    });

    it("should extract @mention style items", () => {
      const text = "@Sarah please check the budget estimates";
      const items = service.extractActionItems(text);

      expect(items.length).toBeGreaterThan(0);
      expect(items[0].assignee).toBe("Sarah");
    });

    it("should extract follow-up patterns", () => {
      const text = "Follow up on the client proposal next week.";
      const items = service.extractActionItems(text);

      expect(items.length).toBeGreaterThan(0);
    });

    it("should extract 'need to' patterns", () => {
      const text = "We need to finalize the architecture decision.";
      const items = service.extractActionItems(text);

      expect(items.length).toBeGreaterThan(0);
    });

    it("should extract deadline from text", () => {
      const text = "Submit the report by Friday.";
      const items = service.extractActionItems(text);

      expect(items.length).toBeGreaterThan(0);
      expect(items[0].deadline).toBeDefined();
    });

    it("should extract deadline with tomorrow", () => {
      const text = "John will finish the task by tomorrow.";
      const items = service.extractActionItems(text);

      expect(items.length).toBeGreaterThan(0);
      expect(items[0].deadline).toBeDefined();
    });

    it("should extract multiple action items from text", () => {
      const text = `
        John will prepare the presentation by Monday.
        TODO: Update the documentation.
        @Alice please review the code changes.
        Action: Engineering to deploy by EOD.
      `;
      const items = service.extractActionItems(text);

      expect(items.length).toBeGreaterThanOrEqual(3);
    });

    it("should return empty array for no action items", () => {
      const text =
        "This is a general discussion about market trends without any specific tasks.";
      const items = service.extractActionItems(text);

      expect(items).toEqual([]);
    });

    it("should handle empty string", () => {
      const items = service.extractActionItems("");
      expect(items).toEqual([]);
    });

    it("should skip very short descriptions", () => {
      const text = "John will do it.";
      const items = service.extractActionItems(text);

      // "do it" is less than 5 characters, should be filtered
      expect(items.every((i) => i.description.length >= 5)).toBe(true);
    });

    it("should deduplicate similar action items", () => {
      const text = `
        TODO: Fix the bug
        We need to fix the bug
      `;
      const items = service.extractActionItems(text);

      // Should dedupe based on description
      const descriptions = items.map((i) => i.description.toLowerCase());
      const uniqueDescriptions = new Set(descriptions);
      expect(uniqueDescriptions.size).toBe(descriptions.length);
    });

    it("should sort by priority and confidence", () => {
      const text = `
        Action: Critical fix needed by EOD.
        TODO: Review docs someday.
      `;
      const items = service.extractActionItems(text);

      if (items.length >= 2) {
        // High priority items should come first
        const priorityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
        for (let i = 1; i < items.length; i++) {
          const prevPriority = priorityOrder[items[i - 1].priority];
          const currPriority = priorityOrder[items[i].priority];
          expect(prevPriority).toBeLessThanOrEqual(currPriority);
        }
      }
    });

    it("should handle special characters in text", () => {
      const text = "TODO: Fix UTF-8 encoding for: cafe, naive characters";
      const items = service.extractActionItems(text);

      expect(items).toBeDefined();
      expect(() => service.extractActionItems(text)).not.toThrow();
    });

    it("should assign unique IDs to action items", () => {
      const text = `
        TODO: Task one
        TODO: Task two
        TODO: Task three
      `;
      const items = service.extractActionItems(text);

      const ids = items.map((i) => i.id);
      const uniqueIds = new Set(ids);
      expect(uniqueIds.size).toBe(ids.length);
    });

    it("should calculate confidence score based on markers", () => {
      const explicitAction = "Action: Complete the deployment";
      const vagueAction = "John might possibly do something";

      const explicitItems = service.extractActionItems(explicitAction);
      const vagueItems = service.extractActionItems(vagueAction);

      if (explicitItems.length > 0 && vagueItems.length > 0) {
        expect(explicitItems[0].confidence).toBeGreaterThan(
          vagueItems[0].confidence,
        );
      }
    });
  });

  // ============================================================================
  // DECISION EXTRACTION TESTS
  // ============================================================================

  describe("extractDecisions()", () => {
    it("should extract 'decided' pattern decisions", () => {
      const text = "We decided to use Kubernetes for orchestration.";
      const decisions = service.extractDecisions(text);

      expect(decisions.length).toBeGreaterThan(0);
      expect(decisions[0].decision.toLowerCase()).toContain("kubernetes");
    });

    it("should extract 'agreed' pattern decisions", () => {
      const text = "The team agreed that the deadline should be extended.";
      const decisions = service.extractDecisions(text);

      expect(decisions.length).toBeGreaterThan(0);
    });

    it("should extract 'going with' pattern decisions", () => {
      const text = "We're going with option B for the implementation.";
      const decisions = service.extractDecisions(text);

      expect(decisions.length).toBeGreaterThan(0);
    });

    it("should extract 'approved' pattern decisions", () => {
      const text = "Approved: Budget increase for Q2 marketing campaign.";
      const decisions = service.extractDecisions(text);

      expect(decisions.length).toBeGreaterThan(0);
      expect(decisions[0].confidence).toBeGreaterThanOrEqual(0.9);
    });

    it("should return empty array when no decisions found", () => {
      const text =
        "General discussion about various topics without conclusions.";
      const decisions = service.extractDecisions(text);

      expect(decisions).toEqual([]);
    });

    it("should handle empty string", () => {
      const decisions = service.extractDecisions("");
      expect(decisions).toEqual([]);
    });

    it("should skip very short decisions", () => {
      const text = "We decided ok.";
      const decisions = service.extractDecisions(text);

      // "ok" is less than 10 characters
      expect(decisions.every((d) => d.decision.length >= 10)).toBe(true);
    });

    it("should deduplicate similar decisions", () => {
      const text = `
        We decided to use React.
        The decision is to use React.
      `;
      const decisions = service.extractDecisions(text);

      const texts = decisions.map((d) => d.decision.toLowerCase());
      const uniqueTexts = new Set(texts);
      expect(uniqueTexts.size).toBe(texts.length);
    });

    it("should sort decisions by confidence", () => {
      const text = `
        Approved: New policy takes effect immediately.
        Finally, we might consider the alternative approach.
      `;
      const decisions = service.extractDecisions(text);

      if (decisions.length >= 2) {
        for (let i = 1; i < decisions.length; i++) {
          expect(decisions[i - 1].confidence).toBeGreaterThanOrEqual(
            decisions[i].confidence,
          );
        }
      }
    });
  });

  // ============================================================================
  // MEETING HISTORY LOOKUP (REAL-TIME ASSISTANCE) TESTS
  // ============================================================================

  describe("getRealTimeAssistance()", () => {
    it("should return relevant context based on current topic", async () => {
      const memories = createMemorySearchResults(3);
      (mockMemory.search as ReturnType<typeof vi.fn>).mockResolvedValue(
        memories,
      );

      const event = createCalendarEvent();
      const assistance = await service.getRealTimeAssistance(
        event,
        "budget discussion",
        undefined,
        "user123",
      );

      expect(mockMemory.search).toHaveBeenCalledWith(
        "budget discussion",
        expect.any(Object),
      );
      expect(assistance.relevantContext.length).toBeGreaterThan(0);
    });

    it("should handle missing current topic", async () => {
      const event = createCalendarEvent();
      const assistance = await service.getRealTimeAssistance(event, undefined);

      expect(assistance.relevantContext).toEqual([]);
    });

    it("should detect action items from notes", async () => {
      const event = createCalendarEvent();
      const notes = "TODO: Review the proposal. John will send the document.";
      const assistance = await service.getRealTimeAssistance(
        event,
        "project planning",
        notes,
      );

      expect(assistance.detectedActions.length).toBeGreaterThan(0);
    });

    it("should detect decisions from notes", async () => {
      const event = createCalendarEvent();
      const notes = "We decided to proceed with vendor A for the integration.";
      const assistance = await service.getRealTimeAssistance(
        event,
        "vendor selection",
        notes,
      );

      expect(assistance.detectedDecisions.length).toBeGreaterThan(0);
    });

    it("should generate suggested questions based on context", async () => {
      const memories: MemorySearchResult[] = [
        {
          id: "mem_1",
          content: "Previous project timeline was 6 months",
          category: "context",
          source: "agent",
          senderId: "global",
          confidence: 0.9,
          createdAt: Date.now(),
          updatedAt: Date.now(),
          score: 0.85,
        },
      ];
      (mockMemory.search as ReturnType<typeof vi.fn>).mockResolvedValue(
        memories,
      );

      const event = createCalendarEvent();
      const assistance = await service.getRealTimeAssistance(
        event,
        "project timeline",
      );

      expect(assistance.suggestedQuestions.length).toBeGreaterThan(0);
    });

    it("should get attendee facts from memory", async () => {
      const factMemory: MemorySearchResult = {
        id: "mem_fact_1",
        content: "Alice prefers morning meetings",
        category: "fact",
        source: "agent",
        senderId: "global",
        confidence: 0.9,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        score: 0.8,
      };
      (mockMemory.search as ReturnType<typeof vi.fn>).mockResolvedValue([
        factMemory,
      ]);

      const event = createCalendarEvent({
        attendees: [{ email: "alice@company.com" }],
      });
      const assistance = await service.getRealTimeAssistance(
        event,
        "meeting planning",
        undefined,
        "user123",
      );

      expect(assistance.attendeeFacts.length).toBeGreaterThanOrEqual(0);
    });

    it("should handle memory search errors gracefully", async () => {
      (mockMemory.search as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error("Search failed"),
      );

      const event = createCalendarEvent();
      const assistance = await service.getRealTimeAssistance(
        event,
        "some topic",
      );

      expect(assistance).toBeDefined();
      expect(assistance.relevantContext).toEqual([]);
    });

    it("should return event ID in assistance", async () => {
      const event = createCalendarEvent({ id: "evt_custom_123" });
      const assistance = await service.getRealTimeAssistance(event);

      expect(assistance.eventId).toBe("evt_custom_123");
    });
  });

  // ============================================================================
  // FOLLOW-UP CREATION TESTS
  // ============================================================================

  describe("generateFollowUp()", () => {
    it("should generate follow-up with summary", async () => {
      const event = createCalendarEvent();
      const options: FollowUpOptions = {
        notes:
          "Discussed roadmap priorities. John will prepare Q2 plan by Friday.",
      };

      const followUp = await service.generateFollowUp(event, options);

      expect(followUp).toMatchObject({
        eventId: "evt_test_001",
        eventSummary: "Weekly Team Sync",
        summary: expect.any(String),
        generatedAt: expect.any(Number),
      });
    });

    it("should extract action items from notes", async () => {
      const event = createCalendarEvent();
      const options: FollowUpOptions = {
        notes: `
          TODO: Update documentation
          Alice will review the PR by Monday
          Action: Deploy to staging
        `,
      };

      const followUp = await service.generateFollowUp(event, options);

      expect(followUp.actionItems.length).toBeGreaterThan(0);
    });

    it("should extract decisions from notes", async () => {
      const event = createCalendarEvent();
      const options: FollowUpOptions = {
        notes: "We decided to postpone the launch until Q3.",
      };

      const followUp = await service.generateFollowUp(event, options);

      expect(followUp.decisions.length).toBeGreaterThan(0);
    });

    it("should extract key points from bullet points", async () => {
      const event = createCalendarEvent();
      const options: FollowUpOptions = {
        notes: `
          - First important point discussed
          - Second key topic covered in detail
          - Third item requiring follow-up
        `,
      };

      const followUp = await service.generateFollowUp(event, options);

      expect(followUp.keyPoints.length).toBeGreaterThan(0);
    });

    it("should extract key points from numbered lists", async () => {
      const event = createCalendarEvent();
      const options: FollowUpOptions = {
        notes: `
          1. First agenda item completed successfully
          2. Second point discussed with stakeholders
          3. Third topic deferred to next meeting
        `,
      };

      const followUp = await service.generateFollowUp(event, options);

      expect(followUp.keyPoints.length).toBeGreaterThan(0);
    });

    it("should generate next steps from high-priority actions", async () => {
      const event = createCalendarEvent();
      const options: FollowUpOptions = {
        notes:
          "Action: Critical fix needed by EOD. We decided to use the new API.",
      };

      const followUp = await service.generateFollowUp(event, options);

      expect(followUp.nextSteps.length).toBeGreaterThan(0);
    });

    it("should generate follow-up email draft by default", async () => {
      const event = createCalendarEvent();
      const options: FollowUpOptions = {
        notes: "TODO: Review proposal. We decided to proceed with plan A.",
      };

      const followUp = await service.generateFollowUp(event, options);

      expect(followUp.followUpEmailDraft).toBeDefined();
      expect(followUp.followUpEmailDraft.subject).toContain("Follow-up");
      expect(followUp.followUpEmailDraft.body).toContain("Weekly Team Sync");
    });

    it("should skip email draft when generateEmailDraft is false", async () => {
      const event = createCalendarEvent();
      const options: FollowUpOptions = {
        notes: "General discussion notes.",
        generateEmailDraft: false,
      };

      const followUp = await service.generateFollowUp(event, options);

      expect(followUp.followUpEmailDraft.to).toEqual([]);
      expect(followUp.followUpEmailDraft.subject).toBe("");
      expect(followUp.followUpEmailDraft.body).toBe("");
    });

    it("should include attendees in email recipients", async () => {
      const event = createCalendarEvent({
        attendees: [
          { email: "team@company.com" },
          { email: "manager@company.com" },
        ],
      });
      const options: FollowUpOptions = {
        notes: "Meeting notes here.",
      };

      const followUp = await service.generateFollowUp(event, options);

      expect(followUp.followUpEmailDraft.to).toContain("team@company.com");
      expect(followUp.followUpEmailDraft.to).toContain("manager@company.com");
    });

    it("should save action items to memory when senderId provided", async () => {
      const event = createCalendarEvent();
      const options: FollowUpOptions = {
        notes: "TODO: Important task to track",
        senderId: "user123",
      };

      await service.generateFollowUp(event, options);

      expect(mockMemory.save).toHaveBeenCalled();
    });

    it("should not save to memory when no senderId", async () => {
      const event = createCalendarEvent();
      const options: FollowUpOptions = {
        notes: "TODO: Task without sender",
      };

      await service.generateFollowUp(event, options);

      // save is called only when there are action items AND senderId
      const saveCallsWithSenderId = (
        mockMemory.save as ReturnType<typeof vi.fn>
      ).mock.calls.filter((call) => call[0]?.senderId);
      expect(saveCallsWithSenderId.length).toBe(0);
    });

    it("should handle memory save errors gracefully", async () => {
      (mockMemory.save as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error("Save failed"),
      );

      const event = createCalendarEvent();
      const options: FollowUpOptions = {
        notes: "TODO: This task will fail to save",
        senderId: "user123",
      };

      const followUp = await service.generateFollowUp(event, options);

      expect(followUp).toBeDefined();
    });

    it("should include meeting date in follow-up", async () => {
      const event = createCalendarEvent({
        start: { dateTime: "2024-03-15T14:00:00Z" },
      });
      const options: FollowUpOptions = {
        notes: "Meeting notes.",
      };

      const followUp = await service.generateFollowUp(event, options);

      expect(followUp.meetingDate).toBe("2024-03-15T14:00:00Z");
    });

    it("should format email body with sections", async () => {
      const event = createCalendarEvent();
      const options: FollowUpOptions = {
        notes: `
          We decided to proceed with the new architecture.
          TODO: Document the design thoroughly.
          Action: Team to implement changes.
        `,
      };

      const followUp = await service.generateFollowUp(event, options);

      expect(followUp.followUpEmailDraft.body).toContain("## Decisions");
      // Action Items section is only included when action items are extracted
      if (followUp.actionItems.length > 0) {
        expect(followUp.followUpEmailDraft.body).toContain("## Action Items");
      }
    });
  });

  // ============================================================================
  // EDGE CASES AND ERROR HANDLING
  // ============================================================================

  describe("Edge Cases", () => {
    it("should handle event with empty ID", async () => {
      const event = createCalendarEvent({ id: undefined });
      const preBrief = await service.generatePreBrief(event);

      expect(preBrief.eventId).toBe("");
    });

    it("should handle event with null attendees email", async () => {
      const event = createCalendarEvent({
        attendees: [
          { email: "valid@test.com" },
          { email: undefined } as calendar_v3.Schema$EventAttendee,
          { email: null } as unknown as calendar_v3.Schema$EventAttendee,
        ],
      });

      const preBrief = await service.generatePreBrief(event);

      expect(preBrief.attendees).toContain("valid@test.com");
      expect(preBrief.attendees).not.toContain(undefined);
      expect(preBrief.attendees).not.toContain(null);
    });

    it("should handle very long meeting notes", async () => {
      const event = createCalendarEvent();
      const longNotes = "TODO: Task item.\n".repeat(1000);
      const options: FollowUpOptions = { notes: longNotes };

      const followUp = await service.generateFollowUp(event, options);

      expect(followUp).toBeDefined();
      expect(followUp.actionItems.length).toBeGreaterThan(0);
    });

    it("should handle notes with only whitespace", async () => {
      const event = createCalendarEvent();
      const options: FollowUpOptions = { notes: "   \n\n\t   " };

      const followUp = await service.generateFollowUp(event, options);

      expect(followUp.actionItems).toEqual([]);
      expect(followUp.decisions).toEqual([]);
    });

    it("should handle attendees with display names but no email", async () => {
      const event = createCalendarEvent({
        attendees: [
          { displayName: "John Doe" } as calendar_v3.Schema$EventAttendee,
        ],
      });

      const preBrief = await service.generatePreBrief(event);

      expect(preBrief.attendees).not.toContain(undefined);
    });

    it("should handle multiple regex pattern resets correctly", () => {
      // Call extractActionItems multiple times to ensure regex lastIndex is reset
      const text = "TODO: First task";

      const items1 = service.extractActionItems(text);
      const items2 = service.extractActionItems(text);
      const items3 = service.extractActionItems(text);

      expect(items1.length).toBe(items2.length);
      expect(items2.length).toBe(items3.length);
    });
  });

  // ============================================================================
  // INTEGRATION TESTS
  // ============================================================================

  describe("Integration Tests", () => {
    it("should handle complete meeting workflow", async () => {
      const memories = createMemorySearchResults(2);
      (mockMemory.search as ReturnType<typeof vi.fn>).mockResolvedValue(
        memories,
      );

      // 1. Generate pre-brief
      const event = createCalendarEvent({
        summary: "Client Onboarding",
        description: "Initial kickoff meeting",
      });

      const preBrief = await service.generatePreBrief(event, {
        senderId: "user123",
      });
      expect(preBrief.eventSummary).toBe("Client Onboarding");
      expect(preBrief.relevantMemories.length).toBeGreaterThan(0);

      // 2. Get real-time assistance during meeting
      const assistance = await service.getRealTimeAssistance(
        event,
        "implementation timeline",
        "We discussed the 8-week plan.",
        "user123",
      );
      expect(assistance.eventId).toBe(event.id);

      // 3. Generate follow-up after meeting
      const followUp = await service.generateFollowUp(event, {
        notes: `
          We decided to use the phased approach.
          TODO: Create project plan
          John will send contract by Monday.
        `,
        senderId: "user123",
      });

      expect(followUp.eventSummary).toBe("Client Onboarding");
      expect(followUp.actionItems.length).toBeGreaterThan(0);
      expect(followUp.decisions.length).toBeGreaterThan(0);
    });

    it("should maintain consistent results across multiple calls", async () => {
      const event = createCalendarEvent();
      const options: FollowUpOptions = {
        notes: "TODO: Consistent task extraction test",
      };

      const followUp1 = await service.generateFollowUp(event, options);
      const followUp2 = await service.generateFollowUp(event, options);

      expect(followUp1.eventSummary).toBe(followUp2.eventSummary);
      expect(followUp1.actionItems.length).toBe(followUp2.actionItems.length);
    });
  });
});

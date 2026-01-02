/**
 * Meeting Intelligence - Pre-brief before meetings, real-time assistance,
 * and automated follow-up with action item extraction.
 *
 * Features:
 * - Pre-meeting briefs with relevant context, past discussions, action items
 * - Real-time assistance during meetings
 * - Automated follow-up with action item extraction
 */

import type { AgentTool, AgentToolResult } from "@mariozechner/pi-ai";
import { type TSchema, Type } from "@sinclair/typebox";
import type { calendar_v3 } from "googleapis";

import {
  createMemoryService,
  type MemorySearchResult,
  type MemoryService,
} from "../memory/index.js";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

/** Priority level for action items */
export type ActionPriority = "low" | "medium" | "high" | "critical";

/** Status of an action item */
export type ActionStatus =
  | "pending"
  | "in_progress"
  | "completed"
  | "cancelled";

/** An extracted action item from meeting notes or transcript */
export interface ActionItem {
  /** Unique identifier */
  id: string;
  /** Description of the action */
  description: string;
  /** Person responsible (if identified) */
  assignee?: string;
  /** Due date (ISO string, if identified) */
  deadline?: string;
  /** Priority level */
  priority: ActionPriority;
  /** Current status */
  status: ActionStatus;
  /** Source text where this was extracted from */
  sourceText: string;
  /** Confidence score 0-1 */
  confidence: number;
}

/** A decision made during the meeting */
export interface MeetingDecision {
  /** What was decided */
  decision: string;
  /** Context or reasoning */
  context?: string;
  /** Who made or approved the decision */
  decisionMakers?: string[];
  /** Source text */
  sourceText: string;
  /** Confidence score */
  confidence: number;
}

/** Email context relevant to a meeting */
export interface EmailContext {
  /** Email ID */
  id: string;
  /** Sender email */
  from: string;
  /** Email subject */
  subject: string;
  /** Date received */
  date: string;
  /** Relevant snippet */
  snippet: string;
}

/** Context about past meetings with same attendees */
export interface PastMeetingContext {
  /** Event ID */
  eventId: string;
  /** Meeting title */
  summary: string;
  /** When it occurred */
  date: string;
  /** Action items from that meeting */
  actionItems?: ActionItem[];
  /** Key topics discussed */
  topics?: string[];
}

/** Enhanced pre-brief for an upcoming meeting */
export interface MeetingPreBrief {
  /** Calendar event ID */
  eventId: string;
  /** Event title/summary */
  eventSummary: string;
  /** Start time (ISO string) */
  startTime: string;
  /** End time (ISO string) */
  endTime?: string;
  /** Meeting location or video link */
  location?: string;
  /** List of attendee emails */
  attendees: string[];
  /** Memories relevant to this meeting and attendees */
  relevantMemories: MemorySearchResult[];
  /** Recent emails from/to attendees */
  recentEmails: EmailContext[];
  /** Past meetings with same attendees */
  pastMeetings: PastMeetingContext[];
  /** Outstanding action items from past meetings */
  outstandingActions: ActionItem[];
  /** Suggested questions/topics */
  suggestedTopics: string[];
  /** Suggested preparation tasks */
  preparationTasks: string[];
  /** When this brief was generated */
  generatedAt: number;
}

/** Real-time meeting assistance context */
export interface RealTimeAssistance {
  /** Current meeting event ID */
  eventId: string;
  /** Surfaced memories relevant to current discussion */
  relevantContext: MemorySearchResult[];
  /** Quick facts about attendees */
  attendeeFacts: Array<{
    email: string;
    facts: string[];
  }>;
  /** Suggested follow-up questions */
  suggestedQuestions: string[];
  /** Detected action items so far */
  detectedActions: ActionItem[];
  /** Detected decisions so far */
  detectedDecisions: MeetingDecision[];
}

/** Complete meeting follow-up package */
export interface MeetingFollowUp {
  /** Calendar event ID */
  eventId: string;
  /** Meeting title */
  eventSummary: string;
  /** Meeting date */
  meetingDate: string;
  /** Attendees */
  attendees: string[];
  /** Generated summary of the meeting */
  summary: string;
  /** Key points discussed */
  keyPoints: string[];
  /** Extracted action items */
  actionItems: ActionItem[];
  /** Decisions made */
  decisions: MeetingDecision[];
  /** Suggested next steps */
  nextSteps: string[];
  /** Draft follow-up email */
  followUpEmailDraft: {
    to: string[];
    subject: string;
    body: string;
  };
  /** When this follow-up was generated */
  generatedAt: number;
}

/** Options for generating a pre-brief */
export interface PreBriefOptions {
  /** User/sender ID for memory context */
  senderId?: string;
  /** Max memories to retrieve per search */
  maxMemories?: number;
  /** Max recent emails to include */
  maxEmails?: number;
  /** Max past meetings to include */
  maxPastMeetings?: number;
  /** Days back to search for emails */
  emailDaysBack?: number;
  /** Google OAuth client for API calls */
  googleAuth?: unknown;
}

/** Options for generating follow-up */
export interface FollowUpOptions {
  /** Meeting notes or transcript text */
  notes: string;
  /** User ID for context */
  senderId?: string;
  /** Include email draft */
  generateEmailDraft?: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// Action Item Extraction Patterns
// ─────────────────────────────────────────────────────────────────────────────

/** Regex patterns for detecting action items */
const ACTION_PATTERNS = [
  // Direct assignments: "John will...", "Sarah should...", "I'll..."
  {
    pattern:
      /\b([A-Z][a-z]+|I)\s+(will|should|needs? to|has? to|must|shall|'ll)\s+(.+?)(?:\.|$)/gi,
    extractAssignee: true,
    priority: "medium" as ActionPriority,
  },
  // TODO patterns: "TODO: ...", "To do: ..."
  {
    pattern: /\b(?:TODO|To do|To-do)[:.]?\s*(.+?)(?:\.|$)/gi,
    extractAssignee: false,
    priority: "medium" as ActionPriority,
  },
  // Action prefix: "Action: ...", "Action item: ..."
  {
    pattern: /\b(?:Action(?:\s+item)?|AI)[:.]?\s*(.+?)(?:\.|$)/gi,
    extractAssignee: false,
    priority: "high" as ActionPriority,
  },
  // @ mentions: "@John please...", "@Sarah can you..."
  {
    pattern:
      /@([A-Za-z]+)\s+(?:please\s+|can you\s+|could you\s+)?(.+?)(?:\.|$)/gi,
    extractAssignee: true,
    priority: "medium" as ActionPriority,
  },
  // Follow up: "Follow up on...", "Following up..."
  {
    pattern: /\b(?:Follow(?:ing)?\s+up(?:\s+on)?|FU)[:.]?\s*(.+?)(?:\.|$)/gi,
    extractAssignee: false,
    priority: "medium" as ActionPriority,
  },
  // Need to / We need to
  {
    pattern: /\b(?:We\s+)?need(?:s)?\s+to\s+(.+?)(?:\.|$)/gi,
    extractAssignee: false,
    priority: "medium" as ActionPriority,
  },
  // Deadline patterns: "by Friday", "due Monday", "before EOD"
  {
    pattern:
      /\b(.+?)\s+(?:by|due|before|until)\s+(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday|EOD|end of day|tomorrow|next week|\d{1,2}\/\d{1,2})/gi,
    extractAssignee: false,
    priority: "high" as ActionPriority,
    hasDeadline: true,
  },
];

/** Regex patterns for detecting decisions */
const DECISION_PATTERNS = [
  // Explicit decision: "We decided...", "The decision is..."
  {
    pattern:
      /\b(?:We\s+)?(?:decided|agreed|concluded|determined)(?:\s+that)?\s+(.+?)(?:\.|$)/gi,
    confidence: 0.9,
  },
  // Decision is: "The decision is...", "Decision:"
  {
    pattern: /\b(?:The\s+)?decision(?:\s+is)?[:.]?\s*(.+?)(?:\.|$)/gi,
    confidence: 0.85,
  },
  // Going with: "We're going with...", "Let's go with..."
  {
    pattern:
      /\b(?:We(?:'re|'ll)\s+(?:go|going)\s+with|Let's\s+go\s+with)\s+(.+?)(?:\.|$)/gi,
    confidence: 0.8,
  },
  // Final: "The final answer is...", "Finally, we..."
  {
    pattern: /\b(?:The\s+)?final(?:ly)?[:,]?\s*(?:we\s+)?(.+?)(?:\.|$)/gi,
    confidence: 0.75,
  },
  // Approved: "Approved:", "Approval given for..."
  {
    pattern: /\b(?:Approved|Approval\s+given\s+for)[:.]?\s*(.+?)(?:\.|$)/gi,
    confidence: 0.9,
  },
];

/** Deadline parsing patterns */
const DEADLINE_PATTERNS = [
  {
    pattern: /by\s+(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)/i,
    type: "weekday",
  },
  { pattern: /by\s+(\d{1,2}\/\d{1,2}(?:\/\d{2,4})?)/i, type: "date" },
  { pattern: /by\s+(tomorrow|today)/i, type: "relative" },
  { pattern: /by\s+(EOD|end of day|COB|close of business)/i, type: "eod" },
  { pattern: /by\s+(next week|next month)/i, type: "relative" },
  { pattern: /(?:due|before)\s+(\d{1,2}\/\d{1,2})/i, type: "date" },
];

// ─────────────────────────────────────────────────────────────────────────────
// Meeting Intelligence Service
// ─────────────────────────────────────────────────────────────────────────────

/** Singleton instance */
let serviceInstance: MeetingIntelligenceService | null = null;
let initPromise: Promise<MeetingIntelligenceService | null> | null = null;

/**
 * MeetingIntelligenceService - Provides intelligent meeting assistance
 * including pre-briefs, real-time help, and follow-up generation.
 */
export class MeetingIntelligenceService {
  private readonly memory: MemoryService;
  private actionItemCounter = 0;

  constructor(memory: MemoryService) {
    this.memory = memory;
  }

  /**
   * Generate a comprehensive pre-brief for an upcoming meeting.
   */
  async generatePreBrief(
    event: calendar_v3.Schema$Event,
    options: PreBriefOptions = {},
  ): Promise<MeetingPreBrief> {
    const {
      senderId,
      maxMemories = 5,
      // maxEmails and maxPastMeetings reserved for Gmail/Calendar API integration
    } = options;

    const attendees = this.extractAttendees(event);
    const eventSummary = event.summary ?? "Untitled Meeting";

    // Build search queries for memories
    const searchQueries = this.buildSearchQueries(event);

    // Search memories in parallel
    const memoryResults = await this.searchMemoriesParallel(
      searchQueries,
      senderId,
      maxMemories,
    );

    // Generate suggested topics based on context
    const suggestedTopics = this.generateSuggestedTopics(
      eventSummary,
      event.description,
      memoryResults,
      attendees,
    );

    // Generate preparation tasks
    const preparationTasks = this.generatePreparationTasks(
      eventSummary,
      event.description,
      memoryResults,
    );

    // Extract outstanding action items from memories
    const outstandingActions =
      this.extractOutstandingActionsFromMemories(memoryResults);

    return {
      eventId: event.id ?? "",
      eventSummary,
      startTime: event.start?.dateTime ?? event.start?.date ?? "",
      endTime: (event.end?.dateTime ?? event.end?.date) || undefined,
      location: (event.location ?? event.hangoutLink) || undefined,
      attendees,
      relevantMemories: memoryResults,
      recentEmails: [], // Would be populated via Google Gmail API
      pastMeetings: [], // Would be populated via Calendar history
      outstandingActions,
      suggestedTopics,
      preparationTasks,
      generatedAt: Date.now(),
    };
  }

  /**
   * Provide real-time assistance during a meeting.
   */
  async getRealTimeAssistance(
    event: calendar_v3.Schema$Event,
    currentTopic?: string,
    notes?: string,
    senderId?: string,
  ): Promise<RealTimeAssistance> {
    const attendees = this.extractAttendees(event);

    // Search for relevant context based on current topic
    let relevantContext: MemorySearchResult[] = [];
    if (currentTopic) {
      relevantContext = await this.memory
        .search(currentTopic, {
          senderId,
          limit: 5,
          minScore: 0.5,
        })
        .catch(() => []);
    }

    // Get quick facts about attendees
    const attendeeFacts = await this.getAttendeeFacts(attendees, senderId);

    // Generate suggested questions
    const suggestedQuestions = this.generateSuggestedQuestions(
      event.summary ?? "",
      currentTopic,
      relevantContext,
    );

    // Extract any action items from notes so far
    const detectedActions = notes ? this.extractActionItems(notes) : [];

    // Extract any decisions from notes so far
    const detectedDecisions = notes ? this.extractDecisions(notes) : [];

    return {
      eventId: event.id ?? "",
      relevantContext,
      attendeeFacts,
      suggestedQuestions,
      detectedActions,
      detectedDecisions,
    };
  }

  /**
   * Generate a complete follow-up package after a meeting.
   */
  async generateFollowUp(
    event: calendar_v3.Schema$Event,
    options: FollowUpOptions,
  ): Promise<MeetingFollowUp> {
    const { notes, senderId, generateEmailDraft = true } = options;

    const attendees = this.extractAttendees(event);
    const eventSummary = event.summary ?? "Untitled Meeting";
    const meetingDate =
      event.start?.dateTime ?? event.start?.date ?? new Date().toISOString();

    // Extract action items and decisions
    const actionItems = this.extractActionItems(notes);
    const decisions = this.extractDecisions(notes);

    // Generate summary
    const summary = this.generateMeetingSummary(
      eventSummary,
      notes,
      actionItems,
      decisions,
    );

    // Extract key points
    const keyPoints = this.extractKeyPoints(notes);

    // Generate next steps
    const nextSteps = this.generateNextSteps(actionItems, decisions);

    // Generate follow-up email draft
    const followUpEmailDraft = generateEmailDraft
      ? this.generateFollowUpEmail(
          eventSummary,
          attendees,
          summary,
          actionItems,
          decisions,
          nextSteps,
        )
      : { to: [], subject: "", body: "" };

    // Save action items to memory for future reference
    if (actionItems.length > 0 && senderId) {
      await this.saveActionItemsToMemory(eventSummary, actionItems, senderId);
    }

    return {
      eventId: event.id ?? "",
      eventSummary,
      meetingDate,
      attendees,
      summary,
      keyPoints,
      actionItems,
      decisions,
      nextSteps,
      followUpEmailDraft,
      generatedAt: Date.now(),
    };
  }

  /**
   * Extract action items from meeting notes or transcript.
   */
  extractActionItems(text: string): ActionItem[] {
    const items: ActionItem[] = [];
    const seenDescriptions = new Set<string>();

    for (const {
      pattern,
      extractAssignee,
      priority,
      hasDeadline,
    } of ACTION_PATTERNS) {
      // Reset lastIndex for global patterns
      pattern.lastIndex = 0;
      let match: RegExpExecArray | null;

      while ((match = pattern.exec(text)) !== null) {
        let description: string;
        let assignee: string | undefined;

        if (extractAssignee && match[1] && match[1] !== "I") {
          assignee = match[1];
          description = match[3] ?? match[2] ?? match[0];
        } else {
          description = match[1] ?? match[0];
        }

        // Clean up description
        description = description
          .trim()
          .replace(/^[,:\s]+/, "")
          .replace(/[,:\s]+$/, "");

        // Skip if too short or duplicate
        if (
          description.length < 5 ||
          seenDescriptions.has(description.toLowerCase())
        ) {
          continue;
        }
        seenDescriptions.add(description.toLowerCase());

        // Extract deadline if present
        const deadline = hasDeadline
          ? this.extractDeadline(match[0])
          : this.extractDeadline(description);

        items.push({
          id: `action-${++this.actionItemCounter}`,
          description,
          assignee,
          deadline,
          priority: deadline ? "high" : priority,
          status: "pending",
          sourceText: match[0],
          confidence: this.calculateActionConfidence(match[0], description),
        });
      }
    }

    // Sort by confidence and priority
    return items.sort((a, b) => {
      const priorityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
      const priorityDiff =
        priorityOrder[a.priority] - priorityOrder[b.priority];
      if (priorityDiff !== 0) return priorityDiff;
      return b.confidence - a.confidence;
    });
  }

  /**
   * Extract decisions from meeting notes.
   */
  extractDecisions(text: string): MeetingDecision[] {
    const decisions: MeetingDecision[] = [];
    const seenDecisions = new Set<string>();

    for (const { pattern, confidence } of DECISION_PATTERNS) {
      pattern.lastIndex = 0;
      let match: RegExpExecArray | null;

      while ((match = pattern.exec(text)) !== null) {
        const decision = (match[1] ?? match[0]).trim();

        // Skip if too short or duplicate
        if (decision.length < 10 || seenDecisions.has(decision.toLowerCase())) {
          continue;
        }
        seenDecisions.add(decision.toLowerCase());

        decisions.push({
          decision,
          sourceText: match[0],
          confidence,
        });
      }
    }

    return decisions.sort((a, b) => b.confidence - a.confidence);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Private Helper Methods
  // ─────────────────────────────────────────────────────────────────────────

  private extractAttendees(event: calendar_v3.Schema$Event): string[] {
    return (
      event.attendees
        ?.map((a) => a.email)
        .filter((e): e is string => Boolean(e)) ?? []
    );
  }

  private buildSearchQueries(event: calendar_v3.Schema$Event): string[] {
    const queries: string[] = [];

    // Search by event title
    if (event.summary && event.summary !== "Untitled Meeting") {
      queries.push(event.summary);
    }

    // Search by attendee names
    const attendees = this.extractAttendees(event);
    for (const attendee of attendees.slice(0, 3)) {
      const name = attendee.split("@")[0].replace(/[._-]/g, " ");
      queries.push(name);
    }

    // Search by description keywords
    if (event.description) {
      const snippet = event.description.slice(0, 100);
      queries.push(snippet);
    }

    return queries;
  }

  private async searchMemoriesParallel(
    queries: string[],
    senderId?: string,
    limit = 5,
  ): Promise<MemorySearchResult[]> {
    const allMemories: MemorySearchResult[] = [];
    const seenIds = new Set<string>();

    const searchPromises = queries.map((query) =>
      this.memory
        .search(query, { senderId, limit, minScore: 0.4 })
        .catch(() => [] as MemorySearchResult[]),
    );

    const results = await Promise.all(searchPromises);

    for (const memoryList of results) {
      for (const mem of memoryList) {
        if (!seenIds.has(mem.id)) {
          seenIds.add(mem.id);
          allMemories.push(mem);
        }
      }
    }

    return allMemories.sort((a, b) => b.score - a.score).slice(0, limit);
  }

  private generateSuggestedTopics(
    _eventSummary: string,
    description?: string | null,
    memories?: MemorySearchResult[],
    _attendees?: string[],
  ): string[] {
    const topics: string[] = [];

    // Extract topics from high-scoring memories
    for (const mem of (memories ?? []).filter((m) => m.score > 0.6)) {
      const content = mem.content.toLowerCase();
      if (
        content.includes("follow up") ||
        content.includes("discuss") ||
        content.includes("review") ||
        content.includes("pending") ||
        content.includes("action")
      ) {
        topics.push(mem.content.slice(0, 60));
      }
    }

    // Extract topics from description
    if (description) {
      const lines = description.split("\n").filter((l) => l.trim().length > 0);
      for (const line of lines.slice(0, 3)) {
        if (line.length > 10 && line.length < 100) {
          topics.push(line.trim());
        }
      }
    }

    return [...new Set(topics)].slice(0, 5);
  }

  private generatePreparationTasks(
    eventSummary: string,
    _description?: string | null,
    memories?: MemorySearchResult[],
  ): string[] {
    const tasks: string[] = [];
    const summaryLower = eventSummary.toLowerCase();

    // Generic preparation tasks based on meeting type
    if (summaryLower.includes("review") || summaryLower.includes("demo")) {
      tasks.push("Prepare demo or materials to review");
    }
    if (summaryLower.includes("planning") || summaryLower.includes("roadmap")) {
      tasks.push("Review current status and blockers");
    }
    if (summaryLower.includes("1:1") || summaryLower.includes("one on one")) {
      tasks.push("Note topics to discuss and feedback to share");
    }
    if (summaryLower.includes("standup") || summaryLower.includes("sync")) {
      tasks.push("Prepare brief status update");
    }

    // Tasks from outstanding actions in memories
    for (const mem of (memories ?? []).filter(
      (m) => m.category === "reminder",
    )) {
      tasks.push(`Review: ${mem.content.slice(0, 50)}`);
    }

    return [...new Set(tasks)].slice(0, 4);
  }

  private extractOutstandingActionsFromMemories(
    memories: MemorySearchResult[],
  ): ActionItem[] {
    const actions: ActionItem[] = [];

    for (const mem of memories.filter(
      (m) => m.category === "reminder" || m.category === "context",
    )) {
      const content = mem.content.toLowerCase();
      if (
        content.includes("action") ||
        content.includes("todo") ||
        content.includes("follow up") ||
        content.includes("pending")
      ) {
        actions.push({
          id: `mem-${mem.id.slice(0, 8)}`,
          description: mem.content,
          priority: "medium",
          status: "pending",
          sourceText: mem.content,
          confidence: mem.score,
        });
      }
    }

    return actions.slice(0, 5);
  }

  private async getAttendeeFacts(
    attendees: string[],
    senderId?: string,
  ): Promise<Array<{ email: string; facts: string[] }>> {
    const results: Array<{ email: string; facts: string[] }> = [];

    for (const email of attendees.slice(0, 5)) {
      const name = email.split("@")[0].replace(/[._-]/g, " ");
      const memories = await this.memory
        .search(name, { senderId, limit: 3, minScore: 0.5 })
        .catch(() => []);

      const facts = memories
        .filter((m) => m.category === "fact" || m.category === "preference")
        .map((m) => m.content)
        .slice(0, 3);

      if (facts.length > 0) {
        results.push({ email, facts });
      }
    }

    return results;
  }

  private generateSuggestedQuestions(
    _eventSummary: string,
    currentTopic?: string,
    context?: MemorySearchResult[],
  ): string[] {
    const questions: string[] = [];

    // Generic questions based on context
    if (context && context.length > 0) {
      for (const mem of context.slice(0, 2)) {
        if (mem.category === "context" || mem.category === "fact") {
          questions.push(
            `What's the latest status on ${mem.content.slice(0, 40)}?`,
          );
        }
      }
    }

    // Topic-based questions
    if (currentTopic) {
      questions.push(`What are the main blockers for ${currentTopic}?`);
      questions.push(`What's the timeline for ${currentTopic}?`);
    }

    return questions.slice(0, 3);
  }

  private extractDeadline(text: string): string | undefined {
    for (const { pattern, type } of DEADLINE_PATTERNS) {
      const match = text.match(pattern);
      if (match?.[1]) {
        const deadlineText = match[1];

        // Convert to ISO date
        if (type === "weekday") {
          const day = this.getNextWeekday(deadlineText);
          if (day) return day.toISOString();
        } else if (type === "relative") {
          const relative = deadlineText.toLowerCase();
          const now = new Date();
          if (relative === "tomorrow") {
            now.setDate(now.getDate() + 1);
            return now.toISOString();
          } else if (relative === "today") {
            return now.toISOString();
          } else if (relative === "next week") {
            now.setDate(now.getDate() + 7);
            return now.toISOString();
          }
        } else if (type === "eod") {
          const now = new Date();
          now.setHours(17, 0, 0, 0);
          return now.toISOString();
        } else if (type === "date") {
          const parsed = new Date(deadlineText);
          if (!Number.isNaN(parsed.getTime())) {
            return parsed.toISOString();
          }
        }
      }
    }
    return undefined;
  }

  private getNextWeekday(dayName: string): Date | null {
    const days = [
      "sunday",
      "monday",
      "tuesday",
      "wednesday",
      "thursday",
      "friday",
      "saturday",
    ];
    const targetDay = days.indexOf(dayName.toLowerCase());
    if (targetDay === -1) return null;

    const now = new Date();
    const currentDay = now.getDay();
    let daysToAdd = (targetDay - currentDay + 7) % 7;
    if (daysToAdd === 0) daysToAdd = 7;

    now.setDate(now.getDate() + daysToAdd);
    now.setHours(17, 0, 0, 0);
    return now;
  }

  private calculateActionConfidence(
    sourceText: string,
    _description: string,
  ): number {
    let confidence = 0.5;

    // Boost for explicit markers
    if (/\b(action|todo|follow up)\b/i.test(sourceText)) confidence += 0.2;
    if (/\b(will|should|must|needs? to)\b/i.test(sourceText)) confidence += 0.1;
    if (/@\w+/.test(sourceText)) confidence += 0.15;

    // Boost for deadline
    if (/\b(by|due|before|until)\b/i.test(sourceText)) confidence += 0.15;

    // Reduce for vague language
    if (/\b(maybe|might|could|possibly)\b/i.test(sourceText)) confidence -= 0.2;

    return Math.max(0.1, Math.min(1, confidence));
  }

  private generateMeetingSummary(
    eventSummary: string,
    notes: string,
    actionItems: ActionItem[],
    decisions: MeetingDecision[],
  ): string {
    const parts: string[] = [];

    // Opening
    parts.push(`Meeting "${eventSummary}" covered the following:`);

    // Key topics (extract from notes)
    const sentences = notes.split(/[.!?]+/).filter((s) => s.trim().length > 20);
    if (sentences.length > 0) {
      const topicCount = Math.min(3, sentences.length);
      parts.push(
        `\nKey discussions:\n${sentences
          .slice(0, topicCount)
          .map((s) => `- ${s.trim()}`)
          .join("\n")}`,
      );
    }

    // Decisions
    if (decisions.length > 0) {
      parts.push(`\nDecisions made: ${decisions.length}`);
    }

    // Actions
    if (actionItems.length > 0) {
      parts.push(`\nAction items: ${actionItems.length}`);
    }

    return parts.join("\n");
  }

  private extractKeyPoints(notes: string): string[] {
    const points: string[] = [];

    // Extract bullet points or numbered items
    const bulletPattern = /^[\s]*[-*•]\s*(.+)$/gm;
    const numberedPattern = /^[\s]*\d+[.)]\s*(.+)$/gm;

    let match: RegExpExecArray | null;

    bulletPattern.lastIndex = 0;
    while ((match = bulletPattern.exec(notes)) !== null) {
      const point = match[1].trim();
      if (point.length > 10 && point.length < 200) {
        points.push(point);
      }
    }

    numberedPattern.lastIndex = 0;
    while ((match = numberedPattern.exec(notes)) !== null) {
      const point = match[1].trim();
      if (point.length > 10 && point.length < 200) {
        points.push(point);
      }
    }

    // If no structured points, extract key sentences
    if (points.length === 0) {
      const sentences = notes
        .split(/[.!?]+/)
        .map((s) => s.trim())
        .filter((s) => s.length > 30 && s.length < 200);
      points.push(...sentences.slice(0, 5));
    }

    return [...new Set(points)].slice(0, 10);
  }

  private generateNextSteps(
    actionItems: ActionItem[],
    decisions: MeetingDecision[],
  ): string[] {
    const steps: string[] = [];

    // Add high-priority actions as next steps
    for (const action of actionItems.filter(
      (a) => a.priority === "high" || a.priority === "critical",
    )) {
      const step = action.assignee
        ? `${action.assignee}: ${action.description}`
        : action.description;
      steps.push(step);
    }

    // Add decisions that need implementation
    for (const decision of decisions.slice(0, 2)) {
      steps.push(`Implement: ${decision.decision.slice(0, 60)}`);
    }

    return steps.slice(0, 5);
  }

  private generateFollowUpEmail(
    eventSummary: string,
    attendees: string[],
    summary: string,
    actionItems: ActionItem[],
    decisions: MeetingDecision[],
    nextSteps: string[],
  ): { to: string[]; subject: string; body: string } {
    const subject = `Follow-up: ${eventSummary}`;

    const bodyParts: string[] = [
      "Hi all,",
      "",
      `Thanks for attending "${eventSummary}". Here's a summary:`,
      "",
      summary,
      "",
    ];

    if (decisions.length > 0) {
      bodyParts.push("## Decisions");
      for (const d of decisions) {
        bodyParts.push(`- ${d.decision}`);
      }
      bodyParts.push("");
    }

    if (actionItems.length > 0) {
      bodyParts.push("## Action Items");
      for (const a of actionItems) {
        let item = `- ${a.description}`;
        if (a.assignee) item += ` (@${a.assignee})`;
        if (a.deadline)
          item += ` - Due: ${new Date(a.deadline).toLocaleDateString()}`;
        bodyParts.push(item);
      }
      bodyParts.push("");
    }

    if (nextSteps.length > 0) {
      bodyParts.push("## Next Steps");
      for (const step of nextSteps) {
        bodyParts.push(`- ${step}`);
      }
      bodyParts.push("");
    }

    bodyParts.push("Best regards");

    return {
      to: attendees,
      subject,
      body: bodyParts.join("\n"),
    };
  }

  private async saveActionItemsToMemory(
    eventSummary: string,
    actionItems: ActionItem[],
    senderId: string,
  ): Promise<void> {
    for (const action of actionItems.slice(0, 5)) {
      const content = `Action item from "${eventSummary}": ${action.description}${action.assignee ? ` (assigned to ${action.assignee})` : ""}${action.deadline ? ` due ${new Date(action.deadline).toLocaleDateString()}` : ""}`;

      await this.memory
        .save({
          content,
          category: "reminder",
          source: "auto",
          senderId,
          confidence: action.confidence,
          metadata: {
            actionItemId: action.id,
            eventSummary,
            assignee: action.assignee,
            deadline: action.deadline,
            priority: action.priority,
          },
        })
        .catch(() => {
          // Ignore save errors
        });
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Factory Function
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Get or create the MeetingIntelligenceService singleton.
 */
export async function createMeetingIntelligenceService(): Promise<MeetingIntelligenceService | null> {
  if (serviceInstance) return serviceInstance;
  if (initPromise) return initPromise;

  initPromise = (async () => {
    try {
      const memory = await createMemoryService();
      if (!memory) {
        console.log("MeetingIntelligenceService: Memory service not available");
        return null;
      }

      serviceInstance = new MeetingIntelligenceService(memory);
      return serviceInstance;
    } catch (error) {
      console.error("Failed to initialize MeetingIntelligenceService:", error);
      return null;
    }
  })();

  return initPromise;
}

/**
 * Reset the service singleton (for testing).
 */
export function resetMeetingIntelligenceService(): void {
  serviceInstance = null;
  initPromise = null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Agent Tool Types
// ─────────────────────────────────────────────────────────────────────────────

type AnyAgentTool = AgentTool<TSchema, unknown>;

function jsonResult(payload: unknown): AgentToolResult<unknown> {
  return {
    content: [{ type: "text", text: JSON.stringify(payload, null, 2) }],
    details: payload,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Meeting Context Service (History Tracking)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * MeetingContext - Tracks meeting history per person/project.
 * Stores meeting summaries in memory and enables queries like
 * "What did we decide about X in the last meeting?"
 */
export class MeetingContext {
  private readonly memory: MemoryService;

  constructor(memory: MemoryService) {
    this.memory = memory;
  }

  /**
   * Get meeting history with a specific person.
   */
  async getMeetingHistoryWithPerson(
    personQuery: string,
    limit = 10,
  ): Promise<
    Array<{
      meetingId: string;
      title: string;
      date: string;
      attendees: string[];
      summary?: string;
      decisions?: string[];
      actionItemCount: number;
    }>
  > {
    // Search for meetings involving this person
    const searchQuery = `meeting ${personQuery}`;
    const results = await this.memory
      .search(searchQuery, {
        category: "context",
        limit: limit * 2,
        minScore: 0.4,
      })
      .catch(() => []);

    const meetings: Array<{
      meetingId: string;
      title: string;
      date: string;
      attendees: string[];
      summary?: string;
      decisions?: string[];
      actionItemCount: number;
    }> = [];

    const seenIds = new Set<string>();
    const personLower = personQuery.toLowerCase();

    for (const mem of results) {
      // Check if this memory is about a meeting with this person
      const content = mem.content.toLowerCase();
      const metadata = mem.metadata as Record<string, unknown> | undefined;

      // Check metadata first
      const metaAttendees = metadata?.attendees;
      const attendeeMatch =
        Array.isArray(metaAttendees) &&
        metaAttendees.some(
          (a: unknown) =>
            typeof a === "string" && a.toLowerCase().includes(personLower),
        );

      // Also check content
      const contentMatch = content.includes(personLower);

      if (attendeeMatch || contentMatch) {
        const meetingId = (metadata?.meetingId as string) ?? mem.id.slice(0, 8);

        if (seenIds.has(meetingId)) continue;
        seenIds.add(meetingId);

        // Try to extract meeting summary data
        const title = (metadata?.eventSummary as string) ?? "Meeting";
        const date = new Date(mem.createdAt).toISOString().split("T")[0];

        meetings.push({
          meetingId,
          title,
          date,
          attendees: Array.isArray(metaAttendees)
            ? (metaAttendees as string[])
            : [],
          summary: mem.content.slice(0, 200),
          actionItemCount: 0,
        });
      }
    }

    return meetings.slice(0, limit);
  }

  /**
   * Get meeting history for a specific project/topic.
   */
  async getMeetingHistoryByProject(
    projectQuery: string,
    limit = 10,
  ): Promise<
    Array<{
      meetingId: string;
      title: string;
      date: string;
      topics: string[];
      summary?: string;
      decisions?: string[];
    }>
  > {
    const searchQuery = `meeting ${projectQuery}`;
    const results = await this.memory
      .search(searchQuery, {
        category: "context",
        limit: limit * 2,
        minScore: 0.4,
      })
      .catch(() => []);

    const meetings: Array<{
      meetingId: string;
      title: string;
      date: string;
      topics: string[];
      summary?: string;
      decisions?: string[];
    }> = [];

    const seenIds = new Set<string>();
    const projectLower = projectQuery.toLowerCase();

    for (const mem of results) {
      const content = mem.content.toLowerCase();
      const metadata = mem.metadata as Record<string, unknown> | undefined;

      // Check if content or title mentions the project
      const titleMatch =
        typeof metadata?.eventSummary === "string" &&
        (metadata.eventSummary as string).toLowerCase().includes(projectLower);
      const contentMatch = content.includes(projectLower);

      if (titleMatch || contentMatch) {
        const meetingId = (metadata?.meetingId as string) ?? mem.id.slice(0, 8);

        if (seenIds.has(meetingId)) continue;
        seenIds.add(meetingId);

        const title = (metadata?.eventSummary as string) ?? "Meeting";
        const date = new Date(mem.createdAt).toISOString().split("T")[0];

        meetings.push({
          meetingId,
          title,
          date,
          topics: [],
          summary: mem.content.slice(0, 200),
        });
      }
    }

    return meetings.slice(0, limit);
  }

  /**
   * Query what was decided about a topic in past meetings.
   * Enables "What did we decide about X?" queries.
   */
  async getDecisionsAboutTopic(
    topic: string,
    limit = 10,
  ): Promise<
    Array<{
      decision: string;
      meetingTitle: string;
      meetingDate: string;
      context?: string;
    }>
  > {
    // Search for decisions about this topic
    const searchQueries = [
      `decided ${topic}`,
      `decision ${topic}`,
      `agreed ${topic}`,
    ];

    const allResults: MemorySearchResult[] = [];
    const seenIds = new Set<string>();

    for (const query of searchQueries) {
      const results = await this.memory
        .search(query, {
          limit: 10,
          minScore: 0.4,
        })
        .catch(() => []);

      for (const r of results) {
        if (!seenIds.has(r.id)) {
          seenIds.add(r.id);
          allResults.push(r);
        }
      }
    }

    const decisions: Array<{
      decision: string;
      meetingTitle: string;
      meetingDate: string;
      context?: string;
    }> = [];

    const topicLower = topic.toLowerCase();

    for (const mem of allResults) {
      const content = mem.content;
      const contentLower = content.toLowerCase();
      const metadata = mem.metadata as Record<string, unknown> | undefined;

      // Only include if it seems like a decision
      if (
        contentLower.includes("decided") ||
        contentLower.includes("decision") ||
        contentLower.includes("agreed") ||
        contentLower.includes("concluded")
      ) {
        // And relates to the topic
        if (contentLower.includes(topicLower)) {
          decisions.push({
            decision: content.slice(0, 300),
            meetingTitle: (metadata?.eventSummary as string) ?? "Meeting",
            meetingDate: new Date(mem.createdAt).toISOString().split("T")[0],
          });
        }
      }
    }

    return decisions.slice(0, limit);
  }

  /**
   * Store a meeting summary in memory for future retrieval.
   */
  async storeMeetingSummary(params: {
    meetingId: string;
    title: string;
    date: string;
    attendees: string[];
    summary: string;
    decisions?: string[];
    actionItems?: ActionItem[];
    senderId?: string;
  }): Promise<void> {
    // Store main meeting summary
    const summaryContent = [
      `Meeting: ${params.title}`,
      `Date: ${params.date}`,
      `Attendees: ${params.attendees.join(", ")}`,
      "",
      params.summary,
    ].join("\n");

    await this.memory.save({
      content: summaryContent,
      category: "context",
      source: "agent",
      senderId: params.senderId ?? "global",
      metadata: {
        type: "meeting_summary",
        meetingId: params.meetingId,
        eventSummary: params.title,
        attendees: params.attendees,
        date: params.date,
      },
    });

    // Store decisions separately for better retrieval
    if (params.decisions && params.decisions.length > 0) {
      const decisionsContent = params.decisions
        .map((d) => `Decision from "${params.title}" (${params.date}): ${d}`)
        .join("\n\n");

      await this.memory.save({
        content: decisionsContent,
        category: "context",
        source: "agent",
        senderId: params.senderId ?? "global",
        metadata: {
          type: "meeting_decisions",
          meetingId: params.meetingId,
          eventSummary: params.title,
          decisionCount: params.decisions.length,
        },
      });
    }
  }
}

// MeetingContext singleton
let contextInstance: MeetingContext | null = null;

async function getMeetingContext(): Promise<MeetingContext | null> {
  if (contextInstance) return contextInstance;

  const memory = await createMemoryService();
  if (!memory) return null;

  contextInstance = new MeetingContext(memory);
  return contextInstance;
}

// ─────────────────────────────────────────────────────────────────────────────
// Enhanced Tool Schema
// ─────────────────────────────────────────────────────────────────────────────

const MeetingIntelligenceSchema = Type.Union([
  // Pre-brief action (generates pre-meeting context)
  Type.Object({
    action: Type.Literal("meeting_prebrief"),
    eventId: Type.String({ description: "Calendar event ID" }),
    eventSummary: Type.String({ description: "Event title" }),
    eventStart: Type.String({ description: "Start time (ISO)" }),
    eventEnd: Type.Optional(Type.String({ description: "End time (ISO)" })),
    eventDescription: Type.Optional(Type.String()),
    eventLocation: Type.Optional(Type.String()),
    attendees: Type.Optional(Type.Array(Type.String())),
    senderId: Type.Optional(Type.String()),
  }),
  // Followup action (extracts action items and decisions)
  Type.Object({
    action: Type.Literal("meeting_followup"),
    eventId: Type.String({ description: "Calendar event ID" }),
    eventSummary: Type.String({ description: "Event title" }),
    eventStart: Type.String({ description: "Meeting date (ISO)" }),
    notes: Type.String({ description: "Meeting notes or transcript" }),
    attendees: Type.Optional(Type.Array(Type.String())),
    generateEmailDraft: Type.Optional(Type.Boolean({ default: true })),
    saveToMemory: Type.Optional(Type.Boolean({ default: true })),
    senderId: Type.Optional(Type.String()),
  }),
  // Meeting history - by person
  Type.Object({
    action: Type.Literal("meeting_history"),
    queryType: Type.Literal("person"),
    person: Type.String({ description: "Person name or email to search for" }),
    limit: Type.Optional(Type.Number({ default: 10 })),
  }),
  // Meeting history - by project/topic
  Type.Object({
    action: Type.Literal("meeting_history"),
    queryType: Type.Literal("project"),
    project: Type.String({ description: "Project or topic name" }),
    limit: Type.Optional(Type.Number({ default: 10 })),
  }),
  // Meeting history - decisions about topic
  Type.Object({
    action: Type.Literal("meeting_history"),
    queryType: Type.Literal("decisions"),
    topic: Type.String({ description: "Topic to find decisions about" }),
    limit: Type.Optional(Type.Number({ default: 10 })),
  }),
  // Real-time assistance during meeting
  Type.Object({
    action: Type.Literal("real_time_assist"),
    eventId: Type.String({ description: "Calendar event ID" }),
    eventSummary: Type.String({ description: "Event title" }),
    currentTopic: Type.Optional(
      Type.String({ description: "Current discussion topic" }),
    ),
    notes: Type.Optional(Type.String({ description: "Meeting notes so far" })),
    attendees: Type.Optional(Type.Array(Type.String())),
    senderId: Type.Optional(Type.String()),
  }),
  // Standalone action extraction
  Type.Object({
    action: Type.Literal("extract_actions"),
    text: Type.String({ description: "Text to extract action items from" }),
  }),
  // Standalone decision extraction
  Type.Object({
    action: Type.Literal("extract_decisions"),
    text: Type.String({ description: "Text to extract decisions from" }),
  }),
]);

/**
 * Create the Meeting Intelligence tool for agent use.
 */
export function createMeetingIntelligenceTool(): AnyAgentTool {
  return {
    label: "Meeting Intelligence",
    name: "meeting_intelligence",
    description: `Intelligent meeting assistance for pre-briefs, follow-up, and meeting history tracking.

Actions:
- meeting_prebrief: Generate pre-meeting brief with attendee context, pending items, and past discussions
  Example: "Meeting with Sarah about Project X in 30 mins. Last discussed: budget concerns. Action items pending: review proposal"
- meeting_followup: Parse meeting notes, extract action items/decisions, create tasks, and optionally generate follow-up email
- meeting_history: Query meeting history (by person, project, or decisions about a topic)
  - queryType: "person" - Get past meetings with a specific person
  - queryType: "project" - Get past meetings about a project/topic
  - queryType: "decisions" - "What did we decide about X in the last meeting?"
- real_time_assist: Get real-time assistance during meetings
- extract_actions: Extract action items from any text
- extract_decisions: Extract decisions from any text

Best practices:
- Run meeting_prebrief before important meetings to prepare context
- Use meeting_followup after meetings to capture and track action items
- Query meeting_history with "decisions" to answer "what did we decide about X?"`,
    parameters: MeetingIntelligenceSchema,
    execute: async (_toolCallId, args) => {
      const params = args as Record<string, unknown>;
      const action = params.action as string;

      const service = await createMeetingIntelligenceService();
      const context = await getMeetingContext();

      if (!service) {
        return jsonResult({
          error: "service_unavailable",
          message:
            "Meeting Intelligence service not available (memory system required)",
        });
      }

      switch (action) {
        case "meeting_prebrief": {
          const event: calendar_v3.Schema$Event = {
            id: params.eventId as string,
            summary: params.eventSummary as string,
            description: params.eventDescription as string | undefined,
            location: params.eventLocation as string | undefined,
            start: { dateTime: params.eventStart as string },
            end: params.eventEnd
              ? { dateTime: params.eventEnd as string }
              : undefined,
            attendees: (params.attendees as string[] | undefined)?.map(
              (email) => ({ email }),
            ),
          };

          const brief = await service.generatePreBrief(event, {
            senderId: params.senderId as string | undefined,
          });

          // Generate human-readable briefing text
          const briefingParts: string[] = [];
          const attendeeNames =
            (params.attendees as string[] | undefined)
              ?.map((e) => e.split("@")[0].replace(/[._-]/g, " "))
              ?.join(", ") ?? "attendees";

          briefingParts.push(
            `Meeting with ${attendeeNames} about "${params.eventSummary}" at ${new Date(params.eventStart as string).toLocaleString()}.`,
          );

          if (brief.relevantMemories.length > 0) {
            const contexts = brief.relevantMemories
              .slice(0, 3)
              .map((m) => m.content.slice(0, 80))
              .join("; ");
            briefingParts.push(`Relevant context: ${contexts}`);
          }

          if (brief.outstandingActions.length > 0) {
            briefingParts.push(
              `Pending action items: ${brief.outstandingActions
                .map((a) => a.description)
                .slice(0, 3)
                .join("; ")}`,
            );
          }

          if (brief.suggestedTopics.length > 0) {
            briefingParts.push(
              `Suggested topics: ${brief.suggestedTopics.slice(0, 3).join(", ")}`,
            );
          }

          return {
            content: [
              { type: "text", text: briefingParts.join("\n\n") },
              { type: "text", text: JSON.stringify(brief, null, 2) },
            ],
            details: brief,
          };
        }

        case "meeting_followup": {
          const event: calendar_v3.Schema$Event = {
            id: params.eventId as string,
            summary: params.eventSummary as string,
            start: { dateTime: params.eventStart as string },
            attendees: (params.attendees as string[] | undefined)?.map(
              (email) => ({ email }),
            ),
          };

          const followUp = await service.generateFollowUp(event, {
            notes: params.notes as string,
            senderId: params.senderId as string | undefined,
            generateEmailDraft: (params.generateEmailDraft as boolean) ?? true,
          });

          // Save to meeting context if requested
          const saveToMemory = (params.saveToMemory as boolean) ?? true;
          if (saveToMemory && context) {
            await context.storeMeetingSummary({
              meetingId: followUp.eventId,
              title: followUp.eventSummary,
              date: followUp.meetingDate.split("T")[0],
              attendees: followUp.attendees,
              summary: followUp.summary,
              decisions: followUp.decisions.map((d) => d.decision),
              actionItems: followUp.actionItems,
              senderId: params.senderId as string | undefined,
            });
          }

          return jsonResult({
            success: true,
            actionItemsExtracted: followUp.actionItems.length,
            decisionsExtracted: followUp.decisions.length,
            savedToMemory: saveToMemory,
            followUp,
          });
        }

        case "meeting_history": {
          if (!context) {
            return jsonResult({
              error: "service_unavailable",
              message: "Meeting context service not available",
            });
          }

          const queryType = params.queryType as string;
          const limit = (params.limit as number) ?? 10;

          if (queryType === "person") {
            const person = params.person as string;
            if (!person?.trim()) {
              return jsonResult({
                error: "validation",
                message: "person required",
              });
            }

            const meetings = await context.getMeetingHistoryWithPerson(
              person,
              limit,
            );
            return jsonResult({
              success: true,
              queryType: "person",
              person,
              count: meetings.length,
              meetings,
            });
          }

          if (queryType === "project") {
            const project = params.project as string;
            if (!project?.trim()) {
              return jsonResult({
                error: "validation",
                message: "project required",
              });
            }

            const meetings = await context.getMeetingHistoryByProject(
              project,
              limit,
            );
            return jsonResult({
              success: true,
              queryType: "project",
              project,
              count: meetings.length,
              meetings,
            });
          }

          if (queryType === "decisions") {
            const topic = params.topic as string;
            if (!topic?.trim()) {
              return jsonResult({
                error: "validation",
                message: "topic required",
              });
            }

            const decisions = await context.getDecisionsAboutTopic(
              topic,
              limit,
            );
            return jsonResult({
              success: true,
              queryType: "decisions",
              topic,
              count: decisions.length,
              decisions,
            });
          }

          return jsonResult({ error: "invalid_query_type", queryType });
        }

        case "real_time_assist": {
          const event: calendar_v3.Schema$Event = {
            id: params.eventId as string,
            summary: params.eventSummary as string,
            attendees: (params.attendees as string[] | undefined)?.map(
              (email) => ({ email }),
            ),
          };

          const assistance = await service.getRealTimeAssistance(
            event,
            params.currentTopic as string | undefined,
            params.notes as string | undefined,
            params.senderId as string | undefined,
          );

          return jsonResult({
            success: true,
            assistance,
          });
        }

        case "extract_actions": {
          const text = params.text as string;
          if (!text?.trim()) {
            return jsonResult({
              error: "validation",
              message: "text required",
            });
          }

          const actionItems = service.extractActionItems(text);
          return jsonResult({
            success: true,
            count: actionItems.length,
            actionItems,
          });
        }

        case "extract_decisions": {
          const text = params.text as string;
          if (!text?.trim()) {
            return jsonResult({
              error: "validation",
              message: "text required",
            });
          }

          const decisions = service.extractDecisions(text);
          return jsonResult({
            success: true,
            count: decisions.length,
            decisions,
          });
        }

        default:
          return jsonResult({ error: "unknown_action", action });
      }
    },
  };
}

/**
 * Reset context singleton (for testing).
 */
export function resetMeetingContext(): void {
  contextInstance = null;
}

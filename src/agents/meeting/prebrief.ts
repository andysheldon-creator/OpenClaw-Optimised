/**
 * Meeting Pre-Brief Generator
 *
 * Generates comprehensive markdown pre-briefs for upcoming meetings by:
 * 1. Getting meeting details (attendees, topic) from calendar
 * 2. Searching memory for context about attendees
 * 3. Searching memory for past discussions on topic
 * 4. Finding pending action items
 * 5. Formatting as markdown pre-brief
 */

import type { calendar_v3 } from "googleapis";
import type { MemoryService, MemorySearchResult } from "../../memory/index.js";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

/** Attendee with retrieved context */
export interface AttendeeContext {
  email: string;
  name: string;
  responseStatus?: string;
  memories: MemorySearchResult[];
}

/** Action item from memory */
export interface PendingActionItem {
  id: string;
  description: string;
  assignee?: string;
  deadline?: string;
  source: string;
  confidence: number;
}

/** Topic context from memory */
export interface TopicContext {
  topic: string;
  relatedMemories: MemorySearchResult[];
}

/** Generated pre-brief result */
export interface PreBriefResult {
  markdown: string;
  eventId: string;
  eventSummary: string;
  startTime: string;
  attendeeContexts: AttendeeContext[];
  topicContexts: TopicContext[];
  pendingActions: PendingActionItem[];
  generatedAt: number;
}

/** Options for pre-brief generation */
export interface PreBriefOptions {
  /** User/sender ID for memory filtering */
  senderId?: string;
  /** Max memories per attendee search */
  maxMemoriesPerAttendee?: number;
  /** Max memories per topic search */
  maxMemoriesPerTopic?: number;
  /** Minimum score threshold for memories */
  minScore?: number;
  /** Include suggested talking points */
  includeSuggestedTopics?: boolean;
  /** Include preparation checklist */
  includeChecklist?: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// Calendar Service Interface
// ─────────────────────────────────────────────────────────────────────────────

/** Minimal calendar service interface for fetching meeting details */
export interface CalendarService {
  /** Get event by ID */
  getEvent(eventId: string): Promise<calendar_v3.Schema$Event | null>;
  /** List upcoming events */
  listUpcoming?(maxResults?: number): Promise<calendar_v3.Schema$Event[]>;
}

// ─────────────────────────────────────────────────────────────────────────────
// MeetingPreBrief Class
// ─────────────────────────────────────────────────────────────────────────────

/**
 * MeetingPreBrief - Generates comprehensive pre-briefs for meetings
 */
export class MeetingPreBrief {
  constructor(
    private memoryStore: MemoryService,
    private calendarService: CalendarService
  ) {}

  /**
   * Generate a comprehensive pre-brief for an upcoming meeting.
   *
   * @param meetingId - Calendar event ID
   * @param options - Generation options
   * @returns PreBriefResult with markdown and structured data
   */
  async generatePreBrief(
    meetingId: string,
    options: PreBriefOptions = {}
  ): Promise<PreBriefResult> {
    const {
      senderId,
      maxMemoriesPerAttendee = 3,
      maxMemoriesPerTopic = 5,
      minScore = 0.4,
      includeSuggestedTopics = true,
      includeChecklist = true,
    } = options;

    // 1. Get meeting details from calendar
    const event = await this.calendarService.getEvent(meetingId);
    if (!event) {
      throw new Error(`Meeting not found: ${meetingId}`);
    }

    const eventSummary = event.summary ?? "Untitled Meeting";
    const startTime = event.start?.dateTime ?? event.start?.date ?? "";
    const endTime = event.end?.dateTime ?? event.end?.date;
    const location = event.location ?? event.hangoutLink;
    const description = event.description;

    // Extract attendees
    const attendees = this.extractAttendees(event);

    // 2. Search memory for context about each attendee
    const attendeeContexts = await this.getAttendeeContexts(
      attendees,
      senderId,
      maxMemoriesPerAttendee,
      minScore
    );

    // 3. Search memory for past discussions on topic
    const topicContexts = await this.getTopicContexts(
      eventSummary,
      description,
      senderId,
      maxMemoriesPerTopic,
      minScore
    );

    // 4. Find pending action items
    const pendingActions = await this.findPendingActions(
      attendees,
      eventSummary,
      senderId,
      minScore
    );

    // 5. Format as markdown pre-brief
    const markdown = this.formatMarkdown({
      eventSummary,
      startTime,
      endTime,
      location,
      description,
      attendeeContexts,
      topicContexts,
      pendingActions,
      includeSuggestedTopics,
      includeChecklist,
    });

    return {
      markdown,
      eventId: meetingId,
      eventSummary,
      startTime,
      attendeeContexts,
      topicContexts,
      pendingActions,
      generatedAt: Date.now(),
    };
  }

  /**
   * Generate pre-brief directly from an event object (no calendar fetch needed).
   */
  async generatePreBriefFromEvent(
    event: calendar_v3.Schema$Event,
    options: PreBriefOptions = {}
  ): Promise<PreBriefResult> {
    const {
      senderId,
      maxMemoriesPerAttendee = 3,
      maxMemoriesPerTopic = 5,
      minScore = 0.4,
      includeSuggestedTopics = true,
      includeChecklist = true,
    } = options;

    const eventSummary = event.summary ?? "Untitled Meeting";
    const startTime = event.start?.dateTime ?? event.start?.date ?? "";
    const endTime = event.end?.dateTime ?? event.end?.date;
    const location = event.location ?? event.hangoutLink;
    const description = event.description;

    const attendees = this.extractAttendees(event);

    const attendeeContexts = await this.getAttendeeContexts(
      attendees,
      senderId,
      maxMemoriesPerAttendee,
      minScore
    );

    const topicContexts = await this.getTopicContexts(
      eventSummary,
      description,
      senderId,
      maxMemoriesPerTopic,
      minScore
    );

    const pendingActions = await this.findPendingActions(
      attendees,
      eventSummary,
      senderId,
      minScore
    );

    const markdown = this.formatMarkdown({
      eventSummary,
      startTime,
      endTime,
      location,
      description,
      attendeeContexts,
      topicContexts,
      pendingActions,
      includeSuggestedTopics,
      includeChecklist,
    });

    return {
      markdown,
      eventId: event.id ?? "",
      eventSummary,
      startTime,
      attendeeContexts,
      topicContexts,
      pendingActions,
      generatedAt: Date.now(),
    };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Private Helper Methods
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Extract attendees from calendar event.
   */
  private extractAttendees(
    event: calendar_v3.Schema$Event
  ): Array<{ email: string; name: string; responseStatus?: string }> {
    return (
      event.attendees
        ?.filter((a) => a.email)
        .map((a) => ({
          email: a.email!,
          name: this.extractNameFromEmail(a.email!),
          responseStatus: a.responseStatus ?? undefined,
        })) ?? []
    );
  }

  /**
   * Extract a readable name from an email address.
   */
  private extractNameFromEmail(email: string): string {
    const local = email.split("@")[0];
    return local
      .replace(/[._-]/g, " ")
      .replace(/\b\w/g, (c) => c.toUpperCase())
      .trim();
  }

  /**
   * Get memory context for each attendee.
   */
  private async getAttendeeContexts(
    attendees: Array<{ email: string; name: string; responseStatus?: string }>,
    senderId: string | undefined,
    limit: number,
    minScore: number
  ): Promise<AttendeeContext[]> {
    const contexts: AttendeeContext[] = [];

    for (const attendee of attendees.slice(0, 10)) {
      // Search by name and email
      const searchQueries = [attendee.name, attendee.email.split("@")[0]];
      const seenIds = new Set<string>();
      const memories: MemorySearchResult[] = [];

      for (const query of searchQueries) {
        try {
          const results = await this.memoryStore.search(query, {
            senderId,
            limit,
            minScore,
          });
          for (const mem of results) {
            if (!seenIds.has(mem.id)) {
              seenIds.add(mem.id);
              memories.push(mem);
            }
          }
        } catch {
          // Continue on search errors
        }
      }

      // Sort by score and take top results
      memories.sort((a, b) => b.score - a.score);

      contexts.push({
        email: attendee.email,
        name: attendee.name,
        responseStatus: attendee.responseStatus,
        memories: memories.slice(0, limit),
      });
    }

    return contexts;
  }

  /**
   * Get memory context for meeting topics.
   */
  private async getTopicContexts(
    eventSummary: string,
    description: string | null | undefined,
    senderId: string | undefined,
    limit: number,
    minScore: number
  ): Promise<TopicContext[]> {
    const contexts: TopicContext[] = [];
    const topics: string[] = [];

    // Add event summary as a topic
    if (eventSummary && eventSummary !== "Untitled Meeting") {
      topics.push(eventSummary);
    }

    // Extract topics from description
    if (description) {
      // Extract lines that look like topics (agenda items, bullet points)
      const lines = description.split("\n").filter((l) => l.trim().length > 0);
      for (const line of lines.slice(0, 5)) {
        const cleanLine = line.replace(/^[-*\d.)\s]+/, "").trim();
        if (cleanLine.length > 5 && cleanLine.length < 100) {
          topics.push(cleanLine);
        }
      }
    }

    // Search memories for each topic
    for (const topic of [...new Set(topics)].slice(0, 5)) {
      try {
        const results = await this.memoryStore.search(topic, {
          senderId,
          limit,
          minScore,
        });

        if (results.length > 0) {
          contexts.push({
            topic,
            relatedMemories: results,
          });
        }
      } catch {
        // Continue on search errors
      }
    }

    return contexts;
  }

  /**
   * Find pending action items related to attendees or meeting topic.
   */
  private async findPendingActions(
    attendees: Array<{ email: string; name: string }>,
    eventSummary: string,
    senderId: string | undefined,
    minScore: number
  ): Promise<PendingActionItem[]> {
    const actions: PendingActionItem[] = [];
    const seenIds = new Set<string>();

    // Search for action items, todos, follow-ups
    const actionQueries = [
      "action item",
      "todo",
      "follow up",
      "pending",
      eventSummary,
    ];

    // Also search by attendee names
    for (const attendee of attendees.slice(0, 5)) {
      actionQueries.push(`${attendee.name} action`);
      actionQueries.push(`${attendee.name} todo`);
    }

    for (const query of actionQueries) {
      try {
        const results = await this.memoryStore.search(query, {
          senderId,
          category: "reminder",
          limit: 5,
          minScore,
        });

        for (const mem of results) {
          if (seenIds.has(mem.id)) continue;
          seenIds.add(mem.id);

          // Parse action item from memory content
          const action = this.parseActionFromMemory(mem);
          if (action) {
            actions.push(action);
          }
        }
      } catch {
        // Continue on search errors
      }
    }

    // Sort by confidence/score and return unique actions
    return actions
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, 10);
  }

  /**
   * Parse an action item from a memory entry.
   */
  private parseActionFromMemory(
    mem: MemorySearchResult
  ): PendingActionItem | null {
    const content = mem.content;

    // Skip if doesn't look like an action item
    const actionKeywords = [
      "action",
      "todo",
      "follow up",
      "need to",
      "should",
      "will",
      "pending",
    ];
    if (!actionKeywords.some((kw) => content.toLowerCase().includes(kw))) {
      return null;
    }

    // Extract assignee if mentioned
    let assignee: string | undefined;
    const assigneeMatch = content.match(
      /(?:assigned to|@)?\s*([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/
    );
    if (assigneeMatch) {
      assignee = assigneeMatch[1];
    }

    // Extract deadline if mentioned
    let deadline: string | undefined;
    const deadlineMatch = content.match(
      /(?:by|due|before)\s+([\w\s,]+\d{4}|Monday|Tuesday|Wednesday|Thursday|Friday|tomorrow|next week)/i
    );
    if (deadlineMatch) {
      deadline = deadlineMatch[1];
    }

    return {
      id: mem.id,
      description: content,
      assignee,
      deadline,
      source: `Memory: ${mem.category}`,
      confidence: mem.score,
    };
  }

  /**
   * Format the pre-brief as markdown.
   */
  private formatMarkdown(params: {
    eventSummary: string;
    startTime: string;
    endTime?: string | null;
    location?: string | null;
    description?: string | null;
    attendeeContexts: AttendeeContext[];
    topicContexts: TopicContext[];
    pendingActions: PendingActionItem[];
    includeSuggestedTopics: boolean;
    includeChecklist: boolean;
  }): string {
    const {
      eventSummary,
      startTime,
      endTime,
      location,
      description,
      attendeeContexts,
      topicContexts,
      pendingActions,
      includeSuggestedTopics,
      includeChecklist,
    } = params;

    const lines: string[] = [];

    // Header
    lines.push(`# Pre-Brief: ${eventSummary}`);
    lines.push("");

    // Meeting Details
    lines.push("## Meeting Details");
    lines.push("");
    lines.push(`**When:** ${this.formatDateTime(startTime, endTime)}`);
    if (location) {
      lines.push(`**Where:** ${location}`);
    }
    if (description) {
      lines.push("");
      lines.push("**Description:**");
      lines.push(`> ${description.split("\n").join("\n> ")}`);
    }
    lines.push("");

    // Attendees Section
    if (attendeeContexts.length > 0) {
      lines.push("## Attendees");
      lines.push("");

      for (const ctx of attendeeContexts) {
        const status = this.formatResponseStatus(ctx.responseStatus);
        lines.push(`### ${ctx.name} ${status}`);
        lines.push(`*${ctx.email}*`);
        lines.push("");

        if (ctx.memories.length > 0) {
          lines.push("**Context:**");
          for (const mem of ctx.memories) {
            lines.push(`- ${mem.content}`);
          }
        } else {
          lines.push("*No relevant context found*");
        }
        lines.push("");
      }
    }

    // Topic Context Section
    if (topicContexts.length > 0) {
      lines.push("## Related Context");
      lines.push("");

      for (const ctx of topicContexts) {
        lines.push(`### ${ctx.topic}`);
        lines.push("");
        for (const mem of ctx.relatedMemories.slice(0, 3)) {
          lines.push(`- ${mem.content}`);
        }
        lines.push("");
      }
    }

    // Pending Actions Section
    if (pendingActions.length > 0) {
      lines.push("## Pending Action Items");
      lines.push("");

      for (const action of pendingActions) {
        let item = `- [ ] ${action.description}`;
        if (action.assignee) {
          item += ` (@${action.assignee})`;
        }
        if (action.deadline) {
          item += ` - Due: ${action.deadline}`;
        }
        lines.push(item);
      }
      lines.push("");
    }

    // Suggested Topics Section
    if (includeSuggestedTopics) {
      const suggestedTopics = this.generateSuggestedTopics(
        eventSummary,
        attendeeContexts,
        topicContexts,
        pendingActions
      );

      if (suggestedTopics.length > 0) {
        lines.push("## Suggested Discussion Topics");
        lines.push("");
        for (const topic of suggestedTopics) {
          lines.push(`- ${topic}`);
        }
        lines.push("");
      }
    }

    // Preparation Checklist Section
    if (includeChecklist) {
      const checklist = this.generateChecklist(
        eventSummary,
        pendingActions.length > 0,
        attendeeContexts.length > 0
      );

      if (checklist.length > 0) {
        lines.push("## Preparation Checklist");
        lines.push("");
        for (const item of checklist) {
          lines.push(`- [ ] ${item}`);
        }
        lines.push("");
      }
    }

    // Footer
    lines.push("---");
    lines.push(`*Generated at ${new Date().toLocaleString()}*`);

    return lines.join("\n");
  }

  /**
   * Format date/time range for display.
   */
  private formatDateTime(startTime: string, endTime?: string | null): string {
    try {
      const start = new Date(startTime);
      const options: Intl.DateTimeFormatOptions = {
        weekday: "long",
        year: "numeric",
        month: "long",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      };

      let formatted = start.toLocaleString("en-US", options);

      if (endTime) {
        const end = new Date(endTime);
        const endTimeStr = end.toLocaleTimeString("en-US", {
          hour: "numeric",
          minute: "2-digit",
        });
        formatted += ` - ${endTimeStr}`;
      }

      return formatted;
    } catch {
      return startTime;
    }
  }

  /**
   * Format response status as emoji.
   */
  private formatResponseStatus(status?: string): string {
    switch (status) {
      case "accepted":
        return "(Accepted)";
      case "declined":
        return "(Declined)";
      case "tentative":
        return "(Tentative)";
      case "needsAction":
        return "(Pending)";
      default:
        return "";
    }
  }

  /**
   * Generate suggested discussion topics based on context.
   */
  private generateSuggestedTopics(
    eventSummary: string,
    attendeeContexts: AttendeeContext[],
    topicContexts: TopicContext[],
    pendingActions: PendingActionItem[]
  ): string[] {
    const topics: string[] = [];

    // Add topics from pending actions
    if (pendingActions.length > 0) {
      topics.push("Review status of pending action items");
    }

    // Add topics from high-scoring memories
    for (const ctx of topicContexts) {
      for (const mem of ctx.relatedMemories.filter((m) => m.score > 0.6)) {
        const content = mem.content.toLowerCase();
        if (
          content.includes("discuss") ||
          content.includes("follow up") ||
          content.includes("review")
        ) {
          topics.push(mem.content.slice(0, 80));
        }
      }
    }

    // Add meeting-type specific topics
    const summaryLower = eventSummary.toLowerCase();
    if (summaryLower.includes("1:1") || summaryLower.includes("one on one")) {
      topics.push("Recent wins and accomplishments");
      topics.push("Current blockers or challenges");
      topics.push("Career development and goals");
    } else if (
      summaryLower.includes("standup") ||
      summaryLower.includes("sync")
    ) {
      topics.push("Progress since last sync");
      topics.push("Blockers and dependencies");
    } else if (
      summaryLower.includes("planning") ||
      summaryLower.includes("roadmap")
    ) {
      topics.push("Priorities for next period");
      topics.push("Resource allocation");
    }

    return [...new Set(topics)].slice(0, 5);
  }

  /**
   * Generate a preparation checklist based on meeting type.
   */
  private generateChecklist(
    eventSummary: string,
    hasActions: boolean,
    hasAttendeeContext: boolean
  ): string[] {
    const items: string[] = [];
    const summaryLower = eventSummary.toLowerCase();

    // Generic items
    items.push("Review meeting agenda");

    if (hasActions) {
      items.push("Update status of pending action items");
    }

    if (hasAttendeeContext) {
      items.push("Review attendee context above");
    }

    // Meeting-type specific items
    if (summaryLower.includes("review") || summaryLower.includes("demo")) {
      items.push("Prepare demo or materials to present");
      items.push("Test demo environment");
    }

    if (
      summaryLower.includes("planning") ||
      summaryLower.includes("roadmap")
    ) {
      items.push("Gather metrics and status data");
      items.push("Prepare proposals for discussion");
    }

    if (summaryLower.includes("1:1") || summaryLower.includes("one on one")) {
      items.push("Prepare feedback points");
      items.push("Note topics you want to discuss");
    }

    if (summaryLower.includes("interview")) {
      items.push("Review candidate resume/profile");
      items.push("Prepare interview questions");
    }

    return items.slice(0, 6);
  }
}

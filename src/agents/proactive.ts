/**
 * Proactive assistance service - meeting pre-briefs, memory surfacing, conflict detection.
 * Provides intelligent context injection for upcoming meetings and events.
 */

import type { calendar_v3 } from "googleapis";

import {
  type ProactiveConfig,
  loadConfig,
} from "../config/config.js";
import {
  createMemoryService,
  type MemoryService,
} from "../memory/index.js";
import type { MemorySearchResult } from "../memory/types.js";

// ─────────────────────────────────────────────────────────────────────────────
// Default Configuration
// ─────────────────────────────────────────────────────────────────────────────

const DEFAULT_PRE_BRIEF_MINUTES = 15;
const DEFAULT_MAX_MEMORIES = 5;
const DEFAULT_MIN_RELEVANCE_SCORE = 0.5;
const DEFAULT_CONFLICT_LOOKAHEAD_HOURS = 24;

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

/** Pre-brief for an upcoming meeting with relevant context */
export interface ProactiveBrief {
  /** Calendar event ID */
  eventId: string;
  /** Event title/summary */
  eventSummary: string;
  /** Start time (ISO string) */
  startTime: string;
  /** End time (ISO string) */
  endTime?: string;
  /** List of attendee emails */
  attendees: string[];
  /** Memories relevant to this meeting and its attendees */
  relevantMemories: MemorySearchResult[];
  /** Recent email snippets from attendees (optional) */
  recentEmails?: string[];
  /** AI-suggested talking points based on context */
  suggestedTopics?: string[];
}

/** Detected scheduling or resource conflict */
export interface Conflict {
  /** Type of conflict detected */
  type: "schedule_overlap" | "deadline_clash" | "resource_conflict";
  /** Human-readable description of the conflict */
  description: string;
  /** Events involved in the conflict */
  events: Array<{
    id: string;
    summary: string;
    start: string;
    end: string;
  }>;
  /** Severity level for prioritization */
  severity: "low" | "medium" | "high";
  /** Optional suggestion for resolution */
  suggestion?: string;
}

/** Complete proactive context for injection into conversation */
export interface ProactiveContext {
  /** Pre-briefs for upcoming meetings */
  meetingBriefs: ProactiveBrief[];
  /** Memories surfaced based on current context */
  surfacedMemories: MemorySearchResult[];
  /** Detected conflicts to alert user about */
  conflicts: Conflict[];
  /** When this context was generated */
  timestamp: number;
}

/** Options for generating proactive context */
export interface ProactiveContextOptions {
  /** User/sender ID for memory filtering */
  senderId?: string;
  /** Hours ahead to look for meetings (default: 24) */
  lookaheadHours?: number;
  /** Maximum number of meeting briefs to generate */
  maxBriefs?: number;
  /** Maximum memories per brief */
  memoriesPerBrief?: number;
  /** Optional current context/topic for memory surfacing */
  currentContext?: string;
  /** Calendar events to analyze (passed from caller) */
  events?: calendar_v3.Schema$Event[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Singleton Service
// ─────────────────────────────────────────────────────────────────────────────

/** Singleton service instance */
let serviceInstance: ProactiveService | null = null;
let initPromise: Promise<ProactiveService | null> | null = null;

/**
 * ProactiveService - Generates meeting briefs, surfaces relevant memories,
 * and detects scheduling conflicts for proactive user assistance.
 */
export class ProactiveService {
  private readonly memory: MemoryService;

  constructor(memory: MemoryService) {
    this.memory = memory;
  }

  /**
   * Generate a pre-brief for an upcoming meeting.
   * Fetches relevant memories for the meeting topic and attendees.
   *
   * @param event - Calendar event to brief on
   * @param senderId - User ID for memory context
   * @param options - Additional options
   * @returns Meeting pre-brief with relevant context
   */
  async getMeetingPreBrief(
    event: calendar_v3.Schema$Event,
    senderId?: string,
    options?: { memoriesPerBrief?: number }
  ): Promise<ProactiveBrief> {
    const memoriesPerBrief = options?.memoriesPerBrief ?? 5;
    const attendees =
      event.attendees?.map((a) => a.email).filter(Boolean) as string[] ?? [];
    const eventSummary = event.summary ?? "Untitled Event";

    // Build search queries for relevant memories
    const searchQueries: string[] = [];

    // Search by event title/summary
    if (eventSummary && eventSummary !== "Untitled Event") {
      searchQueries.push(eventSummary);
    }

    // Search by attendee names/emails
    for (const attendee of attendees.slice(0, 3)) {
      // Limit to first 3 attendees
      const name = attendee.split("@")[0].replace(/[._-]/g, " ");
      searchQueries.push(name);
    }

    // Search by event description if available
    if (event.description) {
      // Extract key phrases from description (first 100 chars)
      const descSnippet = event.description.slice(0, 100);
      searchQueries.push(descSnippet);
    }

    // Execute all searches in parallel and deduplicate results
    const allMemories: MemorySearchResult[] = [];
    const seenIds = new Set<string>();

    const searchPromises = searchQueries.map((query) =>
      this.memory
        .search(query, {
          senderId,
          limit: memoriesPerBrief,
          minScore: 0.4, // Lower threshold for meeting relevance
        })
        .catch(() => [] as MemorySearchResult[])
    );

    const searchResults = await Promise.all(searchPromises);

    for (const results of searchResults) {
      for (const mem of results) {
        if (!seenIds.has(mem.id)) {
          seenIds.add(mem.id);
          allMemories.push(mem);
        }
      }
    }

    // Sort by score and limit
    allMemories.sort((a, b) => b.score - a.score);
    const relevantMemories = allMemories.slice(0, memoriesPerBrief);

    // Generate suggested topics based on memories
    const suggestedTopics = this.generateSuggestedTopics(
      eventSummary,
      relevantMemories
    );

    // Handle null values from googleapis types
    const endTime = event.end?.dateTime ?? event.end?.date ?? undefined;

    return {
      eventId: event.id ?? "",
      eventSummary,
      startTime: event.start?.dateTime ?? event.start?.date ?? "",
      endTime: endTime || undefined,
      attendees,
      relevantMemories,
      suggestedTopics,
    };
  }

  /**
   * Surface relevant memories based on a query or context.
   * Uses semantic search to find related information.
   *
   * @param query - Search query or context
   * @param senderId - User ID for filtering
   * @param options - Search options
   * @returns Relevant memories sorted by score
   */
  async surfaceRelevantMemories(
    query: string,
    senderId?: string,
    options?: { limit?: number; minScore?: number }
  ): Promise<MemorySearchResult[]> {
    const limit = options?.limit ?? 10;
    const minScore = options?.minScore ?? 0.5;

    try {
      return await this.memory.search(query, {
        senderId,
        limit,
        minScore,
      });
    } catch (error) {
      console.error("Failed to surface memories:", error);
      return [];
    }
  }

  /**
   * Detect scheduling conflicts in a set of calendar events.
   * Finds overlapping events, deadline clashes, and resource conflicts.
   *
   * @param events - Calendar events to analyze
   * @returns Array of detected conflicts
   */
  detectConflicts(events: calendar_v3.Schema$Event[]): Conflict[] {
    const conflicts: Conflict[] = [];

    // Convert events to normalized format for comparison
    const normalizedEvents = events
      .filter((e) => e.start?.dateTime || e.start?.date)
      .map((e) => ({
        id: e.id ?? "",
        summary: e.summary ?? "Untitled",
        start: e.start?.dateTime ?? e.start?.date ?? "",
        end: e.end?.dateTime ?? e.end?.date ?? "",
        startMs: new Date(
          e.start?.dateTime ?? e.start?.date ?? ""
        ).getTime(),
        endMs: new Date(e.end?.dateTime ?? e.end?.date ?? "").getTime(),
      }))
      .filter((e) => !isNaN(e.startMs) && !isNaN(e.endMs))
      .sort((a, b) => a.startMs - b.startMs);

    // Detect schedule overlaps
    for (let i = 0; i < normalizedEvents.length; i++) {
      for (let j = i + 1; j < normalizedEvents.length; j++) {
        const eventA = normalizedEvents[i];
        const eventB = normalizedEvents[j];

        // Check for overlap: A ends after B starts AND A starts before B ends
        if (eventA.endMs > eventB.startMs && eventA.startMs < eventB.endMs) {
          // Calculate overlap duration
          const overlapStart = Math.max(eventA.startMs, eventB.startMs);
          const overlapEnd = Math.min(eventA.endMs, eventB.endMs);
          const overlapMinutes = (overlapEnd - overlapStart) / (1000 * 60);

          // Determine severity based on overlap duration
          let severity: "low" | "medium" | "high" = "low";
          if (overlapMinutes >= 60) {
            severity = "high";
          } else if (overlapMinutes >= 15) {
            severity = "medium";
          }

          conflicts.push({
            type: "schedule_overlap",
            description: `"${eventA.summary}" overlaps with "${eventB.summary}" by ${Math.round(overlapMinutes)} minutes`,
            events: [
              {
                id: eventA.id,
                summary: eventA.summary,
                start: eventA.start,
                end: eventA.end,
              },
              {
                id: eventB.id,
                summary: eventB.summary,
                start: eventB.start,
                end: eventB.end,
              },
            ],
            severity,
            suggestion: this.generateConflictSuggestion(
              "schedule_overlap",
              eventA,
              eventB,
              overlapMinutes
            ),
          });
        }
      }
    }

    // Detect back-to-back meetings (potential deadline clash)
    for (let i = 0; i < normalizedEvents.length - 1; i++) {
      const current = normalizedEvents[i];
      const next = normalizedEvents[i + 1];

      // Events ending and starting within 5 minutes
      const gapMinutes = (next.startMs - current.endMs) / (1000 * 60);
      if (gapMinutes >= 0 && gapMinutes < 5) {
        conflicts.push({
          type: "deadline_clash",
          description: `Back-to-back meetings: "${current.summary}" ends just before "${next.summary}" starts (${Math.round(gapMinutes)} min gap)`,
          events: [
            {
              id: current.id,
              summary: current.summary,
              start: current.start,
              end: current.end,
            },
            {
              id: next.id,
              summary: next.summary,
              start: next.start,
              end: next.end,
            },
          ],
          severity: "low",
          suggestion:
            "Consider adding buffer time between meetings for breaks or preparation.",
        });
      }
    }

    return conflicts;
  }

  /**
   * Generate complete proactive context for a user.
   * Combines meeting briefs, surfaced memories, and conflict detection.
   *
   * @param options - Configuration options
   * @returns Complete proactive context
   */
  async generateProactiveContext(
    options: ProactiveContextOptions = {}
  ): Promise<ProactiveContext> {
    const {
      senderId,
      maxBriefs = 5,
      memoriesPerBrief = 3,
      currentContext,
      events = [],
    } = options;

    // Filter events to upcoming ones only
    const now = Date.now();
    const upcomingEvents = events
      .filter((e) => {
        const startTime = e.start?.dateTime ?? e.start?.date;
        if (!startTime) return false;
        return new Date(startTime).getTime() > now;
      })
      .slice(0, maxBriefs);

    // Generate meeting briefs in parallel
    const briefPromises = upcomingEvents.map((event) =>
      this.getMeetingPreBrief(event, senderId, { memoriesPerBrief }).catch(
        (err) => {
          console.error("Failed to generate brief:", err);
          return null;
        }
      )
    );

    const briefs = (await Promise.all(briefPromises)).filter(
      (b): b is ProactiveBrief => b !== null
    );

    // Surface memories based on current context
    let surfacedMemories: MemorySearchResult[] = [];
    if (currentContext) {
      surfacedMemories = await this.surfaceRelevantMemories(
        currentContext,
        senderId,
        { limit: 5 }
      );
    }

    // Detect conflicts in all provided events
    const conflicts = this.detectConflicts(events);

    return {
      meetingBriefs: briefs,
      surfacedMemories,
      conflicts,
      timestamp: Date.now(),
    };
  }

  /**
   * Format proactive context as an injectable string for the LLM.
   *
   * @param context - Proactive context to format
   * @returns Formatted string for context injection
   */
  formatContextForInjection(context: ProactiveContext): string {
    const sections: string[] = [];

    // Meeting briefs section
    if (context.meetingBriefs.length > 0) {
      const briefLines = context.meetingBriefs.map((brief) => {
        const lines = [
          `## ${brief.eventSummary}`,
          `- Start: ${brief.startTime}`,
        ];

        if (brief.attendees.length > 0) {
          lines.push(`- Attendees: ${brief.attendees.join(", ")}`);
        }

        if (brief.relevantMemories.length > 0) {
          lines.push("- Relevant context:");
          for (const mem of brief.relevantMemories) {
            lines.push(`  - ${mem.content} (${mem.category})`);
          }
        }

        if (brief.suggestedTopics && brief.suggestedTopics.length > 0) {
          lines.push(`- Suggested topics: ${brief.suggestedTopics.join(", ")}`);
        }

        return lines.join("\n");
      });

      sections.push("# Upcoming Meetings\n\n" + briefLines.join("\n\n"));
    }

    // Surfaced memories section
    if (context.surfacedMemories.length > 0) {
      const memoryLines = context.surfacedMemories.map(
        (mem) => `- ${mem.content} (${mem.category}, score: ${mem.score.toFixed(2)})`
      );
      sections.push("# Relevant Context\n\n" + memoryLines.join("\n"));
    }

    // Conflicts section
    if (context.conflicts.length > 0) {
      const conflictLines = context.conflicts.map((c) => {
        const severity = c.severity.toUpperCase();
        let line = `- [${severity}] ${c.description}`;
        if (c.suggestion) {
          line += `\n  Suggestion: ${c.suggestion}`;
        }
        return line;
      });
      sections.push("# Schedule Alerts\n\n" + conflictLines.join("\n"));
    }

    if (sections.length === 0) {
      return "";
    }

    return sections.join("\n\n---\n\n");
  }

  /**
   * Generate suggested discussion topics based on memories.
   */
  private generateSuggestedTopics(
    eventSummary: string,
    memories: MemorySearchResult[]
  ): string[] {
    const topics: string[] = [];

    // Extract topics from high-scoring memories
    for (const mem of memories.filter((m) => m.score > 0.6)) {
      // Extract key phrases from memory content
      const content = mem.content.toLowerCase();

      // Look for action-oriented content
      if (
        content.includes("follow up") ||
        content.includes("discuss") ||
        content.includes("review")
      ) {
        const snippet = mem.content.slice(0, 50);
        if (!topics.includes(snippet)) {
          topics.push(snippet);
        }
      }

      // Look for preferences or facts
      if (mem.category === "preference" || mem.category === "fact") {
        const snippet = mem.content.slice(0, 50);
        if (!topics.includes(snippet)) {
          topics.push(snippet);
        }
      }
    }

    return topics.slice(0, 3); // Limit to 3 suggested topics
  }

  /**
   * Generate a suggestion for resolving a conflict.
   */
  private generateConflictSuggestion(
    type: string,
    eventA: { summary: string; startMs: number; endMs: number },
    eventB: { summary: string; startMs: number; endMs: number },
    overlapMinutes: number
  ): string {
    if (type === "schedule_overlap") {
      if (overlapMinutes >= 60) {
        return `Consider rescheduling one of these meetings. "${eventA.summary}" or "${eventB.summary}" could be moved to a different time.`;
      }
      if (overlapMinutes >= 15) {
        return `There's a ${Math.round(overlapMinutes)} minute overlap. You may need to leave "${eventA.summary}" early or join "${eventB.summary}" late.`;
      }
      return `Minor overlap detected. You might be a few minutes late to "${eventB.summary}".`;
    }

    return "";
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Config-Aware Helper Functions
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Check if proactive assistance is enabled in config.
 */
export function isProactiveEnabled(): boolean {
  const config = loadConfig();
  return config.proactive?.enabled === true;
}

/**
 * Check if we are currently in quiet hours.
 * During quiet hours, proactive messages should not be sent.
 */
export function isQuietHours(config?: ProactiveConfig): boolean {
  const cfg = config ?? loadConfig().proactive;
  const start = cfg?.quietHoursStart;
  const end = cfg?.quietHoursEnd;

  if (start === undefined || end === undefined) return false;

  const now = new Date();
  const hour = now.getHours();

  // Handle overnight quiet hours (e.g., 22-7)
  if (start > end) {
    return hour >= start || hour < end;
  }
  // Normal quiet hours (e.g., 23-6)
  return hour >= start && hour < end;
}

/**
 * Get the pre-brief window in minutes from config.
 */
export function getPreBriefMinutes(config?: ProactiveConfig): number {
  const cfg = config ?? loadConfig().proactive;
  return cfg?.preBrief?.minutesBefore ?? DEFAULT_PRE_BRIEF_MINUTES;
}

/**
 * Get max memories per pre-brief from config.
 */
export function getMaxMemoriesPerBrief(config?: ProactiveConfig): number {
  const cfg = config ?? loadConfig().proactive;
  return cfg?.preBrief?.maxMemories ?? DEFAULT_MAX_MEMORIES;
}

/**
 * Get minimum relevance score from config.
 */
export function getMinRelevanceScore(config?: ProactiveConfig): number {
  const cfg = config ?? loadConfig().proactive;
  return cfg?.preBrief?.minRelevanceScore ?? DEFAULT_MIN_RELEVANCE_SCORE;
}

/**
 * Get conflict detection lookahead hours from config.
 */
export function getConflictLookaheadHours(config?: ProactiveConfig): number {
  const cfg = config ?? loadConfig().proactive;
  return cfg?.conflictDetection?.lookAheadHours ?? DEFAULT_CONFLICT_LOOKAHEAD_HOURS;
}

/**
 * Check if pre-briefs are enabled.
 */
export function isPreBriefEnabled(config?: ProactiveConfig): boolean {
  const cfg = config ?? loadConfig().proactive;
  // Pre-briefs are enabled by default when proactive is enabled
  return cfg?.enabled === true && cfg?.preBrief?.enabled !== false;
}

/**
 * Check if conflict detection is enabled.
 */
export function isConflictDetectionEnabled(config?: ProactiveConfig): boolean {
  const cfg = config ?? loadConfig().proactive;
  // Conflict detection is enabled by default when proactive is enabled
  return cfg?.enabled === true && cfg?.conflictDetection?.enabled !== false;
}

/**
 * Get events needing pre-briefs (within the configured window and not yet briefed).
 */
export function filterEventsForPreBrief(
  events: calendar_v3.Schema$Event[],
  briefedEventIds: Set<string>,
  config?: ProactiveConfig,
): calendar_v3.Schema$Event[] {
  const now = Date.now();
  const minutesBefore = getPreBriefMinutes(config);
  const windowEnd = now + minutesBefore * 60 * 1000;

  return events.filter((event) => {
    if (!event.id) return false;
    if (briefedEventIds.has(event.id)) return false;

    const startTime = event.start?.dateTime ?? event.start?.date;
    if (!startTime) return false;

    const startMs = new Date(startTime).getTime();
    // Event is within window and hasn't started yet
    return startMs > now && startMs <= windowEnd;
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Factory Function
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Get or create the ProactiveService singleton.
 * Returns null if memory service is not available.
 */
export async function createProactiveService(): Promise<ProactiveService | null> {
  // Return cached instance if available
  if (serviceInstance) return serviceInstance;

  // Return existing init promise to prevent duplicate initialization
  if (initPromise) return initPromise;

  initPromise = (async () => {
    try {
      const memory = await createMemoryService();

      if (!memory) {
        console.log("ProactiveService: Memory service not available");
        return null;
      }

      serviceInstance = new ProactiveService(memory);
      return serviceInstance;
    } catch (error) {
      console.error("Failed to initialize ProactiveService:", error);
      return null;
    }
  })();

  return initPromise;
}

/**
 * Check if proactive service can be initialized.
 */
export async function isProactiveServiceAvailable(): Promise<boolean> {
  const service = await createProactiveService();
  return service !== null;
}

/**
 * Reset the proactive service singleton (for testing).
 */
export function resetProactiveService(): void {
  serviceInstance = null;
  initPromise = null;
}

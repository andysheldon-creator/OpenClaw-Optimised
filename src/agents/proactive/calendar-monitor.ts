/**
 * Calendar monitoring for proactive meeting assistance.
 * Monitors upcoming meetings and provides contextual pre-briefs.
 */

import fs from "node:fs/promises";
import path from "node:path";

import { type Auth, type calendar_v3, google } from "googleapis";

import {
  createMemoryService,
  type MemorySearchResult,
  type MemoryService,
} from "../../memory/index.js";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

/** A calendar event with normalized fields for monitoring */
export interface CalendarEvent {
  /** Calendar event ID */
  id: string;
  /** Event title/summary */
  summary: string;
  /** Event description */
  description?: string;
  /** Start time (ISO string) */
  startTime: string;
  /** End time (ISO string) */
  endTime?: string;
  /** Meeting location or video link */
  location?: string;
  /** Hangout/Meet link if available */
  meetLink?: string;
  /** List of attendee emails */
  attendees: string[];
  /** Organizer email */
  organizer?: string;
  /** Event status (confirmed, tentative, cancelled) */
  status: string;
  /** Whether the event is an all-day event */
  isAllDay: boolean;
  /** Calendar ID this event belongs to */
  calendarId: string;
  /** Minutes until event starts (negative if already started) */
  minutesUntilStart: number;
}

/** Context gathered for a meeting */
export interface MeetingContext {
  /** The calendar event */
  event: CalendarEvent;
  /** Relevant memories for attendees and topic */
  relevantMemories: MemorySearchResult[];
  /** Key facts about attendees */
  attendeeFacts: Array<{
    email: string;
    name: string;
    facts: string[];
  }>;
  /** Topics to discuss based on context */
  suggestedTopics: string[];
  /** Recent interactions with attendees */
  recentInteractions: string[];
  /** Outstanding action items related to attendees */
  outstandingActions: string[];
  /** When this context was generated */
  generatedAt: number;
}

/** Options for the CalendarMonitor */
export interface CalendarMonitorOptions {
  /** Default calendar ID to monitor (default: "primary") */
  defaultCalendarId?: string;
  /** Additional calendar IDs to monitor */
  additionalCalendarIds?: string[];
  /** Timezone for display (default: "Europe/Vienna") */
  timezone?: string;
  /** Max memories per attendee search */
  maxMemoriesPerSearch?: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Google Calendar Service
// ─────────────────────────────────────────────────────────────────────────────

const CREDS_DIR = path.join(
  process.env.HOME ?? "/tmp",
  ".clawdis",
  "credentials",
  "google",
);
const OAUTH_CLIENT_PATH = path.join(CREDS_DIR, "oauth-client.json");
const TOKENS_PATH = path.join(CREDS_DIR, "tokens.json");

/** Cached OAuth client */
let cachedAuth: Auth.OAuth2Client | null = null;

/**
 * Get or create the OAuth2 client for Google APIs.
 */
async function getAuthClient(): Promise<Auth.OAuth2Client> {
  if (cachedAuth) return cachedAuth;

  const [clientRaw, tokensRaw] = await Promise.all([
    fs.readFile(OAUTH_CLIENT_PATH, "utf-8"),
    fs.readFile(TOKENS_PATH, "utf-8"),
  ]);

  const client = JSON.parse(clientRaw) as {
    installed: { client_id: string; client_secret: string };
  };
  const tokens = JSON.parse(tokensRaw) as {
    access_token: string;
    refresh_token?: string;
    expiry_date?: number;
  };

  const oauth2Client = new google.auth.OAuth2(
    client.installed.client_id,
    client.installed.client_secret,
  );
  oauth2Client.setCredentials(tokens);

  // Auto-refresh tokens
  oauth2Client.on("tokens", async (newTokens) => {
    const existingTokens = JSON.parse(await fs.readFile(TOKENS_PATH, "utf-8"));
    await fs.writeFile(
      TOKENS_PATH,
      JSON.stringify({ ...existingTokens, ...newTokens }, null, 2),
      { mode: 0o600 },
    );
  });

  cachedAuth = oauth2Client;
  return oauth2Client;
}

/**
 * GoogleCalendarService - Wrapper around Google Calendar API.
 */
export class GoogleCalendarService {
  private calendar: calendar_v3.Calendar | null = null;

  /**
   * Initialize the calendar service with OAuth credentials.
   */
  async initialize(): Promise<void> {
    const auth = await getAuthClient();
    this.calendar = google.calendar({ version: "v3", auth });
  }

  /**
   * Ensure service is initialized.
   */
  private async ensureInitialized(): Promise<calendar_v3.Calendar> {
    if (!this.calendar) {
      await this.initialize();
    }
    if (!this.calendar) {
      throw new Error("Failed to initialize Google Calendar service");
    }
    return this.calendar;
  }

  /**
   * List upcoming events from a calendar.
   */
  async listUpcomingEvents(
    options: {
      calendarId?: string;
      timeMin?: Date;
      timeMax?: Date;
      maxResults?: number;
    } = {},
  ): Promise<calendar_v3.Schema$Event[]> {
    const calendar = await this.ensureInitialized();
    const {
      calendarId = "primary",
      timeMin = new Date(),
      timeMax,
      maxResults = 20,
    } = options;

    const response = await calendar.events.list({
      calendarId,
      timeMin: timeMin.toISOString(),
      timeMax: timeMax?.toISOString(),
      maxResults,
      singleEvents: true,
      orderBy: "startTime",
    });

    return response.data.items ?? [];
  }

  /**
   * Get events starting within a time window.
   */
  async getEventsStartingWithin(
    withinMinutes: number,
    calendarIds: string[] = ["primary"],
  ): Promise<calendar_v3.Schema$Event[]> {
    const now = new Date();
    const timeMax = new Date(now.getTime() + withinMinutes * 60 * 1000);

    const allEvents: calendar_v3.Schema$Event[] = [];

    for (const calendarId of calendarIds) {
      try {
        const events = await this.listUpcomingEvents({
          calendarId,
          timeMin: now,
          timeMax,
          maxResults: 10,
        });
        allEvents.push(...events);
      } catch (error) {
        console.error(
          `Failed to fetch events from calendar ${calendarId}:`,
          error,
        );
      }
    }

    // Sort by start time
    return allEvents.sort((a, b) => {
      const aStart = new Date(
        a.start?.dateTime ?? a.start?.date ?? 0,
      ).getTime();
      const bStart = new Date(
        b.start?.dateTime ?? b.start?.date ?? 0,
      ).getTime();
      return aStart - bStart;
    });
  }

  /**
   * Get a single event by ID.
   */
  async getEvent(
    eventId: string,
    calendarId = "primary",
  ): Promise<calendar_v3.Schema$Event | null> {
    const calendar = await this.ensureInitialized();

    try {
      const response = await calendar.events.get({ calendarId, eventId });
      return response.data;
    } catch {
      return null;
    }
  }

  /**
   * Convert a Google Calendar event to our normalized format.
   */
  normalizeEvent(
    event: calendar_v3.Schema$Event,
    calendarId = "primary",
  ): CalendarEvent {
    const now = Date.now();
    const startTime = event.start?.dateTime ?? event.start?.date ?? "";
    const startMs = new Date(startTime).getTime();
    const minutesUntilStart = Math.round((startMs - now) / (60 * 1000));

    return {
      id: event.id ?? "",
      summary: event.summary ?? "Untitled Event",
      description: event.description ?? undefined,
      startTime,
      endTime: event.end?.dateTime ?? event.end?.date ?? undefined,
      location: event.location ?? undefined,
      meetLink: event.hangoutLink ?? undefined,
      attendees: (event.attendees ?? [])
        .map((a) => a.email)
        .filter((e): e is string => Boolean(e)),
      organizer: event.organizer?.email ?? undefined,
      status: event.status ?? "confirmed",
      isAllDay: !event.start?.dateTime,
      calendarId,
      minutesUntilStart,
    };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Calendar Monitor
// ─────────────────────────────────────────────────────────────────────────────

/** Singleton service instance */
let monitorInstance: CalendarMonitor | null = null;
let initPromise: Promise<CalendarMonitor | null> | null = null;

/**
 * CalendarMonitor - Monitors upcoming calendar events and provides
 * contextual intelligence for proactive meeting assistance.
 */
export class CalendarMonitor {
  private readonly calendarService: GoogleCalendarService;
  private readonly memory: MemoryService | null;
  private readonly options: CalendarMonitorOptions;

  constructor(
    calendarService: GoogleCalendarService,
    memory: MemoryService | null = null,
    options: CalendarMonitorOptions = {},
  ) {
    this.calendarService = calendarService;
    this.memory = memory;
    this.options = {
      defaultCalendarId: "primary",
      additionalCalendarIds: [],
      timezone: "Europe/Vienna",
      maxMemoriesPerSearch: 5,
      ...options,
    };
  }

  /**
   * Get meetings starting within the next N minutes.
   * Returns normalized CalendarEvent objects with time-until-start calculated.
   */
  async getUpcomingMeetings(withinMinutes: number): Promise<CalendarEvent[]> {
    const calendarIds = [
      this.options.defaultCalendarId ?? "primary",
      ...(this.options.additionalCalendarIds ?? []),
    ];

    const events = await this.calendarService.getEventsStartingWithin(
      withinMinutes,
      calendarIds,
    );

    // Filter out cancelled events and all-day events (unless they start soon)
    return events
      .map((event) => {
        // Use first calendar ID for normalization (events are already fetched from those calendars)
        const calendarId = calendarIds[0] ?? "primary";
        return this.calendarService.normalizeEvent(event, calendarId);
      })
      .filter((event) => {
        // Exclude cancelled events
        if (event.status === "cancelled") return false;
        // Include all-day events only if starting today
        if (event.isAllDay) {
          const startDate = new Date(event.startTime).toDateString();
          const today = new Date().toDateString();
          return startDate === today;
        }
        return true;
      });
  }

  /**
   * Get rich context for a meeting including attendee info,
   * relevant memories, and suggested topics.
   */
  async getMeetingContext(
    event: CalendarEvent,
    senderId?: string,
  ): Promise<MeetingContext> {
    const maxMemories = this.options.maxMemoriesPerSearch ?? 5;

    // Build search queries for memories
    const searchQueries: string[] = [];

    // Search by event title
    if (event.summary && event.summary !== "Untitled Event") {
      searchQueries.push(event.summary);
    }

    // Search by attendee names
    for (const attendee of event.attendees.slice(0, 5)) {
      const name = attendee.split("@")[0].replace(/[._-]/g, " ");
      searchQueries.push(name);
    }

    // Search by description keywords
    if (event.description) {
      const snippet = event.description.slice(0, 100);
      searchQueries.push(snippet);
    }

    // Search memories in parallel
    const relevantMemories = await this.searchMemoriesParallel(
      searchQueries,
      senderId,
      maxMemories,
    );

    // Get attendee facts
    const attendeeFacts = await this.getAttendeeFacts(
      event.attendees,
      senderId,
    );

    // Generate suggested topics
    const suggestedTopics = this.generateSuggestedTopics(
      event,
      relevantMemories,
    );

    // Extract recent interactions from memories
    const recentInteractions = this.extractRecentInteractions(
      relevantMemories,
      event.attendees,
    );

    // Extract outstanding actions
    const outstandingActions = this.extractOutstandingActions(relevantMemories);

    return {
      event,
      relevantMemories,
      attendeeFacts,
      suggestedTopics,
      recentInteractions,
      outstandingActions,
      generatedAt: Date.now(),
    };
  }

  /**
   * Get meetings requiring immediate attention (starting very soon).
   */
  async getImmediateMeetings(withinMinutes = 15): Promise<CalendarEvent[]> {
    const meetings = await this.getUpcomingMeetings(withinMinutes);
    return meetings.filter(
      (m) => m.minutesUntilStart >= 0 && m.minutesUntilStart <= withinMinutes,
    );
  }

  /**
   * Check if user has any meetings starting soon.
   */
  async hasUpcomingMeetingSoon(withinMinutes = 30): Promise<boolean> {
    const meetings = await this.getUpcomingMeetings(withinMinutes);
    return meetings.length > 0;
  }

  /**
   * Get the next meeting on the calendar.
   */
  async getNextMeeting(): Promise<CalendarEvent | null> {
    const meetings = await this.getUpcomingMeetings(24 * 60); // Next 24 hours
    return meetings.length > 0 ? meetings[0] : null;
  }

  /**
   * Format meeting context as a string for injection into prompts.
   */
  formatContextForPrompt(context: MeetingContext): string {
    const { event, attendeeFacts, suggestedTopics, outstandingActions } =
      context;
    const lines: string[] = [];

    // Event header
    lines.push(`## Upcoming Meeting: ${event.summary}`);
    lines.push(`- Starts in: ${event.minutesUntilStart} minutes`);
    lines.push(
      `- Time: ${new Date(event.startTime).toLocaleString("en-US", {
        weekday: "short",
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
        timeZone: this.options.timezone,
      })}`,
    );

    if (event.location) {
      lines.push(`- Location: ${event.location}`);
    }
    if (event.meetLink) {
      lines.push(`- Meet Link: ${event.meetLink}`);
    }

    // Attendees with facts
    if (event.attendees.length > 0) {
      lines.push("");
      lines.push("### Attendees");
      for (const attendee of event.attendees.slice(0, 5)) {
        const facts = attendeeFacts.find((f) => f.email === attendee);
        if (facts && facts.facts.length > 0) {
          lines.push(`- ${facts.name} (${attendee})`);
          for (const fact of facts.facts.slice(0, 2)) {
            lines.push(`  - ${fact}`);
          }
        } else {
          const name = attendee.split("@")[0].replace(/[._-]/g, " ");
          lines.push(`- ${name} (${attendee})`);
        }
      }
    }

    // Suggested topics
    if (suggestedTopics.length > 0) {
      lines.push("");
      lines.push("### Suggested Topics");
      for (const topic of suggestedTopics) {
        lines.push(`- ${topic}`);
      }
    }

    // Outstanding actions
    if (outstandingActions.length > 0) {
      lines.push("");
      lines.push("### Outstanding Action Items");
      for (const action of outstandingActions) {
        lines.push(`- ${action}`);
      }
    }

    return lines.join("\n");
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Private Helper Methods
  // ─────────────────────────────────────────────────────────────────────────

  private async searchMemoriesParallel(
    queries: string[],
    senderId?: string,
    limit = 5,
  ): Promise<MemorySearchResult[]> {
    const memory = this.memory;
    if (!memory) return [];

    const allMemories: MemorySearchResult[] = [];
    const seenIds = new Set<string>();

    const searchPromises = queries.map((query) =>
      memory
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

    return allMemories.sort((a, b) => b.score - a.score).slice(0, limit * 2);
  }

  private async getAttendeeFacts(
    attendees: string[],
    senderId?: string,
  ): Promise<Array<{ email: string; name: string; facts: string[] }>> {
    if (!this.memory) {
      return attendees.map((email) => ({
        email,
        name: email.split("@")[0].replace(/[._-]/g, " "),
        facts: [],
      }));
    }

    const results: Array<{ email: string; name: string; facts: string[] }> = [];

    for (const email of attendees.slice(0, 5)) {
      const name = email.split("@")[0].replace(/[._-]/g, " ");
      const memories = await this.memory
        .search(name, { senderId, limit: 5, minScore: 0.5 })
        .catch(() => []);

      const facts = memories
        .filter((m) => m.category === "fact" || m.category === "preference")
        .map((m) => m.content)
        .slice(0, 3);

      results.push({ email, name, facts });
    }

    return results;
  }

  private generateSuggestedTopics(
    event: CalendarEvent,
    memories: MemorySearchResult[],
  ): string[] {
    const topics: string[] = [];

    // Extract topics from high-scoring memories
    for (const mem of memories.filter((m) => m.score > 0.6)) {
      const content = mem.content.toLowerCase();
      if (
        content.includes("follow up") ||
        content.includes("discuss") ||
        content.includes("review") ||
        content.includes("pending") ||
        content.includes("action")
      ) {
        const snippet = mem.content.slice(0, 60);
        if (!topics.includes(snippet)) {
          topics.push(snippet);
        }
      }
    }

    // Extract topics from event description
    if (event.description) {
      const lines = event.description
        .split("\n")
        .filter((l) => l.trim().length > 0);
      for (const line of lines.slice(0, 3)) {
        if (line.length > 10 && line.length < 100) {
          topics.push(line.trim());
        }
      }
    }

    return [...new Set(topics)].slice(0, 5);
  }

  private extractRecentInteractions(
    memories: MemorySearchResult[],
    attendees: string[],
  ): string[] {
    const interactions: string[] = [];
    const attendeeNames = attendees.map((a) =>
      a.split("@")[0].replace(/[._-]/g, " ").toLowerCase(),
    );

    for (const mem of memories.filter((m) => m.category === "context")) {
      const contentLower = mem.content.toLowerCase();
      // Check if memory mentions any attendee
      if (attendeeNames.some((name) => contentLower.includes(name))) {
        interactions.push(mem.content.slice(0, 80));
      }
    }

    return interactions.slice(0, 3);
  }

  private extractOutstandingActions(memories: MemorySearchResult[]): string[] {
    const actions: string[] = [];

    for (const mem of memories.filter((m) => m.category === "reminder")) {
      const content = mem.content.toLowerCase();
      if (
        content.includes("action") ||
        content.includes("todo") ||
        content.includes("follow up") ||
        content.includes("pending")
      ) {
        actions.push(mem.content.slice(0, 80));
      }
    }

    return actions.slice(0, 5);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Factory Functions
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Create a new CalendarMonitor instance.
 * Requires Google OAuth credentials to be configured.
 */
export async function createCalendarMonitor(
  options: CalendarMonitorOptions = {},
): Promise<CalendarMonitor | null> {
  // Return cached instance if available
  if (monitorInstance) return monitorInstance;

  // Return existing init promise to prevent duplicate initialization
  if (initPromise) return initPromise;

  initPromise = (async () => {
    try {
      // Initialize calendar service
      const calendarService = new GoogleCalendarService();
      await calendarService.initialize();

      // Try to get memory service (optional)
      const memory = await createMemoryService().catch(() => null);

      monitorInstance = new CalendarMonitor(calendarService, memory, options);
      return monitorInstance;
    } catch (error) {
      console.error("Failed to initialize CalendarMonitor:", error);
      return null;
    }
  })();

  return initPromise;
}

/**
 * Check if calendar monitoring is available.
 */
export async function isCalendarMonitorAvailable(): Promise<boolean> {
  try {
    // Check if credentials exist
    await Promise.all([fs.access(OAUTH_CLIENT_PATH), fs.access(TOKENS_PATH)]);
    return true;
  } catch {
    return false;
  }
}

/**
 * Reset the calendar monitor singleton (for testing).
 */
export function resetCalendarMonitor(): void {
  monitorInstance = null;
  initPromise = null;
  cachedAuth = null;
}

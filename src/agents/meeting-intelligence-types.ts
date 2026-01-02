/**
 * Meeting Intelligence Types
 * Core types for the meeting intelligence service.
 */

import type { calendar_v3 } from "googleapis";
import type { MemorySearchResult } from "../memory/index.js";

// ─────────────────────────────────────────────────────────────────────────────
// Action Items
// ─────────────────────────────────────────────────────────────────────────────

export type ActionPriority = "low" | "medium" | "high" | "critical";

export type ActionStatus =
  | "pending"
  | "in_progress"
  | "completed"
  | "cancelled"
  | "deferred";

export interface ActionItem {
  id: string;
  title: string;
  description?: string;
  assignee?: string;
  dueDate?: number;
  priority: ActionPriority;
  status: ActionStatus;
  meetingId?: string;
  meetingTitle?: string;
  createdAt: number;
  updatedAt?: number;
  completedAt?: number;
  tags?: string[];
  sourceText?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Decisions
// ─────────────────────────────────────────────────────────────────────────────

export interface Decision {
  id: string;
  text: string;
  context?: string;
  meetingId?: string;
  meetingTitle?: string;
  detectedAt: number;
  participants?: string[];
  tags?: string[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Meeting Brief
// ─────────────────────────────────────────────────────────────────────────────

export interface MeetingBrief {
  eventId: string;
  eventSummary: string;
  startTime: string;
  endTime?: string;
  location?: string;
  attendees: Array<{
    email: string;
    name?: string;
    responseStatus?: string;
  }>;
  relevantMemories: MemorySearchResult[];
  recentEmails?: Array<{
    from: string;
    subject: string;
    snippet: string;
    timestamp: number;
  }>;
  pastMeetings?: Array<{
    title: string;
    date: string;
    summary?: string;
  }>;
  outstandingActions?: ActionItem[];
  suggestedTopics?: string[];
  preparationTasks?: string[];
  generatedAt: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Meeting Context
// ─────────────────────────────────────────────────────────────────────────────

export interface MeetingContext {
  eventId: string;
  eventSummary: string;
  startTime: string;
  endTime?: string;
  attendees: string[];
  previousMeetings?: Array<{
    id: string;
    title: string;
    date: string;
    summary?: string;
    decisions?: Decision[];
    actions?: ActionItem[];
  }>;
  relevantMemories?: MemorySearchResult[];
  currentTopics?: string[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Real-Time Context
// ─────────────────────────────────────────────────────────────────────────────

export interface RealTimeContext {
  eventId: string;
  currentTopic?: string;
  notes?: string;
  attendees?: string[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Meeting Follow-Up
// ─────────────────────────────────────────────────────────────────────────────

export interface MeetingFollowUp {
  meetingId: string;
  title: string;
  date: string;
  attendees: string[];
  summary: string;
  actionItems: ActionItem[];
  decisions: Decision[];
  followUpDate?: number;
  nextSteps?: string[];
  generatedAt: number;
}

export interface MeetingFollowUpInput {
  meetingId?: string;
  title: string;
  date: string;
  attendees: string[];
  notes: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Real-Time Assistance Response
// ─────────────────────────────────────────────────────────────────────────────

export interface RealTimeAssistanceResponse {
  relevantMemories: MemorySearchResult[];
  suggestedQuestions?: string[];
  relatedDecisions?: Decision[];
  relatedActions?: ActionItem[];
  context?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Service Options
// ─────────────────────────────────────────────────────────────────────────────

export interface PreBriefOptions {
  event: calendar_v3.Schema$Event;
  maxMemories?: number;
  includeEmails?: boolean;
  includePastMeetings?: boolean;
}

export interface BuildContextOptions {
  eventId: string;
  eventSummary: string;
  startTime: string;
  endTime?: string;
  attendees?: string[];
  maxPreviousMeetings?: number;
  maxMemories?: number;
}

export interface RealTimeAssistanceOptions {
  context: RealTimeContext;
  query?: string;
  maxMemories?: number;
}

export interface GenerateFollowUpOptions {
  input: MeetingFollowUpInput;
  saveToMemory?: boolean;
}

export interface ExtractActionItemsOptions {
  text: string;
  meetingId?: string;
  meetingTitle?: string;
}

export interface DetectDecisionsOptions {
  text: string;
  meetingId?: string;
  meetingTitle?: string;
}

export interface SaveActionItemsOptions {
  items: ActionItem[];
  meetingId?: string;
}

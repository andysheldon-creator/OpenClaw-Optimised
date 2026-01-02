/**
 * Meeting Intelligence Module
 *
 * Provides pre-meeting briefs, real-time assistance during meetings,
 * and automated follow-up with action item extraction.
 */

// Action Item Extraction
export type { ActionItem } from "./action-extractor.js";

export {
  extractActionItems,
  formatActionItems,
} from "./action-extractor.js";

// Pre-brief Module
export type {
  AttendeeContext,
  PendingActionItem,
  TopicContext,
  PreBriefResult,
  PreBriefOptions as PreBriefServiceOptions,
  CalendarService,
} from "./prebrief.js";

export { MeetingPreBrief as MeetingPreBriefService } from "./prebrief.js";

// Meeting Intelligence Types and Service
export type {
  ActionPriority,
  ActionStatus,
  MeetingDecision,
  EmailContext,
  PastMeetingContext,
  MeetingPreBrief,
  RealTimeAssistance,
  MeetingFollowUp,
  PreBriefOptions,
  FollowUpOptions,
} from "../meeting-intelligence.js";

export {
  MeetingIntelligenceService,
  createMeetingIntelligenceService,
  resetMeetingIntelligenceService,
  MeetingContext,
  createMeetingIntelligenceTool,
  resetMeetingContext,
} from "../meeting-intelligence.js";

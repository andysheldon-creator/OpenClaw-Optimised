/**
 * Board of Directors — Public API
 *
 * Re-exports the multi-agent system's public interface.
 */

export {
  DEFAULT_BOARD_AGENTS,
  getDefaultPersonality,
  resolveAgentDef,
  resolveAllAgentDefs,
} from "./agents.js";
export {
  buildConsultationPrompt,
  cancelConsultation,
  cleanupTimedOutConsultations,
  clearAllConsultations,
  completeConsultation,
  createConsultation,
  formatConsultationResult,
  getActiveConsultations,
  getConsultation,
} from "./consultation.js";
export {
  buildSynthesisPrompt,
  cancelMeeting,
  cleanupOldMeetings,
  clearAllMeetings,
  completeMeeting,
  createMeeting,
  failAgentInput,
  formatMeetingSummary,
  getActiveMeetings,
  getMeeting,
  isMeetingTimedOut,
  recordAgentInput,
  skipAgentInput,
  startMeeting,
} from "./meeting.js";

export {
  buildBoardSystemPrompt,
  ensureBoardPersonalityFiles,
  loadAgentPersonality,
} from "./personality.js";
export type { ConsultTag, RouteResult } from "./router.js";

export {
  buildTopicMap,
  extractConsultTags,
  extractMeetingTag,
  routeMessage,
  stripConsultTags,
  stripMeetingTag,
} from "./router.js";
export {
  boardSessionKey,
  extractRoleFromSessionKey,
  isBoardSessionKey,
} from "./session-keys.js";
export {
  buildExpectedTopics,
  buildTopicName,
  createBoardTopics,
  getTopicIdForAgent,
  resolveAgentFromTopicId,
  topicMappingsToMap,
} from "./telegram-topics.js";
export type {
  BoardAgentDef,
  BoardAgentRole,
  BoardMeeting,
  BoardRoutingContext,
  ConsultationRequest,
  ConsultationResponse,
  MeetingAgentInput,
  MeetingStatus,
  TopicMapping,
} from "./types.js";
export { BOARD_AGENT_ROLES, isBoardAgentRole } from "./types.js";

export type {
  AgentRunCallback,
  BoardContext,
  PostReplyResult,
} from "./board-orchestrator.js";
export {
  executeConsultations,
  executeMeeting,
  prepareBoardContext,
  processAgentResponse,
} from "./board-orchestrator.js";

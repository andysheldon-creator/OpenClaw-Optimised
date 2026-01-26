/**
 * Conversation state machine for multi-question check-in flows.
 */

import type { CheckinsStorage } from "./storage.js";
import type { Checkin, ConversationState } from "./types.js";
import { isSkipResponse } from "./questions.js";

/**
 * Initiate a new check-in conversation for a member.
 * @param storage - Storage instance
 * @param memberId - Member UUID
 * @param teamId - Team UUID
 * @returns New conversation state at question 1
 */
export function initiateCheckIn(
  storage: CheckinsStorage,
  memberId: string,
  teamId: string,
): ConversationState {
  const now = Date.now();
  const state: ConversationState = {
    memberId,
    teamId,
    currentQuestion: 1,
    answers: {},
    startedAt: now,
    lastActivityAt: now,
    reminderSent: false,
  };

  storage.saveConversationState(state);
  return state;
}

/**
 * Advance the conversation with a user's answer.
 * @param storage - Storage instance
 * @param memberId - Member UUID
 * @param answer - User's answer text
 * @returns Either next question or completed check-in
 */
export function advanceConversation(
  storage: CheckinsStorage,
  memberId: string,
  answer: string,
): { done: false; nextQuestion: 2 | 3 } | { done: true; checkin: Checkin } {
  const state = storage.getConversationState(memberId);
  if (!state) {
    throw new Error("No active conversation");
  }

  const now = Date.now();

  // Handle based on current question
  if (state.currentQuestion === 1) {
    // Q1: What did you accomplish today?
    state.answers.yesterday = answer;
    state.currentQuestion = 2;
    state.lastActivityAt = now;
    storage.saveConversationState(state);
    return { done: false, nextQuestion: 2 };
  } else if (state.currentQuestion === 2) {
    // Q2: What will you do next?
    state.answers.today = answer;
    state.currentQuestion = 3;
    state.lastActivityAt = now;
    storage.saveConversationState(state);
    return { done: false, nextQuestion: 3 };
  } else {
    // Q3: Any blockers?
    const blockers = isSkipResponse(answer) ? null : answer;
    state.answers.blockers = blockers ?? undefined;
    state.lastActivityAt = now;

    // Complete the check-in
    const checkin = completeCheckIn(storage, state);
    return { done: true, checkin };
  }
}

/**
 * Complete a check-in and save it to storage.
 * @param storage - Storage instance
 * @param state - Current conversation state
 * @returns Saved check-in record
 */
export function completeCheckIn(
  storage: CheckinsStorage,
  state: ConversationState,
): Checkin {
  // Save checkin record
  const checkin = storage.saveCheckin({
    memberId: state.memberId,
    teamId: state.teamId,
    yesterday: state.answers.yesterday!,
    today: state.answers.today!,
    blockers: state.answers.blockers,
  });

  // Delete conversation state
  storage.deleteConversationState(state.memberId);

  return checkin;
}

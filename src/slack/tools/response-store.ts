/**
 * Response store for tracking pending interactive questions
 * Allows tools to wait for user responses to Block Kit interactions
 */

import type { Option } from "../blocks/types.js";

export interface PendingQuestion {
  questionId: string;
  actionIdPrefix: string;
  createdAt: number;
  timeoutMs: number;
  resolve: (response: QuestionResponse | null) => void;
}

export interface QuestionResponse {
  answered: boolean;
  selectedValues?: string[];
  selectedOptions?: Option[];
  userId: string;
  userName?: string;
  timestamp: number;
  timedOut?: boolean;
}

/**
 * Store for tracking pending questions and their responses
 */
export class ResponseStore {
  private pending = new Map<string, PendingQuestion>();
  private timeouts = new Map<string, NodeJS.Timeout>();

  /**
   * Wait for a response to a question
   * Returns null if the question times out
   */
  async waitForResponse(questionId: string, timeoutMs: number): Promise<QuestionResponse | null> {
    return new Promise((resolve) => {
      const question: PendingQuestion = {
        questionId,
        actionIdPrefix: questionId,
        createdAt: Date.now(),
        timeoutMs,
        resolve,
      };

      this.pending.set(questionId, question);

      // Set timeout
      const timeout = setTimeout(() => {
        const pending = this.pending.get(questionId);
        if (pending) {
          pending.resolve({
            answered: false,
            timedOut: true,
            userId: "",
            timestamp: Date.now(),
          });
          this.pending.delete(questionId);
          this.timeouts.delete(questionId);
        }
      }, timeoutMs);

      this.timeouts.set(questionId, timeout);
    });
  }

  /**
   * Record a response to a pending question
   */
  recordResponse(questionId: string, response: Omit<QuestionResponse, "timedOut">): boolean {
    const pending = this.pending.get(questionId);
    if (!pending) {
      return false;
    }

    // Clear timeout
    const timeout = this.timeouts.get(questionId);
    if (timeout) {
      clearTimeout(timeout);
      this.timeouts.delete(questionId);
    }

    // Resolve promise
    pending.resolve(response);
    this.pending.delete(questionId);

    return true;
  }

  /**
   * Check if a question is pending
   */
  isPending(questionId: string): boolean {
    return this.pending.has(questionId);
  }

  /**
   * Cancel a pending question
   */
  cancel(questionId: string): void {
    const timeout = this.timeouts.get(questionId);
    if (timeout) {
      clearTimeout(timeout);
      this.timeouts.delete(questionId);
    }

    const pending = this.pending.get(questionId);
    if (pending) {
      pending.resolve(null);
      this.pending.delete(questionId);
    }
  }

  /**
   * Cancel all pending questions
   */
  cancelAll(): void {
    for (const questionId of this.pending.keys()) {
      this.cancel(questionId);
    }
  }

  /**
   * Get count of pending questions
   */
  get pendingCount(): number {
    return this.pending.size;
  }

  /**
   * Clean up expired questions
   * Removes questions that have exceeded their timeout but haven't been cleaned up
   */
  cleanup(): void {
    const now = Date.now();
    for (const [questionId, question] of this.pending.entries()) {
      if (now - question.createdAt > question.timeoutMs) {
        this.cancel(questionId);
      }
    }
  }
}

/**
 * Global singleton response store
 */
export const globalResponseStore = new ResponseStore();

// Clean up expired questions every minute
setInterval(() => {
  globalResponseStore.cleanup();
}, 60_000);

/**
 * Question content and skip detection for check-in conversations.
 */

/**
 * Fixed question content for the 3-question check-in flow.
 */
export const QUESTIONS = {
  1: "What did you accomplish today?",
  2: "What will you do next?",
  3: "Any blockers or anything to handover?",
} as const;

/**
 * Get question text by question number.
 * @param questionNumber - Question number (1, 2, or 3)
 * @returns Question text
 */
export function getQuestion(questionNumber: 1 | 2 | 3): string {
  return QUESTIONS[questionNumber];
}

/**
 * Detect if a response indicates the user wants to skip Q3 (no blockers).
 * @param text - User's response text
 * @returns true if skip intent detected
 */
export function isSkipResponse(text: string): boolean {
  // Normalize input
  const normalized = text.toLowerCase().trim();

  // Skip keywords
  const skipKeywords = [
    "skip",
    "none",
    "no",
    "nope",
    "nothing",
    "n/a",
    "na",
    "no blockers",
    "no blocker",
    "-",
  ];

  // Check if input matches exact keyword or keyword followed by space/punctuation
  for (const keyword of skipKeywords) {
    // Exact match
    if (normalized === keyword) {
      return true;
    }

    // Match keyword followed by space or punctuation
    if (normalized.startsWith(keyword + " ") ||
        normalized.startsWith(keyword + ".") ||
        normalized.startsWith(keyword + "!")) {
      return true;
    }
  }

  return false;
}

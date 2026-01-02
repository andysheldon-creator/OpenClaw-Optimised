/**
 * Action Item Extraction from Meeting Notes
 * Uses regex patterns to identify action items, assignees, deadlines, and priorities.
 */

export interface ActionItem {
  description: string;
  assignee?: string;
  deadline?: string;
  priority: "high" | "medium" | "low";
}

// Regex patterns for action item extraction
const PATTERNS = {
  // Explicit action markers: "ACTION:", "TODO:", "TASK:"
  explicitAction: /^[\s-]*(?:ACTION|TODO|TASK):\s*(.+)$/gim,

  // Assignment patterns: "@person will ...", "John will ...", "assigned to John"
  assignmentWill: /@?(\w+(?:\s+\w+)?)\s+will\s+(.+)/gi,
  assignedTo: /assigned\s+to\s+@?(\w+(?:\s+\w+)?)[:\s]*(.+)?/gi,
  personShould:
    /@?(\w+(?:\s+\w+)?)\s+(?:should|needs?\s+to|must|has\s+to)\s+(.+)/gi,

  // Deadline patterns: "by Friday", "due Monday", "deadline: Jan 15", "before end of week"
  deadlineBy:
    /\bby\s+((?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday|tomorrow|next\s+week|end\s+of\s+(?:day|week|month)|(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+\d{1,2}(?:st|nd|rd|th)?(?:,?\s*\d{4})?|\d{1,2}\/\d{1,2}(?:\/\d{2,4})?))\b/gi,
  deadlineDue:
    /\bdue\s+((?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday|tomorrow|next\s+week|(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+\d{1,2}(?:st|nd|rd|th)?(?:,?\s*\d{4})?|\d{1,2}\/\d{1,2}(?:\/\d{2,4})?))\b/gi,
  deadlineExplicit: /\bdeadline:\s*([^\n,]+)/gi,

  // Priority indicators
  highPriority:
    /\b(?:urgent|critical|asap|immediately|high\s+priority|p0|p1)\b/gi,
  lowPriority:
    /\b(?:low\s+priority|when\s+possible|nice\s+to\s+have|p3|optional)\b/gi,

  // Bullet/list item action indicators
  bulletAction:
    /^[\s]*[-*]\s*(.+(?:will|should|needs?\s+to|must|has\s+to).+)$/gim,
} as const;

/**
 * Execute regex pattern and collect all matches
 */
function execAllMatches(pattern: RegExp, text: string): Array<RegExpExecArray> {
  pattern.lastIndex = 0;
  const matches: Array<RegExpExecArray> = [];
  let match = pattern.exec(text);
  while (match !== null) {
    matches.push(match);
    match = pattern.exec(text);
  }
  return matches;
}

/**
 * Extract deadline from text using various patterns
 */
function extractDeadline(text: string): string | undefined {
  // Try each deadline pattern
  for (const pattern of [
    PATTERNS.deadlineBy,
    PATTERNS.deadlineDue,
    PATTERNS.deadlineExplicit,
  ]) {
    // Reset lastIndex for global regex
    pattern.lastIndex = 0;
    const match = pattern.exec(text);
    if (match?.[1]) {
      return match[1].trim();
    }
  }
  return undefined;
}

/**
 * Determine priority based on text content
 */
function extractPriority(text: string): "high" | "medium" | "low" {
  PATTERNS.highPriority.lastIndex = 0;
  PATTERNS.lowPriority.lastIndex = 0;

  if (PATTERNS.highPriority.test(text)) {
    return "high";
  }
  if (PATTERNS.lowPriority.test(text)) {
    return "low";
  }
  return "medium";
}

/**
 * Extract assignee from text using various patterns
 */
function extractAssignee(text: string): string | undefined {
  // Try assignment patterns
  for (const pattern of [
    PATTERNS.assignmentWill,
    PATTERNS.assignedTo,
    PATTERNS.personShould,
  ]) {
    pattern.lastIndex = 0;
    const match = pattern.exec(text);
    if (match?.[1]) {
      const assignee = match[1].trim();
      // Filter out common false positives
      const falsePositives = [
        "we",
        "they",
        "it",
        "this",
        "that",
        "someone",
        "team",
        "everyone",
      ];
      if (!falsePositives.includes(assignee.toLowerCase())) {
        return assignee;
      }
    }
  }
  return undefined;
}

/**
 * Clean up description text by removing deadline/priority markers
 */
function cleanDescription(text: string): string {
  return text
    .replace(PATTERNS.deadlineBy, "")
    .replace(PATTERNS.deadlineDue, "")
    .replace(PATTERNS.deadlineExplicit, "")
    .replace(PATTERNS.highPriority, "")
    .replace(PATTERNS.lowPriority, "")
    .replace(/^[\s-]*(?:ACTION|TODO|TASK):\s*/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** False positive assignee names to filter out */
const FALSE_POSITIVE_ASSIGNEES = [
  "we",
  "they",
  "it",
  "this",
  "that",
  "someone",
  "team",
  "everyone",
];

/**
 * Parse meeting notes and extract action items
 * Looks for patterns like:
 * - "ACTION: ..."
 * - "TODO: ..."
 * - "@person will ..."
 * - "by [date]"
 */
export function extractActionItems(meetingNotes: string): ActionItem[] {
  const items: ActionItem[] = [];
  const seenDescriptions = new Set<string>();

  // Helper to add unique items
  const addItem = (
    description: string,
    assignee?: string,
    deadline?: string,
    priority?: "high" | "medium" | "low",
  ) => {
    const cleaned = cleanDescription(description);
    const normalized = cleaned.toLowerCase();

    if (cleaned.length > 5 && !seenDescriptions.has(normalized)) {
      seenDescriptions.add(normalized);
      items.push({
        description: cleaned,
        assignee: assignee || extractAssignee(description),
        deadline: deadline || extractDeadline(description),
        priority: priority || extractPriority(description),
      });
    }
  };

  // 1. Extract explicit ACTION/TODO/TASK items
  for (const match of execAllMatches(PATTERNS.explicitAction, meetingNotes)) {
    addItem(match[1]);
  }

  // 2. Extract "@person will ..." patterns
  for (const match of execAllMatches(PATTERNS.assignmentWill, meetingNotes)) {
    const assignee = match[1].trim();
    const task = match[2].trim();
    if (!FALSE_POSITIVE_ASSIGNEES.includes(assignee.toLowerCase())) {
      addItem(task, assignee);
    }
  }

  // 3. Extract "assigned to @person" patterns
  for (const match of execAllMatches(PATTERNS.assignedTo, meetingNotes)) {
    const assignee = match[1].trim();
    const task = match[2]?.trim();
    if (task) {
      addItem(task, assignee);
    }
  }

  // 4. Extract "person should/needs to/must" patterns
  for (const match of execAllMatches(PATTERNS.personShould, meetingNotes)) {
    const assignee = match[1].trim();
    const task = match[2].trim();
    if (!FALSE_POSITIVE_ASSIGNEES.includes(assignee.toLowerCase())) {
      addItem(task, assignee);
    }
  }

  // 5. Extract bullet items that contain action verbs
  for (const match of execAllMatches(PATTERNS.bulletAction, meetingNotes)) {
    addItem(match[1]);
  }

  return items;
}

/**
 * Format action items as a markdown checklist
 */
export function formatActionItems(items: ActionItem[]): string {
  if (items.length === 0) {
    return "No action items found.";
  }

  // Sort by priority (high -> medium -> low)
  const priorityOrder = { high: 0, medium: 1, low: 2 };
  const sorted = [...items].sort(
    (a, b) => priorityOrder[a.priority] - priorityOrder[b.priority],
  );

  const lines: string[] = ["## Action Items", ""];

  for (const item of sorted) {
    const parts: string[] = [];

    // Priority indicator
    const priorityIcon =
      item.priority === "high"
        ? "[HIGH]"
        : item.priority === "low"
          ? "[LOW]"
          : "";

    // Build the checklist item
    let line = `- [ ] ${item.description}`;

    if (priorityIcon) {
      parts.push(priorityIcon);
    }
    if (item.assignee) {
      parts.push(`@${item.assignee}`);
    }
    if (item.deadline) {
      parts.push(`due: ${item.deadline}`);
    }

    if (parts.length > 0) {
      line += ` (${parts.join(" | ")})`;
    }

    lines.push(line);
  }

  return lines.join("\n");
}

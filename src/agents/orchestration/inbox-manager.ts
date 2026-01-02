/**
 * Inbox Manager Agent - Email/message triage and prioritization orchestration.
 *
 * This agent handles:
 * - Email and message triage and prioritization
 * - Summarizing unread messages
 * - Categorizing messages (urgent, personal, work, newsletters)
 * - Suggesting responses based on context
 * - Integration with Gmail and WhatsApp message queues
 */

import type { AgentTool, AgentToolResult } from "@mariozechner/pi-ai";
import { type TSchema, Type } from "@sinclair/typebox";

type AnyAgentTool = AgentTool<TSchema, unknown>;

// ─────────────────────────────────────────────────────────────────────────────
// Types and Interfaces
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Message priority levels for triage
 */
export type MessagePriority = "urgent" | "high" | "normal" | "low";

/**
 * Message categories for classification
 */
export type MessageCategory =
  | "urgent"
  | "personal"
  | "work"
  | "newsletter"
  | "promotional"
  | "social"
  | "transactional"
  | "spam"
  | "unknown";

/**
 * Supported message sources
 */
export type MessageSource = "gmail" | "whatsapp";

/**
 * A unified message representation across sources
 */
export interface UnifiedMessage {
  id: string;
  source: MessageSource;
  from: string;
  subject?: string;
  snippet: string;
  body?: string;
  date: string;
  isUnread: boolean;
  labels?: string[];
  threadId?: string;
}

/**
 * Triaged message with priority and category
 */
export interface TriagedMessage extends UnifiedMessage {
  priority: MessagePriority;
  category: MessageCategory;
  reason: string;
  suggestedAction?: string;
}

/**
 * Message summary output
 */
export interface MessageSummary {
  totalCount: number;
  unreadCount: number;
  byPriority: Record<MessagePriority, number>;
  byCategory: Record<MessageCategory, number>;
  highlights: string[];
  actionRequired: TriagedMessage[];
}

/**
 * Response suggestion
 */
export interface ResponseSuggestion {
  messageId: string;
  tone: "formal" | "casual" | "friendly" | "professional";
  suggestedReply: string;
  keyPoints: string[];
  confidence: number;
}

/**
 * Inbox Manager Agent configuration
 */
export interface InboxManagerAgent {
  name: string;
  description: string;
  capabilities: string[];
  actions: string[];
}

/**
 * Agent configuration export
 */
export const inboxManagerAgent: InboxManagerAgent = {
  name: "inbox_manager",
  description:
    "Intelligent inbox management agent that triages, categorizes, summarizes messages, and suggests responses across Gmail and WhatsApp.",
  capabilities: [
    "message_triage",
    "message_summarization",
    "message_categorization",
    "response_suggestion",
    "priority_detection",
    "sender_analysis",
    "thread_tracking",
  ],
  actions: ["triage", "summarize", "categorize", "suggest_response"],
};

// ─────────────────────────────────────────────────────────────────────────────
// Helper Functions
// ─────────────────────────────────────────────────────────────────────────────

function jsonResult(payload: unknown): AgentToolResult<unknown> {
  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(payload, null, 2),
      },
    ],
    details: payload,
  };
}

/**
 * Detect priority based on message content and metadata
 */
function detectPriority(message: UnifiedMessage): {
  priority: MessagePriority;
  reason: string;
} {
  const subject = (message.subject ?? "").toLowerCase();
  const snippet = message.snippet.toLowerCase();
  const from = message.from.toLowerCase();
  const combined = `${subject} ${snippet}`;

  // Urgent indicators
  const urgentPatterns = [
    /urgent/i,
    /asap/i,
    /immediately/i,
    /emergency/i,
    /critical/i,
    /time.?sensitive/i,
    /deadline.*today/i,
    /action.?required/i,
  ];

  for (const pattern of urgentPatterns) {
    if (pattern.test(combined)) {
      return { priority: "urgent", reason: `Contains urgent keyword: ${pattern}` };
    }
  }

  // High priority indicators
  const highPatterns = [
    /important/i,
    /priority/i,
    /deadline/i,
    /reminder/i,
    /follow.?up/i,
    /waiting.*response/i,
    /please.*respond/i,
  ];

  for (const pattern of highPatterns) {
    if (pattern.test(combined)) {
      return { priority: "high", reason: `Contains high-priority keyword: ${pattern}` };
    }
  }

  // Check for known important senders (could be extended with contact memory)
  if (from.includes("boss") || from.includes("manager") || from.includes("ceo")) {
    return { priority: "high", reason: "From important sender" };
  }

  // Low priority indicators
  const lowPatterns = [
    /unsubscribe/i,
    /newsletter/i,
    /promotional/i,
    /sale/i,
    /discount/i,
    /deal/i,
    /no.?reply/i,
  ];

  for (const pattern of lowPatterns) {
    if (pattern.test(combined) || pattern.test(from)) {
      return { priority: "low", reason: `Automated/promotional content` };
    }
  }

  return { priority: "normal", reason: "Standard message" };
}

/**
 * Categorize message based on content analysis
 */
function categorizeMessage(message: UnifiedMessage): {
  category: MessageCategory;
  reason: string;
} {
  const subject = (message.subject ?? "").toLowerCase();
  const snippet = message.snippet.toLowerCase();
  const from = message.from.toLowerCase();
  const labels = (message.labels ?? []).map((l) => l.toLowerCase());
  const combined = `${subject} ${snippet}`;

  // Check Gmail labels first
  if (labels.includes("spam")) {
    return { category: "spam", reason: "Marked as spam" };
  }
  if (labels.includes("promotions") || labels.includes("category_promotions")) {
    return { category: "promotional", reason: "Gmail promotions category" };
  }
  if (labels.includes("social") || labels.includes("category_social")) {
    return { category: "social", reason: "Gmail social category" };
  }
  if (labels.includes("updates") || labels.includes("category_updates")) {
    return { category: "transactional", reason: "Gmail updates category" };
  }

  // Newsletter detection
  const newsletterPatterns = [
    /newsletter/i,
    /unsubscribe/i,
    /weekly.?digest/i,
    /daily.?update/i,
    /subscription/i,
    /mailing.?list/i,
  ];

  for (const pattern of newsletterPatterns) {
    if (pattern.test(combined) || pattern.test(from)) {
      return { category: "newsletter", reason: "Newsletter content detected" };
    }
  }

  // Urgent detection
  const urgentPatterns = [
    /urgent/i,
    /emergency/i,
    /critical/i,
    /immediate/i,
    /asap/i,
  ];

  for (const pattern of urgentPatterns) {
    if (pattern.test(combined)) {
      return { category: "urgent", reason: "Urgent content detected" };
    }
  }

  // Work-related detection
  const workPatterns = [
    /meeting/i,
    /schedule/i,
    /project/i,
    /deadline/i,
    /invoice/i,
    /report/i,
    /review/i,
    /approval/i,
    /contract/i,
    /proposal/i,
  ];

  for (const pattern of workPatterns) {
    if (pattern.test(combined)) {
      return { category: "work", reason: "Work-related content detected" };
    }
  }

  // Promotional detection
  const promoPatterns = [
    /sale/i,
    /discount/i,
    /offer/i,
    /promo/i,
    /deal/i,
    /limited.?time/i,
    /exclusive/i,
    /free.?shipping/i,
  ];

  for (const pattern of promoPatterns) {
    if (pattern.test(combined)) {
      return { category: "promotional", reason: "Promotional content detected" };
    }
  }

  // Transactional detection
  const transactionalPatterns = [
    /order.*confirm/i,
    /shipping.*update/i,
    /delivery/i,
    /receipt/i,
    /payment/i,
    /invoice/i,
    /account.*update/i,
    /password/i,
    /verification/i,
  ];

  for (const pattern of transactionalPatterns) {
    if (pattern.test(combined)) {
      return { category: "transactional", reason: "Transactional content detected" };
    }
  }

  // Social detection
  const socialPatterns = [
    /friend.?request/i,
    /follow/i,
    /like/i,
    /comment/i,
    /mention/i,
    /tagged/i,
    /invitation/i,
  ];

  for (const pattern of socialPatterns) {
    if (pattern.test(combined)) {
      return { category: "social", reason: "Social notification detected" };
    }
  }

  // Personal (default for non-categorized human messages)
  if (!from.includes("noreply") && !from.includes("no-reply")) {
    return { category: "personal", reason: "Personal message from individual" };
  }

  return { category: "unknown", reason: "Unable to determine category" };
}

/**
 * Suggest an action based on message triage
 */
function suggestAction(message: TriagedMessage): string {
  switch (message.priority) {
    case "urgent":
      return "Respond immediately or escalate";
    case "high":
      return "Review and respond within 24 hours";
    case "normal":
      return "Review when convenient";
    case "low":
      return "Archive or unsubscribe if not needed";
  }
}

/**
 * Generate a response suggestion based on message content
 */
function generateResponseSuggestion(
  message: UnifiedMessage,
  context?: string
): ResponseSuggestion {
  const subject = message.subject ?? "";
  const snippet = message.snippet;
  const keyPoints: string[] = [];

  // Determine tone based on content
  let tone: ResponseSuggestion["tone"] = "professional";
  const lowerSnippet = snippet.toLowerCase();

  if (lowerSnippet.includes("hey") || lowerSnippet.includes("hi ")) {
    tone = "casual";
  } else if (
    lowerSnippet.includes("dear") ||
    lowerSnippet.includes("sincerely")
  ) {
    tone = "formal";
  }

  // Extract key points (simplified - would use LLM in production)
  if (lowerSnippet.includes("?")) {
    keyPoints.push("Contains question(s) requiring answer");
  }
  if (lowerSnippet.includes("meeting") || lowerSnippet.includes("schedule")) {
    keyPoints.push("Scheduling/meeting request");
  }
  if (lowerSnippet.includes("deadline") || lowerSnippet.includes("by")) {
    keyPoints.push("Time-sensitive request");
  }
  if (lowerSnippet.includes("help") || lowerSnippet.includes("assist")) {
    keyPoints.push("Assistance requested");
  }

  // Generate a template response
  const templates: Record<ResponseSuggestion["tone"], string> = {
    formal: `Dear ${message.from.split("<")[0].trim()},\n\nThank you for your message regarding "${subject}".\n\n[Your response here]\n\nBest regards`,
    professional: `Hi ${message.from.split("<")[0].trim().split(" ")[0]},\n\nThank you for reaching out about "${subject}".\n\n[Your response here]\n\nBest`,
    casual: `Hey ${message.from.split("<")[0].trim().split(" ")[0]},\n\nThanks for your message!\n\n[Your response here]\n\nCheers`,
    friendly: `Hi ${message.from.split("<")[0].trim().split(" ")[0]}!\n\nGreat to hear from you about "${subject}".\n\n[Your response here]\n\nTake care`,
  };

  return {
    messageId: message.id,
    tone,
    suggestedReply: templates[tone],
    keyPoints,
    confidence: keyPoints.length > 0 ? 0.7 : 0.5,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// TypeBox Schemas
// ─────────────────────────────────────────────────────────────────────────────

const MessageSourceSchema = Type.Union([
  Type.Literal("gmail"),
  Type.Literal("whatsapp"),
]);

const MessagePrioritySchema = Type.Union([
  Type.Literal("urgent"),
  Type.Literal("high"),
  Type.Literal("normal"),
  Type.Literal("low"),
]);

const MessageCategorySchema = Type.Union([
  Type.Literal("urgent"),
  Type.Literal("personal"),
  Type.Literal("work"),
  Type.Literal("newsletter"),
  Type.Literal("promotional"),
  Type.Literal("social"),
  Type.Literal("transactional"),
  Type.Literal("spam"),
  Type.Literal("unknown"),
]);

const InboxManagerSchema = Type.Union([
  // Triage action - analyze and prioritize messages
  Type.Object({
    action: Type.Literal("triage"),
    source: Type.Optional(MessageSourceSchema),
    maxMessages: Type.Optional(
      Type.Number({
        default: 20,
        description: "Maximum messages to triage",
      })
    ),
    unreadOnly: Type.Optional(
      Type.Boolean({
        default: true,
        description: "Only triage unread messages",
      })
    ),
    query: Type.Optional(
      Type.String({
        description: "Optional search query to filter messages",
      })
    ),
  }),

  // Summarize action - get inbox overview
  Type.Object({
    action: Type.Literal("summarize"),
    source: Type.Optional(MessageSourceSchema),
    maxMessages: Type.Optional(
      Type.Number({
        default: 50,
        description: "Maximum messages to include in summary",
      })
    ),
    timeRange: Type.Optional(
      Type.String({
        description:
          "Time range (e.g., '24h', '7d', '1w'). Default: all recent",
      })
    ),
  }),

  // Categorize action - classify specific messages
  Type.Object({
    action: Type.Literal("categorize"),
    messageIds: Type.Optional(
      Type.Array(Type.String(), {
        description: "Specific message IDs to categorize",
      })
    ),
    source: Type.Optional(MessageSourceSchema),
    categories: Type.Optional(
      Type.Array(MessageCategorySchema, {
        description: "Filter to specific categories",
      })
    ),
    maxMessages: Type.Optional(Type.Number({ default: 20 })),
  }),

  // Suggest response action
  Type.Object({
    action: Type.Literal("suggest_response"),
    messageId: Type.String({
      description: "Message ID to suggest response for",
    }),
    source: Type.Optional(MessageSourceSchema),
    context: Type.Optional(
      Type.String({
        description: "Additional context for response generation",
      })
    ),
    tone: Type.Optional(
      Type.Union([
        Type.Literal("formal"),
        Type.Literal("casual"),
        Type.Literal("friendly"),
        Type.Literal("professional"),
      ])
    ),
  }),

  // Get queue status
  Type.Object({
    action: Type.Literal("queue_status"),
    source: Type.Optional(MessageSourceSchema),
  }),
]);

// ─────────────────────────────────────────────────────────────────────────────
// Mock Data Layer (to be replaced with actual Gmail/WhatsApp integration)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Fetch messages from Gmail (placeholder - uses existing gmail tool internally)
 * In production, this would call the google_gmail tool
 */
async function fetchGmailMessages(options: {
  maxResults?: number;
  query?: string;
  unreadOnly?: boolean;
}): Promise<UnifiedMessage[]> {
  // This is a placeholder that returns instruction for the agent
  // The actual implementation would integrate with google-tools.ts
  return [];
}

/**
 * Fetch messages from WhatsApp queue (placeholder)
 */
async function fetchWhatsAppMessages(_options: {
  maxResults?: number;
}): Promise<UnifiedMessage[]> {
  // Placeholder - would integrate with WhatsApp message queue
  return [];
}

// ─────────────────────────────────────────────────────────────────────────────
// Tool Implementation
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Create the Inbox Manager agent tool
 */
export function createInboxManagerTool(): AnyAgentTool {
  return {
    label: "Inbox Manager",
    name: "inbox_manager",
    description: `Intelligent inbox management for email/message triage and organization. Capabilities:

- **triage**: Analyze messages, assign priority (urgent/high/normal/low), and suggest actions
- **summarize**: Get inbox overview with counts by priority/category and action items
- **categorize**: Classify messages (urgent, personal, work, newsletter, promotional, etc.)
- **suggest_response**: Generate context-aware response suggestions

Works with Gmail and WhatsApp messages. Use this to help users manage their inbox efficiently.

Best practices:
- Start with 'summarize' to understand inbox state
- Use 'triage' for unread messages needing attention
- Use 'suggest_response' for messages requiring replies
- Consider user's context and preferences from memory`,
    parameters: InboxManagerSchema,
    execute: async (_toolCallId, args) => {
      const params = args as Record<string, unknown>;
      const action = params.action as string;

      switch (action) {
        case "triage": {
          const source = params.source as MessageSource | undefined;
          const maxMessages = (params.maxMessages as number) ?? 20;
          const unreadOnly = (params.unreadOnly as boolean) ?? true;
          const query = params.query as string | undefined;

          // Return instructions for integration
          // The agent should use this with google_gmail tool
          const instructions = {
            action: "triage",
            steps: [
              {
                tool: "google_gmail",
                params: {
                  action: unreadOnly ? "search" : "list",
                  query: unreadOnly
                    ? `is:unread ${query ?? ""}`.trim()
                    : query ?? undefined,
                  maxResults: maxMessages,
                },
              },
            ],
            processing: {
              description:
                "For each message returned, analyze and assign priority/category",
              priorityRules: {
                urgent: [
                  "Contains 'urgent', 'ASAP', 'emergency', 'critical'",
                  "From VIP contacts",
                  "Has deadline today",
                ],
                high: [
                  "Contains 'important', 'deadline', 'reminder'",
                  "Requires response",
                  "From manager/boss",
                ],
                normal: ["Standard messages", "General inquiries"],
                low: [
                  "Newsletters",
                  "Promotional",
                  "Automated notifications",
                  "No-reply senders",
                ],
              },
              categoryRules: {
                urgent: "Immediate action required",
                work: "Meeting, project, deadline, invoice related",
                personal: "From individuals, personal matters",
                newsletter: "Subscriptions, digests, mailing lists",
                promotional: "Sales, discounts, offers",
                social: "Social media notifications",
                transactional: "Order confirmations, receipts, account updates",
              },
            },
            outputFormat: {
              triaged: [
                {
                  id: "message_id",
                  from: "sender",
                  subject: "subject",
                  priority: "urgent|high|normal|low",
                  category: "category",
                  reason: "why this priority/category",
                  suggestedAction: "what to do",
                },
              ],
              summary: {
                total: "number",
                urgent: "count",
                actionRequired: "count",
              },
            },
          };

          return jsonResult({
            status: "instructions",
            message:
              "Use google_gmail tool to fetch messages, then apply triage rules",
            source: source ?? "gmail",
            instructions,
          });
        }

        case "summarize": {
          const source = params.source as MessageSource | undefined;
          const maxMessages = (params.maxMessages as number) ?? 50;
          const timeRange = params.timeRange as string | undefined;

          const instructions = {
            action: "summarize",
            steps: [
              {
                tool: "google_gmail",
                params: {
                  action: "list",
                  maxResults: maxMessages,
                  query: timeRange ? `newer_than:${timeRange}` : undefined,
                },
              },
              {
                tool: "google_gmail",
                params: {
                  action: "search",
                  query: "is:unread",
                  maxResults: 10,
                },
              },
            ],
            processing: {
              description: "Aggregate messages into summary statistics",
              metrics: [
                "Total message count",
                "Unread count",
                "Count by priority (urgent/high/normal/low)",
                "Count by category",
                "Top senders",
                "Messages requiring action",
              ],
            },
            outputFormat: {
              summary: {
                totalCount: "number",
                unreadCount: "number",
                byPriority: {
                  urgent: "number",
                  high: "number",
                  normal: "number",
                  low: "number",
                },
                byCategory: {
                  work: "number",
                  personal: "number",
                  newsletter: "number",
                  promotional: "number",
                },
                highlights: ["Important items to note"],
                actionRequired: ["Messages needing response"],
              },
            },
          };

          return jsonResult({
            status: "instructions",
            message: "Use google_gmail tool to fetch messages for summary",
            source: source ?? "gmail",
            instructions,
          });
        }

        case "categorize": {
          const messageIds = params.messageIds as string[] | undefined;
          const source = params.source as MessageSource | undefined;
          const categories = params.categories as MessageCategory[] | undefined;
          const maxMessages = (params.maxMessages as number) ?? 20;

          const instructions = {
            action: "categorize",
            steps: messageIds
              ? messageIds.map((id) => ({
                  tool: "google_gmail",
                  params: { action: "read", messageId: id },
                }))
              : [
                  {
                    tool: "google_gmail",
                    params: { action: "list", maxResults: maxMessages },
                  },
                ],
            processing: {
              description: "Classify each message into categories",
              categories: {
                urgent: "Immediate action needed - emergencies, critical issues",
                personal:
                  "Messages from individuals about personal matters",
                work: "Professional/work-related communications",
                newsletter: "Subscriptions, digests, regular updates",
                promotional: "Marketing, sales, offers, discounts",
                social: "Social media notifications",
                transactional: "Receipts, confirmations, account updates",
                spam: "Unwanted or suspicious messages",
              },
              filterTo: categories ?? "all",
            },
            outputFormat: {
              categorized: [
                {
                  id: "message_id",
                  from: "sender",
                  subject: "subject",
                  category: "category",
                  confidence: "0.0-1.0",
                  reason: "categorization reason",
                },
              ],
              stats: {
                byCategory: "counts per category",
              },
            },
          };

          return jsonResult({
            status: "instructions",
            message: "Use google_gmail tool to fetch messages for categorization",
            source: source ?? "gmail",
            instructions,
          });
        }

        case "suggest_response": {
          const messageId = params.messageId as string;
          const source = params.source as MessageSource | undefined;
          const context = params.context as string | undefined;
          const preferredTone = params.tone as ResponseSuggestion["tone"] | undefined;

          if (!messageId) {
            return jsonResult({
              error: "validation",
              message: "messageId is required for suggest_response action",
            });
          }

          const instructions = {
            action: "suggest_response",
            steps: [
              {
                tool: "google_gmail",
                params: { action: "read", messageId },
              },
              {
                tool: "clawdis_memory",
                params: {
                  action: "search",
                  query: "sender preferences communication style",
                },
                optional: true,
              },
            ],
            processing: {
              description: "Generate appropriate response suggestion",
              factors: [
                "Message content and tone",
                "Sender relationship (from memory if available)",
                "Any questions that need answers",
                "Required actions or commitments",
                "Appropriate formality level",
              ],
              preferredTone: preferredTone ?? "auto-detect",
              additionalContext: context ?? null,
            },
            outputFormat: {
              suggestion: {
                messageId: "original message id",
                originalSubject: "Re: subject",
                tone: "formal|casual|friendly|professional",
                suggestedReply: "Full suggested response text",
                keyPoints: ["Points to address"],
                questionsToAnswer: ["Questions from original message"],
                confidence: "0.0-1.0",
                alternatives: [
                  {
                    tone: "different tone",
                    reply: "alternative response",
                  },
                ],
              },
            },
          };

          return jsonResult({
            status: "instructions",
            message: "Use google_gmail to read message, then generate response",
            source: source ?? "gmail",
            messageId,
            instructions,
          });
        }

        case "queue_status": {
          const source = params.source as MessageSource | undefined;

          const instructions = {
            action: "queue_status",
            steps: [
              {
                tool: "google_gmail",
                params: { action: "profile" },
              },
              {
                tool: "google_gmail",
                params: { action: "labels" },
              },
              {
                tool: "google_gmail",
                params: {
                  action: "search",
                  query: "is:unread",
                  maxResults: 1,
                },
              },
            ],
            outputFormat: {
              status: {
                source: "gmail|whatsapp",
                connected: "boolean",
                email: "user email",
                unreadCount: "number",
                labels: ["available labels"],
                lastSync: "timestamp",
              },
            },
          };

          return jsonResult({
            status: "instructions",
            message: "Check inbox queue status",
            source: source ?? "gmail",
            instructions,
          });
        }

        default:
          return jsonResult({
            error: "unknown_action",
            message: `Unknown action: ${action}`,
            availableActions: [
              "triage",
              "summarize",
              "categorize",
              "suggest_response",
              "queue_status",
            ],
          });
      }
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Utility exports for use by other agents
// ─────────────────────────────────────────────────────────────────────────────

export { detectPriority, categorizeMessage, generateResponseSuggestion, suggestAction };

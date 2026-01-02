/**
 * Meeting intelligence tool for Clawdis agent - meeting preparation and follow-up.
 */

import type { AgentTool, AgentToolResult } from "@mariozechner/pi-ai";
import { type Static, type TSchema, Type } from "@sinclair/typebox";

type AnyAgentTool = AgentTool<TSchema, unknown>;

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

export const MeetingToolSchema = Type.Object({
  action: Type.Union([
    Type.Literal("meeting_prebrief"),
    Type.Literal("meeting_followup"),
    Type.Literal("meeting_history"),
    Type.Literal("extract_actions"),
  ]),
  meetingId: Type.Optional(Type.String()),
  attendees: Type.Optional(Type.Array(Type.String())),
  topic: Type.Optional(Type.String()),
  notes: Type.Optional(Type.String()),
});

export type MeetingToolInput = Static<typeof MeetingToolSchema>;

/**
 * Create the meeting intelligence tool for agent use.
 */
export function createMeetingTool(): AnyAgentTool {
  return {
    label: "Meeting Intelligence",
    name: "clawdis_meeting",
    description: `Prepare for and follow up on meetings. Use this to:
- Get prebriefs before meetings (context, talking points, attendee info)
- Create follow-up summaries and action items
- Review meeting history with contacts
- Extract action items from meeting notes

Actions:
- meeting_prebrief: Prepare context before a meeting (requires attendees and/or topic)
- meeting_followup: Generate follow-up summary and next steps (requires notes)
- meeting_history: Get past meeting context with attendees (requires attendees)
- extract_actions: Extract action items from meeting notes (requires notes)

Best practices:
- Provide attendee identifiers (phone numbers, emails, or names)
- Include meeting topic for better prebrief context
- Pass complete notes for accurate follow-up generation`,
    parameters: MeetingToolSchema,
    execute: async (_toolCallId, args) => {
      const params = args as MeetingToolInput;
      const { action, meetingId, attendees, topic, notes } = params;

      switch (action) {
        case "meeting_prebrief": {
          if (!attendees?.length && !topic) {
            return jsonResult({
              error: "validation",
              message: "meeting_prebrief requires attendees and/or topic",
            });
          }

          // TODO: Integrate with memory service to pull relevant context
          // TODO: Integrate with calendar service for meeting details
          return jsonResult({
            action: "meeting_prebrief",
            meetingId,
            attendees,
            topic,
            prebrief: {
              context: "Meeting prebrief generation not yet implemented",
              talkingPoints: [],
              attendeeContext: [],
            },
          });
        }

        case "meeting_followup": {
          if (!notes?.trim()) {
            return jsonResult({
              error: "validation",
              message: "meeting_followup requires notes",
            });
          }

          // TODO: Use LLM to generate summary and action items
          return jsonResult({
            action: "meeting_followup",
            meetingId,
            attendees,
            topic,
            followup: {
              summary: "Meeting follow-up generation not yet implemented",
              actionItems: [],
              nextSteps: [],
            },
          });
        }

        case "meeting_history": {
          if (!attendees?.length) {
            return jsonResult({
              error: "validation",
              message: "meeting_history requires attendees",
            });
          }

          // TODO: Query memory service for past meeting context
          return jsonResult({
            action: "meeting_history",
            attendees,
            history: {
              pastMeetings: [],
              sharedContext: "Meeting history retrieval not yet implemented",
            },
          });
        }

        case "extract_actions": {
          if (!notes?.trim()) {
            return jsonResult({
              error: "validation",
              message: "extract_actions requires notes",
            });
          }

          // TODO: Use LLM to extract action items
          return jsonResult({
            action: "extract_actions",
            meetingId,
            notes: notes.substring(0, 100) + (notes.length > 100 ? "..." : ""),
            actionItems: [],
            message: "Action item extraction not yet implemented",
          });
        }

        default:
          return jsonResult({ error: "unknown_action", action });
      }
    },
  };
}

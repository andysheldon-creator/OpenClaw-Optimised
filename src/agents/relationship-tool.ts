/**
 * Relationship management tool for Clawdis agent.
 * Provides tools for tracking contacts, analyzing relationships,
 * and querying communication history.
 */

import type { AgentTool, AgentToolResult } from "@mariozechner/pi-ai";
import { type TSchema, Type } from "@sinclair/typebox";
import { loadConfig } from "../config/config.js";
import type {
  CommunicationDirection,
  MessageType,
  Platform,
} from "../memory/relationships.js";
import { createRelationshipService } from "../memory/relationships.js";

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

function isRelationshipEnabled(): boolean {
  const config = loadConfig();
  return config.memory?.enabled === true;
}

// ─────────────────────────────────────────────────────────────────────────────
// Schema Definition
// ─────────────────────────────────────────────────────────────────────────────

const RelationshipToolSchema = Type.Union([
  // Check relationships needing attention
  Type.Object({
    action: Type.Literal("check_relationships"),
    minDaysSinceContact: Type.Optional(
      Type.Number({
        default: 7,
        description: "Minimum days since last contact",
      }),
    ),
    limit: Type.Optional(
      Type.Number({ default: 10, description: "Max suggestions to return" }),
    ),
  }),

  // Get communication history with a contact
  Type.Object({
    action: Type.Literal("communication_history"),
    contactId: Type.Optional(Type.String({ description: "Contact ID" })),
    contactName: Type.Optional(
      Type.String({ description: "Contact name (will search)" }),
    ),
    limit: Type.Optional(
      Type.Number({ default: 20, description: "Max records to return" }),
    ),
  }),

  // Track a new contact
  Type.Object({
    action: Type.Literal("track_contact"),
    displayName: Type.String({ description: "Contact's display name" }),
    platform: Type.Union([
      Type.Literal("whatsapp"),
      Type.Literal("telegram"),
      Type.Literal("discord"),
      Type.Literal("email"),
      Type.Literal("other"),
    ]),
    platformId: Type.String({ description: "Platform-specific ID" }),
    tags: Type.Optional(Type.Array(Type.String())),
    notes: Type.Optional(Type.String()),
  }),

  // Record a communication
  Type.Object({
    action: Type.Literal("record_communication"),
    contactId: Type.String({ description: "Contact ID" }),
    platform: Type.Union([
      Type.Literal("whatsapp"),
      Type.Literal("telegram"),
      Type.Literal("discord"),
      Type.Literal("email"),
      Type.Literal("other"),
    ]),
    direction: Type.Union([Type.Literal("inbound"), Type.Literal("outbound")]),
    messageType: Type.Optional(
      Type.Union([
        Type.Literal("text"),
        Type.Literal("voice"),
        Type.Literal("image"),
        Type.Literal("video"),
        Type.Literal("document"),
      ]),
    ),
    topics: Type.Optional(Type.Array(Type.String())),
    summary: Type.Optional(Type.String()),
  }),

  // List all contacts
  Type.Object({
    action: Type.Literal("list_contacts"),
    tags: Type.Optional(Type.Array(Type.String())),
    limit: Type.Optional(Type.Number({ default: 50 })),
  }),

  // Get relationship stats
  Type.Object({
    action: Type.Literal("relationship_stats"),
    contactId: Type.String({ description: "Contact ID" }),
  }),

  // Get dormant contacts
  Type.Object({
    action: Type.Literal("dormant_contacts"),
    daysSinceContact: Type.Optional(
      Type.Number({ default: 14, description: "Days threshold for dormancy" }),
    ),
    limit: Type.Optional(Type.Number({ default: 10 })),
  }),
]);

// ─────────────────────────────────────────────────────────────────────────────
// Tool Implementation
// ─────────────────────────────────────────────────────────────────────────────

export function createRelationshipTool(): AnyAgentTool {
  return {
    name: "relationship_manager",
    label: "Relationship Manager",
    description: `Manage relationships and communication history with contacts.

Actions:
- check_relationships: Get suggestions for contacts needing attention
- communication_history: Get history with a specific contact
- track_contact: Add or update a contact
- record_communication: Record a communication event
- list_contacts: List all tracked contacts
- relationship_stats: Get detailed stats for a contact
- dormant_contacts: Find contacts you haven't communicated with recently`,

    parameters: RelationshipToolSchema,

    execute: async (_toolCallId, args) => {
      const params = args as Record<string, unknown>;
      const action = params.action as string;

      if (!isRelationshipEnabled()) {
        return jsonResult({
          error: "not_configured",
          message:
            "Relationship tracking requires memory system to be enabled in configuration",
        });
      }

      const service = await createRelationshipService();
      if (!service) {
        return jsonResult({
          error: "initialization_failed",
          message:
            "Failed to initialize relationship service (check Qdrant connection)",
        });
      }

      try {
        switch (action) {
          // ─────────────────────────────────────────────────────────────────
          // check_relationships - Get maintenance suggestions
          // ─────────────────────────────────────────────────────────────────
          case "check_relationships": {
            const minDays = (params.minDaysSinceContact as number) ?? 7;
            const limit = (params.limit as number) ?? 10;

            const suggestions = await service.getMaintenanceSuggestions({
              minDaysSinceContact: minDays,
              limit,
            });

            if (suggestions.length === 0) {
              return jsonResult({
                message:
                  "All relationships are well-maintained! No contacts need immediate attention.",
                suggestions: [],
              });
            }

            return jsonResult({
              count: suggestions.length,
              suggestions: suggestions.map(
                (s: {
                  contactId: string;
                  displayName: string;
                  daysSinceLastContact: number;
                  priority: string;
                  suggestedAction: string;
                  reason: string;
                }) => ({
                  contactId: s.contactId,
                  displayName: s.displayName,
                  daysSinceContact: s.daysSinceLastContact,
                  priority: s.priority,
                  suggestedAction: s.suggestedAction,
                  reason: s.reason,
                }),
              ),
            });
          }

          // ─────────────────────────────────────────────────────────────────
          // communication_history - Get history with a contact
          // ─────────────────────────────────────────────────────────────────
          case "communication_history": {
            let contactId = params.contactId as string | undefined;
            const contactName = params.contactName as string | undefined;
            const limit = (params.limit as number) ?? 20;

            // Find contact by name if needed
            if (!contactId && contactName) {
              const contacts = await service.listContacts();
              const match = contacts.find((c) =>
                c.displayName.toLowerCase().includes(contactName.toLowerCase()),
              );
              if (!match) {
                return jsonResult({
                  error: "contact_not_found",
                  message: `No contact found matching "${contactName}"`,
                });
              }
              contactId = match.id;
            }

            if (!contactId) {
              return jsonResult({
                error: "validation",
                message: "Either contactId or contactName is required",
              });
            }

            const contact = await service.getContact(contactId);
            const records = await service.getCommunicationHistory(
              contactId,
              limit,
            );

            return jsonResult({
              contact: contact?.displayName ?? contactId,
              totalRecords: records.length,
              recentInteractions: records
                .slice(0, 10)
                .map(
                  (r: {
                    platform: string;
                    direction: string;
                    messageType: string;
                    timestamp: number;
                  }) => ({
                    platform: r.platform,
                    direction: r.direction,
                    type: r.messageType,
                    date: new Date(r.timestamp).toISOString(),
                  }),
                ),
            });
          }

          // ─────────────────────────────────────────────────────────────────
          // track_contact - Create or update a contact
          // ─────────────────────────────────────────────────────────────────
          case "track_contact": {
            const displayName = params.displayName as string;
            const platform = params.platform as Platform;
            const platformId = params.platformId as string;
            const tags = params.tags as string[] | undefined;

            if (!displayName?.trim()) {
              return jsonResult({
                error: "validation",
                message: "displayName required",
              });
            }

            // Check if contact already exists
            const existing = await service.findContactByPlatformId(
              platform,
              platformId,
            );

            if (existing) {
              // Update existing contact
              const updated = await service.updateContact(existing.id, {
                displayName,
                tags,
              });

              return jsonResult({
                action: "updated",
                contact: {
                  id: updated?.id ?? existing.id,
                  displayName: updated?.displayName ?? displayName,
                  platforms: updated?.platforms ?? existing.platforms,
                  tags: updated?.tags ?? tags,
                },
              });
            }

            // Create new contact
            const contact = await service.createContact({
              displayName,
              platforms: { [platform]: platformId },
              tags,
            });

            return jsonResult({
              action: "created",
              contact: {
                id: contact.id,
                displayName: contact.displayName,
                platforms: contact.platforms,
                tags: contact.tags,
              },
            });
          }

          // ─────────────────────────────────────────────────────────────────
          // record_communication - Record a communication event
          // ─────────────────────────────────────────────────────────────────
          case "record_communication": {
            const contactId = params.contactId as string;
            const platform = params.platform as Platform;
            const direction = params.direction as CommunicationDirection;
            const messageType = (params.messageType as MessageType) ?? "text";
            const topics = params.topics as string[] | undefined;
            const summary = params.summary as string | undefined;

            if (!contactId) {
              return jsonResult({
                error: "validation",
                message: "contactId required",
              });
            }

            await service.recordCommunication({
              contactId,
              platform,
              direction,
              messageType,
            });

            return jsonResult({
              success: true,
              message: "Communication recorded",
              contactId,
              platform,
              direction,
            });
          }

          // ─────────────────────────────────────────────────────────────────
          // list_contacts - List all tracked contacts
          // ─────────────────────────────────────────────────────────────────
          case "list_contacts": {
            const tags = params.tags as string[] | undefined;
            const limit = (params.limit as number) ?? 50;

            let contacts = await service.listContacts({ limit: 100 });

            // Filter by tags if specified
            if (tags?.length) {
              contacts = contacts.filter((c) =>
                c.tags?.some((t) => tags.includes(t)),
              );
            }

            contacts = contacts.slice(0, limit);

            return jsonResult({
              count: contacts.length,
              contacts: contacts.map((c) => ({
                id: c.id,
                displayName: c.displayName,
                platforms: c.platforms,
                tags: c.tags ?? [],
              })),
            });
          }

          // ─────────────────────────────────────────────────────────────────
          // relationship_stats - Get detailed stats for a contact
          // ─────────────────────────────────────────────────────────────────
          case "relationship_stats": {
            const contactId = params.contactId as string;

            if (!contactId) {
              return jsonResult({
                error: "validation",
                message: "contactId required",
              });
            }

            const contact = await service.getContact(contactId);
            if (!contact) {
              return jsonResult({
                error: "contact_not_found",
                message: `Contact ${contactId} not found`,
              });
            }

            const stats = await service.getRelationshipStats(contactId);

            return jsonResult({
              contact: contact.displayName,
              contactId: contact.id,
              platforms: contact.platforms,
              tags: contact.tags ?? [],
              stats: stats
                ? {
                    totalInteractions: stats.totalInteractions,
                    daysSinceLastContact: stats.daysSinceLastContact,
                    relationshipAgeDays: stats.relationshipAgeDays,
                    frequencyPerWeek: stats.communicationFrequency?.toFixed(2),
                    preferredPlatform: stats.preferredPlatform,
                  }
                : null,
            });
          }

          // ─────────────────────────────────────────────────────────────────
          // dormant_contacts - Find contacts that need attention
          // ─────────────────────────────────────────────────────────────────
          case "dormant_contacts": {
            const daysSinceContact = (params.daysSinceContact as number) ?? 14;
            const limit = (params.limit as number) ?? 10;

            const dormant = await service.getDormantContacts(daysSinceContact);

            if (dormant.length === 0) {
              return jsonResult({
                message: `No contacts have been dormant for more than ${daysSinceContact} days`,
                contacts: [],
              });
            }

            return jsonResult({
              threshold: daysSinceContact,
              count: Math.min(dormant.length, limit),
              contacts: dormant.slice(0, limit).map((c) => ({
                id: c.id,
                displayName: c.displayName,
                platforms: c.platforms,
                daysSinceContact: c.stats.daysSinceLastContact,
                preferredPlatform: c.stats.preferredPlatform,
              })),
            });
          }

          default:
            return jsonResult({
              error: "unknown_action",
              message: `Unknown action: ${action}`,
            });
        }
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Unknown error";
        return jsonResult({
          error: "execution_error",
          message,
        });
      }
    },
  };
}

export default createRelationshipTool;

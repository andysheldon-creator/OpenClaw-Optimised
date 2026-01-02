/**
 * Graph database tool for Clawdis agent - knowledge graph operations.
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

export const GraphToolSchema = Type.Union([
  Type.Object({
    action: Type.Literal("graph_add_node"),
    nodeType: Type.String({
      description: "Type/label of the node (e.g., Person, Place, Concept)",
    }),
    nodeId: Type.Optional(
      Type.String({
        description: "Optional unique identifier (auto-generated if omitted)",
      }),
    ),
    properties: Type.Optional(
      Type.Record(Type.String(), Type.Unknown(), {
        description: "Key-value properties to store on the node",
      }),
    ),
  }),
  Type.Object({
    action: Type.Literal("graph_add_edge"),
    sourceId: Type.String({ description: "Source node ID" }),
    targetId: Type.String({ description: "Target node ID" }),
    relationship: Type.String({
      description: "Relationship type (e.g., KNOWS, LOCATED_IN, RELATED_TO)",
    }),
    properties: Type.Optional(
      Type.Record(Type.String(), Type.Unknown(), {
        description: "Key-value properties to store on the edge",
      }),
    ),
  }),
  Type.Object({
    action: Type.Literal("graph_query"),
    nodeType: Type.Optional(
      Type.String({ description: "Filter by node type" }),
    ),
    nodeId: Type.Optional(
      Type.String({ description: "Get specific node by ID" }),
    ),
    properties: Type.Optional(
      Type.Record(Type.String(), Type.Unknown(), {
        description: "Filter nodes by property values",
      }),
    ),
  }),
  Type.Object({
    action: Type.Literal("graph_traverse"),
    nodeId: Type.String({ description: "Starting node ID for traversal" }),
    relationship: Type.Optional(
      Type.String({ description: "Filter by relationship type" }),
    ),
    depth: Type.Optional(
      Type.Number({
        description: "Maximum traversal depth (default: 1)",
        default: 1,
      }),
    ),
  }),
  Type.Object({
    action: Type.Literal("graph_delete_node"),
    nodeId: Type.String({ description: "Node ID to delete" }),
  }),
  Type.Object({
    action: Type.Literal("graph_delete_edge"),
    sourceId: Type.String({ description: "Source node ID" }),
    targetId: Type.String({ description: "Target node ID" }),
    relationship: Type.Optional(
      Type.String({ description: "Specific relationship to delete" }),
    ),
  }),
  Type.Object({
    action: Type.Literal("graph_update_node"),
    nodeId: Type.String({ description: "Node ID to update" }),
    properties: Type.Record(Type.String(), Type.Unknown(), {
      description: "Properties to update/add on the node",
    }),
  }),
]);

export type GraphToolInput = Static<typeof GraphToolSchema>;

/**
 * Create the graph database tool for agent use.
 */
export function createGraphTool(): AnyAgentTool {
  return {
    label: "Graph Database",
    name: "clawdis_graph",
    description: `Store and query knowledge as a graph of nodes and relationships. Use this to:
- Build a knowledge graph of entities and their connections
- Store structured information about people, places, concepts, events
- Query relationships between entities
- Traverse the graph to discover connections

Node types (examples):
- Person: People and their attributes
- Place: Locations and addresses
- Concept: Abstract ideas and topics
- Event: Things that happened
- Organization: Companies, groups

Relationship types (examples):
- KNOWS: Person knows another person
- LOCATED_IN: Entity is in a place
- WORKS_AT: Person works at organization
- RELATED_TO: Generic relationship
- PART_OF: Entity is part of another

Best practices:
- Use consistent node types and relationship names
- Store searchable properties on nodes
- Use traversal to find indirect connections`,
    parameters: GraphToolSchema,
    execute: async (_toolCallId, args) => {
      const params = args as Record<string, unknown>;
      const action = params.action as string;

      // TODO: Implement graph database backend (e.g., in-memory, Neo4j, or file-based)
      // For now, return a placeholder response indicating the feature is not yet implemented

      switch (action) {
        case "graph_add_node": {
          const nodeType = params.nodeType as string;
          const nodeId = (params.nodeId as string) ?? crypto.randomUUID();
          const properties = params.properties as
            | Record<string, unknown>
            | undefined;

          return jsonResult({
            status: "not_implemented",
            message: "Graph database backend not yet configured",
            wouldCreate: {
              nodeId,
              nodeType,
              properties: properties ?? {},
            },
          });
        }

        case "graph_add_edge": {
          const sourceId = params.sourceId as string;
          const targetId = params.targetId as string;
          const relationship = params.relationship as string;
          const properties = params.properties as
            | Record<string, unknown>
            | undefined;

          if (!sourceId?.trim()) {
            return jsonResult({
              error: "validation",
              message: "sourceId required",
            });
          }
          if (!targetId?.trim()) {
            return jsonResult({
              error: "validation",
              message: "targetId required",
            });
          }
          if (!relationship?.trim()) {
            return jsonResult({
              error: "validation",
              message: "relationship required",
            });
          }

          return jsonResult({
            status: "not_implemented",
            message: "Graph database backend not yet configured",
            wouldCreate: {
              sourceId,
              targetId,
              relationship,
              properties: properties ?? {},
            },
          });
        }

        case "graph_query": {
          const nodeType = params.nodeType as string | undefined;
          const nodeId = params.nodeId as string | undefined;
          const properties = params.properties as
            | Record<string, unknown>
            | undefined;

          return jsonResult({
            status: "not_implemented",
            message: "Graph database backend not yet configured",
            query: {
              nodeType: nodeType ?? null,
              nodeId: nodeId ?? null,
              properties: properties ?? {},
            },
            results: [],
          });
        }

        case "graph_traverse": {
          const nodeId = params.nodeId as string;
          const relationship = params.relationship as string | undefined;
          const depth = (params.depth as number) ?? 1;

          if (!nodeId?.trim()) {
            return jsonResult({
              error: "validation",
              message: "nodeId required",
            });
          }

          return jsonResult({
            status: "not_implemented",
            message: "Graph database backend not yet configured",
            traversal: {
              startNode: nodeId,
              relationship: relationship ?? null,
              depth,
            },
            paths: [],
          });
        }

        case "graph_delete_node": {
          const nodeId = params.nodeId as string;

          if (!nodeId?.trim()) {
            return jsonResult({
              error: "validation",
              message: "nodeId required",
            });
          }

          return jsonResult({
            status: "not_implemented",
            message: "Graph database backend not yet configured",
            wouldDelete: { nodeId },
          });
        }

        case "graph_delete_edge": {
          const sourceId = params.sourceId as string;
          const targetId = params.targetId as string;
          const relationship = params.relationship as string | undefined;

          if (!sourceId?.trim()) {
            return jsonResult({
              error: "validation",
              message: "sourceId required",
            });
          }
          if (!targetId?.trim()) {
            return jsonResult({
              error: "validation",
              message: "targetId required",
            });
          }

          return jsonResult({
            status: "not_implemented",
            message: "Graph database backend not yet configured",
            wouldDelete: {
              sourceId,
              targetId,
              relationship: relationship ?? null,
            },
          });
        }

        case "graph_update_node": {
          const nodeId = params.nodeId as string;
          const properties = params.properties as Record<string, unknown>;

          if (!nodeId?.trim()) {
            return jsonResult({
              error: "validation",
              message: "nodeId required",
            });
          }
          if (!properties || typeof properties !== "object") {
            return jsonResult({
              error: "validation",
              message: "properties required",
            });
          }

          return jsonResult({
            status: "not_implemented",
            message: "Graph database backend not yet configured",
            wouldUpdate: {
              nodeId,
              properties,
            },
          });
        }

        default:
          return jsonResult({ error: "unknown_action", action });
      }
    },
  };
}

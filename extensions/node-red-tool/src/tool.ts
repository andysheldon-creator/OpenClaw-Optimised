import { Type } from "@sinclair/typebox";
import type { DeploymentType, NodeRedToolConfig } from "./config.js";
import { NodeRedClient } from "./client.js";
import {
  createFlowTab,
  createNode,
  NodeFactory,
  connectNodes,
  chainNodes,
  layoutNodes,
  validateFlow,
  analyzeFlow,
  buildSimpleFlow,
  buildHttpApiFlow,
  buildSwitchFlow,
  buildErrorHandlerFlow,
  buildTransformPipeline,
  buildParallelProcessFlow,
  type NodeJson,
} from "./flow-builder.js";
import {
  listTemplates,
  searchTemplates,
  generateFromTemplate,
} from "./templates.js";
import {
  NODE_CATALOG,
  getNodeInfo,
  listNodesByCategory,
  getCategories,
  searchNodes,
  getNodeQuickRef,
} from "./node-catalog.js";

// ============================================================================
// Action Definitions
// ============================================================================

const ACTIONS = [
  // Admin API actions
  "flows_get",
  "flows_deploy",
  "flow_add",
  "flow_update",
  "flows_state_get",
  "nodes_list",
  "nodes_install",
  // Flow creation helpers
  "flow_create",
  "node_create",
  "nodes_connect",
  "flow_validate",
  "flow_analyze",
  // Flow patterns
  "pattern_build",
  "node_types",
  // Templates
  "templates_list",
  "template_apply",
  // Node catalog
  "catalog_search",
  "catalog_info",
] as const;

type Action = (typeof ACTIONS)[number];

function stringEnum<T extends readonly string[]>(
  values: T,
  options: { description?: string } = {},
) {
  return Type.Unsafe<T[number]>({
    type: "string",
    enum: [...values],
    ...options,
  });
}

// ============================================================================
// Tool Schema
// ============================================================================

export const NodeRedToolSchema = Type.Object(
  {
    action: stringEnum(ACTIONS, {
      description: `Action: ${ACTIONS.join(", ")}`,
    }),
    // Admin API params
    flows: Type.Optional(
      Type.Array(Type.Any(), {
        description: "Flow JSON array for flows_deploy",
      }),
    ),
    flow: Type.Optional(
      Type.Any({
        description: "Flow tab or node JSON",
      }),
    ),
    flowId: Type.Optional(
      Type.String({
        description: "Flow tab ID",
      }),
    ),
    rev: Type.Optional(
      Type.String({
        description: "Revision for conflict detection",
      }),
    ),
    deploymentType: Type.Optional(
      stringEnum(["full", "nodes", "flows", "reload"], {
        description: "Deployment type",
      }),
    ),
    module: Type.Optional(
      Type.String({
        description: "NPM module name for nodes_install",
      }),
    ),
    // Flow creation params
    label: Type.Optional(
      Type.String({
        description: "Label for flow tab or node name",
      }),
    ),
    nodeType: Type.Optional(
      Type.String({
        description: "Node type (e.g., inject, debug, function, http in)",
      }),
    ),
    position: Type.Optional(
      Type.Object(
        {
          x: Type.Number(),
          y: Type.Number(),
        },
        { description: "Node position {x, y}" },
      ),
    ),
    properties: Type.Optional(
      Type.Any({
        description: "Node-specific properties",
      }),
    ),
    wires: Type.Optional(
      Type.Array(Type.Array(Type.String()), {
        description: "Wire connections [[targetId1], [targetId2]]",
      }),
    ),
    // Connection params
    sourceId: Type.Optional(
      Type.String({
        description: "Source node ID for connection",
      }),
    ),
    targetId: Type.Optional(
      Type.String({
        description: "Target node ID for connection",
      }),
    ),
    sourcePort: Type.Optional(
      Type.Number({
        description: "Source output port (0-indexed)",
      }),
    ),
    nodes: Type.Optional(
      Type.Array(Type.Any(), {
        description: "Array of nodes for batch operations",
      }),
    ),
    // Template params
    templateId: Type.Optional(
      Type.String({
        description: "Template ID for template_apply",
      }),
    ),
    category: Type.Optional(
      Type.String({
        description: "Category filter for templates or catalog",
      }),
    ),
    // Search params
    query: Type.Optional(
      Type.String({
        description: "Search query for templates or catalog",
      }),
    ),
    // Template options
    baseUrl: Type.Optional(
      Type.String({
        description: "Base URL for HTTP templates",
      }),
    ),
    mqttTopic: Type.Optional(
      Type.String({
        description: "MQTT topic for IoT templates",
      }),
    ),
    interval: Type.Optional(
      Type.String({
        description: "Interval in seconds for timer templates",
      }),
    ),
    // Pattern params
    patternType: Type.Optional(
      stringEnum(["simple", "http-api", "switch", "error-handler", "transform", "parallel"], {
        description: "Pattern type for pattern_build",
      }),
    ),
    method: Type.Optional(
      stringEnum(["get", "post", "put", "delete", "patch"], {
        description: "HTTP method for http-api pattern",
      }),
    ),
    conditions: Type.Optional(
      Type.Array(Type.Object({ value: Type.String() }), {
        description: "Conditions for switch pattern [{value: 'x'}, ...]",
      }),
    ),
    transforms: Type.Optional(
      Type.Array(Type.Object({ name: Type.String(), func: Type.String() }), {
        description: "Transform functions for pipeline [{name, func}, ...]",
      }),
    ),
    handlerFunc: Type.Optional(
      Type.String({
        description: "JavaScript function code for pattern handlers",
      }),
    ),
  },
  { additionalProperties: false },
);

type ToolParams = {
  action: Action;
  // Admin API
  flows?: unknown[];
  flow?: unknown;
  flowId?: string;
  rev?: string;
  deploymentType?: DeploymentType;
  module?: string;
  // Flow creation
  label?: string;
  nodeType?: string;
  position?: { x: number; y: number };
  properties?: Record<string, unknown>;
  wires?: string[][];
  // Connection
  sourceId?: string;
  targetId?: string;
  sourcePort?: number;
  nodes?: unknown[];
  // Templates
  templateId?: string;
  category?: string;
  query?: string;
  baseUrl?: string;
  mqttTopic?: string;
  interval?: string;
  // Pattern params
  patternType?: "simple" | "http-api" | "switch" | "error-handler" | "transform" | "parallel";
  method?: "get" | "post" | "put" | "delete" | "patch";
  conditions?: Array<{ value: string }>;
  transforms?: Array<{ name: string; func: string }>;
  handlerFunc?: string;
};

type ToolResult = {
  content: Array<{ type: string; text: string }>;
  details: unknown;
};

function json(payload: unknown): ToolResult {
  return {
    content: [{ type: "text", text: JSON.stringify(payload, null, 2) }],
    details: payload,
  };
}

// ============================================================================
// Tool Executor
// ============================================================================

export function createExecuteNodeRedTool(config: NodeRedToolConfig) {
  const client = new NodeRedClient(config);

  return async function executeNodeRedTool(
    _toolCallId: string,
    params: ToolParams,
  ): Promise<ToolResult> {
    try {
      switch (params.action) {
        // ========================================
        // Admin API Actions
        // ========================================
        case "flows_get": {
          const result = await client.getFlows();
          const analysis = analyzeFlow(result.flows as unknown[]);
          return json({
            success: true,
            rev: result.rev,
            flowCount: result.flows?.length ?? 0,
            summary: analysis.summary,
            tabs: analysis.tabs,
            flows: result.flows,
          });
        }

        case "flows_deploy": {
          if (!params.flows || !Array.isArray(params.flows)) {
            throw new Error("flows array required for flows_deploy action");
          }

          if (config.readOnly) {
            throw new Error(
              "Node-RED is configured in read-only mode. Write operations are disabled.",
            );
          }

          // Validate before deploy
          const validation = validateFlow(params.flows);
          if (!validation.valid) {
            return json({
              error: "Flow validation failed",
              errors: validation.errors,
              warnings: validation.warnings,
            });
          }

          // Pre-fetch for backup
          let backupRev: string | undefined;
          try {
            const current = await client.getFlows();
            backupRev = current.rev;
          } catch {
            // Ignore
          }

          const deployType = params.deploymentType || config.deploymentType;
          const result = await client.deployFlows({
            flows: params.flows,
            rev: params.rev,
            deploymentType: deployType,
          });

          return json({
            success: true,
            previousRev: backupRev,
            newRev: result.rev,
            deploymentType: deployType,
            flowCount: params.flows.length,
            warnings: validation.warnings,
          });
        }

        case "flow_add": {
          if (!params.flow) {
            throw new Error("flow object required for flow_add action");
          }

          const result = await client.addFlow(params.flow);
          return json({
            success: true,
            id: result.id,
            message: `Flow tab added with ID: ${result.id}`,
          });
        }

        case "flow_update": {
          if (!params.flowId) {
            throw new Error("flowId required for flow_update action");
          }
          if (!params.flow) {
            throw new Error("flow object required for flow_update action");
          }

          await client.updateFlow(params.flowId, params.flow);
          return json({
            success: true,
            id: params.flowId,
            message: `Flow tab ${params.flowId} updated successfully`,
          });
        }

        case "flows_state_get": {
          const result = await client.getFlowsState();
          return json({
            success: true,
            state: result.state,
            details: result,
          });
        }

        case "nodes_list": {
          const nodes = await client.getNodes();
          return json({
            success: true,
            nodeCount: nodes.length,
            nodes: nodes.map((n) => ({
              id: n.id,
              name: n.name,
              module: n.module,
              version: n.version,
              enabled: n.enabled,
              types: n.types,
            })),
          });
        }

        case "nodes_install": {
          if (!params.module) {
            throw new Error("module name required for nodes_install action");
          }

          const result = await client.installNode(params.module);
          return json({
            success: true,
            module: params.module,
            result,
            message: `Module ${params.module} installed successfully`,
          });
        }

        // ========================================
        // Flow Creation Actions
        // ========================================
        case "flow_create": {
          const label = params.label || "New Flow";
          const tab = createFlowTab(label);
          return json({
            success: true,
            message: `Flow tab created. Use this ID for nodes: ${tab.id}`,
            tab,
            hint: "Add nodes with node_create action, then deploy with flows_deploy",
          });
        }

        case "node_create": {
          if (!params.nodeType) {
            throw new Error("nodeType required for node_create action");
          }
          if (!params.flowId) {
            throw new Error("flowId required for node_create action");
          }

          // Check if factory method exists
          const factoryMethod = NodeFactory[params.nodeType as keyof typeof NodeFactory];
          let node: NodeJson;

          if (factoryMethod && typeof factoryMethod === "function") {
            // Use factory for known types with defaults
            // @ts-expect-error - dynamic call
            node = factoryMethod(params.flowId, params.position, params.properties || {});
          } else {
            // Generic node creation
            node = createNode({
              type: params.nodeType,
              name: params.label,
              flowId: params.flowId,
              position: params.position,
              properties: params.properties as Record<string, unknown>,
              wires: params.wires,
            });
          }

          if (params.label) {
            node.name = params.label;
          }

          // Include usage hint from catalog
          const info = getNodeInfo(params.nodeType);
          const hint = info?.usage || `Node type: ${params.nodeType}`;

          return json({
            success: true,
            node,
            hint,
          });
        }

        case "nodes_connect": {
          if (!params.sourceId) {
            throw new Error("sourceId required for nodes_connect");
          }
          if (!params.targetId) {
            throw new Error("targetId required for nodes_connect");
          }

          // If nodes array provided, find and update source
          if (params.nodes && Array.isArray(params.nodes)) {
            const sourceIndex = params.nodes.findIndex(
              (n: unknown) => (n as NodeJson).id === params.sourceId,
            );
            if (sourceIndex < 0) {
              throw new Error(`Source node ${params.sourceId} not found in nodes array`);
            }

            const updatedNodes = [...params.nodes];
            updatedNodes[sourceIndex] = connectNodes(
              params.nodes[sourceIndex] as NodeJson,
              params.targetId,
              params.sourcePort ?? 0,
            );

            return json({
              success: true,
              message: `Connected ${params.sourceId} → ${params.targetId}`,
              nodes: updatedNodes,
            });
          }

          // Otherwise return connection spec
          return json({
            success: true,
            message: `Wire specification created. Add to source node's wires array.`,
            connection: {
              sourceId: params.sourceId,
              targetId: params.targetId,
              sourcePort: params.sourcePort ?? 0,
            },
            hint: "Update source node wires: wires[port].push(targetId)",
          });
        }

        case "flow_validate": {
          if (!params.flows && !params.nodes) {
            throw new Error("flows or nodes array required for flow_validate");
          }

          const items = (params.flows || params.nodes) as unknown[];
          const result = validateFlow(items);

          return json({
            success: true,
            valid: result.valid,
            errors: result.errors,
            warnings: result.warnings,
            stats: result.stats,
          });
        }

        case "flow_analyze": {
          if (!params.flows) {
            throw new Error("flows array required for flow_analyze");
          }

          const analysis = analyzeFlow(params.flows);
          return json({
            success: true,
            ...analysis,
          });
        }

        // ========================================
        // Pattern Actions
        // ========================================
        case "pattern_build": {
          if (!params.patternType) {
            return json({
              success: true,
              availablePatterns: [
                { id: "simple", description: "inject → function → debug" },
                { id: "http-api", description: "http in → handler → http response" },
                { id: "switch", description: "input → switch → multiple outputs" },
                { id: "error-handler", description: "catch → handler → debug" },
                { id: "transform", description: "input → [transforms...] → output" },
                { id: "parallel", description: "split → process → join" },
              ],
              hint: "Specify patternType to generate a flow pattern",
            });
          }

          let pattern;
          const label = params.label || `${params.patternType} Flow`;

          switch (params.patternType) {
            case "simple":
              pattern = buildSimpleFlow(label, params.handlerFunc, {
                repeat: params.interval,
              });
              break;
            case "http-api":
              if (!params.baseUrl) {
                throw new Error("baseUrl required for http-api pattern");
              }
              pattern = buildHttpApiFlow(label, params.baseUrl, params.method || "get", params.handlerFunc);
              break;
            case "switch":
              pattern = buildSwitchFlow(
                label,
                params.properties?.property as string || "payload",
                params.conditions || [{ value: "A" }, { value: "B" }],
              );
              break;
            case "error-handler":
              pattern = buildErrorHandlerFlow(label, params.handlerFunc);
              break;
            case "transform":
              if (!params.transforms || params.transforms.length === 0) {
                throw new Error("transforms array required for transform pattern");
              }
              pattern = buildTransformPipeline(label, params.transforms);
              break;
            case "parallel":
              pattern = buildParallelProcessFlow(label, params.handlerFunc);
              break;
            default:
              throw new Error(`Unknown pattern: ${params.patternType}`);
          }

          const flowItems = [pattern.tab, ...pattern.nodes];
          return json({
            success: true,
            message: `Pattern "${params.patternType}" built successfully`,
            tab: pattern.tab,
            nodeCount: pattern.nodes.length,
            flows: flowItems,
            hint: "Use flows_deploy to deploy, or merge with existing flows",
          });
        }

        case "node_types": {
          // Return available NodeFactory types
          const factoryTypes = Object.keys(NodeFactory).sort();
          return json({
            success: true,
            message: "Available node types in NodeFactory",
            nodeTypes: factoryTypes,
            count: factoryTypes.length,
            usage: "Use node_create with nodeType parameter",
            examples: [
              { nodeType: "inject", description: "Message injection/timer" },
              { nodeType: "debug", description: "Debug output" },
              { nodeType: "function", description: "JavaScript processing" },
              { nodeType: "change", description: "Set/change message properties" },
              { nodeType: "switch", description: "Route by condition" },
              { nodeType: "httpIn", description: "HTTP endpoint" },
              { nodeType: "httpRequest", description: "HTTP client" },
              { nodeType: "split", description: "Split array/string" },
              { nodeType: "join", description: "Join messages" },
              { nodeType: "json", description: "JSON parse/stringify" },
              { nodeType: "file", description: "Write to file" },
              { nodeType: "fileIn", description: "Read from file" },
            ],
          });
        }

        // ========================================
        // Template Actions
        // ========================================
        case "templates_list": {
          const templates = params.query
            ? searchTemplates(params.query)
            : params.category
              ? listTemplates(params.category)
              : listTemplates();

          return json({
            success: true,
            templateCount: templates.length,
            templates: templates.map((t) => ({
              id: t.id,
              name: t.name,
              description: t.description,
              category: t.category,
              tags: t.tags,
            })),
            categories: ["api", "iot", "automation", "integration", "utility"],
          });
        }

        case "template_apply": {
          if (!params.templateId) {
            throw new Error("templateId required for template_apply action");
          }

          const generated = generateFromTemplate(params.templateId, {
            label: params.label,
            baseUrl: params.baseUrl,
            mqttTopic: params.mqttTopic,
            interval: params.interval,
          });

          if (!generated) {
            throw new Error(`Template not found: ${params.templateId}`);
          }

          // Return flow ready for deployment
          const flowItems = [generated.tab, ...generated.nodes];

          return json({
            success: true,
            message: `Template "${params.templateId}" applied. Ready to deploy.`,
            description: generated.description,
            tab: generated.tab,
            nodeCount: generated.nodes.length,
            flows: flowItems,
            hint: "Use flows_deploy with these flows to deploy, or merge with existing flows",
          });
        }

        // ========================================
        // Catalog Actions
        // ========================================
        case "catalog_search": {
          if (!params.query && !params.category) {
            // Return overview
            const categories = getCategories();
            return json({
              success: true,
              totalNodeTypes: Object.keys(NODE_CATALOG).length,
              categories: categories.map((c) => ({
                name: c,
                count: listNodesByCategory(c).length,
              })),
              hint: "Use query or category to filter",
            });
          }

          const results = params.query
            ? searchNodes(params.query)
            : listNodesByCategory(params.category!);

          return json({
            success: true,
            resultCount: results.length,
            nodes: results.map((n) => ({
              type: n.type,
              category: n.category,
              description: n.description,
              inputs: n.inputs,
              outputs: n.outputs,
            })),
          });
        }

        case "catalog_info": {
          if (!params.nodeType) {
            throw new Error("nodeType required for catalog_info action");
          }

          const info = getNodeInfo(params.nodeType);
          if (!info) {
            // Try to find similar
            const similar = searchNodes(params.nodeType).slice(0, 5);
            return json({
              success: false,
              error: `Node type "${params.nodeType}" not found in catalog`,
              similarTypes: similar.map((n) => n.type),
              hint: "This might be a contrib node not in core catalog",
            });
          }

          return json({
            success: true,
            ...info,
            quickRef: getNodeQuickRef(params.nodeType),
          });
        }

        default: {
          params.action satisfies never;
          throw new Error(
            `Unknown action: ${String(params.action)}. Valid actions: ${ACTIONS.join(", ")}`,
          );
        }
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);

      if (
        errorMessage.includes("409") ||
        errorMessage.toLowerCase().includes("conflict")
      ) {
        return json({
          error: "Revision conflict detected",
          message:
            "The flows have been modified since last fetch. Please retrieve the latest revision and try again.",
          details: errorMessage,
        });
      }

      if (
        errorMessage.includes("401") ||
        errorMessage.includes("403") ||
        errorMessage.toLowerCase().includes("unauthorized")
      ) {
        return json({
          error: "Authentication failed",
          message:
            "Please check your Node-RED token configuration. Ensure adminAuth is properly configured.",
          details: errorMessage,
        });
      }

      return json({
        error: errorMessage,
      });
    }
  };
}

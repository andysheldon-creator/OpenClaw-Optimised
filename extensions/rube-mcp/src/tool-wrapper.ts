import { Type, type TObject, type TProperties, type TSchema } from "@sinclair/typebox";

import type { McpTool, RubeMcpClient } from "./mcp-client.js";
import type { RubeOAuthCredentials } from "./auth.js";
import { RubeMcpClient as RubeMcpClientClass } from "./mcp-client.js";

export type CachedMcpTool = {
  name: string;
  description?: string;
  inputSchema: McpTool["inputSchema"];
};

type ClawdbotTool = {
  name: string;
  description: string;
  parameters: TObject<TProperties>;
  execute: (id: string, params: Record<string, unknown>) => Promise<{
    content: Array<{ type: string; text: string }>;
  }>;
};

/**
 * Convert JSON Schema type to TypeBox type
 */
function jsonSchemaToTypebox(schema: unknown, required = false): unknown {
  if (!schema || typeof schema !== "object") {
    return required ? Type.Unknown() : Type.Optional(Type.Unknown());
  }

  const s = schema as Record<string, unknown>;
  const type = s.type as string | undefined;
  const description = s.description as string | undefined;

  let result: unknown;

  switch (type) {
    case "string":
      result = Type.String({ description });
      break;
    case "number":
      result = Type.Number({ description });
      break;
    case "integer":
      result = Type.Integer({ description });
      break;
    case "boolean":
      result = Type.Boolean({ description });
      break;
    case "array": {
      const items = s.items as unknown;
      const itemType = jsonSchemaToTypebox(items, true) as TSchema;
      result = Type.Array(itemType, { description });
      break;
    }
    case "object": {
      const properties = (s.properties ?? {}) as Record<string, unknown>;
      const requiredProps = (s.required ?? []) as string[];
      const props: Record<string, TSchema> = {};

      for (const [key, propSchema] of Object.entries(properties)) {
        props[key] = jsonSchemaToTypebox(propSchema, requiredProps.includes(key)) as TSchema;
      }

      result = Type.Object(props as TProperties, { description });
      break;
    }
    default:
      result = Type.Unknown({ description });
  }

  return required ? result : Type.Optional(result as TSchema);
}

/**
 * Convert MCP input schema to TypeBox parameters
 */
function mcpSchemaToTypebox(inputSchema: McpTool["inputSchema"]): TObject<TProperties> {
  const properties = inputSchema.properties ?? {};
  const required = inputSchema.required ?? [];

  const props: Record<string, unknown> = {};

  for (const [key, propSchema] of Object.entries(properties)) {
    props[key] = jsonSchemaToTypebox(propSchema, required.includes(key));
  }

  return Type.Object(props as TProperties);
}

/**
 * Wrap an MCP tool as a Clawdbot tool
 */
export function wrapMcpTool(mcpTool: McpTool, client: RubeMcpClient): ClawdbotTool {
  const toolName = `rube_${mcpTool.name.toLowerCase().replace(/[^a-z0-9]/g, "_")}`;

  return {
    name: toolName,
    description: mcpTool.description ?? `Rube MCP tool: ${mcpTool.name}`,
    parameters: mcpSchemaToTypebox(mcpTool.inputSchema),

    async execute(_id: string, params: Record<string, unknown>) {
      const result = await client.callTool(mcpTool.name, params);

      // Convert MCP response to Clawdbot tool response
      const textContent = result.content
        .filter((c) => c.type === "text" && typeof c.text === "string")
        .map((c) => c.text as string)
        .join("\n");

      if (result.isError) {
        throw new Error(textContent || "Rube tool execution failed");
      }

      return {
        content: [{ type: "text", text: textContent || JSON.stringify(result.content) }],
      };
    },
  };
}

/**
 * Wrap all MCP tools from a client as Clawdbot tools
 */
export async function wrapAllMcpTools(client: RubeMcpClient): Promise<ClawdbotTool[]> {
  const mcpTools = await client.listTools();
  return mcpTools.map((tool) => wrapMcpTool(tool, client));
}

/**
 * Normalize tool name to be a valid identifier (alphanumeric + underscores)
 */
function normalizeToolName(name: string): string {
  return name.toUpperCase().replace(/[^A-Z0-9]/g, "_");
}

/**
 * Wrap a cached MCP tool definition, creating a client lazily on execute
 */
export function wrapCachedMcpTool(
  cachedTool: CachedMcpTool,
  getCredentials: () => RubeOAuthCredentials | null,
  onCredentialsRefreshed?: (creds: RubeOAuthCredentials) => Promise<void>,
): ClawdbotTool {
  const toolName = `mcp__rube__${normalizeToolName(cachedTool.name)}`;

  return {
    name: toolName,
    description: cachedTool.description ?? `Rube MCP tool: ${cachedTool.name}`,
    parameters: mcpSchemaToTypebox(cachedTool.inputSchema),

    async execute(_id: string, params: Record<string, unknown>) {
      const credentials = getCredentials();
      if (!credentials) {
        throw new Error("Rube MCP: Not authenticated. Run 'clawdbot rube login' first.");
      }

      const client = new RubeMcpClientClass({
        credentials,
        onCredentialsRefreshed,
      });

      try {
        const result = await client.callTool(cachedTool.name, params);

        const textContent = result.content
          .filter((c) => c.type === "text" && typeof c.text === "string")
          .map((c) => c.text as string)
          .join("\n");

        if (result.isError) {
          throw new Error(textContent || "Rube tool execution failed");
        }

        return {
          content: [{ type: "text", text: textContent || JSON.stringify(result.content) }],
        };
      } finally {
        await client.close();
      }
    },
  };
}

/**
 * Wrap all cached MCP tool definitions as Clawdbot tools
 */
export function wrapCachedMcpTools(
  cachedTools: CachedMcpTool[],
  getCredentials: () => RubeOAuthCredentials | null,
  onCredentialsRefreshed?: (creds: RubeOAuthCredentials) => Promise<void>,
): ClawdbotTool[] {
  return cachedTools.map((tool) =>
    wrapCachedMcpTool(tool, getCredentials, onCredentialsRefreshed)
  );
}

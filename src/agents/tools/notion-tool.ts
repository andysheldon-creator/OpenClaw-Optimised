import { Type } from "@sinclair/typebox";
import type { OpenClawConfig } from "../../config/config.js";
import type { AnyAgentTool } from "./common.js";
import { readStringParam } from "./common.js";

const NotionToolSchema = Type.Object({
  action: Type.Union(
    [
      Type.Literal("search"),
      Type.Literal("getPage"),
      Type.Literal("createPage"),
      Type.Literal("updatePage"),
      Type.Literal("query"),
    ],
    { description: "API action to perform" },
  ),
  query: Type.Optional(Type.String({ description: "Search query or filter" })),
  pageId: Type.Optional(Type.String({ description: "Page or database ID" })),
  parentId: Type.Optional(Type.String({ description: "Parent page/database ID for creation" })),
  title: Type.Optional(Type.String({ description: "Page title" })),
  content: Type.Optional(Type.String({ description: "Page content (markdown)" })),
  properties: Type.Optional(Type.String({ description: "JSON properties for database items" })),
});

const NOTION_VERSION = "2025-09-03";

async function notionRequest(
  endpoint: string,
  apiKey: string,
  method: "GET" | "POST" | "PATCH" = "GET",
  body?: unknown,
): Promise<unknown> {
  const response = await fetch(`https://api.notion.com/v1${endpoint}`, {
    method,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Notion-Version": NOTION_VERSION,
      "Content-Type": "application/json",
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Notion API error (${response.status}): ${error}`);
  }

  return response.json();
}

export function createNotionTool(_opts?: { config?: OpenClawConfig }): AnyAgentTool {
  return {
    label: "Notion",
    name: "notion",
    description:
      "Interact with Notion API. Actions: search, getPage, createPage, updatePage, query. " +
      "API key is handled securely server-side.",
    parameters: NotionToolSchema,
    execute: async (_toolCallId, args) => {
      const params = args as Record<string, unknown>;
      const action = readStringParam(params, "action", { required: true });

      // Get API key from environment (server-side only)
      const apiKey = process.env.NOTION_API_KEY;
      if (!apiKey) {
        return {
          content: [{ type: "text", text: "Notion API key not configured. Set NOTION_API_KEY." }],
          details: { error: "missing_api_key" },
        };
      }

      try {
        let result: unknown;

        switch (action) {
          case "search": {
            const query = readStringParam(params, "query") || "";
            result = await notionRequest("/search", apiKey, "POST", { query });
            break;
          }
          case "getPage": {
            const pageId = readStringParam(params, "pageId", { required: true });
            result = await notionRequest(`/pages/${pageId}`, apiKey);
            break;
          }
          case "createPage": {
            const parentId = readStringParam(params, "parentId", { required: true });
            const title = readStringParam(params, "title", { required: true });
            const content = readStringParam(params, "content");

            const body: Record<string, unknown> = {
              parent: { page_id: parentId },
              properties: {
                title: { title: [{ text: { content: title } }] },
              },
            };

            if (content) {
              body.children = [
                {
                  object: "block",
                  type: "paragraph",
                  paragraph: { rich_text: [{ text: { content } }] },
                },
              ];
            }

            result = await notionRequest("/pages", apiKey, "POST", body);
            break;
          }
          case "updatePage": {
            const pageId = readStringParam(params, "pageId", { required: true });
            const properties = readStringParam(params, "properties");
            const body = properties ? JSON.parse(properties) : {};
            result = await notionRequest(`/pages/${pageId}`, apiKey, "PATCH", { properties: body });
            break;
          }
          case "query": {
            const pageId = readStringParam(params, "pageId", { required: true });
            const query = readStringParam(params, "query");
            const body = query ? JSON.parse(query) : {};
            result = await notionRequest(`/databases/${pageId}/query`, apiKey, "POST", body);
            break;
          }
          default:
            return {
              content: [{ type: "text", text: `Unknown action: ${action}` }],
              details: { error: "unknown_action" },
            };
        }

        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
          details: { action, success: true },
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return {
          content: [{ type: "text", text: `Notion error: ${message}` }],
          details: { action, error: message },
        };
      }
    },
  };
}

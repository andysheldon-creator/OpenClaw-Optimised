import type { AgentTool, AgentToolResult } from "@mariozechner/pi-agent-core";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import {
  StdioClientTransport,
  getDefaultEnvironment,
} from "@modelcontextprotocol/sdk/client/stdio.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import crypto from "node:crypto";
import type { OpenClawConfig } from "../config/config.js";
import type { McpServerConfig, McpServersConfig } from "../config/types.mcp.js";
import { normalizeToolName } from "../agents/tool-policy.js";
import { logDebug, logInfo, logWarn } from "../logger.js";
import { resolveEffectiveMcpServers, isMcpServerEnabled } from "./resolve.js";

// NOTE: We keep these tool objects compatible with Pi Agent runtime and
// Claude Agent SDK tool bridging (via the existing MCP server bridge).

export type AnyAgentTool = AgentTool<any, unknown>;

export type McpRemoteToolDef = {
  name: string;
  description?: string;
  // MCP SDK returns JSON Schema objects.
  inputSchema: Record<string, unknown>;
  outputSchema?: Record<string, unknown>;
};

type McpCallResult = {
  content: Array<Record<string, unknown>>;
  isError?: boolean;
};

function stableStringify(value: unknown): string {
  if (value === null || value === undefined) {
    return String(value);
  }
  const t = typeof value;
  if (t === "string") {
    return JSON.stringify(value);
  }
  if (t === "number" || t === "boolean") {
    return JSON.stringify(value);
  }
  if (t !== "object") {
    // Handles bigint, symbol, function
    return JSON.stringify(
      typeof value === "bigint"
        ? value.toString()
        : String(value as string | symbol | ((...args: unknown[]) => unknown)),
    );
  }

  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(",")}]`;
  }

  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).toSorted();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`).join(",")}}`;
}

function stableHash(value: unknown): string {
  return crypto.createHash("sha256").update(stableStringify(value)).digest("hex");
}

function normalizeToolComponent(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function mcpPiToolName(serverId: string, toolName: string): string {
  const s = normalizeToolComponent(serverId) || "server";
  const t = normalizeToolComponent(toolName) || "tool";
  return `mcp__${s}__${t}`;
}

function detectAuthRequired(server: McpServerConfig): boolean {
  // HTTP or SSE transports use headers
  if ("headers" in server && server.headers) {
    const headerEntries = Object.entries(server.headers).filter(
      (e): e is [string, string] => typeof e[0] === "string" && typeof e[1] === "string",
    );
    if (headerEntries.length > 0) {
      return true;
    }
  }
  // STDIO transport uses environment variables
  if ("env" in server && server.env) {
    const envEntries = Object.entries(server.env).filter(
      (e): e is [string, string] => typeof e[0] === "string" && typeof e[1] === "string",
    );
    if (envEntries.length > 0) {
      return true;
    }
  }
  return false;
}

function getTransportHint(server: McpServerConfig): string {
  if (server.transport === "http") {
    return "[HTTP]";
  } else if (server.transport === "sse") {
    return "[SSE]";
  } else if (server.transport === "stdio") {
    return "[Local]";
  }
  return "[Unknown]";
}

function buildEnhancedDescription(
  originalDescription: string,
  server: McpServerConfig,
  serverLabel: string = "MCP Server",
): string {
  const hint = getTransportHint(server);
  const authHint = detectAuthRequired(server) ? "[Requires Auth]" : "";

  const parts = [hint];
  if (authHint) {
    parts.push(authHint);
  }

  const description = originalDescription || "Tool";
  parts.push(`${description} (via ${serverLabel})`);

  return parts.join(" ");
}

function enhanceParameterDescription(schema: Record<string, unknown>): string {
  // Preserve existing description
  if (typeof schema.description === "string" && schema.description.trim()) {
    return schema.description;
  }

  // Build description from type and enum
  const parts: string[] = [];

  if (typeof schema.type === "string") {
    parts.push(schema.type);
  }

  if (Array.isArray(schema.enum) && schema.enum.length > 0) {
    const enumValues = schema.enum.map((v) => JSON.stringify(v)).join(", ");
    parts.push(`values: ${enumValues}`);
  }

  return parts.join("; ") || "Parameter";
}

function coerceHeaders(headers: Record<string, string> | undefined): HeadersInit | undefined {
  if (!headers) {
    return undefined;
  }
  const entries = Object.entries(headers).filter(
    (e): e is [string, string] => typeof e[0] === "string" && typeof e[1] === "string",
  );
  if (entries.length === 0) {
    return undefined;
  }
  return Object.fromEntries(entries);
}

/**
 * Detects if a server config requires authentication based on headers or environment
 */
function detectAuthRequired(server: McpServerConfig): boolean {
  // Check for auth headers (SSE and HTTP transports have headers)
  if ("headers" in server && server.headers && typeof server.headers === "object") {
    const headers = server.headers as Record<string, unknown>;
    const authKeys = ["authorization", "x-api-key", "x-auth-token", "token", "apikey"];
    return authKeys.some((key) =>
      Object.keys(headers).some((h) => h.toLowerCase().includes(key.toLowerCase())),
    );
  }

  // Check for auth-related environment variables (STDIO transport has env)
  if ("env" in server && server.env && typeof server.env === "object") {
    const env = server.env as Record<string, unknown>;
    const authKeys = ["token", "key", "secret", "password", "api_key", "auth"];
    return authKeys.some((key) =>
      Object.keys(env).some((e) => e.toLowerCase().includes(key.toLowerCase())),
    );
  }

  return false;
}

/**
 * Gets the transport type hint for a server config
 */
function getTransportHint(server: McpServerConfig): string {
  const transport = typeof server.transport === "string" ? server.transport : "stdio";
  if (transport === "http") return "[HTTP]";
  if (transport === "sse") return "[SSE]";
  return "[Local]"; // stdio
}

/**
 * Builds an enhanced tool description with context about the server and requirements
 */
function buildEnhancedDescription(
  toolName: string,
  toolDescription: string | undefined,
  serverId: string,
  serverLabel: string | undefined,
  server: McpServerConfig,
): string {
  const hasDescription = toolDescription && toolDescription.trim().length > 0;
  const baseDesc = hasDescription
    ? toolDescription.trim()
    : toolName.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

  const hints: string[] = [];

  // Add transport type hint for remote servers
  const transport = typeof server.transport === "string" ? server.transport : "stdio";
  if (transport === "http" || transport === "sse") {
    hints.push(getTransportHint(server));
  }

  // Add auth requirement hint
  if (detectAuthRequired(server)) {
    hints.push("[Requires Auth]");
  }

  const prefix = hints.length > 0 ? `${hints.join(" ")} ` : "";
  const serverRef = serverLabel?.trim() ? `via ${serverLabel}` : `via mcp:${serverId}`;

  return `${prefix}${baseDesc} (${serverRef})`;
}

/**
 * Enhances parameter descriptions with type information when missing
 */
function enhanceParameterDescription(
  param: Record<string, unknown>,
  paramName: string,
): Record<string, unknown> {
  if (typeof param.description === "string" && param.description.trim().length > 0) {
    // Already has a description
    return param;
  }

  // Add a minimal description based on parameter name and type
  const type = param.type || "unknown";
  const enhanced = { ...param };
  const displayName = paramName.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  enhanced.description = `${displayName} (${type})`;

  return enhanced;
}

function stringifyToolResultContent(
  block: Record<string, unknown>,
): AgentToolResult<unknown>["content"][number] {
  const type = typeof block.type === "string" ? block.type : "";

  if (type === "text") {
    return { type: "text", text: typeof block.text === "string" ? block.text : "" };
  }

  if (type === "image") {
    const data = typeof block.data === "string" ? block.data : "";
    const mimeType = typeof block.mimeType === "string" ? block.mimeType : "image/png";
    return { type: "image", data, mimeType };
  }

  // Unsupported content kinds in Pi tool results: audio/resource.
  // We preserve them as text so the model can still see useful output.
  if (type === "audio") {
    const mimeType = typeof block.mimeType === "string" ? block.mimeType : "audio/mpeg";
    return {
      type: "text",
      text: `[MCP audio content: ${mimeType} (${typeof block.data === "string" ? block.data.length : 0} base64 chars)]`,
    };
  }

  if (type === "resource") {
    const resource = (block.resource ?? {}) as Record<string, unknown>;
    const uri = typeof resource.uri === "string" ? resource.uri : "";
    const text = typeof resource.text === "string" ? resource.text : undefined;
    const blob = typeof resource.blob === "string" ? resource.blob : undefined;
    return {
      type: "text",
      text: text ?? (blob ? `[MCP resource blob: ${uri} (${blob.length} base64 chars)]` : uri),
    };
  }

  return { type: "text", text: JSON.stringify(block, null, 2) };
}

class McpConnection {
  readonly serverId: string;
  readonly server: McpServerConfig;

  private client: Client | null = null;
  private transport:
    | StdioClientTransport
    | SSEClientTransport
    | StreamableHTTPClientTransport
    | null = null;

  private connectPromise: Promise<void> | null = null;

  constructor(params: { serverId: string; server: McpServerConfig }) {
    this.serverId = params.serverId;
    this.server = params.server;
  }

  async connect(): Promise<void> {
    if (this.connectPromise) {
      return this.connectPromise;
    }

    this.connectPromise = (async () => {
      const transportType = (this.server as any).transport ?? "stdio";

      const client = new Client({
        name: `openclaw-mcp-${this.serverId}`,
        version: "1.0.0",
      });

      if (transportType === "sse") {
        const url = new URL((this.server as any).url);
        const headers = coerceHeaders((this.server as any).headers);
        const requestInit = headers ? ({ headers } as RequestInit) : undefined;
        // SSE transport uses EventSource for receive + POST for send.
        this.transport = new SSEClientTransport(url, {
          requestInit,
          eventSourceInit: headers ? ({ headers } as any) : undefined,
        });
      } else if (transportType === "http") {
        const url = new URL((this.server as any).url);
        const headers = coerceHeaders((this.server as any).headers);
        const requestInit = headers ? ({ headers } as RequestInit) : undefined;
        this.transport = new StreamableHTTPClientTransport(url, {
          requestInit,
        });
      } else {
        const env = (this.server as any).env as Record<string, string> | undefined;
        const mergedEnv = env ? { ...getDefaultEnvironment(), ...env } : undefined;
        this.transport = new StdioClientTransport({
          command: (this.server as any).command,
          args: (this.server as any).args,
          cwd: (this.server as any).cwd,
          env: mergedEnv,
          stderr: (this.server as any).stderr,
        });
      }

      this.client = client;
      await client.connect(this.transport);
    })();

    return this.connectPromise;
  }

  async listTools(signal?: AbortSignal): Promise<McpRemoteToolDef[]> {
    await this.connect();
    if (!this.client) {
      throw new Error("MCP client missing");
    }
    const res = await this.client.listTools(undefined, { signal });
    return (res.tools ?? []) as unknown as McpRemoteToolDef[];
  }

  async callTool(params: {
    toolName: string;
    args: Record<string, unknown>;
    signal?: AbortSignal;
  }): Promise<McpCallResult> {
    await this.connect();
    if (!this.client) {
      throw new Error("MCP client missing");
    }
    const res = await this.client.callTool(
      {
        name: params.toolName,
        arguments: params.args,
      },
      undefined,
      { signal: params.signal },
    );
    return res as unknown as McpCallResult;
  }

  async close(): Promise<void> {
    try {
      await this.transport?.close();
    } catch {
      // ignore
    }
    this.transport = null;
    this.client = null;
    this.connectPromise = null;
  }
}

type AgentMcpState = {
  /** Hash of the effective mcpServers config for this agent. */
  configHash: string;
  servers: McpServersConfig;
  connections: Map<string, McpConnection>;
  toolsPromise: Promise<AnyAgentTool[]> | null;
};

const agentStates = new Map<string, AgentMcpState>();

function ensureAgentState(agentId: string, servers: McpServersConfig): AgentMcpState {
  const id = agentId.trim().toLowerCase() || "main";
  const configHash = stableHash(servers);

  const existing = agentStates.get(id);
  if (existing && existing.configHash === configHash) {
    return existing;
  }

  // Config changed: close existing connections and replace.
  if (existing) {
    void Promise.all(Array.from(existing.connections.values()).map((c) => c.close())).catch(() => {
      // ignore
    });
  }

  const state: AgentMcpState = {
    configHash,
    servers,
    connections: new Map(),
    toolsPromise: null,
  };
  agentStates.set(id, state);
  return state;
}

function getOrCreateConnection(state: AgentMcpState, serverId: string): McpConnection {
  const existing = state.connections.get(serverId);
  if (existing) {
    return existing;
  }
  const server = state.servers[serverId];
  if (!server) {
    throw new Error(`Unknown MCP server: ${serverId}`);
  }
  const conn = new McpConnection({ serverId, server });
  state.connections.set(serverId, conn);
  return conn;
}

function buildMcpPiTool(params: {
  agentId: string;
  serverId: string;
  serverLabel?: string;
  tool: McpRemoteToolDef;
  connection: McpConnection;
  serverConfig?: McpServerConfig;
}): AnyAgentTool {
  const rawName = mcpPiToolName(params.serverId, params.tool.name);
  const normalizedName = normalizeToolName(rawName);
  const labelPrefix = params.serverLabel?.trim() || params.serverId;
  const label = `mcp:${labelPrefix}:${params.tool.name}`;

  // The Pi Agent runtime expects TypeBox-style JSON schema objects.
  // MCP servers return JSON Schema; this is compatible enough for our tool
  // validation + provider schema normalization pipeline.
  let parameters = (params.tool.inputSchema ?? { type: "object" }) as any;

  // Phase #2: Enhance parameter descriptions
  if (parameters.properties && typeof parameters.properties === "object") {
    const enhanced: Record<string, unknown> = {};
    for (const [paramName, paramDef] of Object.entries(parameters.properties)) {
      if (paramDef && typeof paramDef === "object") {
        enhanced[paramName] = enhanceParameterDescription(
          paramDef as Record<string, unknown>,
          paramName,
        );
      }
    }
    parameters = { ...parameters, properties: enhanced };
  }

  // Build enhanced description with server context and auth hints
  const enhancedDescription = params.serverConfig
    ? buildEnhancedDescription(
        params.tool.name,
        params.tool.description,
        params.serverId,
        params.serverLabel,
        params.serverConfig,
      )
    : (params.tool.description ?? `MCP tool: ${params.tool.name}`);

  // Build enhanced description when serverConfig is provided
  const description = params.serverConfig
    ? buildEnhancedDescription(
        params.tool.description || "",
        params.serverConfig,
        params.serverLabel || params.serverId,
      )
    : (params.tool.description ?? `MCP tool: ${params.tool.name}`);

  const execute: AnyAgentTool["execute"] = async (toolCallId, toolParams, signal) => {
    const result = await params.connection.callTool({
      toolName: params.tool.name,
      args: (toolParams ?? {}) as Record<string, unknown>,
      signal,
    });

    const blocks = Array.isArray(result.content) ? result.content : [];

    if (result.isError) {
      const text = blocks
        .map((b) => (typeof b.text === "string" ? b.text : ""))
        .filter(Boolean)
        .join("\n")
        .trim();
      // Phase #2: Enhanced error message with more context
      const errorMsg =
        text || `MCP tool failed: ${params.serverLabel || params.serverId}/${params.tool.name}`;
      throw new Error(errorMsg);
    }

    const content = blocks.map((b) => stringifyToolResultContent(b));

    return {
      content,
      details: {
        toolCallId,
        serverId: params.serverId,
        serverLabel: params.serverLabel,
        tool: params.tool.name,
        result,
      },
    } satisfies AgentToolResult<unknown>;
  };

  return {
    name: normalizedName,
    label,
    description: enhancedDescription,
    parameters,
    execute,
  } as AnyAgentTool;
}

export async function resolveMcpToolsForAgent(params: {
  config?: OpenClawConfig;
  agentId: string;
  abortSignal?: AbortSignal;
}): Promise<AnyAgentTool[]> {
  const servers = resolveEffectiveMcpServers({ config: params.config, agentId: params.agentId });
  const enabledServerIds = Object.entries(servers)
    .filter(([, cfg]) => isMcpServerEnabled(cfg))
    .map(([id]) => id);

  if (enabledServerIds.length === 0) {
    return [];
  }

  const state = ensureAgentState(params.agentId, servers);

  if (state.toolsPromise) {
    return state.toolsPromise;
  }

  state.toolsPromise = (async () => {
    const tools: AnyAgentTool[] = [];

    for (const serverId of enabledServerIds) {
      const server = servers[serverId];
      if (!server || !isMcpServerEnabled(server)) {
        continue;
      }

      try {
        const conn = getOrCreateConnection(state, serverId);
        const remoteTools = await conn.listTools(params.abortSignal);

        logInfo(
          `[mcp] Loaded ${remoteTools.length} tools from MCP server "${serverId}" (${(server as any).transport ?? "stdio"})`,
        );

        for (const tool of remoteTools) {
          if (!tool?.name?.trim()) {
            continue;
          }
          tools.push(
            buildMcpPiTool({
              agentId: params.agentId,
              serverId,
              serverLabel: (server as any).label,
              tool,
              connection: conn,
              serverConfig: server,
            }),
          );
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        logWarn(`[mcp] Failed to load MCP server "${serverId}": ${message}`);
        logDebug(err instanceof Error && err.stack ? err.stack : "");
      }
    }

    // Ensure stable ordering for deterministic tool lists.
    tools.sort((a, b) => a.name.localeCompare(b.name));

    // If no tools could be loaded, don't keep a cached promise forever.
    if (tools.length === 0) {
      logWarn(`[mcp] No MCP tools available for agent "${params.agentId}"`);
      state.toolsPromise = null;
    }

    return tools;
  })();

  return state.toolsPromise;
}

export async function shutdownAllMcpServers(): Promise<void> {
  const states = Array.from(agentStates.values());
  agentStates.clear();
  await Promise.all(
    states.flatMap((state) => Array.from(state.connections.values()).map((conn) => conn.close())),
  );
}

export const __testing = {
  mcpPiToolName,
  normalizeToolComponent,
  stringifyToolResultContent,
  stableStringify,
  stableHash,
  buildMcpPiTool,
  McpConnection,
  agentStates,
  ensureAgentState,
  getOrCreateConnection,
  detectAuthRequired,
  getTransportHint,
  buildEnhancedDescription,
  enhanceParameterDescription,
};

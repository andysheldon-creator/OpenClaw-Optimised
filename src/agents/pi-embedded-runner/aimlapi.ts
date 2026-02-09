import type { AgentMessage, AgentTool } from "@mariozechner/pi-agent-core";
import type { SessionManager } from "@mariozechner/pi-coding-agent";
import type { TSchema } from "@sinclair/typebox";
import { log } from "./logger.js";

const AIMLAPI_UNSUPPORTED_SCHEMA_KEYWORDS = new Set([
  "anyOf",
  "oneOf",
  "allOf",
  "patternProperties",
  "additionalProperties",
  "$schema",
  "$id",
  "$ref",
  "$defs",
  "definitions",
  "examples",
  "minLength",
  "maxLength",
  "minimum",
  "maximum",
  "multipleOf",
  "pattern",
  "format",
  "minItems",
  "maxItems",
  "uniqueItems",
  "minProperties",
  "maxProperties",
]);

function shouldLogAimlapiDiagnostics(): boolean {
  const value = process.env.OPENCLAW_AIMLAPI_DEBUG_LOG?.trim().toLowerCase();
  return value === "1" || value === "true" || value === "yes" || value === "on";
}

function logAimlapiWarn(message: string, meta?: Record<string, unknown>) {
  if (!shouldLogAimlapiDiagnostics()) {
    return;
  }
  log.warn(message, meta);
}

function logAimlapiInfo(message: string, meta?: Record<string, unknown>) {
  if (!shouldLogAimlapiDiagnostics()) {
    return;
  }
  log.info(message, meta);
}
type SchemaSanitizeStats = {
  removedKeywords: string[];
  flattenedUnionPaths: string[];
  normalizedTypeArrayPaths: string[];
  normalizedRootToObject: boolean;
};

function createSchemaSanitizeStats(): SchemaSanitizeStats {
  return {
    removedKeywords: [],
    flattenedUnionPaths: [],
    normalizedTypeArrayPaths: [],
    normalizedRootToObject: false,
  };
}

function toRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

function stringifyUnknown(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }
  if (
    typeof value === "number" ||
    typeof value === "boolean" ||
    typeof value === "bigint" ||
    typeof value === "symbol"
  ) {
    return String(value);
  }
  if (value === null || value === undefined) {
    return "";
  }
  try {
    return JSON.stringify(value);
  } catch {
    return "";
  }
}
function extractLiteralEnum(variants: unknown[]): { type?: string; enum: unknown[] } | null {
  if (variants.length === 0) {
    return null;
  }
  const out: unknown[] = [];
  let commonType: string | undefined;
  for (const variant of variants) {
    const record = toRecord(variant);
    if (!record) {
      return null;
    }
    let literal: unknown;
    if ("const" in record) {
      literal = record.const;
    } else if (Array.isArray(record.enum) && record.enum.length === 1) {
      literal = record.enum[0];
    } else {
      return null;
    }
    out.push(literal);
    if (typeof record.type === "string") {
      commonType = commonType ?? record.type;
      if (commonType !== record.type) {
        commonType = undefined;
      }
    }
  }
  if (out.length === 0) {
    return null;
  }
  return { ...(commonType ? { type: commonType } : {}), enum: out };
}

function cleanAimlapiSchema(
  schema: unknown,
  stats: SchemaSanitizeStats,
  path = "parameters",
  depth = 0,
): unknown {
  if (!schema || typeof schema !== "object") {
    return schema;
  }
  if (Array.isArray(schema)) {
    return schema.map((entry, index) =>
      cleanAimlapiSchema(entry, stats, `${path}[${index}]`, depth + 1),
    );
  }

  const source = schema as Record<string, unknown>;
  const cleaned: Record<string, unknown> = {};

  const union =
    (Array.isArray(source.anyOf) && source.anyOf) ||
    (Array.isArray(source.oneOf) && source.oneOf) ||
    null;
  if (union) {
    const flattened = extractLiteralEnum(union);
    if (flattened) {
      stats.flattenedUnionPaths.push(path);
      if (typeof source.description === "string") {
        cleaned.description = source.description;
      }
      if (typeof source.title === "string") {
        cleaned.title = source.title;
      }
      if (flattened.type) {
        cleaned.type = flattened.type;
      }
      cleaned.enum = flattened.enum;
      return cleaned;
    }
  }

  for (const [key, value] of Object.entries(source)) {
    if (AIMLAPI_UNSUPPORTED_SCHEMA_KEYWORDS.has(key)) {
      stats.removedKeywords.push(`${path}.${key}`);
      continue;
    }
    if (key === "type" && Array.isArray(value)) {
      const normalized = value.filter((entry) => entry !== "null");
      if (normalized.length === 1 && typeof normalized[0] === "string") {
        cleaned.type = normalized[0];
        stats.normalizedTypeArrayPaths.push(path);
      }
      continue;
    }
    if (key === "properties") {
      const props = toRecord(value);
      if (!props) {
        continue;
      }
      const nextProps: Record<string, unknown> = {};
      for (const [propKey, propValue] of Object.entries(props)) {
        nextProps[propKey] = cleanAimlapiSchema(
          propValue,
          stats,
          `${path}.properties.${propKey}`,
          depth + 1,
        );
      }
      cleaned.properties = nextProps;
      continue;
    }
    if (key === "items") {
      cleaned.items = cleanAimlapiSchema(value, stats, `${path}.items`, depth + 1);
      continue;
    }
    if (key === "required" && Array.isArray(value)) {
      cleaned.required = value.filter((entry): entry is string => typeof entry === "string");
      continue;
    }
    cleaned[key] = cleanAimlapiSchema(value, stats, `${path}.${key}`, depth + 1);
  }

  if (depth === 0) {
    const properties = toRecord(cleaned.properties) ?? {};
    const required = Array.isArray(cleaned.required)
      ? cleaned.required.filter((key): key is string => key in properties)
      : [];
    stats.normalizedRootToObject = true;
    return {
      type: "object",
      properties,
      ...(required.length > 0 ? { required } : {}),
    };
  }

  return cleaned;
}

function summarizeStats(stats: SchemaSanitizeStats) {
  return {
    removedKeywordCount: stats.removedKeywords.length,
    removedKeywordPaths: stats.removedKeywords.slice(0, 20),
    flattenedUnionCount: stats.flattenedUnionPaths.length,
    flattenedUnionPaths: stats.flattenedUnionPaths.slice(0, 20),
    normalizedTypeArrayCount: stats.normalizedTypeArrayPaths.length,
    normalizedTypeArrayPaths: stats.normalizedTypeArrayPaths.slice(0, 20),
    normalizedRootToObject: stats.normalizedRootToObject,
  };
}

export function sanitizeToolsForAimlapi<
  TSchemaType extends TSchema = TSchema,
  TResult = unknown,
>(params: {
  tools: AgentTool<TSchemaType, TResult>[];
  provider: string;
}): AgentTool<TSchemaType, TResult>[] {
  if (params.provider !== "aimlapi") {
    return params.tools;
  }

  let transformedTools = 0;
  const normalizedTools = params.tools.map((tool) => {
    const stats = createSchemaSanitizeStats();
    const cleaned = cleanAimlapiSchema(tool.parameters, stats);
    const summary = summarizeStats(stats);
    if (
      summary.removedKeywordCount > 0 ||
      summary.flattenedUnionCount > 0 ||
      summary.normalizedTypeArrayCount > 0
    ) {
      transformedTools += 1;
      logAimlapiWarn("aimlapi tools: schema transformed for compatibility", {
        tool: tool.name,
        ...summary,
      });
    }
    return { ...tool, parameters: cleaned as TSchemaType };
  });

  if (transformedTools > 0) {
    logAimlapiWarn("aimlapi tools: completed schema compatibility pass", {
      transformedTools,
      totalTools: params.tools.length,
    });
  }

  return normalizedTools;
}

function rewriteAssistantNullContentInMessages(params: {
  provider: string;
  messages: unknown[];
  source: string;
}): number {
  if (params.provider !== "aimlapi") {
    return 0;
  }
  let replaced = 0;
  for (const [index, entry] of params.messages.entries()) {
    if (!entry || typeof entry !== "object") {
      continue;
    }
    const record = entry as Record<string, unknown>;
    if (record.role !== "assistant" || record.content !== null) {
      continue;
    }
    record.content = "";
    replaced += 1;
    logAimlapiWarn("aimlapi message normalization: rewrote assistant null content", {
      source: params.source,
      index,
      hasToolCalls: Array.isArray(record.tool_calls),
    });
  }
  if (replaced > 0) {
    logAimlapiWarn("aimlapi message normalization: rewrite summary", {
      source: params.source,
      replaced,
      totalMessages: params.messages.length,
    });
  }
  return replaced;
}

export function normalizeAimlapiPayloadNullContent(params: {
  provider: string;
  payload: unknown;
}): { replacedCount: number } {
  if (params.provider !== "aimlapi") {
    return { replacedCount: 0 };
  }
  if (!params.payload || typeof params.payload !== "object") {
    return { replacedCount: 0 };
  }
  const payload = params.payload as { messages?: unknown };
  if (!Array.isArray(payload.messages)) {
    return { replacedCount: 0 };
  }
  const replacedCount = rewriteAssistantNullContentInMessages({
    provider: params.provider,
    messages: payload.messages,
    source: "outbound_payload",
  });
  return { replacedCount };
}

export function normalizeAimlapiAssistantNullContent(params: {
  provider: string;
  messages: AgentMessage[];
}): { messages: AgentMessage[]; replacedCount: number } {
  if (params.provider !== "aimlapi") {
    return { messages: params.messages, replacedCount: 0 };
  }
  let replacedCount = 0;
  const nextMessages = params.messages.map((message, index) => {
    if (message.role !== "assistant") {
      return message;
    }
    const assistantMessage = message as AgentMessage & {
      content?: unknown;
      toolCalls?: unknown;
    };
    if (assistantMessage.content !== null) {
      return message;
    }
    replacedCount += 1;
    logAimlapiWarn(
      "aimlapi message normalization: replacing assistant null content with empty string",
      {
        index,
        hasToolCalls: Array.isArray((assistantMessage as { toolCalls?: unknown }).toolCalls),
      },
    );
    return {
      ...assistantMessage,
      content: "",
    } as AgentMessage;
  });

  if (replacedCount > 0) {
    logAimlapiWarn("aimlapi message normalization: replaced assistant null content entries", {
      replacedCount,
      totalMessages: params.messages.length,
    });
  }

  return { messages: nextMessages, replacedCount };
}

export function isAimlapiInvalidToolSchemaError(errorText: string): boolean {
  const normalized = errorText.toLowerCase();
  const hasSchemaSignal =
    normalized.includes("tool schema") ||
    normalized.includes("invalid payload provided") ||
    normalized.includes("invalid function parameters") ||
    normalized.includes("invalid tools");
  const detected =
    (normalized.includes("aimlapi") && normalized.includes("invalid") && hasSchemaSignal) ||
    (normalized.includes("http 400") && hasSchemaSignal) ||
    hasSchemaSignal;
  return detected;
}

export function formatAimlapiToolSchemaError(errorText: string): string {
  const trimmed = errorText.trim();
  if (!trimmed) {
    return "AIMLAPI rejected the tool schema. The schema was sanitized to the supported subset; please retry.";
  }
  return `AIMLAPI rejected the tool schema (HTTP 400). Detailed server response:\n${trimmed}`;
}

export function rollbackFailedAimlapiPrompt(params: {
  provider: string;
  promptError: unknown;
  sessionManager: SessionManager;
  activeMessages: { role?: unknown }[];
  runId: string;
  sessionId: string;
  replaceMessages: (messages: AgentMessage[]) => void;
}): boolean {
  if (params.provider !== "aimlapi") {
    return false;
  }
  const errorText = stringifyUnknown(params.promptError);
  if (!isAimlapiInvalidToolSchemaError(errorText)) {
    return false;
  }

  logAimlapiWarn("aimlapi invalid schema: attempting prompt rollback", {
    runId: params.runId,
    sessionId: params.sessionId,
    activeMessages: params.activeMessages.length,
  });

  const leafEntry = params.sessionManager.getLeafEntry();
  if (leafEntry?.type === "message" && leafEntry.message.role === "user") {
    if (leafEntry.parentId) {
      logAimlapiInfo("aimlapi invalid schema: rolling back by branching to parent", {
        runId: params.runId,
        sessionId: params.sessionId,
        parentId: leafEntry.parentId,
      });
      params.sessionManager.branch(leafEntry.parentId);
    } else {
      logAimlapiInfo("aimlapi invalid schema: rolling back by resetting leaf", {
        runId: params.runId,
        sessionId: params.sessionId,
      });
      params.sessionManager.resetLeaf();
    }
    const sessionContext = params.sessionManager.buildSessionContext();
    params.replaceMessages(sessionContext.messages);
    logAimlapiWarn("aimlapi invalid schema: removed failed prompt turn from persisted history", {
      runId: params.runId,
      sessionId: params.sessionId,
      nextMessages: sessionContext.messages.length,
    });
    return true;
  }

  if (params.activeMessages[params.activeMessages.length - 1]?.role === "user") {
    params.replaceMessages(params.activeMessages.slice(0, -1) as AgentMessage[]);
    logAimlapiWarn("aimlapi invalid schema: trimmed last transient user turn in memory", {
      runId: params.runId,
      sessionId: params.sessionId,
      nextMessages: Math.max(0, params.activeMessages.length - 1),
    });
    return true;
  }

  logAimlapiWarn("aimlapi invalid schema: rollback attempted but no removable user turn found", {
    runId: params.runId,
    sessionId: params.sessionId,
    activeMessages: params.activeMessages.length,
    leafType: leafEntry?.type,
    leafRole:
      leafEntry?.type === "message"
        ? (leafEntry.message as { role?: unknown } | undefined)?.role
        : undefined,
  });

  return false;
}

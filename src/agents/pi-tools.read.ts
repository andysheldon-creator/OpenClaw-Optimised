import type { AgentToolResult } from "@mariozechner/pi-agent-core";
import { createEditTool, createReadTool, createWriteTool } from "@mariozechner/pi-coding-agent";
import type { AnyAgentTool } from "./pi-tools.types.js";
import { logDebug } from "../logger.js";
import { detectMime } from "../media/mime.js";
import { assertSandboxPath } from "./sandbox-paths.js";
import { sanitizeToolResultImages } from "./tool-images.js";

// NOTE(steipete): Upstream read now does file-magic MIME detection; we keep the wrapper
// to normalize payloads and sanitize oversized images before they hit providers.
type ToolContentBlock = AgentToolResult<unknown>["content"][number];
type ImageContentBlock = Extract<ToolContentBlock, { type: "image" }>;
type TextContentBlock = Extract<ToolContentBlock, { type: "text" }>;

async function sniffMimeFromBase64(base64: string): Promise<string | undefined> {
  const trimmed = base64.trim();
  if (!trimmed) {
    return undefined;
  }

  const take = Math.min(256, trimmed.length);
  const sliceLen = take - (take % 4);
  if (sliceLen < 8) {
    return undefined;
  }

  try {
    const head = Buffer.from(trimmed.slice(0, sliceLen), "base64");
    return await detectMime({ buffer: head });
  } catch {
    return undefined;
  }
}

function rewriteReadImageHeader(text: string, mimeType: string): string {
  // pi-coding-agent uses: "Read image file [image/png]"
  if (text.startsWith("Read image file [") && text.endsWith("]")) {
    return `Read image file [${mimeType}]`;
  }
  return text;
}

async function normalizeReadImageResult(
  result: AgentToolResult<unknown>,
  filePath: string,
): Promise<AgentToolResult<unknown>> {
  const content = Array.isArray(result.content) ? result.content : [];

  const image = content.find(
    (b): b is ImageContentBlock =>
      !!b &&
      typeof b === "object" &&
      (b as { type?: unknown }).type === "image" &&
      typeof (b as { data?: unknown }).data === "string" &&
      typeof (b as { mimeType?: unknown }).mimeType === "string",
  );
  if (!image) {
    return result;
  }

  if (!image.data.trim()) {
    throw new Error(`read: image payload is empty (${filePath})`);
  }

  const sniffed = await sniffMimeFromBase64(image.data);
  if (!sniffed) {
    return result;
  }

  if (!sniffed.startsWith("image/")) {
    throw new Error(
      `read: file looks like ${sniffed} but was treated as ${image.mimeType} (${filePath})`,
    );
  }

  if (sniffed === image.mimeType) {
    return result;
  }

  const nextContent = content.map((block) => {
    if (block && typeof block === "object" && (block as { type?: unknown }).type === "image") {
      const b = block as ImageContentBlock & { mimeType: string };
      return { ...b, mimeType: sniffed } satisfies ImageContentBlock;
    }
    if (
      block &&
      typeof block === "object" &&
      (block as { type?: unknown }).type === "text" &&
      typeof (block as { text?: unknown }).text === "string"
    ) {
      const b = block as TextContentBlock & { text: string };
      return {
        ...b,
        text: rewriteReadImageHeader(b.text, sniffed),
      } satisfies TextContentBlock;
    }
    return block;
  });

  return { ...result, content: nextContent };
}

type RequiredParamGroup = {
  keys: readonly string[];
  allowEmpty?: boolean;
  label?: string;
};

export const CLAUDE_PARAM_GROUPS = {
  read: [{ keys: ["path", "file_path"], label: "path (path or file_path)" }],
  write: [{ keys: ["path", "file_path"], label: "path (path or file_path)" }],
  edit: [
    { keys: ["path", "file_path"], label: "path (path or file_path)" },
    {
      keys: ["oldText", "old_string"],
      label: "oldText (oldText or old_string)",
    },
    {
      keys: ["newText", "new_string"],
      label: "newText (newText or new_string)",
    },
  ],
} as const;

// Known alias pairs used by patchToolSchemaForClaudeCompatibility
// This is used as a fallback when schema-based extraction doesn't work
const KNOWN_ALIAS_PAIRS: Array<{ original: string; alias: string }> = [
  { original: "path", alias: "file_path" },
  { original: "oldText", alias: "old_string" },
  { original: "newText", alias: "new_string" },
  { original: "command", alias: "cmd" },
];

/**
 * Deep equality check for JSON Schema objects.
 * Compares type, description, and other relevant properties.
 */
function schemaDeepEqual(a: unknown, b: unknown): boolean {
  if (a === b) {
    return true;
  }
  if (!a || !b || typeof a !== "object" || typeof b !== "object") {
    return false;
  }
  const aObj = a as Record<string, unknown>;
  const bObj = b as Record<string, unknown>;

  // Compare type
  if (aObj.type !== bObj.type) {
    return false;
  }

  // Compare description (optional but useful)
  if (aObj.description !== bObj.description) {
    return false;
  }

  // For objects, compare properties recursively
  if (aObj.type === "object" && bObj.type === "object") {
    const aProps = aObj.properties as Record<string, unknown> | undefined;
    const bProps = bObj.properties as Record<string, unknown> | undefined;
    if (!aProps || !bProps) {
      return aProps === bProps;
    }
    const aKeys = Object.keys(aProps).sort();
    const bKeys = Object.keys(bProps).sort();
    if (aKeys.length !== bKeys.length) {
      return false;
    }
    for (const key of aKeys) {
      if (!schemaDeepEqual(aProps[key], bProps[key])) {
        return false;
      }
    }
    return true;
  }

  // For arrays, compare items
  if (aObj.type === "array" && bObj.type === "array") {
    return schemaDeepEqual(aObj.items, bObj.items);
  }

  // For other types, assume equal if type matches
  return true;
}

/**
 * Extracts alias mappings from a tool schema.
 *
 * When `patchToolSchemaForClaudeCompatibility` runs, it duplicates properties
 * to create aliases. For example, if `path` exists, it also adds `file_path`
 * with the same schema definition.
 *
 * This function detects such duplicates and returns a map: { alias: original }
 * (e.g., { "file_path": "path", "cmd": "command" }).
 *
 * @param tool The tool definition with a schema
 * @returns Map from alias name to original property name
 */
export function extractAliasesFromSchema(tool: AnyAgentTool): Map<string, string> {
  const aliases = new Map<string, string>();
  const schema =
    tool.parameters && typeof tool.parameters === "object"
      ? (tool.parameters as Record<string, unknown>)
      : undefined;

  if (!schema || !schema.properties || typeof schema.properties !== "object") {
    return aliases;
  }

  const properties = schema.properties as Record<string, unknown>;
  const propertyNames = Object.keys(properties);

  // Strategy 1: Detect duplicates by comparing schema definitions
  // If two properties have identical schemas, one is likely an alias
  for (let i = 0; i < propertyNames.length; i++) {
    const propA = propertyNames[i];
    const schemaA = properties[propA];

    for (let j = i + 1; j < propertyNames.length; j++) {
      const propB = propertyNames[j];
      const schemaB = properties[propB];

      if (schemaDeepEqual(schemaA, schemaB)) {
        // Both have identical schemas - determine which is the alias
        // Known pattern: aliases are typically longer (file_path vs path)
        // or use snake_case when original uses camelCase
        const aIsKnownOriginal = KNOWN_ALIAS_PAIRS.some((p) => p.original === propA);
        const bIsKnownOriginal = KNOWN_ALIAS_PAIRS.some((p) => p.original === propB);
        const aIsKnownAlias = KNOWN_ALIAS_PAIRS.some((p) => p.alias === propA);
        const bIsKnownAlias = KNOWN_ALIAS_PAIRS.some((p) => p.alias === propB);

        if (aIsKnownOriginal && bIsKnownAlias) {
          aliases.set(propB, propA);
        } else if (bIsKnownOriginal && aIsKnownAlias) {
          aliases.set(propA, propB);
        } else if (aIsKnownAlias && !bIsKnownAlias) {
          // propA is a known alias, so propB must be original
          aliases.set(propA, propB);
        } else if (bIsKnownAlias && !aIsKnownAlias) {
          // propB is a known alias, so propA must be original
          aliases.set(propB, propA);
        } else {
          // Heuristic: shorter name is usually original, longer is alias
          // Or camelCase is original, snake_case is alias
          const aIsCamelCase = /^[a-z][a-zA-Z0-9]*$/.test(propA);
          const bIsCamelCase = /^[a-z][a-zA-Z0-9]*$/.test(propB);
          if (aIsCamelCase && !bIsCamelCase) {
            aliases.set(propB, propA);
          } else if (bIsCamelCase && !aIsCamelCase) {
            aliases.set(propA, propB);
          } else if (propA.length < propB.length) {
            aliases.set(propB, propA);
          } else if (propB.length < propA.length) {
            aliases.set(propA, propB);
          }
        }
      }
    }
  }

  // Strategy 2: Use known alias pairs as fallback
  // If we didn't find duplicates but know the pattern, use it
  if (aliases.size === 0) {
    for (const { original, alias } of KNOWN_ALIAS_PAIRS) {
      if (original in properties && alias in properties) {
        aliases.set(alias, original);
      }
    }
  }

  // Diagnostic logging: show extracted aliases
  if (aliases.size > 0) {
    const aliasList = Array.from(aliases.entries())
      .map(([alias, original]) => `${alias}→${original}`)
      .join(", ");
    logDebug(
      `[schema-normalizer] Extracted ${aliases.size} alias(es) from "${tool.name}" schema: ${aliasList}`,
    );
  }

  return aliases;
}

/**
 * Normalizes tool parameters using aliases extracted from the tool schema.
 *
 * This is the schema-aware version of normalization. It extracts aliases
 * from the tool's schema (created by `patchToolSchemaForClaudeCompatibility`)
 * and uses them to normalize parameters.
 *
 * Falls back to hardcoded `normalizeToolParams` for backward compatibility
 * if schema extraction doesn't find any aliases.
 *
 * @param params The raw parameters from the model
 * @param schema The tool's parameter schema
 * @param tool Optional tool definition (used to extract aliases)
 * @returns Normalized parameters, or undefined if params are invalid
 */
export function normalizeToolParamsFromSchema(
  params: unknown,
  schema: unknown,
  tool?: AnyAgentTool,
): Record<string, unknown> | undefined {
  if (!params || typeof params !== "object") {
    return undefined;
  }

  const record = params as Record<string, unknown>;
  const normalized = { ...record };

  // Extract aliases from schema if tool is provided
  let aliases: Map<string, string> | undefined;
  if (tool) {
    aliases = extractAliasesFromSchema(tool);
  } else if (schema && typeof schema === "object") {
    // Try to construct a minimal tool-like object for extraction
    const schemaObj = schema as Record<string, unknown>;
    if (schemaObj.properties) {
      aliases = extractAliasesFromSchema({
        name: "unknown",
        parameters: schema,
      } as AnyAgentTool);
    }
  }

  let changed = false;

  // Apply schema-based aliases
  if (aliases && aliases.size > 0) {
    for (const [alias, original] of aliases.entries()) {
      if (alias in normalized && !(original in normalized)) {
        normalized[original] = normalized[alias];
        delete normalized[alias];
        changed = true;
        logDebug(
          `[schema-normalizer] Applied alias: ${alias} → ${original} (value: ${JSON.stringify(normalized[original]).slice(0, 100)})`,
        );
      }
    }
  }

  // Fallback to hardcoded normalization for known patterns
  // This ensures backward compatibility
  const hardcodedNormalized = normalizeToolParams(normalized);
  if (hardcodedNormalized) {
    // Merge any additional normalizations from hardcoded version
    for (const [key, value] of Object.entries(hardcodedNormalized)) {
      if (!(key in normalized) || normalized[key] !== value) {
        normalized[key] = value;
        changed = true;
      }
    }
  }

  // Special handling for cmd → command (array to string conversion)
  if ("cmd" in normalized && !("command" in normalized)) {
    const cmdValue = normalized.cmd;
    if (Array.isArray(cmdValue) && cmdValue.every((v) => typeof v === "string")) {
      normalized.command = cmdValue.join(" ");
      delete normalized.cmd;
      changed = true;
    } else if (typeof cmdValue === "string") {
      normalized.command = cmdValue;
      delete normalized.cmd;
      changed = true;
    }
  }

  // Remove root property if present (not part of any schema)
  if ("root" in normalized) {
    delete normalized.root;
    changed = true;
  }

  return changed || aliases?.size ? normalized : undefined;
}

/**
 * Normalize tool parameters from Claude Code conventions to pi-coding-agent conventions.
 * Claude Code uses file_path/old_string/new_string while pi-coding-agent uses path/oldText/newText.
 * This prevents models trained on Claude Code from getting stuck in tool-call loops.
 *
 * @deprecated Prefer using `normalizeToolParamsFromSchema` which extracts aliases from the
 * tool schema automatically. This function is kept for backward compatibility and as a fallback
 * when schema-based normalization is not available.
 */
export function normalizeToolParams(params: unknown): Record<string, unknown> | undefined {
  if (!params || typeof params !== "object") {
    return undefined;
  }
  const record = params as Record<string, unknown>;
  const normalized = { ...record };
  // file_path → path (read, write, edit)
  if ("file_path" in normalized && !("path" in normalized)) {
    normalized.path = normalized.file_path;
    delete normalized.file_path;
  }
  // old_string → oldText (edit)
  if ("old_string" in normalized && !("oldText" in normalized)) {
    normalized.oldText = normalized.old_string;
    delete normalized.old_string;
  }
  // new_string → newText (edit)
  if ("new_string" in normalized && !("newText" in normalized)) {
    normalized.newText = normalized.new_string;
    delete normalized.new_string;
  }
  // cmd → command (exec)
  if ("cmd" in normalized && !("command" in normalized)) {
    const cmdValue = normalized.cmd;
    // If cmd is an array, join it into a string (for exec tool compatibility)
    if (Array.isArray(cmdValue)) {
      normalized.command = cmdValue.join(" ");
    } else if (typeof cmdValue === "string") {
      normalized.command = cmdValue;
    }
    delete normalized.cmd;
  }
  // Remove root property if present (not part of exec schema)
  if ("root" in normalized) {
    delete normalized.root;
  }
  return normalized;
}

export function patchToolSchemaForClaudeCompatibility(tool: AnyAgentTool): AnyAgentTool {
  const schema =
    tool.parameters && typeof tool.parameters === "object"
      ? (tool.parameters as Record<string, unknown>)
      : undefined;

  if (!schema || !schema.properties || typeof schema.properties !== "object") {
    return tool;
  }

  const properties = { ...(schema.properties as Record<string, unknown>) };
  const required = Array.isArray(schema.required)
    ? schema.required.filter((key): key is string => typeof key === "string")
    : [];
  let changed = false;

  const aliasPairs: Array<{ original: string; alias: string }> = [
    { original: "path", alias: "file_path" },
    { original: "oldText", alias: "old_string" },
    { original: "newText", alias: "new_string" },
    { original: "command", alias: "cmd" },
  ];

  for (const { original, alias } of aliasPairs) {
    if (!(original in properties)) {
      continue;
    }
    if (!(alias in properties)) {
      properties[alias] = properties[original];
      changed = true;
    }
    const idx = required.indexOf(original);
    if (idx !== -1) {
      required.splice(idx, 1);
      changed = true;
    }
  }

  if (!changed) {
    return tool;
  }

  return {
    ...tool,
    parameters: {
      ...schema,
      properties,
      required,
    },
  };
}

export function assertRequiredParams(
  record: Record<string, unknown> | undefined,
  groups: readonly RequiredParamGroup[],
  toolName: string,
): void {
  if (!record || typeof record !== "object") {
    throw new Error(`Missing parameters for ${toolName}`);
  }

  for (const group of groups) {
    const satisfied = group.keys.some((key) => {
      if (!(key in record)) {
        return false;
      }
      const value = record[key];
      if (typeof value !== "string") {
        return false;
      }
      if (group.allowEmpty) {
        return true;
      }
      return value.trim().length > 0;
    });

    if (!satisfied) {
      const label = group.label ?? group.keys.join(" or ");
      throw new Error(`Missing required parameter: ${label}`);
    }
  }
}

// Generic wrapper to normalize parameters for any tool
export function wrapToolParamNormalization(
  tool: AnyAgentTool,
  requiredParamGroups?: readonly RequiredParamGroup[],
): AnyAgentTool {
  const patched = patchToolSchemaForClaudeCompatibility(tool);
  return {
    ...patched,
    execute: async (toolCallId, params, signal, onUpdate) => {
      const normalized = normalizeToolParams(params);
      const record =
        normalized ??
        (params && typeof params === "object" ? (params as Record<string, unknown>) : undefined);
      if (requiredParamGroups?.length) {
        assertRequiredParams(record, requiredParamGroups, tool.name);
      }
      return tool.execute(toolCallId, normalized ?? params, signal, onUpdate);
    },
  };
}

function wrapSandboxPathGuard(tool: AnyAgentTool, root: string): AnyAgentTool {
  return {
    ...tool,
    execute: async (toolCallId, args, signal, onUpdate) => {
      const normalized = normalizeToolParams(args);
      const record =
        normalized ??
        (args && typeof args === "object" ? (args as Record<string, unknown>) : undefined);
      const filePath = record?.path;
      if (typeof filePath === "string" && filePath.trim()) {
        await assertSandboxPath({ filePath, cwd: root, root });
      }
      return tool.execute(toolCallId, normalized ?? args, signal, onUpdate);
    },
  };
}

export function createSandboxedReadTool(root: string) {
  const base = createReadTool(root) as unknown as AnyAgentTool;
  return wrapSandboxPathGuard(createOpenClawReadTool(base), root);
}

export function createSandboxedWriteTool(root: string) {
  const base = createWriteTool(root) as unknown as AnyAgentTool;
  return wrapSandboxPathGuard(wrapToolParamNormalization(base, CLAUDE_PARAM_GROUPS.write), root);
}

export function createSandboxedEditTool(root: string) {
  const base = createEditTool(root) as unknown as AnyAgentTool;
  return wrapSandboxPathGuard(wrapToolParamNormalization(base, CLAUDE_PARAM_GROUPS.edit), root);
}

export function createOpenClawReadTool(base: AnyAgentTool): AnyAgentTool {
  const patched = patchToolSchemaForClaudeCompatibility(base);
  return {
    ...patched,
    execute: async (toolCallId, params, signal) => {
      const normalized = normalizeToolParams(params);
      const record =
        normalized ??
        (params && typeof params === "object" ? (params as Record<string, unknown>) : undefined);
      assertRequiredParams(record, CLAUDE_PARAM_GROUPS.read, base.name);
      const result = await base.execute(toolCallId, normalized ?? params, signal);
      const filePath = typeof record?.path === "string" ? String(record.path) : "<unknown>";
      const normalizedResult = await normalizeReadImageResult(result, filePath);
      return sanitizeToolResultImages(normalizedResult, `read:${filePath}`);
    },
  };
}

import { pathKey, schemaType, type JsonSchema } from "./config-form.shared";

export type ConfigSchemaAnalysis = {
  schema: JsonSchema | null;
  unsupportedPaths: string[];
};

const META_KEYS = new Set(["title", "description", "default", "nullable"]);

function isAnySchema(schema: JsonSchema): boolean {
  const keys = Object.keys(schema ?? {}).filter((key) => !META_KEYS.has(key));
  return keys.length === 0;
}

function normalizeEnum(values: unknown[]): { enumValues: unknown[]; nullable: boolean } {
  const filtered = values.filter((value) => value != null);
  const nullable = filtered.length !== values.length;
  const enumValues: unknown[] = [];
  for (const value of filtered) {
    if (!enumValues.some((existing) => Object.is(existing, value))) {
      enumValues.push(value);
    }
  }
  return { enumValues, nullable };
}

export function analyzeConfigSchema(raw: unknown): ConfigSchemaAnalysis {
  if (!raw || typeof raw !== "object") {
    return { schema: null, unsupportedPaths: ["<root>"] };
  }
  return normalizeSchemaNode(raw as JsonSchema, []);
}

function normalizeSchemaNode(
  schema: JsonSchema,
  path: Array<string | number>,
): ConfigSchemaAnalysis {
  const unsupported = new Set<string>();
  const normalized: JsonSchema = { ...schema };
  const pathLabel = pathKey(path) || "<root>";

  if (schema.anyOf || schema.oneOf || schema.allOf) {
    const union = normalizeUnion(schema, path);
    if (union) return union;
    // renderNode handles unresolvable unions via a JSON textarea fallback,
    // so don't mark them as unsupported — let the form render them.
    return { schema, unsupportedPaths: [] };
  }

  const nullable = Array.isArray(schema.type) && schema.type.includes("null");
  const type =
    schemaType(schema) ??
    (schema.properties || schema.additionalProperties ? "object" : undefined);
  normalized.type = type ?? schema.type;
  normalized.nullable = nullable || schema.nullable;

  if (normalized.enum) {
    const { enumValues, nullable: enumNullable } = normalizeEnum(normalized.enum);
    normalized.enum = enumValues;
    if (enumNullable) normalized.nullable = true;
    if (enumValues.length === 0) unsupported.add(pathLabel);
  }

  if (type === "object") {
    const properties = schema.properties ?? {};
    const normalizedProps: Record<string, JsonSchema> = {};
    for (const [key, value] of Object.entries(properties)) {
      const res = normalizeSchemaNode(value, [...path, key]);
      if (res.schema) normalizedProps[key] = res.schema;
      for (const entry of res.unsupportedPaths) unsupported.add(entry);
    }
    normalized.properties = normalizedProps;

    if (schema.additionalProperties === true) {
      // Only mark as unsupported if there are no known properties to render
      if (Object.keys(properties).length === 0) {
        unsupported.add(pathLabel);
      }
    } else if (schema.additionalProperties === false) {
      normalized.additionalProperties = false;
    } else if (
      schema.additionalProperties &&
      typeof schema.additionalProperties === "object"
    ) {
      if (!isAnySchema(schema.additionalProperties as JsonSchema)) {
        const res = normalizeSchemaNode(
          schema.additionalProperties as JsonSchema,
          [...path, "*"],
        );
        normalized.additionalProperties =
          res.schema ?? (schema.additionalProperties as JsonSchema);
        // Propagate nested unsupported paths individually rather than
        // blocking the whole object. Map entry values that are unsupported
        // will render their own fallback (JSON textarea).
        for (const p of res.unsupportedPaths) unsupported.add(p);
      }
    }
  } else if (type === "array") {
    const itemsSchema = Array.isArray(schema.items)
      ? schema.items[0]
      : schema.items;
    if (!itemsSchema) {
      unsupported.add(pathLabel);
    } else {
      const res = normalizeSchemaNode(itemsSchema, [...path, "*"]);
      normalized.items = res.schema ?? itemsSchema;
      const itemPathLabel = pathKey([...path, "*"]);
      if (res.unsupportedPaths.some((p) => p === itemPathLabel)) {
        // Items schema itself is entirely unsupported — can't render items
        unsupported.add(pathLabel);
      } else {
        // Only nested fields within items are unsupported — propagate them
        // individually so the array renders and nested fields show their
        // own error messages or JSON textarea fallbacks.
        for (const p of res.unsupportedPaths) unsupported.add(p);
      }
    }
  } else if (
    type !== "string" &&
    type !== "number" &&
    type !== "integer" &&
    type !== "boolean" &&
    !normalized.enum
  ) {
    unsupported.add(pathLabel);
  }

  return {
    schema: normalized,
    unsupportedPaths: Array.from(unsupported),
  };
}

function mergeAllOf(
  schema: JsonSchema,
  path: Array<string | number>,
): ConfigSchemaAnalysis | null {
  const entries = schema.allOf;
  if (!entries || entries.length === 0) return null;

  // Simple case: single entry in allOf
  if (entries.length === 1 && entries[0]) {
    return normalizeSchemaNode({ ...schema, ...entries[0], allOf: undefined }, path);
  }

  // Try to merge object schemas
  const mergedProps: Record<string, JsonSchema> = {};
  let mergedType: string | undefined;

  for (const entry of entries) {
    if (!entry || typeof entry !== "object") continue;

    const entryType = schemaType(entry);
    if (entryType === "object" || entry.properties) {
      mergedType = "object";
      if (entry.properties) {
        for (const [key, prop] of Object.entries(entry.properties)) {
          mergedProps[key] = prop;
        }
      }
    } else if (entryType) {
      // Non-object type in allOf - can't merge incompatible types
      if (mergedType && mergedType !== entryType) return null;
      mergedType = entryType;
    }
  }

  if (mergedType === "object" && Object.keys(mergedProps).length > 0) {
    const merged: JsonSchema = {
      ...schema,
      type: "object",
      properties: mergedProps,
      allOf: undefined,
    };
    return normalizeSchemaNode(merged, path);
  }

  return null;
}

function normalizeUnion(
  schema: JsonSchema,
  path: Array<string | number>,
): ConfigSchemaAnalysis | null {
  if (schema.allOf) {
    // Try to merge allOf into a single object schema
    const merged = mergeAllOf(schema, path);
    if (merged) return merged;
    return null;
  }
  const union = schema.anyOf ?? schema.oneOf;
  if (!union) return null;

  const literals: unknown[] = [];
  const remaining: JsonSchema[] = [];
  let nullable = false;

  for (const entry of union) {
    if (!entry || typeof entry !== "object") return null;
    if (Array.isArray(entry.enum)) {
      const { enumValues, nullable: enumNullable } = normalizeEnum(entry.enum);
      literals.push(...enumValues);
      if (enumNullable) nullable = true;
      continue;
    }
    if ("const" in entry) {
      if (entry.const == null) {
        nullable = true;
        continue;
      }
      literals.push(entry.const);
      continue;
    }
    if (schemaType(entry) === "null") {
      nullable = true;
      continue;
    }
    remaining.push(entry);
  }

  if (literals.length > 0 && remaining.length === 0) {
    const unique: unknown[] = [];
    for (const value of literals) {
      if (!unique.some((existing) => Object.is(existing, value))) {
        unique.push(value);
      }
    }
    return {
      schema: {
        ...schema,
        enum: unique,
        nullable,
        anyOf: undefined,
        oneOf: undefined,
        allOf: undefined,
      },
      unsupportedPaths: [],
    };
  }

  if (remaining.length === 1) {
    const res = normalizeSchemaNode(remaining[0], path);
    if (res.schema) {
      res.schema.nullable = nullable || res.schema.nullable;
    }
    return res;
  }

  const primitiveTypes = ["string", "number", "integer", "boolean"];
  if (
    remaining.length > 0 &&
    literals.length === 0 &&
    remaining.every((entry) => entry.type && primitiveTypes.includes(String(entry.type)))
  ) {
    return {
      schema: {
        ...schema,
        nullable,
      },
      unsupportedPaths: [],
    };
  }

  return null;
}

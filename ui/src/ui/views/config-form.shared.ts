import type { ConfigUiHints } from "../types";

export type ConfigIssueSeverity = "error" | "warn" | "info";

export type ConfigValidationIssue = {
  severity: ConfigIssueSeverity;
  message: string;
  raw?: unknown;
};

export type ConfigValidationMap = Record<string, ConfigValidationIssue[]>;

export type JsonSchema = {
  type?: string | string[];
  title?: string;
  description?: string;
  properties?: Record<string, JsonSchema>;
  items?: JsonSchema | JsonSchema[];
  additionalProperties?: JsonSchema | boolean;
  enum?: unknown[];
  const?: unknown;
  default?: unknown;
  anyOf?: JsonSchema[];
  oneOf?: JsonSchema[];
  allOf?: JsonSchema[];
  nullable?: boolean;
  minimum?: number;
  maximum?: number;
  exclusiveMinimum?: number;
  exclusiveMaximum?: number;
};

export function schemaType(schema: JsonSchema): string | undefined {
  if (!schema) {
    return undefined;
  }
  if (Array.isArray(schema.type)) {
    const filtered = schema.type.filter((t) => t !== "null");
    return filtered[0] ?? schema.type[0];
  }
  return schema.type;
}

export function defaultValue(schema?: JsonSchema): unknown {
  if (!schema) {
    return "";
  }
  if (schema.default !== undefined) {
    return schema.default;
  }
  const type = schemaType(schema);
  switch (type) {
    case "object":
      return {};
    case "array":
      return [];
    case "boolean":
      return false;
    case "number":
    case "integer":
      return 0;
    case "string":
      return "";
    default:
      return "";
  }
}

export function pathKey(path: Array<string | number>): string {
  return path.filter((segment) => typeof segment === "string").join(".");
}

export function hintForPath(path: Array<string | number>, hints: ConfigUiHints) {
  const key = pathKey(path);
  const direct = hints[key];
  if (direct) {
    return direct;
  }
  const segments = key.split(".");
  for (const [hintKey, hint] of Object.entries(hints)) {
    if (!hintKey.includes("*")) {
      continue;
    }
    const hintSegments = hintKey.split(".");
    if (hintSegments.length !== segments.length) {
      continue;
    }
    let match = true;
    for (let i = 0; i < segments.length; i += 1) {
      if (hintSegments[i] !== "*" && hintSegments[i] !== segments[i]) {
        match = false;
        break;
      }
    }
    if (match) {
      return hint;
    }
  }
  return undefined;
}

export function humanize(raw: string) {
  return raw
    .replace(/_/g, " ")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/\s+/g, " ")
    .replace(/^./, (m) => m.toUpperCase());
}

/**
 * Returns the effective minimum from a schema, considering both
 * `minimum` and `exclusiveMinimum`.
 */
export function schemaMin(schema: JsonSchema): number | undefined {
  const min = schema.minimum;
  const exMin = schema.exclusiveMinimum;
  if (min != null && exMin != null) return Math.max(min, exMin);
  return min ?? exMin;
}

/**
 * Returns the effective maximum from a schema, considering both
 * `maximum` and `exclusiveMaximum`.
 */
export function schemaMax(schema: JsonSchema): number | undefined {
  const max = schema.maximum;
  const exMax = schema.exclusiveMaximum;
  if (max != null && exMax != null) return Math.min(max, exMax);
  return max ?? exMax;
}

/**
 * Returns true if the field should render in compact (multi-column) layout.
 * Compact fields: numbers, integers, booleans, small enums (<=5), or explicit hint.
 */
export function isCompactField(schema: JsonSchema, hint?: { compact?: boolean }): boolean {
  if (hint?.compact === true) return true;
  if (hint?.compact === false) return false;
  const type = schemaType(schema);
  if (type === "number" || type === "integer" || type === "boolean") return true;
  // Small enums rendered as segmented control
  if (schema.enum && schema.enum.length <= 5) return true;
  // anyOf/oneOf literal unions (segmented)
  const variants = schema.anyOf ?? schema.oneOf;
  if (variants) {
    const nonNull = variants.filter(
      (v) => !(v.type === "null" || (Array.isArray(v.type) && v.type.includes("null"))),
    );
    const allLiterals = nonNull.every(
      (v) => v.const !== undefined || (v.enum && v.enum.length === 1),
    );
    if (allLiterals && nonNull.length > 0 && nonNull.length <= 5) return true;
  }
  return false;
}

/**
 * Returns true if a numeric field should render as a slider.
 * Requires both min and max bounds with range <= 10000.
 */
export function shouldUseSlider(schema: JsonSchema, hint?: { widget?: string }): boolean {
  if (hint?.widget === "slider") return true;
  if (hint?.widget && hint.widget !== "slider") return false;
  const min = schemaMin(schema);
  const max = schemaMax(schema);
  if (min == null || max == null) return false;
  const range = max - min;
  return range > 0 && range <= 10000;
}

export function isSensitivePath(path: Array<string | number>): boolean {
  const key = pathKey(path).toLowerCase();
  return (
    key.includes("token") ||
    key.includes("password") ||
    key.includes("secret") ||
    key.includes("apikey") ||
    key.endsWith("key")
  );
}

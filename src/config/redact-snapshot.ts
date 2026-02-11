import type { ConfigFileSnapshot } from "./types.openclaw.js";
import { createSubsystemLogger } from "../logging/subsystem.js";
import { isSensitiveConfigPath, type ConfigUiHints } from "./schema.hints.js";

const log = createSubsystemLogger("config/redaction");

function isSensitivePath(path: string): boolean {
  if (path.endsWith("[]")) {
    return isSensitiveConfigPath(path.slice(0, -2));
  } else {
    return isSensitiveConfigPath(path);
  }
}

/**
 * Sentinel value used to replace sensitive config fields in gateway responses.
 * Write-side handlers (config.set, config.apply, config.patch) detect this
 * sentinel and restore the original value from the on-disk config, so a
 * round-trip through the Web UI does not corrupt credentials.
 */
export const REDACTED_SENTINEL = "__OPENCLAW_REDACTED__";

// ConfigUiHints' keys look like this:
// - path.subpath.key (nested objects)
// - path.subpath[].key (object in array in object)
// - path.*.key (object in record in object)
// records are handled by the lookup, but arrays need two entries in
// the Set, as their first lookup is done before the code knows it's
// an array.
function buildRedactionLookup(hints: ConfigUiHints): Set<string> {
  let result = new Set<string>();

  for (const [path, hint] of Object.entries(hints)) {
    if (!hint.sensitive) {
      continue;
    }

    const parts = path.split(".");
    let joinedPath = parts.shift() ?? "";
    result.add(joinedPath);
    if (joinedPath.endsWith("[]")) {
      result.add(joinedPath.slice(0, -2));
    }

    for (const part of parts) {
      if (part.endsWith("[]")) {
        result.add(`${joinedPath}.${part.slice(0, -2)}`);
      }
      // hey, greptile, notice how this is *NOT* in an else block?
      joinedPath = `${joinedPath}.${part}`;
      result.add(joinedPath);
    }
  }
  if (result.size !== 0) {
    result.add("");
  }
  return result;
}

/**
 * Deep-walk an object and replace string values at sensitive paths
 * with the redaction sentinel.
 */
function redactObject(obj: unknown, hints?: ConfigUiHints): unknown {
  if (hints) {
    const lookup = buildRedactionLookup(hints);
    return lookup.has("") ? redactObjectWithLookup(obj, lookup, "", []) : obj;
  } else {
    return redactObjectGuessing(obj, "", []);
  }
}

/**
 * Collect all sensitive string values from a config object.
 * Used for text-based redaction of the raw JSON5 source.
 */
function collectSensitiveValues(obj: unknown, hints?: ConfigUiHints): string[] {
  const result: string[] = [];
  if (hints) {
    const lookup = buildRedactionLookup(hints);
    if (lookup.has("")) {
      redactObjectWithLookup(obj, lookup, "", result);
    }
  } else {
    redactObjectGuessing(obj, "", result);
  }
  return result;
}

/**
 * Worker for redactObject() and collectSensitiveValues().
 * Used when there are ConfigUiHints available.
 */
function redactObjectWithLookup(
  obj: unknown,
  lookup: Set<string>,
  prefix: string,
  values: string[],
): unknown {
  if (obj === null || obj === undefined) {
    return obj;
  }

  if (Array.isArray(obj)) {
    const path = `${prefix}[]`;
    if (!lookup.has(path)) {
      return obj;
    }
    return obj.map((item) => {
      if (typeof item === "string" && !/^\$\{[^}]*\}$/.test(item.trim())) {
        values.push(item);
        return REDACTED_SENTINEL;
      }
      return redactObjectWithLookup(item, lookup, path, values);
    });
  }

  if (typeof obj === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
      for (const path of [prefix ? `${prefix}.${key}` : key, prefix ? `${prefix}.*` : "*"]) {
        result[key] = value;
        if (lookup.has(path)) {
          // Hey, greptile, look here, this **IS** only applied to strings
          if (typeof value === "string" && !/^\$\{[^}]*\}$/.test(value.trim())) {
            result[key] = REDACTED_SENTINEL;
            values.push(value);
          } else if (typeof value === "object" && value !== null) {
            result[key] = redactObjectWithLookup(value, lookup, path, values);
          }
          break;
        }
      }
    }
    return result;
  }

  return obj;
}

/**
 * Worker for redactObject() and collectSensitiveValues().
 * Used when ConfigUiHints are NOT available.
 */
function redactObjectGuessing(obj: unknown, prefix: string, values: string[]): unknown {
  if (obj === null || obj === undefined) {
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map((item) => {
      const path = `${prefix}[]`;
      if (isSensitivePath(path) && typeof item === "string" && !/^\$\{[^}]*\}$/.test(item.trim())) {
        return REDACTED_SENTINEL;
      }
      return redactObjectGuessing(item, path, values);
    });
  }

  if (typeof obj === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
      const dotPath = prefix ? `${prefix}.${key}` : key;
      if (
        isSensitivePath(dotPath) &&
        typeof value === "string" &&
        !/^\$\{[^}]*\}$/.test(value.trim())
      ) {
        result[key] = REDACTED_SENTINEL;
        values.push(value);
      } else if (typeof value === "object" && value !== null) {
        result[key] = redactObjectGuessing(value, dotPath, values);
      } else {
        result[key] = value;
      }
    }
    return result;
  }

  return obj;
}

/**
 * Replace known sensitive values in a raw JSON5 string with the sentinel.
 * Values are replaced longest-first to avoid partial matches.
 */
function redactRawText(raw: string, config: unknown, hints?: ConfigUiHints): string {
  const sensitiveValues = collectSensitiveValues(config, hints);
  sensitiveValues.sort((a, b) => b.length - a.length);
  let result = raw;
  for (const value of sensitiveValues) {
    result = result.replaceAll(value, REDACTED_SENTINEL);
  }
  return result;
}

/**
 * Returns a copy of the config snapshot with all sensitive fields
 * replaced by {@link REDACTED_SENTINEL}. The `hash` is preserved
 * (it tracks config identity, not content).
 *
 * Both `config` (the parsed object) and `raw` (the JSON5 source) are scrubbed
 * so no credential can leak through either path.
 *
 * When `uiHints` are provided, sensitivity is determined from the schema hints.
 * Without hints, falls back to regex-based detection via `isSensitivePath()`.
 */
/**
 * Redact sensitive fields from a plain config object (not a full snapshot).
 * Used by write endpoints (config.set, config.patch, config.apply) to avoid
 * leaking credentials in their responses.
 */
export function redactConfigObject<T>(value: T, uiHints?: ConfigUiHints): T {
  return redactObject(value, uiHints) as T;
}

export function redactConfigSnapshot(
  snapshot: ConfigFileSnapshot,
  uiHints?: ConfigUiHints,
): ConfigFileSnapshot {
  if (!snapshot.valid) {
    // This is bad. We could try to redact the raw string using known key names,
    // but then we would not be able to restore them, and would trash the user's
    // credentials. Less than ideal---we should never delete important data.
    // On the other hand, we cannot hand out "raw" if we're not sure we have
    // properly redacted all sensitive data. Handing out a partially or, worse,
    // unredacted config string would be bad.
    // Therefore, the only safe route is to reject handling out broken configs.
    return {
      ...snapshot,
      config: {},
      raw: null,
      parsed: null,
    };
  }
  // else: snapshot.config must be valid and populated, as that is what
  // readConfigFileSnapshot() does when it creates the snapshot.

  const redactedConfig = redactObject(snapshot.config, uiHints) as ConfigFileSnapshot["config"];
  const redactedRaw = snapshot.raw ? redactRawText(snapshot.raw, snapshot.config, uiHints) : null;
  const redactedParsed = snapshot.parsed ? redactObject(snapshot.parsed, uiHints) : snapshot.parsed;

  return {
    ...snapshot,
    config: redactedConfig,
    raw: redactedRaw,
    parsed: redactedParsed,
  };
}

export type RedactionResult = {
  ok: boolean;
  result?: unknown;
  error?: unknown;
  humanReadableMessage?: string;
};

/**
 * Deep-walk `incoming` and replace any {@link REDACTED_SENTINEL} values
 * (on sensitive paths) with the corresponding value from `original`.
 *
 * This is called by config.set / config.apply / config.patch before writing,
 * so that credentials survive a Web UI round-trip unmodified.
 */
export function restoreRedactedValues(
  incoming: unknown,
  original: unknown,
  hints?: ConfigUiHints,
): RedactionResult {
  if (incoming === null || incoming === undefined) {
    return { ok: false, error: "no input" };
  }
  if (typeof incoming !== "object") {
    return { ok: false, error: "input not an object" };
  }
  try {
    if (hints) {
      const lookup = buildRedactionLookup(hints);
      if (lookup.has("")) {
        return {
          ok: true,
          result: restoreRedactedValuesWithLookup(incoming, original, lookup, ""),
        };
      } else {
        return { ok: true, result: incoming };
      }
    } else {
      return { ok: true, result: restoreRedactedValuesGuessing(incoming, original, "") };
    }
  } catch (err) {
    if (err instanceof RedactionError) {
      return {
        ok: false,
        humanReadableMessage: `Sentinel value "${REDACTED_SENTINEL}" in key ${err.key} is not valid as real data`,
      };
    }
    throw err; // some coding error, pass through
  }
}

class RedactionError extends Error {
  public readonly key: string;

  constructor(key: string) {
    super("internal error class---should never escape");
    this.key = key;
    this.name = "RedactionError";
    Object.setPrototypeOf(this, RedactionError.prototype);
  }
}

/**
 * Worker for restoreRedactedValues().
 * Used when there are ConfigUiHints available.
 */
function restoreRedactedValuesWithLookup(
  incoming: unknown,
  original: unknown,
  lookup: Set<string>,
  prefix: string,
): unknown {
  if (incoming === null || incoming === undefined) {
    return incoming;
  }
  if (typeof incoming !== "object") {
    return incoming;
  }
  if (Array.isArray(incoming)) {
    // Note: If the user removed an item in the middle of the array,
    // we have no way of knowing which one. In this case, the last
    // element(s) get(s) chopped off. Not good, so please don't put
    // sensitive string array in the config...
    const path = `${prefix}[]`;
    if (!lookup.has(path)) {
      return incoming;
    }
    const origArr = Array.isArray(original) ? original : [];
    if (incoming.length < origArr.length) {
      log.warn(`Redacted config array key ${path} has been truncated`);
    }
    return incoming.map((item, i) => {
      if (item === REDACTED_SENTINEL) {
        return origArr[i];
      }
      return restoreRedactedValuesWithLookup(item, origArr[i], lookup, path);
    });
  }
  const orig =
    original && typeof original === "object" && !Array.isArray(original)
      ? (original as Record<string, unknown>)
      : {};
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(incoming as Record<string, unknown>)) {
    result[key] = value;
    for (const path of [prefix ? `${prefix}.${key}` : key, prefix ? `${prefix}.*` : "*"]) {
      if (lookup.has(path)) {
        if (value === REDACTED_SENTINEL) {
          if (key in orig) {
            result[key] = orig[key];
          } else {
            log.warn(`Cannot un-redact config key ${path} as it doesn't have any value`);
            throw new RedactionError(path);
          }
        } else if (typeof value === "object" && value !== null) {
          result[key] = restoreRedactedValuesWithLookup(value, orig[key], lookup, path);
        }
        break;
      }
    }
  }
  return result;
}

/**
 * Worker for restoreRedactedValues().
 * Used when ConfigUiHints are NOT available.
 */
function restoreRedactedValuesGuessing(
  incoming: unknown,
  original: unknown,
  prefix: string,
): unknown {
  if (incoming === null || incoming === undefined) {
    return incoming;
  }
  if (typeof incoming !== "object") {
    return incoming;
  }
  if (Array.isArray(incoming)) {
    // Note: If the user removed an item in the middle of the array,
    // we have no way of knowing which one. In this case, the last
    // element(s) get(s) chopped off. Not good, so please don't put
    // sensitive string array in the config...
    const origArr = Array.isArray(original) ? original : [];
    return incoming.map((item, i) => {
      var path = `${prefix}[]`;
      if (incoming.length < origArr.length) {
        log.warn(`Redacted config array key ${path} has been truncated`);
      }
      if (isSensitivePath(path) && item === REDACTED_SENTINEL) {
        return origArr[i];
      }
      return restoreRedactedValuesGuessing(item, origArr[i], path);
    });
  }
  const orig =
    original && typeof original === "object" && !Array.isArray(original)
      ? (original as Record<string, unknown>)
      : {};
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(incoming as Record<string, unknown>)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (isSensitivePath(path) && value === REDACTED_SENTINEL) {
      if (key in orig) {
        result[key] = orig[key];
      } else {
        log.warn(`Cannot un-redact config key ${path} as it doesn't have any value`);
        throw new RedactionError(path);
      }
    } else if (typeof value === "object" && value !== null) {
      result[key] = restoreRedactedValuesGuessing(value, orig[key], path);
    } else {
      result[key] = value;
    }
  }
  return result;
}

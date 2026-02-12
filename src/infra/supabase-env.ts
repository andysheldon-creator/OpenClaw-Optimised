import { createSubsystemLogger } from "../logging/subsystem.js";

const log = createSubsystemLogger("supabase-env");

export type SupabaseEnvRow = {
  key: string;
  value: string;
};

export type SupabaseEnvOptions = {
  /** Supabase project URL, e.g. https://xyz.supabase.co */
  supabaseUrl: string;
  /** Supabase service-role key (has full read access to the table). */
  supabaseKey: string;
  /** Table name to query (default: "env_vars"). */
  table?: string;
  /** Timeout in milliseconds for the HTTP request (default: 5000). */
  timeoutMs?: number;
  /** Custom fetch implementation (for testing). */
  fetchFn?: typeof globalThis.fetch;
};

/**
 * Fetches environment variable rows from a Supabase PostgREST table.
 *
 * Expected table schema:
 *   key   TEXT PRIMARY KEY,
 *   value TEXT NOT NULL
 *
 * Returns the parsed rows or an empty array on failure.
 */
export async function fetchSupabaseEnvVars(opts: SupabaseEnvOptions): Promise<SupabaseEnvRow[]> {
  const table = opts.table ?? "env_vars";
  const timeoutMs = opts.timeoutMs ?? 5000;
  const fetchFn = opts.fetchFn ?? globalThis.fetch;

  const url = `${opts.supabaseUrl.replace(/\/+$/, "")}/rest/v1/${encodeURIComponent(table)}?select=key,value`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetchFn(url, {
      method: "GET",
      headers: {
        apikey: opts.supabaseKey,
        Authorization: `Bearer ${opts.supabaseKey}`,
        Accept: "application/json",
      },
      signal: controller.signal,
    });

    if (!response.ok) {
      log.warn(`Supabase env fetch failed: HTTP ${response.status} ${response.statusText}`);
      return [];
    }

    const body: unknown = await response.json();
    if (!Array.isArray(body)) {
      log.warn("Supabase env response is not an array");
      return [];
    }

    const rows: SupabaseEnvRow[] = [];
    for (const item of body) {
      if (
        item &&
        typeof item === "object" &&
        typeof (item as Record<string, unknown>).key === "string" &&
        typeof (item as Record<string, unknown>).value === "string"
      ) {
        rows.push({
          key: (item as Record<string, string>).key,
          value: (item as Record<string, string>).value,
        });
      }
    }

    return rows;
  } catch (err) {
    if ((err as Error).name === "AbortError") {
      log.warn(`Supabase env fetch timed out after ${timeoutMs}ms`);
    } else {
      log.warn(`Supabase env fetch error: ${String(err)}`);
    }
    return [];
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Resolves Supabase bootstrap config from the given env object.
 * Returns `null` if the required bootstrap vars are missing.
 */
export function resolveSupabaseEnvConfig(env: NodeJS.ProcessEnv): SupabaseEnvOptions | null {
  const supabaseUrl = env.SUPABASE_URL?.trim();
  const supabaseKey = env.SUPABASE_SERVICE_ROLE_KEY?.trim();

  if (!supabaseUrl || !supabaseKey) {
    return null;
  }

  const table = env.SUPABASE_ENV_TABLE?.trim() || "env_vars";
  const rawTimeout = env.SUPABASE_ENV_TIMEOUT_MS?.trim();
  const timeoutMs = rawTimeout ? Number.parseInt(rawTimeout, 10) : 5000;

  return {
    supabaseUrl,
    supabaseKey,
    table,
    timeoutMs: Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : 5000,
  };
}

/**
 * Loads environment variables from a Supabase `env_vars` table and applies
 * them to `process.env`. Existing non-empty values are NOT overridden (same
 * semantics as `dotenv`'s `override: false`).
 *
 * This is a no-op when the bootstrap vars (`SUPABASE_URL`,
 * `SUPABASE_SERVICE_ROLE_KEY`) are not set.
 *
 * @returns The number of env vars applied, or 0 on skip/failure.
 */
export async function loadSupabaseEnv(opts?: {
  env?: NodeJS.ProcessEnv;
  fetchFn?: typeof globalThis.fetch;
}): Promise<number> {
  const env = opts?.env ?? process.env;
  const config = resolveSupabaseEnvConfig(env);

  if (!config) {
    return 0;
  }

  if (opts?.fetchFn) {
    config.fetchFn = opts.fetchFn;
  }

  const rows = await fetchSupabaseEnvVars(config);

  let applied = 0;
  for (const { key, value } of rows) {
    if (!key.trim()) {
      continue;
    }
    // Don't override existing non-empty env vars.
    if (env[key]?.trim()) {
      continue;
    }
    env[key] = value;
    applied += 1;
  }

  if (applied > 0) {
    log.info(`Loaded ${applied} env var(s) from Supabase [${config.table}]`);
  }

  return applied;
}

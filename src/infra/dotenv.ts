import dotenv from "dotenv";
import fs from "node:fs";
import path from "node:path";
import { resolveConfigDir } from "../utils.js";
import { loadSupabaseEnv } from "./supabase-env.js";

export function loadDotEnv(opts?: { quiet?: boolean }) {
  const quiet = opts?.quiet ?? true;

  // Load from process CWD first (dotenv default).
  dotenv.config({ quiet });

  // Then load global fallback: ~/.openclaw/.env (or OPENCLAW_STATE_DIR/.env),
  // without overriding any env vars already present.
  const globalEnvPath = path.join(resolveConfigDir(process.env), ".env");
  if (!fs.existsSync(globalEnvPath)) {
    return;
  }

  dotenv.config({ quiet, path: globalEnvPath, override: false });
}

/**
 * Async extension of loadDotEnv that also loads env vars from Supabase.
 * The Supabase layer runs AFTER local .env files so local values take
 * precedence (matching the existing "don't override" convention).
 *
 * This is a no-op when SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are not set.
 */
export async function loadDotEnvWithSupabase(opts?: {
  quiet?: boolean;
}): Promise<{ supabaseApplied: number }> {
  loadDotEnv(opts);

  const supabaseApplied = await loadSupabaseEnv();

  return { supabaseApplied };
}

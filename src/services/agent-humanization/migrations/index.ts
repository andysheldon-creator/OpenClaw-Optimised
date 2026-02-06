/**
 * Agent Humanization Migrations
 *
 * Exports the humanization migration SQL for registration with the
 * central migration runner in src/infra/database/client.ts.
 *
 * Usage in client.ts:
 *   import { humanizationMigrations } from "@/services/agent-humanization/migrations";
 *   // ... inside runMigrations():
 *   const migrations = [ ...coreMigrations, ...humanizationMigrations ];
 */

import { readFileSync } from "fs";
import { join } from "path";

/**
 * Load the SQL migration file at build/runtime.
 * Falls back to inline require if bundler doesn't support fs (edge runtimes).
 */
function loadMigrationSQL(): string {
  try {
    return readFileSync(join(__dirname, "003_agent_humanization.sql"), "utf-8");
  } catch {
    // If fs fails (e.g. bundled env), the SQL is too large to inline.
    // Ensure the .sql file is included in your build output.
    throw new Error(
      "Failed to load 003_agent_humanization.sql. " +
        "Ensure the .sql file is copied to the build output directory.",
    );
  }
}

/**
 * Migration definition compatible with the runner in src/infra/database/client.ts.
 * Each entry has { name: string; up: string } matching the existing pattern.
 */
export const humanizationMigrations: { name: string; up: string }[] = [
  {
    name: "003_agent_humanization",
    up: loadMigrationSQL(),
  },
];

/**
 * Convenience: register humanization migrations into an existing migrations array.
 * Appends in-place and returns the array for chaining.
 *
 * @example
 *   const migrations = [ ...coreMigrations ];
 *   registerHumanizationMigrations(migrations);
 */
export function registerHumanizationMigrations(
  migrations: { name: string; up: string }[],
): { name: string; up: string }[] {
  for (const m of humanizationMigrations) {
    if (!migrations.some((existing) => existing.name === m.name)) {
      migrations.push(m);
    }
  }
  return migrations;
}

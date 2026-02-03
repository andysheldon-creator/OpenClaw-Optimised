/**
 * Database infrastructure exports.
 */

export {
  getDatabase,
  closeDatabase,
  getDatabaseConfig,
  isDatabaseConnected,
  runMigrations,
  type DatabaseConfig,
} from "./client.js";

export type {
  LlmUsageRow,
  LlmUsageInsert,
  LlmUsageHourlyRow,
  UsageQueryFilter,
  UsageAggregation,
} from "./schema.js";

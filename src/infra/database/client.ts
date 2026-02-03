/**
 * PostgreSQL client for OpenClaw metrics storage.
 * Uses postgres.js for connection management.
 * Works with PostgreSQL/TimescaleDB from Docker, Homebrew, or any external source.
 */

import postgres from "postgres";

export type DatabaseConfig = {
  host: string;
  port: number;
  database: string;
  username: string;
  password: string;
  maxConnections?: number;
  idleTimeout?: number;
  connectTimeout?: number;
};

let sql: postgres.Sql | null = null;

export function getDatabaseConfig(): DatabaseConfig {
  return {
    host: process.env.POSTGRES_HOST ?? "localhost",
    port: Number(process.env.POSTGRES_PORT ?? 5432),
    database: process.env.POSTGRES_DB ?? "openclaw",
    username: process.env.POSTGRES_USER ?? "openclaw",
    password: process.env.POSTGRES_PASSWORD ?? "openclaw",
    maxConnections: Number(process.env.POSTGRES_MAX_CONNECTIONS ?? 10),
    idleTimeout: Number(process.env.POSTGRES_IDLE_TIMEOUT ?? 30),
    connectTimeout: Number(process.env.POSTGRES_CONNECT_TIMEOUT ?? 10),
  };
}

export function getDatabase(): postgres.Sql {
  if (sql) {
    return sql;
  }

  const config = getDatabaseConfig();

  sql = postgres({
    host: config.host,
    port: config.port,
    database: config.database,
    username: config.username,
    password: config.password,
    max: config.maxConnections,
    idle_timeout: config.idleTimeout,
    connect_timeout: config.connectTimeout,
    onnotice: () => {
      // Suppress notices
    },
  });

  return sql;
}

export async function closeDatabase(): Promise<void> {
  if (sql) {
    await sql.end();
    sql = null;
  }
}

export async function isDatabaseConnected(): Promise<boolean> {
  try {
    const db = getDatabase();
    await db`SELECT 1`;
    return true;
  } catch {
    return false;
  }
}

export async function runMigrations(): Promise<void> {
  const db = getDatabase();

  // Create migrations tracking table
  await db`
    CREATE TABLE IF NOT EXISTS migrations (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;

  // Get applied migrations
  const applied = await db<{ name: string }[]>`
    SELECT name FROM migrations ORDER BY id
  `;
  const appliedNames = new Set(applied.map((m) => m.name));

  // Define migrations in order
  const migrations: { name: string; up: string }[] = [
    {
      name: "001_create_llm_usage",
      up: `
        CREATE TABLE IF NOT EXISTS llm_usage (
          time TIMESTAMPTZ NOT NULL,
          provider_id TEXT NOT NULL,
          model_id TEXT NOT NULL,
          agent_id TEXT,
          session_id TEXT,
          input_tokens INTEGER NOT NULL,
          output_tokens INTEGER NOT NULL,
          cache_read_tokens INTEGER DEFAULT 0,
          cache_write_tokens INTEGER DEFAULT 0,
          cost_usd DECIMAL(10,6),
          duration_ms INTEGER
        );

        -- Only create hypertable if TimescaleDB extension is available
        DO $$
        BEGIN
          IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'timescaledb') THEN
            PERFORM create_hypertable('llm_usage', 'time', if_not_exists => TRUE);
          END IF;
        END $$;

        CREATE INDEX IF NOT EXISTS idx_usage_provider ON llm_usage (provider_id, time DESC);
        CREATE INDEX IF NOT EXISTS idx_usage_model ON llm_usage (model_id, time DESC);
        CREATE INDEX IF NOT EXISTS idx_usage_agent ON llm_usage (agent_id, time DESC) WHERE agent_id IS NOT NULL;
      `,
    },
    {
      name: "002_create_usage_hourly_view",
      up: `
        -- Create continuous aggregate for hourly stats (TimescaleDB only)
        DO $$
        BEGIN
          IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'timescaledb') THEN
            CREATE MATERIALIZED VIEW IF NOT EXISTS llm_usage_hourly
            WITH (timescaledb.continuous) AS
            SELECT
              time_bucket('1 hour', time) AS bucket,
              provider_id,
              model_id,
              COUNT(*) AS requests,
              SUM(input_tokens) AS total_input_tokens,
              SUM(output_tokens) AS total_output_tokens,
              SUM(cache_read_tokens) AS total_cache_read_tokens,
              SUM(cache_write_tokens) AS total_cache_write_tokens,
              SUM(cost_usd) AS total_cost
            FROM llm_usage
            GROUP BY bucket, provider_id, model_id
            WITH NO DATA;
          END IF;
        END $$;
      `,
    },
  ];

  // Apply pending migrations
  for (const migration of migrations) {
    if (!appliedNames.has(migration.name)) {
      await db.unsafe(migration.up);
      await db`INSERT INTO migrations (name) VALUES (${migration.name})`;
    }
  }
}

export { postgres };

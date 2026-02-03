-- Migration: 001_create_llm_usage
-- Description: Create LLM usage tracking table with TimescaleDB hypertable support

-- Create the main usage table
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

-- Convert to hypertable for time-series optimization (TimescaleDB only)
-- This will fail gracefully if TimescaleDB is not installed
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'timescaledb') THEN
    PERFORM create_hypertable('llm_usage', 'time', if_not_exists => TRUE);
  END IF;
END $$;

-- Create indexes for common queries
CREATE INDEX IF NOT EXISTS idx_usage_provider ON llm_usage (provider_id, time DESC);
CREATE INDEX IF NOT EXISTS idx_usage_model ON llm_usage (model_id, time DESC);
CREATE INDEX IF NOT EXISTS idx_usage_agent ON llm_usage (agent_id, time DESC) WHERE agent_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_usage_session ON llm_usage (session_id, time DESC) WHERE session_id IS NOT NULL;

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

    -- Add refresh policy for continuous aggregate
    SELECT add_continuous_aggregate_policy('llm_usage_hourly',
      start_offset => INTERVAL '3 hours',
      end_offset => INTERVAL '1 hour',
      schedule_interval => INTERVAL '1 hour',
      if_not_exists => TRUE);
  END IF;
END $$;

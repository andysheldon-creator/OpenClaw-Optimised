-- ============================================================================
-- Migration 003: Agent Humanization System
-- Created: 2026-02-06
-- 
-- Creates all 17 tables for the agent humanization system:
--   12 core tables (PostgreSQL)
--    5 time-series hypertables (TimescaleDB, with graceful fallback)
--    4 continuous aggregates
--   Indexes, retention policies, and default data
--
-- Idempotent: safe to re-run (CREATE TABLE IF NOT EXISTS, IF NOT EXISTS guards)
-- ============================================================================

-- ============================================================================
-- CORE TABLE 1: agent_memory
-- Persistent insights, decisions, patterns with importance scoring
-- ============================================================================

CREATE TABLE IF NOT EXISTS agent_memory (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id TEXT NOT NULL,
  memory_type TEXT NOT NULL,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  context JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  importance INTEGER NOT NULL DEFAULT 5,
  retention_score DOUBLE PRECISION NOT NULL DEFAULT 1.0,
  CONSTRAINT agent_memory_importance_range CHECK (importance BETWEEN 1 AND 10),
  CONSTRAINT agent_memory_retention_range CHECK (retention_score BETWEEN 0.0 AND 1.0),
  CONSTRAINT agent_memory_type_check CHECK (memory_type IN ('decision', 'mistake', 'pattern', 'person_insight', 'project_pattern'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_agent_memory_unique
  ON agent_memory (agent_id, memory_type, title);
CREATE INDEX IF NOT EXISTS idx_agent_memory_agent_created
  ON agent_memory (agent_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_agent_memory_agent_importance
  ON agent_memory (agent_id, importance DESC);
CREATE INDEX IF NOT EXISTS idx_agent_memory_type
  ON agent_memory (memory_type);
CREATE INDEX IF NOT EXISTS idx_agent_memory_retention
  ON agent_memory (agent_id, retention_score DESC);

-- ============================================================================
-- CORE TABLE 2: agent_relationships
-- Trust scores and collaboration quality between agents
-- ============================================================================

CREATE TABLE IF NOT EXISTS agent_relationships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id TEXT NOT NULL,
  other_agent_id TEXT NOT NULL,
  trust_score DOUBLE PRECISION NOT NULL DEFAULT 0.5,
  collaboration_quality TEXT NOT NULL DEFAULT 'unknown',
  interaction_count INTEGER NOT NULL DEFAULT 0,
  positive_interactions INTEGER NOT NULL DEFAULT 0,
  negative_interactions INTEGER NOT NULL DEFAULT 0,
  last_interaction TIMESTAMPTZ,
  notes TEXT,
  CONSTRAINT agent_relationships_trust_range CHECK (trust_score BETWEEN 0.0 AND 1.0),
  CONSTRAINT agent_relationships_collab_check CHECK (collaboration_quality IN ('excellent', 'good', 'neutral', 'poor', 'unknown')),
  CONSTRAINT agent_relationships_interactions_valid CHECK (positive_interactions + negative_interactions <= interaction_count)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_agent_relationships_unique
  ON agent_relationships (agent_id, other_agent_id);
CREATE INDEX IF NOT EXISTS idx_agent_relationships_trust
  ON agent_relationships (agent_id, trust_score DESC);
CREATE INDEX IF NOT EXISTS idx_agent_relationships_collab
  ON agent_relationships (agent_id, collaboration_quality);

-- ============================================================================
-- CORE TABLE 3: agent_reputation
-- Multi-dimensional reputation scores per agent (one row per agent)
-- ============================================================================

CREATE TABLE IF NOT EXISTS agent_reputation (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id TEXT NOT NULL UNIQUE,
  reliability_score DOUBLE PRECISION NOT NULL DEFAULT 0.5,
  speed_rating TEXT NOT NULL DEFAULT 'unknown',
  quality_rating TEXT NOT NULL DEFAULT 'unknown',
  accountability_score DOUBLE PRECISION NOT NULL DEFAULT 0.5,
  communication_score DOUBLE PRECISION NOT NULL DEFAULT 0.5,
  collaboration_score DOUBLE PRECISION NOT NULL DEFAULT 0.5,
  trend TEXT NOT NULL DEFAULT 'stable',
  last_updated TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT agent_reputation_reliability_range CHECK (reliability_score BETWEEN 0.0 AND 1.0),
  CONSTRAINT agent_reputation_accountability_range CHECK (accountability_score BETWEEN 0.0 AND 1.0),
  CONSTRAINT agent_reputation_communication_range CHECK (communication_score BETWEEN 0.0 AND 1.0),
  CONSTRAINT agent_reputation_collaboration_range CHECK (collaboration_score BETWEEN 0.0 AND 1.0),
  CONSTRAINT agent_reputation_speed_check CHECK (speed_rating IN ('fast', 'on_track', 'slow', 'very_slow', 'unknown')),
  CONSTRAINT agent_reputation_quality_check CHECK (quality_rating IN ('excellent', 'good', 'average', 'poor', 'unknown')),
  CONSTRAINT agent_reputation_trend_check CHECK (trend IN ('improving', 'declining', 'stable'))
);

CREATE INDEX IF NOT EXISTS idx_agent_reputation_reliability
  ON agent_reputation (reliability_score DESC);
CREATE INDEX IF NOT EXISTS idx_agent_reputation_quality
  ON agent_reputation (quality_rating);
CREATE INDEX IF NOT EXISTS idx_agent_reputation_trend
  ON agent_reputation (trend);

-- ============================================================================
-- CORE TABLE 4: agent_track_record
-- Task completion history for reputation building
-- ============================================================================

CREATE TABLE IF NOT EXISTS agent_track_record (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id TEXT NOT NULL,
  task_id TEXT NOT NULL,
  task_name TEXT,
  category TEXT,
  planned_days INTEGER,
  actual_days INTEGER,
  quality_rating TEXT,
  delivered_status TEXT,
  completed_at TIMESTAMPTZ,
  notes TEXT,
  CONSTRAINT agent_track_record_category_check CHECK (category IS NULL OR category IN ('feature', 'bugfix', 'refactor', 'infrastructure')),
  CONSTRAINT agent_track_record_quality_check CHECK (quality_rating IS NULL OR quality_rating IN ('excellent', 'good', 'average', 'poor')),
  CONSTRAINT agent_track_record_status_check CHECK (delivered_status IS NULL OR delivered_status IN ('early', 'on_time', 'late', 'failed', 'partial'))
);

CREATE INDEX IF NOT EXISTS idx_agent_track_record_agent_completed
  ON agent_track_record (agent_id, completed_at DESC);
CREATE INDEX IF NOT EXISTS idx_agent_track_record_agent_status
  ON agent_track_record (agent_id, delivered_status);
CREATE INDEX IF NOT EXISTS idx_agent_track_record_status
  ON agent_track_record (delivered_status);

-- ============================================================================
-- CORE TABLE 5: agent_autonomy_config
-- Risk-based autonomy rules per agent
-- ============================================================================

CREATE TABLE IF NOT EXISTS agent_autonomy_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id TEXT NOT NULL,
  risk_level TEXT NOT NULL,
  definition TEXT,
  autonomy_type TEXT NOT NULL,
  conditions JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT agent_autonomy_risk_check CHECK (risk_level IN ('low', 'medium', 'high')),
  CONSTRAINT agent_autonomy_type_check CHECK (autonomy_type IN ('FULL', 'PROPOSE_THEN_DECIDE', 'ASK_THEN_WAIT'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_agent_autonomy_config_unique
  ON agent_autonomy_config (agent_id, risk_level);
CREATE INDEX IF NOT EXISTS idx_agent_autonomy_config_agent
  ON agent_autonomy_config (agent_id);
CREATE INDEX IF NOT EXISTS idx_agent_autonomy_config_risk
  ON agent_autonomy_config (risk_level);

-- ============================================================================
-- CORE TABLE 6: agent_intuition_rules
-- Pattern-action mappings with accuracy tracking
-- ============================================================================

CREATE TABLE IF NOT EXISTS agent_intuition_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id TEXT NOT NULL,
  pattern_name TEXT NOT NULL,
  pattern_description TEXT,
  trigger_conditions JSONB DEFAULT '{}',
  recommended_action TEXT,
  action_confidence DOUBLE PRECISION NOT NULL DEFAULT 0.5,
  times_triggered INTEGER NOT NULL DEFAULT 0,
  times_correct INTEGER NOT NULL DEFAULT 0,
  accuracy_rate DOUBLE PRECISION NOT NULL DEFAULT 0.0,
  CONSTRAINT agent_intuition_confidence_range CHECK (action_confidence BETWEEN 0.0 AND 1.0),
  CONSTRAINT agent_intuition_accuracy_range CHECK (accuracy_rate BETWEEN 0.0 AND 1.0),
  CONSTRAINT agent_intuition_correct_lte_triggered CHECK (times_correct <= times_triggered)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_agent_intuition_rules_unique
  ON agent_intuition_rules (agent_id, pattern_name);
CREATE INDEX IF NOT EXISTS idx_agent_intuition_rules_accuracy
  ON agent_intuition_rules (agent_id, accuracy_rate DESC);
CREATE INDEX IF NOT EXISTS idx_agent_intuition_rules_triggered
  ON agent_intuition_rules (agent_id, times_triggered DESC);

-- ============================================================================
-- CORE TABLE 7: agent_assertiveness_rules
-- Conflict response mapping: how agents push back by concern type/level
-- ============================================================================

CREATE TABLE IF NOT EXISTS agent_assertiveness_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id TEXT NOT NULL,
  concern_type TEXT,
  concern_level TEXT,
  trigger_conditions TEXT,
  recommended_response TEXT,
  alternatives JSONB DEFAULT '{}',
  escalation_path TEXT,
  CONSTRAINT agent_assertiveness_concern_type_check CHECK (concern_type IS NULL OR concern_type IN ('deadline', 'scope', 'design', 'metric', 'resources')),
  CONSTRAINT agent_assertiveness_concern_level_check CHECK (concern_level IS NULL OR concern_level IN ('critical', 'high', 'medium', 'low'))
);

CREATE INDEX IF NOT EXISTS idx_agent_assertiveness_agent_level
  ON agent_assertiveness_rules (agent_id, concern_level);
CREATE INDEX IF NOT EXISTS idx_agent_assertiveness_type
  ON agent_assertiveness_rules (concern_type);

-- ============================================================================
-- CORE TABLE 8: agent_person_insights
-- Per-person behavioral insights observed by agents
-- ============================================================================

CREATE TABLE IF NOT EXISTS agent_person_insights (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id TEXT NOT NULL,
  person_id TEXT NOT NULL,
  insight_type TEXT,
  insight_text TEXT NOT NULL,
  confidence DOUBLE PRECISION NOT NULL DEFAULT 0.5,
  evidence_count INTEGER NOT NULL DEFAULT 1,
  last_updated TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_confirmed TIMESTAMPTZ,
  CONSTRAINT agent_person_insights_confidence_range CHECK (confidence BETWEEN 0.0 AND 1.0),
  CONSTRAINT agent_person_insights_type_check CHECK (insight_type IS NULL OR insight_type IN ('reliability', 'communication_style', 'preference', 'skill_level', 'working_hours'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_agent_person_insights_unique
  ON agent_person_insights (agent_id, person_id, insight_type);
CREATE INDEX IF NOT EXISTS idx_agent_person_insights_agent_person
  ON agent_person_insights (agent_id, person_id);
CREATE INDEX IF NOT EXISTS idx_agent_person_insights_confidence
  ON agent_person_insights (agent_id, confidence DESC);
CREATE INDEX IF NOT EXISTS idx_agent_person_insights_type
  ON agent_person_insights (insight_type);

-- ============================================================================
-- CORE TABLE 9: agent_energy_state
-- Current energy/focus snapshot (one row per agent, upsert pattern)
-- ============================================================================

CREATE TABLE IF NOT EXISTS agent_energy_state (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id TEXT NOT NULL UNIQUE,
  current_hour TEXT,
  energy_level DOUBLE PRECISION NOT NULL DEFAULT 0.5,
  focus_level DOUBLE PRECISION NOT NULL DEFAULT 0.5,
  context_switches_today INTEGER NOT NULL DEFAULT 0,
  deep_work_minutes INTEGER NOT NULL DEFAULT 0,
  last_break TIMESTAMPTZ,
  quality_variance DOUBLE PRECISION NOT NULL DEFAULT 0.0,
  last_updated TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT agent_energy_state_energy_range CHECK (energy_level BETWEEN 0.0 AND 1.0),
  CONSTRAINT agent_energy_state_focus_range CHECK (focus_level BETWEEN 0.0 AND 1.0),
  CONSTRAINT agent_energy_state_variance_range CHECK (quality_variance BETWEEN 0.0 AND 1.0)
);

CREATE INDEX IF NOT EXISTS idx_agent_energy_state_agent
  ON agent_energy_state (agent_id);

-- ============================================================================
-- CORE TABLE 10: agent_energy_baselines
-- Per-agent optimal energy patterns (one row per agent)
-- ============================================================================

CREATE TABLE IF NOT EXISTS agent_energy_baselines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id TEXT NOT NULL UNIQUE,
  peak_hours TEXT[],
  low_hours TEXT[],
  max_deep_work_hours INTEGER NOT NULL DEFAULT 4,
  break_needed_after_hours INTEGER NOT NULL DEFAULT 3,
  recovery_break_minutes INTEGER NOT NULL DEFAULT 15,
  max_context_switches_per_day INTEGER NOT NULL DEFAULT 4
);

CREATE INDEX IF NOT EXISTS idx_agent_energy_baselines_agent
  ON agent_energy_baselines (agent_id);

-- ============================================================================
-- CORE TABLE 11: agent_mistake_patterns
-- Recurring error tracking with occurrence counts
-- ============================================================================

CREATE TABLE IF NOT EXISTS agent_mistake_patterns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id TEXT NOT NULL,
  mistake_type TEXT NOT NULL,
  description TEXT,
  occurrences INTEGER NOT NULL DEFAULT 1,
  last_occurrence TIMESTAMPTZ,
  recommended_action TEXT,
  fix_applied BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_agent_mistake_patterns_unique
  ON agent_mistake_patterns (agent_id, mistake_type);
CREATE INDEX IF NOT EXISTS idx_agent_mistake_patterns_occurrences
  ON agent_mistake_patterns (agent_id, occurrences DESC);
CREATE INDEX IF NOT EXISTS idx_agent_mistake_patterns_last
  ON agent_mistake_patterns (agent_id, last_occurrence DESC);

-- ============================================================================
-- CORE TABLE 12: agent_conflict_history
-- Dispute resolution log between agents
-- ============================================================================

CREATE TABLE IF NOT EXISTS agent_conflict_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id TEXT NOT NULL,
  other_agent_id TEXT,
  conflict_type TEXT,
  description TEXT,
  resolution TEXT,
  outcome TEXT,
  resolved_at TIMESTAMPTZ,
  resolved_by TEXT,
  CONSTRAINT agent_conflict_resolution_check CHECK (resolution IS NULL OR resolution IN ('agreed', 'escalated', 'waiting', 'resolved'))
);

CREATE INDEX IF NOT EXISTS idx_agent_conflict_history_agent_resolved
  ON agent_conflict_history (agent_id, resolved_at DESC);
CREATE INDEX IF NOT EXISTS idx_agent_conflict_history_agents
  ON agent_conflict_history (agent_id, other_agent_id);
CREATE INDEX IF NOT EXISTS idx_agent_conflict_history_type
  ON agent_conflict_history (conflict_type);

-- ============================================================================
-- TIME-SERIES TABLE 13: agent_decision_log
-- Decisions made over time with quality and outcomes
-- ============================================================================

CREATE TABLE IF NOT EXISTS agent_decision_log (
  time TIMESTAMPTZ NOT NULL,
  agent_id TEXT NOT NULL,
  decision_type TEXT NOT NULL,
  decision_quality TEXT NOT NULL,
  outcome TEXT,
  confidence_level INTEGER,
  impact_score DOUBLE PRECISION,
  context JSONB DEFAULT '{}',
  CONSTRAINT agent_decision_log_type_check CHECK (decision_type IN ('autonomous', 'proposed', 'asked', 'escalated')),
  CONSTRAINT agent_decision_log_quality_check CHECK (decision_quality IN ('excellent', 'good', 'acceptable', 'poor')),
  CONSTRAINT agent_decision_log_outcome_check CHECK (outcome IS NULL OR outcome IN ('success', 'failure', 'pending', 'partial')),
  CONSTRAINT agent_decision_log_confidence_range CHECK (confidence_level IS NULL OR confidence_level BETWEEN 1 AND 100),
  CONSTRAINT agent_decision_log_impact_range CHECK (impact_score IS NULL OR impact_score BETWEEN 0.0 AND 1.0)
);

CREATE INDEX IF NOT EXISTS idx_agent_decision_log_agent_time
  ON agent_decision_log (agent_id, time DESC);
CREATE INDEX IF NOT EXISTS idx_agent_decision_log_quality
  ON agent_decision_log (agent_id, decision_quality, time DESC);
CREATE INDEX IF NOT EXISTS idx_agent_decision_log_type
  ON agent_decision_log (agent_id, decision_type, time DESC);

-- ============================================================================
-- TIME-SERIES TABLE 14: agent_learning_progress
-- Skill proficiency curves over time
-- ============================================================================

CREATE TABLE IF NOT EXISTS agent_learning_progress (
  time TIMESTAMPTZ NOT NULL,
  agent_id TEXT NOT NULL,
  skill_name TEXT NOT NULL,
  proficiency DOUBLE PRECISION NOT NULL,
  improvement_rate DOUBLE PRECISION,
  practice_hours INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT agent_learning_proficiency_range CHECK (proficiency BETWEEN 0.0 AND 1.0)
);

CREATE INDEX IF NOT EXISTS idx_agent_learning_progress_agent_time
  ON agent_learning_progress (agent_id, time DESC);
CREATE INDEX IF NOT EXISTS idx_agent_learning_progress_skill
  ON agent_learning_progress (agent_id, skill_name, proficiency DESC);

-- ============================================================================
-- TIME-SERIES TABLE 15: agent_behavior_metrics
-- Output quality metrics over time
-- ============================================================================

CREATE TABLE IF NOT EXISTS agent_behavior_metrics (
  time TIMESTAMPTZ NOT NULL,
  agent_id TEXT NOT NULL,
  metric_type TEXT NOT NULL,
  metric_value DOUBLE PRECISION NOT NULL,
  context JSONB DEFAULT '{}',
  CONSTRAINT agent_behavior_metric_type_check CHECK (metric_type IN ('decision_quality', 'collaboration', 'output_quality', 'autonomy_level'))
);

CREATE INDEX IF NOT EXISTS idx_agent_behavior_metrics_agent_time
  ON agent_behavior_metrics (agent_id, time DESC);
CREATE INDEX IF NOT EXISTS idx_agent_behavior_metrics_type
  ON agent_behavior_metrics (metric_type, time DESC);

-- ============================================================================
-- TIME-SERIES TABLE 16: agent_reliability_history
-- Reputation score snapshots over time
-- ============================================================================

CREATE TABLE IF NOT EXISTS agent_reliability_history (
  time TIMESTAMPTZ NOT NULL,
  agent_id TEXT NOT NULL,
  on_time_rate DOUBLE PRECISION,
  quality_score DOUBLE PRECISION,
  accountability_score DOUBLE PRECISION,
  communication_score DOUBLE PRECISION,
  overall_reputation_score DOUBLE PRECISION
);

CREATE INDEX IF NOT EXISTS idx_agent_reliability_history_agent_time
  ON agent_reliability_history (agent_id, time DESC);
CREATE INDEX IF NOT EXISTS idx_agent_reliability_history_score
  ON agent_reliability_history (agent_id, overall_reputation_score, time DESC);

-- ============================================================================
-- TIME-SERIES TABLE 17: agent_energy_history
-- Energy/focus fluctuations over time
-- ============================================================================

CREATE TABLE IF NOT EXISTS agent_energy_history (
  time TIMESTAMPTZ NOT NULL,
  agent_id TEXT NOT NULL,
  energy_level DOUBLE PRECISION NOT NULL,
  focus_level DOUBLE PRECISION NOT NULL,
  quality_output DOUBLE PRECISION,
  context_switches INTEGER NOT NULL DEFAULT 0,
  deep_work_minutes INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT agent_energy_history_energy_range CHECK (energy_level BETWEEN 0.0 AND 1.0),
  CONSTRAINT agent_energy_history_focus_range CHECK (focus_level BETWEEN 0.0 AND 1.0),
  CONSTRAINT agent_energy_history_quality_range CHECK (quality_output IS NULL OR quality_output BETWEEN 0.0 AND 1.0)
);

CREATE INDEX IF NOT EXISTS idx_agent_energy_history_agent_time
  ON agent_energy_history (agent_id, time DESC);

-- ============================================================================
-- TIMESCALEDB: CONVERT TIME-SERIES TABLES TO HYPERTABLES
-- Guarded — gracefully skips if TimescaleDB is not installed
-- ============================================================================

DO $$ 
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'timescaledb') THEN
    PERFORM create_hypertable('agent_decision_log', 'time', if_not_exists => TRUE);
    PERFORM create_hypertable('agent_learning_progress', 'time', if_not_exists => TRUE);
    PERFORM create_hypertable('agent_behavior_metrics', 'time', if_not_exists => TRUE);
    PERFORM create_hypertable('agent_reliability_history', 'time', if_not_exists => TRUE);
    PERFORM create_hypertable('agent_energy_history', 'time', if_not_exists => TRUE);
  END IF;
END $$;

-- ============================================================================
-- TIMESCALEDB: CONTINUOUS AGGREGATES
-- 4 materialized views with automatic refresh
-- Guarded — only created when TimescaleDB is available
-- ============================================================================

-- 1. Daily behavior summary (from agent_behavior_metrics)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'timescaledb') THEN
    IF NOT EXISTS (
      SELECT 1 FROM timescaledb_information.continuous_aggregates
      WHERE view_name = 'agent_daily_behavior'
    ) THEN
      EXECUTE $agg$
        CREATE MATERIALIZED VIEW agent_daily_behavior
        WITH (timescaledb.continuous) AS
        SELECT
          time_bucket('1 day', time) AS day,
          agent_id,
          AVG(metric_value) AS avg_decision_quality,
          MAX(metric_value) AS peak_performance,
          MIN(metric_value) AS lowest_performance
        FROM agent_behavior_metrics
        WHERE metric_type = 'decision_quality'
        GROUP BY day, agent_id
        WITH NO DATA
      $agg$;
    END IF;
  END IF;
END $$;

-- 2. Hourly energy patterns (from agent_energy_history)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'timescaledb') THEN
    IF NOT EXISTS (
      SELECT 1 FROM timescaledb_information.continuous_aggregates
      WHERE view_name = 'agent_hourly_energy'
    ) THEN
      EXECUTE $agg$
        CREATE MATERIALIZED VIEW agent_hourly_energy
        WITH (timescaledb.continuous) AS
        SELECT
          time_bucket('1 hour', time) AS hour,
          agent_id,
          AVG(energy_level) AS avg_energy,
          AVG(focus_level) AS avg_focus,
          AVG(quality_output) AS avg_quality
        FROM agent_energy_history
        GROUP BY hour, agent_id
        WITH NO DATA
      $agg$;
    END IF;
  END IF;
END $$;

-- 3. Weekly learning progression (from agent_learning_progress)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'timescaledb') THEN
    IF NOT EXISTS (
      SELECT 1 FROM timescaledb_information.continuous_aggregates
      WHERE view_name = 'agent_weekly_learning'
    ) THEN
      EXECUTE $agg$
        CREATE MATERIALIZED VIEW agent_weekly_learning
        WITH (timescaledb.continuous) AS
        SELECT
          time_bucket('7 days', time) AS week,
          agent_id,
          skill_name,
          AVG(proficiency) AS avg_proficiency,
          MAX(improvement_rate) AS max_improvement,
          SUM(practice_hours) AS total_practice_hours
        FROM agent_learning_progress
        GROUP BY week, agent_id, skill_name
        WITH NO DATA
      $agg$;
    END IF;
  END IF;
END $$;

-- 4. Monthly reputation trends (from agent_reliability_history)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'timescaledb') THEN
    IF NOT EXISTS (
      SELECT 1 FROM timescaledb_information.continuous_aggregates
      WHERE view_name = 'agent_monthly_reputation'
    ) THEN
      EXECUTE $agg$
        CREATE MATERIALIZED VIEW agent_monthly_reputation
        WITH (timescaledb.continuous) AS
        SELECT
          time_bucket('30 days', time) AS month,
          agent_id,
          AVG(on_time_rate) AS on_time_rate,
          AVG(quality_score) AS quality_score,
          AVG(overall_reputation_score) AS overall_score
        FROM agent_reliability_history
        GROUP BY month, agent_id
        WITH NO DATA
      $agg$;
    END IF;
  END IF;
END $$;

-- ============================================================================
-- TIMESCALEDB: CONTINUOUS AGGREGATE REFRESH POLICIES
-- Guarded — only added when TimescaleDB is available
-- ============================================================================

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'timescaledb') THEN
    -- Daily behavior: refresh last 3 days every hour
    PERFORM add_continuous_aggregate_policy('agent_daily_behavior',
      start_offset => INTERVAL '3 days',
      end_offset => INTERVAL '1 hour',
      schedule_interval => INTERVAL '1 hour',
      if_not_exists => TRUE
    );

    -- Hourly energy: refresh last 4 hours every 30 minutes
    PERFORM add_continuous_aggregate_policy('agent_hourly_energy',
      start_offset => INTERVAL '4 hours',
      end_offset => INTERVAL '30 minutes',
      schedule_interval => INTERVAL '30 minutes',
      if_not_exists => TRUE
    );

    -- Weekly learning: refresh last 2 weeks every day
    PERFORM add_continuous_aggregate_policy('agent_weekly_learning',
      start_offset => INTERVAL '14 days',
      end_offset => INTERVAL '1 day',
      schedule_interval => INTERVAL '1 day',
      if_not_exists => TRUE
    );

    -- Monthly reputation: refresh last 2 months every day
    PERFORM add_continuous_aggregate_policy('agent_monthly_reputation',
      start_offset => INTERVAL '60 days',
      end_offset => INTERVAL '1 day',
      schedule_interval => INTERVAL '1 day',
      if_not_exists => TRUE
    );
  END IF;
END $$;

-- ============================================================================
-- TIMESCALEDB: RETENTION POLICIES
-- 90 days for detailed time-series data; aggregates kept forever
-- Guarded — only added when TimescaleDB is available
-- ============================================================================

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'timescaledb') THEN
    PERFORM add_retention_policy('agent_decision_log',     INTERVAL '90 days', if_not_exists => TRUE);
    PERFORM add_retention_policy('agent_learning_progress', INTERVAL '90 days', if_not_exists => TRUE);
    PERFORM add_retention_policy('agent_behavior_metrics',  INTERVAL '90 days', if_not_exists => TRUE);
    PERFORM add_retention_policy('agent_reliability_history', INTERVAL '90 days', if_not_exists => TRUE);
    PERFORM add_retention_policy('agent_energy_history',    INTERVAL '90 days', if_not_exists => TRUE);
  END IF;
END $$;

-- ============================================================================
-- DEFAULT DATA: Autonomy Config
-- Provides sensible defaults for any agent (agent_id = '__default__')
-- Applications should copy these when initializing a new agent.
-- ============================================================================

INSERT INTO agent_autonomy_config (agent_id, risk_level, definition, autonomy_type, conditions)
VALUES
  ('__default__', 'low',
   'Low-risk actions: formatting, documentation, simple queries, status checks',
   'FULL',
   '{"examples": ["update docs", "format code", "check status", "read files", "simple search"]}'::jsonb),
  ('__default__', 'medium',
   'Medium-risk actions: code changes, config updates, dependency changes',
   'PROPOSE_THEN_DECIDE',
   '{"examples": ["modify code", "update config", "add dependency", "refactor module", "create PR"]}'::jsonb),
  ('__default__', 'high',
   'High-risk actions: deployments, data migrations, security changes, external API calls',
   'ASK_THEN_WAIT',
   '{"examples": ["deploy to production", "run migration", "change permissions", "send email", "delete data"]}'::jsonb)
ON CONFLICT (agent_id, risk_level) DO NOTHING;

-- ============================================================================
-- TABLE COMMENTS
-- ============================================================================

COMMENT ON TABLE agent_memory IS 'Persistent agent memories: decisions, mistakes, patterns, insights. Importance 1-10, retention decays over time.';
COMMENT ON TABLE agent_relationships IS 'Trust and collaboration quality between agent pairs. Trust 0-1, tracks positive/negative interactions.';
COMMENT ON TABLE agent_reputation IS 'Multi-dimensional reputation per agent: reliability, speed, quality, accountability, communication, collaboration.';
COMMENT ON TABLE agent_track_record IS 'Task completion history: planned vs actual days, quality rating, delivery status.';
COMMENT ON TABLE agent_autonomy_config IS 'Risk-based autonomy rules: what agents can do independently vs need approval.';
COMMENT ON TABLE agent_intuition_rules IS 'Pattern-action rules with accuracy tracking. Agents learn which patterns lead to correct actions.';
COMMENT ON TABLE agent_assertiveness_rules IS 'How agents push back on unreasonable requests by concern type and severity.';
COMMENT ON TABLE agent_person_insights IS 'Per-person behavioral insights: reliability, communication style, preferences, skills.';
COMMENT ON TABLE agent_energy_state IS 'Current energy/focus snapshot per agent (upsert pattern). One row per agent.';
COMMENT ON TABLE agent_energy_baselines IS 'Optimal energy patterns per agent: peak hours, break needs, context switch limits.';
COMMENT ON TABLE agent_mistake_patterns IS 'Recurring errors with occurrence counts. Tracks whether fixes have been applied.';
COMMENT ON TABLE agent_conflict_history IS 'Dispute resolution log between agents: conflict type, resolution, outcome.';
COMMENT ON TABLE agent_decision_log IS 'Time-series: all decisions with quality scores and outcomes (TimescaleDB hypertable).';
COMMENT ON TABLE agent_learning_progress IS 'Time-series: skill proficiency curves over time (TimescaleDB hypertable).';
COMMENT ON TABLE agent_behavior_metrics IS 'Time-series: decision quality, collaboration, output quality metrics (TimescaleDB hypertable).';
COMMENT ON TABLE agent_reliability_history IS 'Time-series: reputation score snapshots over time (TimescaleDB hypertable).';
COMMENT ON TABLE agent_energy_history IS 'Time-series: energy and focus level fluctuations (TimescaleDB hypertable).';

-- ============================================================================
-- MIGRATION COMPLETE
-- ============================================================================

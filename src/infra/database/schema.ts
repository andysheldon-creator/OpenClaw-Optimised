/**
 * Database schema types for OpenClaw metrics.
 */

export type LlmUsageRow = {
  time: Date;
  provider_id: string;
  model_id: string;
  agent_id: string | null;
  session_id: string | null;
  input_tokens: number;
  output_tokens: number;
  cache_read_tokens: number;
  cache_write_tokens: number;
  cost_usd: number | null;
  duration_ms: number | null;
};

export type LlmUsageInsert = {
  time?: Date;
  providerId: string;
  modelId: string;
  agentId?: string;
  sessionId?: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens?: number;
  cacheWriteTokens?: number;
  costUsd?: number;
  durationMs?: number;
};

export type LlmUsageHourlyRow = {
  bucket: Date;
  provider_id: string;
  model_id: string;
  requests: number;
  total_input_tokens: number;
  total_output_tokens: number;
  total_cache_read_tokens: number;
  total_cache_write_tokens: number;
  total_cost: number | null;
};

export type UsageQueryFilter = {
  providerId?: string;
  modelId?: string;
  agentId?: string;
  startTime?: Date;
  endTime?: Date;
};

export type UsageAggregation = {
  providerId: string;
  modelId: string;
  requests: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  totalCost: number;
  lastUsed: Date | null;
};

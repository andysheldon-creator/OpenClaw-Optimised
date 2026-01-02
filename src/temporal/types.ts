/**
 * Temporal reasoning types for task duration learning, deadline intelligence,
 * and recurring task detection.
 *
 * These types are designed to integrate with the existing CronService and
 * memory system using TypeBox for schema validation.
 */

import { type Static, Type } from "@sinclair/typebox";

/**
 * Historical record of a task's execution duration.
 * Captured when a task completes, used for statistical analysis.
 */
export const TaskDurationRecordSchema = Type.Object(
  {
    id: Type.String({ format: "uuid" }),
    taskId: Type.String({ minLength: 1 }),
    taskName: Type.String({ minLength: 1 }),
    category: Type.String({ minLength: 1 }),
    tags: Type.Array(Type.String()),
    startedAtMs: Type.Integer({ minimum: 0 }),
    completedAtMs: Type.Integer({ minimum: 0 }),
    durationMs: Type.Integer({ minimum: 0 }),
    status: Type.Union([
      Type.Literal("ok"),
      Type.Literal("error"),
      Type.Literal("skipped"),
    ]),
    outcome: Type.Optional(Type.String()),
    metadata: Type.Optional(Type.Record(Type.String(), Type.Unknown())),
    expiresAtMs: Type.Optional(Type.Integer({ minimum: 0 })),
  },
  { additionalProperties: false },
);

export type TaskDurationRecord = Static<typeof TaskDurationRecordSchema>;

/**
 * Pre-computed statistics for a task or category.
 * Updated periodically from TaskDurationRecord entries.
 */
export const DurationStatisticsSchema = Type.Object(
  {
    key: Type.String({ minLength: 1 }),
    count: Type.Integer({ minimum: 1 }),
    mean: Type.Number({ minimum: 0 }),
    stddev: Type.Number({ minimum: 0 }),
    variance: Type.Number({ minimum: 0 }),
    median: Type.Number({ minimum: 0 }),
    p25: Type.Number({ minimum: 0 }),
    p75: Type.Number({ minimum: 0 }),
    p95: Type.Number({ minimum: 0 }),
    min: Type.Number({ minimum: 0 }),
    max: Type.Number({ minimum: 0 }),
    coefficientOfVariation: Type.Number({ minimum: 0, maximum: 1 }),
    exponentialMovingAverage: Type.Number({ minimum: 0 }),
    trend: Type.Number(), // Can be negative (improving)
    trendDirection: Type.Union([
      Type.Literal("improving"),
      Type.Literal("declining"),
      Type.Literal("stable"),
    ]),
    lastUpdatedMs: Type.Integer({ minimum: 0 }),
  },
  { additionalProperties: false },
);

export type DurationStatistics = Static<typeof DurationStatisticsSchema>;

/**
 * Smart deadline analysis with risk scoring and recommendations.
 */
export const DeadlineIntelligenceSchema = Type.Object(
  {
    id: Type.String({ format: "uuid" }),
    jobId: Type.String({ minLength: 1 }),
    jobName: Type.String({ minLength: 1 }),
    estimatedDurationMs: Type.Integer({ minimum: 0 }),
    estimationMethod: Type.Union([
      Type.Literal("ema"),
      Type.Literal("percentile"),
      Type.Literal("bayesian"),
      Type.Literal("three_point"),
    ]),
    estimationConfidence: Type.Number({ minimum: 0, maximum: 1 }),
    suggestedDeadlineMs: Type.Integer({ minimum: 0 }),
    bufferMs: Type.Integer({ minimum: 0 }),
    bufferReason: Type.String(),
    currentDeadlineMs: Type.Integer({ minimum: 0 }),
    slack: Type.Integer(), // Can be negative
    slackPercentage: Type.Number(),
    riskScore: Type.Number({ minimum: 0, maximum: 1 }),
    riskFactors: Type.Array(Type.String()),
    urgencyLevel: Type.Union([
      Type.Literal("low"),
      Type.Literal("medium"),
      Type.Literal("high"),
      Type.Literal("critical"),
    ]),
    recommendation: Type.String(),
    canBeDeferred: Type.Boolean(),
    alternativeDeadline: Type.Optional(Type.Integer({ minimum: 0 })),
    lastAnalyzedMs: Type.Integer({ minimum: 0 }),
  },
  { additionalProperties: false },
);

export type DeadlineIntelligence = Static<typeof DeadlineIntelligenceSchema>;

/**
 * Detected pattern of recurring task executions.
 */
export const RecurringPatternSchema = Type.Object(
  {
    id: Type.String({ format: "uuid" }),
    jobId: Type.String({ minLength: 1 }),
    jobName: Type.String({ minLength: 1 }),
    patternType: Type.Union([
      Type.Literal("daily"),
      Type.Literal("weekly"),
      Type.Literal("monthly"),
      Type.Literal("custom_interval"),
      Type.Literal("unknown"),
    ]),
    intervalMs: Type.Optional(Type.Integer({ minimum: 1000 })),
    dayOfWeek: Type.Optional(Type.Integer({ minimum: 0, maximum: 6 })),
    dayOfMonth: Type.Optional(Type.Integer({ minimum: 1, maximum: 31 })),
    isLastDayOfMonth: Type.Optional(Type.Boolean()),
    hour: Type.Optional(Type.Integer({ minimum: 0, maximum: 23 })),
    minute: Type.Optional(Type.Integer({ minimum: 0, maximum: 59 })),
    hourWindow: Type.Integer({ minimum: 0 }),
    regularity: Type.Number({ minimum: 0, maximum: 1 }),
    nextExpectedMs: Type.Integer({ minimum: 0 }),
    confidenceScore: Type.Number({ minimum: 0, maximum: 1 }),
    dataPoints: Type.Integer({ minimum: 1 }),
    dateRange: Type.Object({
      start: Type.Integer({ minimum: 0 }),
      end: Type.Integer({ minimum: 0 }),
    }),
    anomalies: Type.Array(Type.Integer()),
    calendarAlignment: Type.Optional(
      Type.Object({
        aligned: Type.Boolean(),
        reason: Type.String(),
      }),
    ),
    coreExpression: Type.Optional(Type.String()),
  },
  { additionalProperties: false },
);

export type RecurringPattern = Static<typeof RecurringPatternSchema>;

/**
 * Confidence-based time prediction with method and bounds.
 */
export const TimeEstimateSchema = Type.Object(
  {
    id: Type.String({ format: "uuid" }),
    taskReference: Type.String({ minLength: 1 }),
    method: Type.Union([
      Type.Literal("moving_average"),
      Type.Literal("histogram_percentile"),
      Type.Literal("bayesian"),
      Type.Literal("three_point"),
      Type.Literal("velocity_based"),
    ]),
    estimateMs: Type.Integer({ minimum: 0 }),
    optimisticMs: Type.Integer({ minimum: 0 }),
    pessimisticMs: Type.Integer({ minimum: 0 }),
    confidence: Type.Number({ minimum: 0, maximum: 1 }),
    confidenceFactors: Type.Object({
      sampleSize: Type.Integer({ minimum: 1 }),
      variance: Type.Number({ minimum: 0 }),
      recency: Type.Number({ minimum: 0, maximum: 1 }),
    }),
    rationale: Type.String(),
    basedOnDataPoints: Type.Integer({ minimum: 1 }),
    methodDetails: Type.Optional(Type.Record(Type.String(), Type.Unknown())),
    lastComputed: Type.Integer({ minimum: 0 }),
    validityMs: Type.Integer({ minimum: 60000 }),
  },
  { additionalProperties: false },
);

export type TimeEstimate = Static<typeof TimeEstimateSchema>;

/**
 * Configuration for temporal reasoning algorithms.
 */
export const TemporalConfigSchema = Type.Object(
  {
    enabled: Type.Boolean({ default: true }),
    // EMA configuration
    emaAlpha: Type.Number({ minimum: 0, maximum: 1, default: 0.3 }),
    // Percentile histogram configuration
    histogramSize: Type.Integer({ minimum: 10, maximum: 500, default: 50 }),
    // Pattern detection configuration
    minPatternDataPoints: Type.Integer({ minimum: 5, maximum: 100, default: 10 }),
    cvThresholdHighRegular: Type.Number({
      minimum: 0,
      maximum: 1,
      default: 0.15,
    }),
    cvThresholdRegular: Type.Number({
      minimum: 0,
      maximum: 1,
      default: 0.25,
    }),
    cvThresholdLikely: Type.Number({ minimum: 0, maximum: 1, default: 0.5 }),
    // Deadline intelligence configuration
    bufferMethod: Type.Union([Type.Literal("percentile"), Type.Literal("sigma")]),
    bufferPercentile: Type.Integer({ minimum: 50, maximum: 99, default: 75 }),
    bufferSigmaFactor: Type.Number({ minimum: 1, maximum: 3, default: 1.5 }),
    // Cache configuration
    statisticsCacheTtlMs: Type.Integer({ minimum: 60000, default: 300000 }),
    // Retention policy
    retentionDays: Type.Integer({ minimum: 7, maximum: 365, default: 90 }),
    maxRecordsPerTask: Type.Integer({ minimum: 100, maximum: 10000, default: 1000 }),
  },
  { additionalProperties: false },
);

export type TemporalConfig = Static<typeof TemporalConfigSchema>;

/**
 * Supported pattern types for recurring detection.
 */
export type PatternType = "daily" | "weekly" | "monthly" | "custom_interval" | "unknown";

/**
 * Supported urgency levels for deadline intelligence.
 */
export type UrgencyLevel = "low" | "medium" | "high" | "critical";

/**
 * Supported duration estimation methods.
 */
export type EstimationMethod = "moving_average" | "histogram_percentile" | "bayesian" | "three_point" | "velocity_based";

/**
 * Result of deadline intelligence analysis.
 */
export interface DeadlineAnalysisResult {
  riskScore: number;
  urgencyLevel: UrgencyLevel;
  suggestedBuffer: number;
  recommendation: string;
  canSafelyDefer: boolean;
}

/**
 * Result of recurring pattern detection.
 */
export interface PatternDetectionResult {
  detected: boolean;
  pattern: RecurringPattern | null;
  anomalyCount: number;
  regularityScore: number;
}

/**
 * Options for computing duration statistics.
 */
export interface ComputeStatisticsOptions {
  taskId?: string;
  category?: string;
  lookbackDays?: number;
  includeSkipped?: boolean;
}

/**
 * Options for deadline analysis.
 */
export interface AnalyzeDeadlineOptions {
  currentDeadlineMs: number;
  estimatedDurationMs?: number;
  bufferMs?: number;
}

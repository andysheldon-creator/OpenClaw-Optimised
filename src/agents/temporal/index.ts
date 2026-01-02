/**
 * Temporal Reasoning Module
 *
 * Provides task duration learning, deadline intelligence, and recurring
 * pattern detection for intelligent time management.
 */

export {
  // Type schemas (TypeBox)
  TaskDurationRecordSchema,
  RiskLevelSchema,
  DeadlineIntelligenceSchema,
  FrequencySchema,
  RecurringPatternSchema,
  EstimationBasisSchema,
  TimeEstimateSchema,
  // Types
  type TaskDurationRecord,
  type RiskLevel,
  type DeadlineIntelligence,
  type Frequency,
  type RecurringPattern,
  type EstimationBasis,
  type TimeEstimate,
  type RecurringSchedule,
  type RecurringTask,
  // Core functions
  recordTaskDuration,
  getTaskHistory,
  estimateTaskDuration,
  analyzeDeadline,
  detectRecurringPatterns,
  getCategoryStats,
  calculateUrgencyScore,
  suggestNextDeadline,
  // Recurring schedule functions
  parseRecurringSchedule,
  calculateNextOccurrence,
  formatRecurringSchedule,
  suggestOptimalSchedule,
  // Utilities
  formatDuration,
  parseDuration,
  describeRiskLevel,
} from "../temporal-reasoning.js";

/**
 * Agent Humanization System - TypeScript Models
 * Complete type definitions for all 8 humanization gaps
 */

// ============================================================================
// 1. MEMORY MODELS
// ============================================================================

export enum MemoryType {
  DECISION = "decision",
  MISTAKE = "mistake",
  PATTERN = "pattern",
  PERSON_INSIGHT = "person_insight",
  PROJECT_PATTERN = "project_pattern",
}

export interface AgentMemory {
  id: string;
  agentId: string;
  memoryType: MemoryType;
  title: string;
  content: string;
  context?: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
  importance: number; // 1-10
  retentionScore: number; // 0-1
}

export interface AgentDecision {
  id: string;
  agentId: string;
  decisionType: "autonomous" | "proposed" | "asked" | "escalated";
  decisionText: string;
  confidenceLevel?: number; // 1-100
  outcome?: "success" | "failure" | "pending" | "partial";
  lessonsLearned?: string;
  madeAt: Date;
  outcomeAt?: Date;
}

export interface PersonInsight {
  id: string;
  agentId: string;
  personId: string;
  insightType:
    | "reliability"
    | "communication_style"
    | "preference"
    | "skill_level"
    | "working_hours";
  insightText: string;
  confidence: number; // 0-1
  evidenceCount: number;
  lastUpdated: Date;
  lastConfirmed?: Date;
}

// ============================================================================
// 2. RELATIONSHIP MODELS
// ============================================================================

export interface AgentRelationship {
  id: string;
  agentId: string;
  otherAgentId: string;
  trustScore: number; // 0-1
  collaborationQuality: "excellent" | "good" | "neutral" | "poor" | "unknown";
  interactionCount: number;
  positiveInteractions: number;
  negativeInteractions: number;
  lastInteraction?: Date;
  notes?: string;
}

export interface TeamChemistry {
  id: string;
  agentId1: string;
  agentId2: string;
  chemistryScore: number; // 0-1
  worksWell: boolean;
  conflicts: boolean;
  conflictType?: "personality" | "style" | "priority" | "communication";
  notes?: string;
  lastAssessed: Date;
}

// ============================================================================
// 3. LEARNING MODELS
// ============================================================================

export interface AgentLearningLog {
  id: string;
  agentId: string;
  logDate: Date;
  whatWorked: string[];
  whatFailed: string[];
  lessonsLearned: string[];
  processImprovements: string[];
  skillsImproved: Record<string, number>; // skill -> improvement rate
  mistakes: Record<string, unknown>;
}

export interface MistakePattern {
  id: string;
  agentId: string;
  mistakeType: string;
  description?: string;
  occurrences: number;
  lastOccurrence?: Date;
  recommendedAction?: string;
  fixApplied: boolean;
}

export interface SkillProgression {
  skill: string;
  startProficiency: number; // 0-1
  currentProficiency: number; // 0-1
  improvementPercentage: number;
  practiceHours: number;
  estimatedMastery: number; // % until 1.0
}

// ============================================================================
// 4. AUTONOMY MODELS
// ============================================================================

export enum RiskLevel {
  LOW = "low",
  MEDIUM = "medium",
  HIGH = "high",
}

export enum AutonomyType {
  FULL = "FULL",
  PROPOSE_THEN_DECIDE = "PROPOSE_THEN_DECIDE",
  ASK_THEN_WAIT = "ASK_THEN_WAIT",
}

export interface AutonomyConfig {
  id: string;
  agentId: string;
  riskLevel: RiskLevel;
  definition: string;
  autonomyType: AutonomyType;
  conditions?: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

export interface DecisionMade {
  id: string;
  agentId: string;
  decisionType?: string;
  taskId?: string;
  decisionMade: boolean;
  decisionQuality: "excellent" | "good" | "acceptable" | "poor";
  decisionTime: Date;
  outcome?: string;
  impactScore?: number; // 0-1
}

// ============================================================================
// 5. REPUTATION MODELS
// ============================================================================

export interface AgentReputation {
  id: string;
  agentId: string;
  reliabilityScore: number; // 0-1
  speedRating: "fast" | "on_track" | "slow" | "very_slow" | "unknown";
  qualityRating: "excellent" | "good" | "average" | "poor" | "unknown";
  accountabilityScore: number; // 0-1
  communicationScore: number; // 0-1
  collaborationScore: number; // 0-1
  trend: "improving" | "declining" | "stable";
  lastUpdated: Date;
}

export interface TrackRecord {
  id: string;
  agentId: string;
  taskId: string;
  taskName?: string;
  category?: "feature" | "bugfix" | "refactor" | "infrastructure";
  plannedDays: number;
  actualDays: number;
  qualityRating: "excellent" | "good" | "average" | "poor";
  deliveredStatus: "early" | "on_time" | "late" | "failed" | "partial";
  completedAt: Date;
  notes?: string;
}

export interface ReputationSummary {
  agentId: string;
  overallScore: number; // 0-1
  reliabilityScore: number;
  speedRating: string;
  qualityRating: string;
  accountabilityScore: number;
  trend: string;
  totalTasks: number;
  onTimeRate: number; // 0-1
  avgQualityScore: number; // 0-1
  growthTrajectory: number; // -1 to +1, improving vs declining
}

// ============================================================================
// 6. INTUITION MODELS
// ============================================================================

export interface IntuitionRule {
  id: string;
  agentId: string;
  patternName: string;
  patternDescription: string;
  triggerConditions?: Record<string, unknown>;
  recommendedAction: string;
  actionConfidence: number; // 0-1
  timesTriggered: number;
  timesCorrect: number;
  accuracyRate: number; // times_correct / times_triggered
}

export interface PatternMatch {
  id: string;
  agentId: string;
  ruleId: string;
  matchedContext?: Record<string, unknown>;
  actionTaken: string;
  outcome: "correct" | "incorrect" | "partial" | "unknown";
  matchedAt: Date;
}

// ============================================================================
// 7. ENERGY MODELS
// ============================================================================

export interface EnergyBaseline {
  id: string;
  agentId: string;
  peakHours: string[]; // ['09:00-12:00', '14:00-16:00']
  lowHours: string[];
  maxDeepWorkHours: number;
  breakNeededAfterHours: number;
  recoveryBreakMinutes: number;
  maxContextSwitchesPerDay: number;
}

export interface EnergyState {
  id: string;
  agentId: string;
  currentHour: string;
  energyLevel: number; // 0-1
  focusLevel: number; // 0-1
  contextSwitchesToday: number;
  deepWorkMinutes: number;
  lastBreak?: Date;
  qualityVariance: number; // 0-1
  lastUpdated: Date;
}

export interface EnergyHistory {
  time: Date;
  agentId: string;
  energyLevel: number;
  focusLevel: number;
  qualityOutput?: number;
  contextSwitches: number;
  deepWorkMinutes: number;
}

// ============================================================================
// 8. NEGOTIATION MODELS
// ============================================================================

export interface AssertivenessRule {
  id: string;
  agentId: string;
  concernType: "deadline" | "scope" | "design" | "metric" | "resources";
  concernLevel: "critical" | "high" | "medium" | "low";
  triggerConditions?: string;
  recommendedResponse: string;
  alternatives?: Record<string, unknown>;
  escalationPath?: string;
}

export interface ConflictHistory {
  id: string;
  agentId: string;
  otherAgentId?: string;
  conflictType: string;
  description?: string;
  resolution: "agreed" | "escalated" | "waiting" | "resolved";
  outcome?: string;
  resolvedAt?: Date;
  resolvedBy?: string;
}

// ============================================================================
// TIME-SERIES MODELS
// ============================================================================

export interface BehaviorMetric {
  time: Date;
  agentId: string;
  metricType: "decision_quality" | "collaboration" | "output_quality" | "autonomy_level";
  metricValue: number;
  context?: Record<string, unknown>;
}

export interface DecisionLog {
  time: Date;
  agentId: string;
  decisionType: "autonomous" | "proposed" | "asked" | "escalated";
  decisionQuality: "excellent" | "good" | "acceptable" | "poor";
  outcome?: "success" | "failure" | "pending" | "partial";
  confidenceLevel?: number;
  impactScore?: number;
  context?: Record<string, unknown>;
}

export interface LearningProgress {
  time: Date;
  agentId: string;
  skillName: string;
  proficiency: number; // 0-1
  improvementRate?: number;
  practiceHours: number;
}

export interface ReliabilityHistory {
  time: Date;
  agentId: string;
  onTimeRate: number;
  qualityScore: number;
  accountabilityScore: number;
  communicationScore: number;
  overallReputationScore: number;
}

// ============================================================================
// COMPOSITE/AGGREGATE MODELS
// ============================================================================

export interface AgentHumanizationProfile {
  agentId: string;
  memory: AgentMemory[];
  relationships: AgentRelationship[];
  reputation: AgentReputation;
  trackRecord: TrackRecord[];
  learningProgress: SkillProgression[];
  currentEnergy: EnergyState;
  autonomyConfig: AutonomyConfig[];
  intuitionRules: IntuitionRule[];
  assertivenessRules: AssertivenessRule[];
}

export interface HumanizationRequest {
  agentId: string;
  context: "decision" | "interaction" | "task" | "learning" | "conflict";
  details: Record<string, unknown>;
  timestamp: Date;
}

export interface HumanizationResponse {
  agentId: string;
  recommendation: string;
  autonomyLevel?: AutonomyType;
  relevantMemories?: AgentMemory[];
  relatedPeople?: PersonInsight[];
  energyFactor?: number; // 0-1, quality adjustment based on energy
  confidenceScore: number; // 0-1, how confident in the recommendation
}

// ============================================================================
// ANALYTICS MODELS
// ============================================================================

export interface AgentDailyBehavior {
  day: Date;
  agentId: string;
  avgDecisionQuality: number;
  peakPerformance: number;
  lowestPerformance: number;
}

export interface AgentHourlyEnergyPattern {
  hour: Date;
  agentId: string;
  avgEnergy: number;
  avgFocus: number;
  avgQuality: number;
}

export interface AgentWeeklyLearning {
  week: Date;
  agentId: string;
  skillName: string;
  avgProficiency: number;
  maxImprovement: number;
  totalPracticeHours: number;
}

export interface AgentMonthlyReputation {
  month: Date;
  agentId: string;
  onTimeRate: number;
  qualityScore: number;
  overallScore: number;
}

// ============================================================================
// DATABASE CONNECTION MODELS
// ============================================================================

export interface DatabaseConfig {
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
}

export interface RedisConfig {
  host: string;
  port: number;
  db?: number;
}

export interface ConnectionPool {
  pg: unknown; // PostgreSQL pool
  redis: unknown; // Redis client
  initialized: boolean;
}

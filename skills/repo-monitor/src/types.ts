/**
 * Repo Monitor V2 - Type Definitions
 */

// ============================================================================
// Configuration
// ============================================================================

export interface MonitorConfig {
  repo: string;
  intervalHours: number;
  stateFile: string;
  reportsDir: string;
  skillsDir: string;
  historyFile: string;
  dashboardFile: string;
}

// ============================================================================
// State Persistence
// ============================================================================

export interface MonitorState {
  lastRunAt: string | null;
  lastOpenPRs: number | null;
  lastOpenIssues: number | null;
  totalLinksPosted: number;
  knownContributors: string[];
  lastHighlights: string[];
}

// ============================================================================
// GitHub Data Types
// ============================================================================

export interface GitHubIssue {
  number: number;
  title: string;
  body: string | null;
  html_url: string;
  state: string;
  created_at: string;
  updated_at: string;
  closed_at: string | null;
  comments: number;
  reactions?: {
    total_count: number;
    "+1": number;
    "-1": number;
  };
  labels: Array<{ name: string; color: string }>;
  user: { login: string };
  assignee: { login: string } | null;
  assignees: Array<{ login: string }>;
  pull_request?: { url: string };
}

export interface GitHubPR {
  number: number;
  title: string;
  body: string | null;
  html_url: string;
  state: string;
  created_at: string;
  updated_at: string;
  closed_at: string | null;
  merged_at: string | null;
  draft: boolean;
  user: { login: string };
  labels: Array<{ name: string }>;
  requested_reviewers: Array<{ login: string }>;
  head: { ref: string };
  base: { ref: string };
}

export interface GitHubEvent {
  id: string;
  type: string;
  actor: { login: string };
  created_at: string;
  payload: Record<string, unknown>;
}

// ============================================================================
// Module Output Types
// ============================================================================

export interface VitalSigns {
  windowHours: number;
  windowSource: "since last run" | "configured" | "manual";
  prs: {
    created: number;
    closed: number;
    merged: number;
    openNow: number;
    netDelta: number;
  };
  issues: {
    created: number;
    closed: number;
    openNow: number;
    netDelta: number;
  };
  mergeRate: number; // merged / created
  health: "healthy" | "warning" | "critical";
}

export interface HotZone {
  label: string;
  count: number;
  delta: number; // change from last run
  trend: "up" | "down" | "stable";
}

export interface ContributorInfo {
  login: string;
  activity: number; // PRs + issues in period
  type: "top" | "active" | "newcomer" | "returned";
  firstPR?: boolean;
  details?: string;
}

export interface ContributorPulse {
  top: ContributorInfo[];
  newcomers: ContributorInfo[];
  returned: ContributorInfo[];
  goneQuiet: string[];
}

export interface InterventionOpportunity {
  type: "needs-response" | "active-discussion" | "awaiting-review" | "has-solution" | "stuck";
  number: number;
  title: string;
  url: string;
  reason: string;
  age: string;
  priority: "high" | "medium" | "low";
  suggestedAction: string;
}

export interface QuickWin {
  number: number;
  title: string;
  url: string;
  score: number;
  signals: string[];
  suggestedLevel: "beginner" | "intermediate" | "advanced";
}

export interface AttentionItem {
  type: "stale-pr" | "stale-issue" | "stuck-review" | "ci-failing" | "conflict";
  number: number;
  title: string;
  url: string;
  reason: string;
  staleDays: number;
  author: string;
}

export interface Highlight {
  type: "achievement" | "milestone" | "notable" | "warning";
  icon: string;
  message: string;
}

// ============================================================================
// Full Report
// ============================================================================

export interface MonitorReport {
  timestamp: string;
  repo: string;
  vitalSigns: VitalSigns;
  hotZones: HotZone[];
  contributorPulse: ContributorPulse;
  interventions: InterventionOpportunity[];
  quickWins: QuickWin[];
  attentionNeeded: AttentionItem[];
  highlights: Highlight[];
  suggestedAction: {
    action: string;
    target: string;
    reason: string;
  } | null;
}

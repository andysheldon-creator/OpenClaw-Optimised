/**
 * Repo Monitor V2 - Historical Data Storage
 * Stores metrics over time for dashboard visualization
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from "fs";
import { dirname } from "path";
import type { MonitorReport } from "./types.js";

// ============================================================================
// Types
// ============================================================================

export interface HistoricalDataPoint {
  timestamp: string;
  windowHours: number;
  
  // PR metrics
  prsCreated: number;
  prsClosed: number;
  prsMerged: number;
  prsOpen: number;
  prsNetDelta: number;
  
  // Issue metrics
  issuesCreated: number;
  issuesClosed: number;
  issuesOpen: number;
  issuesNetDelta: number;
  
  // Rates
  mergeRate: number;
  health: "healthy" | "warning" | "critical";
  
  // Activity metrics
  totalActivity: number; // sum of all created + closed
  
  // Hot zones (top 10)
  hotZones: Array<{ label: string; count: number }>;
  
  // Contributors
  topContributors: Array<{ login: string; activity: number }>;
  newcomersCount: number;
  returnedCount: number;
  
  // Quick wins
  quickWinsCount: number;
  topQuickWinScore: number;
  
  // Attention items
  attentionItemsCount: number;
  stalePRsCount: number;
  staleIssuesCount: number;
}

export interface HistoricalData {
  repo: string;
  createdAt: string;
  updatedAt: string;
  dataPoints: HistoricalDataPoint[];
}

// ============================================================================
// Storage
// ============================================================================

const MAX_DATA_POINTS = 1000; // Keep last 1000 data points (~166 days at 4h intervals)

export function loadHistory(historyFile: string): HistoricalData | null {
  try {
    if (existsSync(historyFile)) {
      const raw = readFileSync(historyFile, "utf-8");
      return JSON.parse(raw) as HistoricalData;
    }
  } catch {
    // Return null on error
  }
  return null;
}

export function saveHistory(historyFile: string, history: HistoricalData): void {
  try {
    mkdirSync(dirname(historyFile), { recursive: true });
    writeFileSync(historyFile, JSON.stringify(history, null, 2));
  } catch (err) {
    console.error(`Failed to save history: ${err}`);
  }
}

// ============================================================================
// Conversion
// ============================================================================

export function reportToDataPoint(report: MonitorReport): HistoricalDataPoint {
  const vs = report.vitalSigns;
  
  // Count stale items by type
  const stalePRs = report.attentionNeeded.filter(a => a.type === "stale-pr").length;
  const staleIssues = report.attentionNeeded.filter(a => a.type === "stale-issue").length;
  
  return {
    timestamp: report.timestamp,
    windowHours: vs.windowHours,
    
    // PR metrics
    prsCreated: vs.prs.created,
    prsClosed: vs.prs.closed,
    prsMerged: vs.prs.merged,
    prsOpen: vs.prs.openNow,
    prsNetDelta: vs.prs.netDelta,
    
    // Issue metrics
    issuesCreated: vs.issues.created,
    issuesClosed: vs.issues.closed,
    issuesOpen: vs.issues.openNow,
    issuesNetDelta: vs.issues.netDelta,
    
    // Rates
    mergeRate: vs.mergeRate,
    health: vs.health,
    
    // Activity
    totalActivity: vs.prs.created + vs.prs.closed + vs.issues.created + vs.issues.closed,
    
    // Hot zones (top 10)
    hotZones: report.hotZones.slice(0, 10).map(z => ({ label: z.label, count: z.count })),
    
    // Contributors
    topContributors: report.contributorPulse.top.slice(0, 10).map(c => ({ 
      login: c.login, 
      activity: c.activity 
    })),
    newcomersCount: report.contributorPulse.newcomers.length,
    returnedCount: report.contributorPulse.returned.length,
    
    // Quick wins
    quickWinsCount: report.quickWins.length,
    topQuickWinScore: report.quickWins[0]?.score ?? 0,
    
    // Attention items
    attentionItemsCount: report.attentionNeeded.length,
    stalePRsCount: stalePRs,
    staleIssuesCount: staleIssues,
  };
}

export function addDataPoint(
  historyFile: string,
  repo: string,
  report: MonitorReport
): HistoricalData {
  const dataPoint = reportToDataPoint(report);
  
  let history = loadHistory(historyFile);
  
  if (!history) {
    history = {
      repo,
      createdAt: report.timestamp,
      updatedAt: report.timestamp,
      dataPoints: [],
    };
  }
  
  // Add new data point
  history.dataPoints.push(dataPoint);
  history.updatedAt = report.timestamp;
  
  // Trim to max size (keep most recent)
  if (history.dataPoints.length > MAX_DATA_POINTS) {
    history.dataPoints = history.dataPoints.slice(-MAX_DATA_POINTS);
  }
  
  // Save
  saveHistory(historyFile, history);
  
  return history;
}

// ============================================================================
// Aggregation helpers for dashboard
// ============================================================================

export interface AggregatedMetrics {
  // Time range
  startDate: string;
  endDate: string;
  totalDataPoints: number;
  
  // Totals
  totalPRsCreated: number;
  totalPRsClosed: number;
  totalPRsMerged: number;
  totalIssuesCreated: number;
  totalIssuesClosed: number;
  
  // Averages
  avgMergeRate: number;
  avgPRsPerDay: number;
  avgIssuesPerDay: number;
  
  // Current state
  currentOpenPRs: number;
  currentOpenIssues: number;
  
  // Health distribution
  healthCounts: { healthy: number; warning: number; critical: number };
  
  // Top contributors (all time in data)
  allTimeContributors: Map<string, number>;
  
  // Hot zones frequency
  hotZoneFrequency: Map<string, number>;
}

export function aggregateHistory(history: HistoricalData): AggregatedMetrics {
  const points = history.dataPoints;
  
  if (points.length === 0) {
    return {
      startDate: "",
      endDate: "",
      totalDataPoints: 0,
      totalPRsCreated: 0,
      totalPRsClosed: 0,
      totalPRsMerged: 0,
      totalIssuesCreated: 0,
      totalIssuesClosed: 0,
      avgMergeRate: 0,
      avgPRsPerDay: 0,
      avgIssuesPerDay: 0,
      currentOpenPRs: 0,
      currentOpenIssues: 0,
      healthCounts: { healthy: 0, warning: 0, critical: 0 },
      allTimeContributors: new Map(),
      hotZoneFrequency: new Map(),
    };
  }
  
  const contributors = new Map<string, number>();
  const hotZones = new Map<string, number>();
  const healthCounts = { healthy: 0, warning: 0, critical: 0 };
  
  let totalPRsCreated = 0;
  let totalPRsClosed = 0;
  let totalPRsMerged = 0;
  let totalIssuesCreated = 0;
  let totalIssuesClosed = 0;
  let totalMergeRate = 0;
  
  for (const p of points) {
    totalPRsCreated += p.prsCreated;
    totalPRsClosed += p.prsClosed;
    totalPRsMerged += p.prsMerged;
    totalIssuesCreated += p.issuesCreated;
    totalIssuesClosed += p.issuesClosed;
    totalMergeRate += p.mergeRate;
    healthCounts[p.health]++;
    
    for (const c of p.topContributors) {
      contributors.set(c.login, (contributors.get(c.login) ?? 0) + c.activity);
    }
    
    for (const z of p.hotZones) {
      hotZones.set(z.label, (hotZones.get(z.label) ?? 0) + z.count);
    }
  }
  
  const startDate = points[0].timestamp;
  const endDate = points[points.length - 1].timestamp;
  const daysDiff = Math.max(1, (new Date(endDate).getTime() - new Date(startDate).getTime()) / (1000 * 60 * 60 * 24));
  
  const latest = points[points.length - 1];
  
  return {
    startDate,
    endDate,
    totalDataPoints: points.length,
    totalPRsCreated,
    totalPRsClosed,
    totalPRsMerged,
    totalIssuesCreated,
    totalIssuesClosed,
    avgMergeRate: Math.round(totalMergeRate / points.length),
    avgPRsPerDay: Math.round(totalPRsCreated / daysDiff),
    avgIssuesPerDay: Math.round(totalIssuesCreated / daysDiff),
    currentOpenPRs: latest.prsOpen,
    currentOpenIssues: latest.issuesOpen,
    healthCounts,
    allTimeContributors: contributors,
    hotZoneFrequency: hotZones,
  };
}

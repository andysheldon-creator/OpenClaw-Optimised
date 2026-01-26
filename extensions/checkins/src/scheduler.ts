/**
 * Cron job scheduler for check-in triggers.
 * Manages cron job configurations for individual member check-ins.
 */

import type { CronJobCreate } from "../../../src/cron/types.js";
import type { CheckinsStorage, Member, Team } from "./storage.js";

/**
 * Convert "HH:MM" time string to cron expression.
 * @param timeStr - Time in 24-hour format (e.g., "17:00")
 * @returns Cron expression (e.g., "0 17 * * *")
 */
export function convertTimeToCronExpr(timeStr: string): string {
  const [hour, minute] = timeStr.split(":");
  return `${minute} ${hour} * * *`;
}

/**
 * Get consistent cron job ID for a member.
 * @param memberId - Member UUID
 * @returns Job ID string
 */
export function getCheckInJobId(memberId: string): string {
  return `checkins-trigger-${memberId}`;
}

/**
 * Build cron job configuration for a member's check-in.
 * @param member - Member entity
 * @param team - Team entity
 * @returns CronJobCreate configuration
 */
export function buildCheckInCronJob(member: Member, team: Team): CronJobCreate {
  return {
    name: `Check-in: ${member.displayName ?? member.discordUserId}`,
    description: `Daily check-in for team ${team.name}`,
    enabled: true,
    schedule: {
      kind: "cron",
      expr: convertTimeToCronExpr(member.schedule.checkInTime),
      tz: member.schedule.timezone,
    },
    sessionTarget: "isolated",
    wakeMode: "now",
    payload: {
      kind: "agentTurn",
      message: `[system] checkins:trigger:${member.id}:${team.id}`,
      deliver: false,
    },
  };
}

/**
 * Build cron job configurations for all members across all teams.
 * Used during gateway startup to schedule all check-ins.
 *
 * @param storage - Storage instance
 * @returns Array of cron job configurations
 */
export function scheduleAllMembers(storage: CheckinsStorage): CronJobCreate[] {
  const jobs: CronJobCreate[] = [];

  // Get all teams and their members
  for (const team of storage.getAllTeams()) {
    for (const member of storage.listMembers(team.id)) {
      jobs.push(buildCheckInCronJob(member, team));
    }
  }

  return jobs;
}

/**
 * Get the job ID for unscheduling a member's check-in.
 * @param memberId - Member UUID
 * @returns Job ID to remove
 */
export function getUnscheduleJobId(memberId: string): string {
  return getCheckInJobId(memberId);
}

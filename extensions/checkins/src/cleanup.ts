/**
 * Midnight cleanup for expired check-in conversations.
 * Runs at 00:05 in each unique timezone to clean up incomplete check-ins.
 */

import type { CronJobCreate } from "../../../src/cron/types.js";
import type { CheckinsStorage } from "./storage.js";

/**
 * Get consistent cleanup job ID for a timezone.
 * @param timezone - IANA timezone string (e.g., "America/New_York")
 * @returns Job ID string (slashes replaced with dashes)
 */
export function getCleanupJobId(timezone: string): string {
  return `checkins-cleanup-${timezone.replace(/\//g, "-")}`;
}

/**
 * Clean up expired check-in conversations for a specific timezone.
 * Silently deletes conversation state without notifying members.
 *
 * @param storage - Storage instance
 * @param timezone - Timezone to clean up (IANA format)
 * @returns Count of deleted conversations
 */
export function cleanupExpiredConversations(storage: CheckinsStorage, timezone: string): number {
  let deletedCount = 0;

  // Get all active conversations
  const conversations = storage.listActiveConversations();

  // Filter to this timezone and delete
  for (const conv of conversations) {
    const member = storage.getMember(conv.memberId);
    if (member && member.schedule.timezone === timezone) {
      storage.deleteConversationState(conv.memberId);
      deletedCount++;
    }
  }

  return deletedCount;
}

/**
 * Build cron job configurations for midnight cleanup across all timezones.
 * Creates one cleanup job per unique timezone found in members.
 *
 * @param storage - Storage instance
 * @returns Array of cleanup cron job configurations
 */
export function buildCleanupCronJobs(storage: CheckinsStorage): CronJobCreate[] {
  // Collect unique timezones from all members
  const timezones = new Set<string>();

  for (const team of storage.getAllTeams()) {
    for (const member of storage.listMembers(team.id)) {
      timezones.add(member.schedule.timezone);
    }
  }

  // Build cleanup job for each timezone
  const jobs: CronJobCreate[] = [];
  for (const tz of timezones) {
    jobs.push({
      name: `Midnight cleanup: ${tz}`,
      description: "Clean up expired check-in conversations",
      enabled: true,
      schedule: {
        kind: "cron",
        expr: "5 0 * * *", // 00:05 (5 minutes past midnight per RESEARCH.md)
        tz,
      },
      sessionTarget: "isolated",
      wakeMode: "now",
      payload: {
        kind: "agentTurn",
        message: `[system] checkins:cleanup:${tz}`,
        deliver: false,
      },
    });
  }

  return jobs;
}

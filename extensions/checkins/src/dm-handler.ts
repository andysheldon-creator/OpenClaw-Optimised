/**
 * DM response handling and check-in triggering for Discord conversations.
 */

import type { CheckinsStorage, Member, Team } from "./storage.js";
import { initiateCheckIn, advanceConversation } from "./conversation.js";
import { formatCheckInPost, formatConfirmation } from "./formatter.js";
import { getQuestion } from "./questions.js";
import { sendMessageDiscord } from "clawdbot/plugin-sdk";

/**
 * Get the current day-of-week (0=Sunday, 6=Saturday) in a specific timezone.
 * @param timezone - IANA timezone string
 * @returns Day of week number (0-6, where 0 is Sunday)
 */
function getDayOfWeekInTimezone(timezone: string): number {
  const formatter = new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    timeZone: timezone,
  });
  const dayStr = formatter.format(new Date()); // "Sun", "Mon", "Tue", etc.
  const days: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };
  return days[dayStr] ?? 1; // Default to Monday if parse fails
}

/**
 * Get the start of the current day (midnight) in a specific timezone as a UTC timestamp.
 * @param timezone - IANA timezone string
 * @returns UTC timestamp of midnight in that timezone
 */
function getStartOfDayInTimezone(timezone: string): number {
  const now = new Date();
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = formatter.formatToParts(now);
  const year = parts.find((p) => p.type === "year")?.value ?? "2026";
  const month = parts.find((p) => p.type === "month")?.value ?? "01";
  const day = parts.find((p) => p.type === "day")?.value ?? "01";

  // Create a date string and parse it in the target timezone
  const dateStr = `${year}-${month}-${day}T00:00:00`;
  const midnightLocal = new Date(dateStr);

  // Calculate the offset for the timezone
  const utcFormatter = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    hour: "numeric",
    minute: "numeric",
    hour12: false,
  });
  const nowInTz = utcFormatter.format(now);
  const [hours, minutes] = nowInTz.split(":").map(Number);
  const nowUtc = now.getUTCHours() * 60 + now.getUTCMinutes();
  const nowTz = hours * 60 + minutes;
  const offsetMinutes = nowTz - nowUtc;

  // Adjust midnight to UTC
  return midnightLocal.getTime() - offsetMinutes * 60 * 1000;
}

/**
 * Find a member by their Discord user ID across all teams.
 * @param storage - Storage instance
 * @param discordUserId - Discord user ID
 * @returns Member and team if found, null otherwise
 */
export function findMemberByDiscordUserId(
  storage: CheckinsStorage,
  discordUserId: string,
): { member: Member; team: Team } | null {
  for (const team of storage.getAllTeams()) {
    const member = storage.getMemberByDiscordId(team.id, discordUserId);
    if (member) {
      return { member, team };
    }
  }
  return null;
}

/**
 * Trigger a check-in for a member (called by scheduler).
 * Handles vacation status and weekend skipping in member's timezone.
 *
 * @param storage - Storage instance
 * @param memberId - Member UUID
 * @param teamId - Team UUID
 * @param discordAccountId - Optional Discord account ID for sending
 */
export async function triggerCheckIn(
  storage: CheckinsStorage,
  memberId: string,
  teamId: string,
  discordAccountId?: string,
): Promise<void> {
  const member = storage.getMember(memberId);
  if (!member) {
    // Member was deleted, skip silently
    return;
  }

  // Check vacation status
  if (member.vacationUntil && member.vacationUntil > Date.now()) {
    // Member is on vacation, skip silently
    return;
  }

  // Check weekend skip (if enabled, check in member's timezone)
  if (member.schedule.skipWeekends) {
    const dayOfWeek = getDayOfWeekInTimezone(member.schedule.timezone);
    if (dayOfWeek === 0 || dayOfWeek === 6) {
      // Saturday or Sunday in member's timezone, skip silently
      return;
    }
  }

  // Check if there's already an active conversation (e.g., manual check-in in progress)
  const existingConversation = storage.getConversationState(memberId);
  if (existingConversation) {
    // Already in a check-in conversation, skip
    return;
  }

  // Check if member already checked in today (in their timezone)
  const startOfDay = getStartOfDayInTimezone(member.schedule.timezone);
  const todaysCheckins = storage.listCheckins({
    memberId,
    teamId,
    since: startOfDay,
  });
  if (todaysCheckins.length > 0) {
    // Already checked in today, skip scheduled check-in
    return;
  }

  // Initiate conversation state
  initiateCheckIn(storage, memberId, teamId);

  // Send first question via DM
  try {
    await sendMessageDiscord(`user:${member.discordUserId}`, getQuestion(1), {
      accountId: discordAccountId,
    });
  } catch (err) {
    // Log error but don't crash
    console.error(`[checkins] Failed to send DM to user ${member.discordUserId}:`, err);
  }
}

/**
 * Check if a message is a manual check-in trigger.
 * Recognizes variations like "checkin", "check in", "standup", "start checkin", etc.
 */
function isManualCheckInTrigger(text: string): boolean {
  const normalized = text.toLowerCase().trim();
  const triggers = [
    "checkin",
    "check in",
    "check-in",
    "standup",
    "stand up",
    "stand-up",
    "start checkin",
    "start check-in",
    "start standup",
    "begin checkin",
    "begin standup",
    "do checkin",
    "do standup",
    "manual checkin",
    "submit standup",
  ];
  return triggers.some((t) => normalized === t || normalized.startsWith(t + " "));
}

/**
 * Handle a DM response from a member and advance the check-in conversation.
 * Also handles manual check-in triggers like "checkin" or "standup".
 *
 * @param storage - Storage instance
 * @param discordUserId - Discord user ID who sent the message
 * @param messageText - Message text content
 * @param discordAccountId - Optional Discord account ID for sending
 * @returns true if the message was handled, false otherwise
 */
export async function handleDmResponse(
  storage: CheckinsStorage,
  discordUserId: string,
  messageText: string,
  discordAccountId?: string,
): Promise<boolean> {
  // Find member by Discord user ID
  const found = findMemberByDiscordUserId(storage, discordUserId);
  if (!found) {
    // Not a team member, ignore DM
    return false;
  }

  // Check for active conversation
  const conversationState = storage.getConversationState(found.member.id);

  // If no active conversation, check for manual check-in trigger
  if (!conversationState) {
    if (isManualCheckInTrigger(messageText)) {
      // Start a manual check-in
      await startManualCheckIn(storage, found.member, found.team, discordAccountId);
      return true;
    }
    // Not a trigger and no active conversation, ignore
    return false;
  }

  // Get team for channel posting
  const team = storage.getTeam(found.team.id);
  if (!team) {
    // Team was deleted, cleanup conversation and return
    storage.deleteConversationState(found.member.id);
    return false;
  }

  // Advance conversation with user's answer
  const result = advanceConversation(storage, found.member.id, messageText);

  try {
    if (!result.done) {
      // More questions to go, send next question
      await sendMessageDiscord(`user:${discordUserId}`, getQuestion(result.nextQuestion), {
        accountId: discordAccountId,
      });
    } else {
      // Check-in complete, post to channel
      const postResult = await sendMessageDiscord(
        team.channelId ? `channel:${team.channelId}` : `discord:${team.serverId}`,
        formatCheckInPost(found.member, result.checkin),
        { accountId: discordAccountId },
      );

      // Mark as posted
      storage.markPosted(result.checkin.id);

      // Send confirmation to user
      await sendMessageDiscord(
        `user:${discordUserId}`,
        formatConfirmation(postResult.channelId, postResult.messageId),
        { accountId: discordAccountId },
      );
    }
  } catch (err) {
    // Log error but don't crash
    console.error(`[checkins] Failed to send message during check-in flow:`, err);
  }

  return true;
}

/**
 * Start a manual check-in for a member.
 * Called when a member DMs a trigger like "checkin" or "standup".
 *
 * @param storage - Storage instance
 * @param member - Member initiating the check-in
 * @param team - Team the member belongs to
 * @param discordAccountId - Optional Discord account ID for sending
 */
async function startManualCheckIn(
  storage: CheckinsStorage,
  member: Member,
  team: Team,
  discordAccountId?: string,
): Promise<void> {
  // Check if member is on vacation
  if (member.vacationUntil && member.vacationUntil > Date.now()) {
    const endDate = new Date(member.vacationUntil);
    const formattedDate = endDate.toLocaleDateString("en-US", {
      weekday: "long",
      month: "long",
      day: "numeric",
    });
    try {
      await sendMessageDiscord(
        `user:${member.discordUserId}`,
        `You're currently on vacation until ${formattedDate}. End your vacation first if you want to check in.`,
        { accountId: discordAccountId },
      );
    } catch (err) {
      console.error(`[checkins] Failed to send vacation notice:`, err);
    }
    return;
  }

  // Initiate conversation state
  initiateCheckIn(storage, member.id, team.id);

  // Send first question
  try {
    await sendMessageDiscord(
      `user:${member.discordUserId}`,
      `Starting your check-in for ${team.name}!\n\n${getQuestion(1)}`,
      { accountId: discordAccountId },
    );
  } catch (err) {
    console.error(`[checkins] Failed to send manual check-in prompt:`, err);
  }
}

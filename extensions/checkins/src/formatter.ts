/**
 * Message formatting for check-in posts and confirmations.
 */

import type { Checkin, Member } from "./types.js";

/**
 * Format a completed check-in for channel posting.
 * @param member - Member who submitted the check-in
 * @param checkin - Completed check-in record
 * @returns Formatted message for channel post (plain text, no embed)
 */
export function formatCheckInPost(member: Member, checkin: Checkin): string {
  // Use display name if set, otherwise fallback (no Discord mention/tag)
  const name = member.displayName ?? "Team Member";

  // Build post content with newlines after each section
  let post = `**${name}'s Check-in**\n\n`;
  post += `**Done:**\n${checkin.yesterday}\n\n`;
  post += `**Next:**\n${checkin.today}`;

  // Include blockers line only if present
  if (checkin.blockers) {
    post += `\n\n**🚧 Blockers:**\n${checkin.blockers}`;
  }

  return post;
}

/**
 * Format a confirmation message after posting to channel.
 * @param channelId - Discord channel ID where check-in was posted
 * @param messageId - Discord message ID (currently unused, for future enhancement)
 * @returns Confirmation message
 */
export function formatConfirmation(channelId: string, messageId: string): string {
  return `Posted to <#${channelId}>!`;
}

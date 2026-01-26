/**
 * Discord permission checking for the check-ins extension.
 */

import { PermissionFlagsBits } from "discord-api-types/v10";
import type { APIRole } from "discord-api-types/v10";
import { fetchMemberInfoDiscord, fetchRoleInfoDiscord } from "clawdbot/plugin-sdk";

/**
 * Check if a Discord user has Administrator permission in a guild.
 *
 * @param params.guildId - Discord server/guild ID
 * @param params.userId - Discord user ID to check
 * @param params.accountId - Optional Discord account ID for multi-account setups
 * @returns true if user has Administrator permission
 */
export async function isDiscordAdmin(params: {
  guildId: string;
  userId: string;
  accountId?: string;
}): Promise<boolean> {
  const { guildId, userId, accountId } = params;

  // Fetch member info and guild roles in parallel
  const opts = accountId ? { accountId } : {};
  const [member, roles] = await Promise.all([
    fetchMemberInfoDiscord(guildId, userId, opts),
    fetchRoleInfoDiscord(guildId, opts),
  ]);

  // Build role permission map
  const rolesById = new Map<string, APIRole>(roles.map((r) => [r.id, r]));

  // Calculate total permissions from member's roles
  let permissions = 0n;
  for (const roleId of member.roles ?? []) {
    const role = rolesById.get(roleId);
    if (role?.permissions) {
      permissions |= BigInt(role.permissions);
    }
  }

  // Check Administrator bit (value 8)
  return (permissions & PermissionFlagsBits.Administrator) !== 0n;
}

/**
 * Member remove tool for the check-ins extension.
 * Uses configured guilds from clawdbot.json.
 */

import { Type } from "@sinclair/typebox";

import type { CheckinsStorage } from "../storage.js";
import type { DiscordGuildConfig } from "../types.js";

/**
 * Create the member-remove tool.
 *
 * @param storage - CheckinsStorage instance
 * @param getDiscordConfig - Function to get Discord config from clawdbot.json
 */
export function createMemberRemoveTool(
  storage: CheckinsStorage,
  getDiscordConfig?: () => { guilds?: Record<string, DiscordGuildConfig> } | undefined,
) {
  return {
    name: "checkins_member_remove",
    description:
      "Remove a member from a team. Uses the Discord server configured in clawdbot.json. " +
      "Requires confirmation.",
    parameters: Type.Object({
      targetUserId: Type.String({ description: "Discord user ID to remove (numeric ID)" }),
      teamName: Type.String({ description: "Team name to remove member from" }),
      confirm: Type.Optional(Type.Boolean({ description: "Set to true to confirm removal" })),
      guildSlug: Type.Optional(
        Type.String({
          description: "Guild slug if multiple servers configured (optional if only one server)",
        }),
      ),
    }),
    async execute(_id: string, params: Record<string, unknown>) {
      const targetUserId = String(params.targetUserId).replace(/\D/g, "");
      const teamName = String(params.teamName).trim();
      const confirm = params.confirm === true;
      const guildSlug = params.guildSlug ? String(params.guildSlug).trim() : undefined;

      // Validate target user ID
      if (!targetUserId) {
        return {
          content: [{ type: "text", text: "Invalid user ID. Please provide the Discord user ID." }],
          isError: true,
        };
      }

      // Get Discord config
      const discordConfig = getDiscordConfig?.();
      const guilds = discordConfig?.guilds;

      if (!guilds || Object.keys(guilds).length === 0) {
        return {
          content: [
            {
              type: "text",
              text: "No Discord servers configured. Add guilds to channels.discord.guilds in clawdbot.json",
            },
          ],
          isError: true,
        };
      }

      // Find the target guild
      const guildEntries = Object.entries(guilds);
      let targetGuildId: string;

      if (guildEntries.length === 1) {
        [targetGuildId] = guildEntries[0];
      } else if (guildSlug) {
        const match = guildEntries.find(([, g]) => g.slug === guildSlug);
        if (!match) {
          const availableSlugs = guildEntries
            .map(([, g]) => g.slug)
            .filter(Boolean)
            .join(", ");
          return {
            content: [
              {
                type: "text",
                text: `Guild with slug "${guildSlug}" not found. Available: ${availableSlugs || "none"}`,
              },
            ],
            isError: true,
          };
        }
        [targetGuildId] = match;
      } else {
        const availableSlugs = guildEntries
          .map(([, g]) => g.slug)
          .filter(Boolean)
          .join(", ");
        return {
          content: [
            {
              type: "text",
              text: `Multiple Discord servers configured. Please specify guildSlug. Available: ${availableSlugs || "use guild IDs"}`,
            },
          ],
          isError: true,
        };
      }

      // Find team
      const team = storage.getTeamByName(targetGuildId, teamName);
      if (!team) {
        const teams = storage.listTeams(targetGuildId);
        const available = teams.map((t) => t.name).join(", ") || "none";
        return {
          content: [{ type: "text", text: `Team not found. Available teams: ${available}` }],
          isError: true,
        };
      }

      // Find member
      const member = storage.getMemberByDiscordId(team.id, targetUserId);
      if (!member) {
        return {
          content: [{ type: "text", text: `<@${targetUserId}> is not on ${teamName}` }],
          isError: true,
        };
      }

      // Require confirmation
      if (!confirm) {
        return {
          content: [
            {
              type: "text",
              text: `Are you sure you want to remove <@${targetUserId}> from ${teamName}? Set confirm=true to proceed.`,
            },
          ],
          details: { requiresConfirmation: true },
        };
      }

      // Remove member
      storage.removeMember(member.id);

      return {
        content: [{ type: "text", text: `Removed <@${targetUserId}> from ${teamName}` }],
      };
    },
  };
}

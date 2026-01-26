/**
 * Team deletion tool for the check-ins extension.
 * Uses configured guilds from clawdbot.json.
 */

import { Type } from "@sinclair/typebox";

import type { CheckinsStorage } from "../storage.js";
import type { DiscordGuildConfig } from "../types.js";

/**
 * Create the team-delete tool.
 *
 * @param storage - CheckinsStorage instance
 * @param getDiscordConfig - Function to get Discord config from clawdbot.json
 */
export function createTeamDeleteTool(
  storage: CheckinsStorage,
  getDiscordConfig?: () => { guilds?: Record<string, DiscordGuildConfig> } | undefined,
) {
  return {
    name: "checkins_team_delete",
    description:
      "Delete a team. Uses the Discord server configured in clawdbot.json. " +
      "Requires confirmation. Removes all members and check-in history.",
    parameters: Type.Object({
      teamName: Type.String({ description: "Team name to delete" }),
      confirm: Type.Optional(Type.Boolean({ description: "Set to true to confirm deletion" })),
      guildSlug: Type.Optional(
        Type.String({
          description: "Guild slug if multiple servers configured (optional if only one server)",
        }),
      ),
    }),
    async execute(_id: string, params: Record<string, unknown>) {
      const teamName = String(params.teamName).trim();
      const confirm = params.confirm === true;
      const guildSlug = params.guildSlug ? String(params.guildSlug).trim() : undefined;

      // Validate team name
      if (!teamName) {
        return {
          content: [{ type: "text", text: "Team name is required" }],
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

      // Require confirmation
      if (!confirm) {
        const members = storage.listMembers(team.id);
        return {
          content: [
            {
              type: "text",
              text: `Are you sure you want to delete team "${teamName}"? This will remove ${members.length} member(s) and all their check-in history. Set confirm=true to proceed.`,
            },
          ],
          details: { requiresConfirmation: true, memberCount: members.length },
        };
      }

      // Delete team (cascades to members via foreign key)
      storage.deleteTeam(team.id);

      return {
        content: [{ type: "text", text: `Deleted team "${teamName}"` }],
      };
    },
  };
}

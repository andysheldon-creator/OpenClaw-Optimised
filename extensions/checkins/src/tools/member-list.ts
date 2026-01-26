/**
 * Member listing tool for the check-ins extension.
 */

import { Type } from "@sinclair/typebox";

import type { CheckinsStorage } from "../storage.js";
import type { DiscordGuildConfig } from "../types.js";

/**
 * Create the member-list tool.
 *
 * @param storage - CheckinsStorage instance
 * @param getDiscordConfig - Function to get Discord config from clawdbot.json
 */
export function createMemberListTool(
  storage: CheckinsStorage,
  getDiscordConfig?: () => { guilds?: Record<string, DiscordGuildConfig> } | undefined,
) {
  return {
    name: "checkins_member_list",
    description:
      "List all members of a check-in team. Shows Discord user IDs, display names, timezones, and check-in times. " +
      "Specify team by name. If multiple Discord servers are configured, also specify guildSlug.",
    parameters: Type.Object({
      teamName: Type.String({ description: "Name of the team to list members for" }),
      guildSlug: Type.Optional(
        Type.String({
          description: "Guild slug if multiple servers configured (optional if only one server)",
        }),
      ),
    }),
    async execute(_id: string, params: Record<string, unknown>) {
      const teamName = String(params.teamName).trim();
      const guildSlug = params.guildSlug ? String(params.guildSlug).trim() : undefined;

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
      let targetGuild: DiscordGuildConfig;

      if (guildEntries.length === 1) {
        // Only one guild configured, use it
        [targetGuildId, targetGuild] = guildEntries[0];
      } else if (guildSlug) {
        // Multiple guilds, find by slug
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
        [targetGuildId, targetGuild] = match;
      } else {
        // Multiple guilds, no slug specified
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

      // Find team by name
      const team = storage.getTeamByName(targetGuildId, teamName);
      if (!team) {
        const teams = storage.listTeams(targetGuildId);
        const availableTeams = teams.map((t) => t.name).join(", ");
        return {
          content: [
            {
              type: "text",
              text: `Team "${teamName}" not found. Available teams: ${availableTeams || "none"}`,
            },
          ],
          isError: true,
        };
      }

      // List members
      const members = storage.listMembers(team.id);

      if (members.length === 0) {
        return {
          content: [
            {
              type: "text",
              text: `Team "${teamName}" has no members. Use checkins_member_add to add members.`,
            },
          ],
        };
      }

      // Build member list
      const memberList = members.map((m) => ({
        id: m.id,
        discordUserId: m.discordUserId,
        displayName: m.displayName,
        timezone: m.schedule.timezone,
        checkInTime: m.schedule.checkInTime,
        skipWeekends: m.schedule.skipWeekends,
        vacationUntil: m.vacationUntil ? new Date(m.vacationUntil).toISOString().split("T")[0] : null,
      }));

      const summary = memberList
        .map((m) => {
          const name = m.displayName || `<@${m.discordUserId}>`;
          const vacation = m.vacationUntil ? ` (vacation until ${m.vacationUntil})` : "";
          return `• ${name} - ${m.checkInTime} ${m.timezone}${vacation}`;
        })
        .join("\n");

      return {
        content: [
          {
            type: "text",
            text: `Members of "${teamName}" (${members.length}):\n${summary}`,
          },
        ],
        details: { members: memberList },
      };
    },
  };
}

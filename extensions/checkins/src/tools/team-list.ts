/**
 * Team listing tool for the check-ins extension.
 */

import { Type } from "@sinclair/typebox";

import type { CheckinsStorage } from "../storage.js";
import type { DiscordGuildConfig } from "../types.js";

/**
 * Create the team-list tool.
 *
 * @param storage - CheckinsStorage instance
 * @param getDiscordConfig - Function to get Discord config from clawdbot.json
 */
export function createTeamListTool(
  storage: CheckinsStorage,
  getDiscordConfig?: () => { guilds?: Record<string, DiscordGuildConfig> } | undefined,
) {
  return {
    name: "checkins_team_list",
    description:
      "List all check-in teams. Shows team names, IDs, channel IDs, and member counts. " +
      "If multiple Discord servers are configured, specify which one by slug.",
    parameters: Type.Object({
      guildSlug: Type.Optional(
        Type.String({
          description: "Guild slug if multiple servers configured (optional if only one server)",
        }),
      ),
    }),
    async execute(_id: string, params: Record<string, unknown>) {
      const guildSlug = params.guildSlug ? String(params.guildSlug).trim() : undefined;

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

      // List teams for this guild
      const teams = storage.listTeams(targetGuildId);

      if (teams.length === 0) {
        const guildLabel = targetGuild.slug || targetGuildId;
        return {
          content: [
            {
              type: "text",
              text: `No teams found in ${guildLabel}. Use checkins_team_create to create one.`,
            },
          ],
        };
      }

      // Build team list with member counts
      const teamList = teams.map((team) => {
        const members = storage.listMembers(team.id);
        return {
          id: team.id,
          name: team.name,
          channelId: team.channelId,
          memberCount: members.length,
        };
      });

      const guildLabel = targetGuild.slug || targetGuildId;
      const summary = teamList
        .map((t) => `• ${t.name} (${t.memberCount} members) - channel: ${t.channelId || "none"}`)
        .join("\n");

      return {
        content: [
          {
            type: "text",
            text: `Teams in ${guildLabel}:\n${summary}`,
          },
        ],
        details: { teams: teamList },
      };
    },
  };
}

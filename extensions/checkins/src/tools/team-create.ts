/**
 * Team creation tool for the check-ins extension.
 * Uses configured guilds/channels from clawdbot.json.
 */

import { Type } from "@sinclair/typebox";

import type { CheckinsStorage } from "../storage.js";
import type { DiscordGuildConfig } from "../types.js";

/**
 * Resolve a channel reference to a channel ID from configured channels.
 * Accepts: channel ID, channel mention (#name), or plain channel name.
 */
function resolveChannelFromConfig(
  channelRef: string,
  configuredChannels: Record<string, { allow?: boolean }>,
): string | null {
  // Already a numeric ID that's in the config
  if (/^\d+$/.test(channelRef) && configuredChannels[channelRef]) {
    return channelRef;
  }

  // For now, just check if it matches a configured channel ID
  // Channel names aren't stored in config, so we can only match by ID
  if (configuredChannels[channelRef]) {
    return channelRef;
  }

  return null;
}

/**
 * Create the team-create tool.
 *
 * @param storage - CheckinsStorage instance
 * @param getDiscordConfig - Function to get Discord config from clawdbot.json
 */
export function createTeamCreateTool(
  storage: CheckinsStorage,
  getDiscordConfig?: () => { guilds?: Record<string, DiscordGuildConfig> } | undefined,
) {
  return {
    name: "checkins_team_create",
    description:
      "Create a new team for check-ins. Uses the Discord server configured in clawdbot.json. " +
      "If multiple servers are configured, specify which one by slug. " +
      "Channel must be one of the configured channel IDs.",
    parameters: Type.Object({
      teamName: Type.String({ description: "Name for the new team" }),
      channelId: Type.String({
        description: "Discord channel ID for standup posts (must be a configured channel)",
      }),
      guildSlug: Type.Optional(
        Type.String({
          description: "Guild slug if multiple servers configured (optional if only one server)",
        }),
      ),
    }),
    async execute(_id: string, params: Record<string, unknown>) {
      const teamName = String(params.teamName).trim();
      const channelId = String(params.channelId);
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

      // Validate channel is configured
      const configuredChannels = targetGuild.channels ?? {};
      const resolvedChannelId = resolveChannelFromConfig(channelId, configuredChannels);

      if (!resolvedChannelId) {
        const availableChannels = Object.keys(configuredChannels).join(", ");
        return {
          content: [
            {
              type: "text",
              text: `Channel "${channelId}" is not configured for this server. Available channel IDs: ${availableChannels || "none"}`,
            },
          ],
          isError: true,
        };
      }

      // Check for duplicate team
      const existing = storage.getTeamByName(targetGuildId, teamName);
      if (existing) {
        return {
          content: [{ type: "text", text: `Team "${teamName}" already exists` }],
          isError: true,
        };
      }

      // Create team (no permission check needed - config access implies admin)
      const team = storage.createTeam({
        serverId: targetGuildId,
        name: teamName,
        channelId: resolvedChannelId,
      });

      const guildLabel = targetGuild.slug || targetGuildId;
      return {
        content: [
          {
            type: "text",
            text: `Created team "${teamName}" in ${guildLabel}, standups will post to channel ${resolvedChannelId}`,
          },
        ],
        details: { team },
      };
    },
  };
}

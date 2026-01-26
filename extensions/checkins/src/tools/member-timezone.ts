/**
 * Member timezone tool for the check-ins extension.
 * Uses configured guilds from clawdbot.json.
 */

import { Type } from "@sinclair/typebox";

import type { CheckinsStorage } from "../storage.js";
import type { DiscordGuildConfig } from "../types.js";
import { normalizeTimezone } from "../timezone.js";

/**
 * Create the member-timezone tool.
 *
 * @param storage - CheckinsStorage instance
 * @param getDiscordConfig - Function to get Discord config from clawdbot.json
 */
export function createMemberTimezoneTool(
  storage: CheckinsStorage,
  getDiscordConfig?: () => { guilds?: Record<string, DiscordGuildConfig> } | undefined,
) {
  return {
    name: "checkins_member_timezone",
    description:
      "Update a member's timezone. Uses the Discord server configured in clawdbot.json. " +
      "Accepts flexible formats (EST, America/New_York, Eastern).",
    parameters: Type.Object({
      targetUserId: Type.String({ description: "Discord user ID to update (numeric ID)" }),
      timezone: Type.String({ description: "New timezone (EST, America/New_York, Eastern, etc.)" }),
      guildSlug: Type.Optional(
        Type.String({
          description: "Guild slug if multiple servers configured (optional if only one server)",
        }),
      ),
    }),
    async execute(_id: string, params: Record<string, unknown>) {
      const targetUserId = String(params.targetUserId).replace(/\D/g, "");
      const timezoneInput = String(params.timezone).trim();
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

      // Normalize timezone
      const timezone = normalizeTimezone(timezoneInput);
      if (!timezone) {
        return {
          content: [
            {
              type: "text",
              text: `Unknown timezone: "${timezoneInput}". Try "America/New_York", "EST", or "Eastern".`,
            },
          ],
          isError: true,
        };
      }

      // Find member across all teams in server
      const teams = storage.listTeams(targetGuildId);
      let member = null;
      let memberTeam = null;
      for (const team of teams) {
        member = storage.getMemberByDiscordId(team.id, targetUserId);
        if (member) {
          memberTeam = team;
          break;
        }
      }

      if (!member || !memberTeam) {
        return {
          content: [{ type: "text", text: `<@${targetUserId}> is not a member of any team` }],
          isError: true,
        };
      }

      // Update timezone
      storage.updateMember(member.id, {
        schedule: { ...member.schedule, timezone },
      });

      return {
        content: [
          { type: "text", text: `Updated <@${targetUserId}>'s timezone to ${timezone}` },
        ],
      };
    },
  };
}

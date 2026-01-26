/**
 * Member add tool for the check-ins extension.
 * Uses configured guilds from clawdbot.json.
 */

import { Type } from "@sinclair/typebox";

import type { CheckinsStorage } from "../storage.js";
import type { DiscordGuildConfig } from "../types.js";
import { normalizeTimezone } from "../timezone.js";

/**
 * Create the member-add tool.
 *
 * @param storage - CheckinsStorage instance
 * @param getDiscordConfig - Function to get Discord config from clawdbot.json
 */
export function createMemberAddTool(
  storage: CheckinsStorage,
  getDiscordConfig?: () => { guilds?: Record<string, DiscordGuildConfig> } | undefined,
) {
  return {
    name: "checkins_member_add",
    description:
      "Add a member to a team. Uses the Discord server configured in clawdbot.json. " +
      "Timezone is required. One team per member per server.",
    parameters: Type.Object({
      targetUserId: Type.String({ description: "Discord user ID to add (numeric ID)" }),
      teamName: Type.String({ description: "Team name to add member to" }),
      timezone: Type.String({ description: "Member timezone (EST, America/New_York, Eastern, etc.)" }),
      guildSlug: Type.Optional(
        Type.String({
          description: "Guild slug if multiple servers configured (optional if only one server)",
        }),
      ),
    }),
    async execute(_id: string, params: Record<string, unknown>) {
      const targetUserId = String(params.targetUserId).replace(/\D/g, ""); // Extract numeric ID
      const teamName = String(params.teamName).trim();
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
      let targetGuild: DiscordGuildConfig;

      if (guildEntries.length === 1) {
        [targetGuildId, targetGuild] = guildEntries[0];
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
        [targetGuildId, targetGuild] = match;
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

      // Find target team
      const team = storage.getTeamByName(targetGuildId, teamName);
      if (!team) {
        const teams = storage.listTeams(targetGuildId);
        const available = teams.map((t) => t.name).join(", ") || "none";
        return {
          content: [{ type: "text", text: `Team not found. Available teams: ${available}` }],
          isError: true,
        };
      }

      // Check if already on this team
      const existingOnTeam = storage.getMemberByDiscordId(team.id, targetUserId);
      if (existingOnTeam) {
        return {
          content: [{ type: "text", text: `<@${targetUserId}> is already on ${teamName}` }],
          isError: true,
        };
      }

      // One team per member per server - check if on another team
      const allTeams = storage.listTeams(targetGuildId);
      let removedFromTeam: string | null = null;
      for (const t of allTeams) {
        const existingMember = storage.getMemberByDiscordId(t.id, targetUserId);
        if (existingMember) {
          storage.removeMember(existingMember.id);
          removedFromTeam = t.name;
          break;
        }
      }

      // Add to team
      storage.addMember({
        teamId: team.id,
        discordUserId: targetUserId,
        schedule: { timezone, checkInTime: "17:00", skipWeekends: true },
      });

      // Build response
      const guildLabel = targetGuild.slug || targetGuildId;
      let message = `Added <@${targetUserId}> to ${teamName} in ${guildLabel}, timezone ${timezone}`;
      if (removedFromTeam) {
        message += ` (removed from ${removedFromTeam})`;
      }

      return {
        content: [{ type: "text", text: message }],
      };
    },
  };
}

/**
 * Vacation tool for the check-ins extension.
 * Uses configured guilds from clawdbot.json.
 */

import { Type } from "@sinclair/typebox";

import type { CheckinsStorage } from "../storage.js";
import type { DiscordGuildConfig } from "../types.js";
import { parseVacationEnd } from "../timezone.js";

/**
 * Create the vacation tool.
 *
 * @param storage - CheckinsStorage instance
 * @param getDiscordConfig - Function to get Discord config from clawdbot.json
 */
export function createVacationTool(
  storage: CheckinsStorage,
  getDiscordConfig?: () => { guilds?: Record<string, DiscordGuildConfig> } | undefined,
) {
  return {
    name: "checkins_vacation",
    description:
      "Set vacation mode for a team member. Uses the Discord server configured in clawdbot.json.",
    parameters: Type.Object({
      targetUserId: Type.String({ description: "Discord user ID to set vacation for (numeric ID)" }),
      action: Type.Unsafe<"enable" | "disable">({
        type: "string",
        enum: ["enable", "disable"],
        description: "Enable or disable vacation mode",
      }),
      until: Type.Optional(
        Type.String({
          description: "Vacation end date (natural language: 'Friday', 'Jan 30', etc.)",
        }),
      ),
      guildSlug: Type.Optional(
        Type.String({
          description: "Guild slug if multiple servers configured (optional if only one server)",
        }),
      ),
    }),
    async execute(_id: string, params: Record<string, unknown>) {
      const targetUserId = String(params.targetUserId).replace(/\D/g, "");
      const action = String(params.action) as "enable" | "disable";
      const until = params.until ? String(params.until).trim() : undefined;
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

      // Find member by Discord user ID across all teams
      const teams = storage.listTeams(targetGuildId);
      let member = null;
      for (const team of teams) {
        member = storage.getMemberByDiscordId(team.id, targetUserId);
        if (member) break;
      }

      if (!member) {
        return {
          content: [{ type: "text", text: `<@${targetUserId}> is not a member of any team` }],
          isError: true,
        };
      }

      if (action === "disable") {
        storage.updateMember(member.id, { vacationUntil: null });
        return {
          content: [{ type: "text", text: `Vacation disabled for <@${targetUserId}>. Check-ins resume.` }],
        };
      }

      // Enable vacation
      let vacationUntil: number | null = null;
      if (until) {
        vacationUntil = parseVacationEnd(until);
        if (!vacationUntil) {
          return {
            content: [
              {
                type: "text",
                text: `Could not parse date: "${until}". Try "until Friday", "Jan 30", or "next Monday".`,
              },
            ],
            isError: true,
          };
        }
      }

      storage.updateMember(member.id, { vacationUntil });

      // Build response
      let message: string;
      if (vacationUntil) {
        const endDate = new Date(vacationUntil);
        message = `<@${targetUserId}> is now on vacation until ${endDate.toLocaleDateString("en-US", {
          weekday: "long",
          month: "long",
          day: "numeric",
        })}`;
      } else {
        message = `<@${targetUserId}> is now on vacation (indefinite)`;
      }

      return {
        content: [{ type: "text", text: message }],
      };
    },
  };
}

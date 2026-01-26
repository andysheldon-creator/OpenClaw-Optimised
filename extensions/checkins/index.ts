/**
 * Check-ins Extension Entry Point
 *
 * Provides team standup check-ins via Discord DM.
 * This plugin manages the storage lifecycle and registers team management tools.
 */

import type { ClawdbotPluginApi, ClawdbotConfig } from "clawdbot/plugin-sdk";
import { z } from "zod";

import { createStorage, type CheckinsStorage } from "./src/storage.js";
import type { CheckinsConfig, DiscordGuildConfig } from "./src/types.js";

// Tool imports
import { createTeamCreateTool } from "./src/tools/team-create.js";
import { createTeamDeleteTool } from "./src/tools/team-delete.js";
import { createTeamListTool } from "./src/tools/team-list.js";
import { createMemberAddTool } from "./src/tools/member-add.js";
import { createMemberRemoveTool } from "./src/tools/member-remove.js";
import { createMemberListTool } from "./src/tools/member-list.js";
import { createMemberTimezoneTool } from "./src/tools/member-timezone.js";
import { createVacationTool } from "./src/tools/vacation.js";

// DM handler import
import { handleDmResponse, triggerCheckIn } from "./src/dm-handler.js";

// Scheduler and cleanup imports
import { scheduleAllMembers, buildCheckInCronJob, getUnscheduleJobId } from "./src/scheduler.js";
import { buildCleanupCronJobs, cleanupExpiredConversations } from "./src/cleanup.js";

// ─────────────────────────────────────────────────────────────────────────────
// Config Schema
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Zod schema for plugin configuration.
 * Matches the config defined in clawdbot.plugin.json.
 */
const CheckinsConfigSchema = z.object({
  enabled: z.boolean().default(true),
  defaultTimezone: z.string().default("America/New_York"),
  defaultCheckInTime: z
    .string()
    .regex(/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/, "Invalid time format (HH:MM)")
    .default("17:00"),
  reminderDelayMinutes: z.number().int().min(1).default(60),
  abandonAfterMinutes: z.number().int().min(1).default(120),
});

/**
 * Config schema wrapper with parse method for plugin API compatibility.
 */
const checkinsConfigSchema = {
  parse(value: unknown): CheckinsConfig {
    const raw =
      value && typeof value === "object" && !Array.isArray(value)
        ? (value as Record<string, unknown>)
        : {};
    return CheckinsConfigSchema.parse(raw);
  },
  uiHints: {
    enabled: {
      label: "Enabled",
      help: "Enable or disable the check-ins extension",
    },
    defaultTimezone: {
      label: "Default Timezone",
      help: "IANA timezone for new team members (e.g., America/New_York)",
    },
    defaultCheckInTime: {
      label: "Default Check-in Time",
      help: "Default time for check-in prompts (24-hour format, e.g., 17:00)",
    },
    reminderDelayMinutes: {
      label: "Reminder Delay (minutes)",
      help: "Minutes to wait before sending a reminder for incomplete check-ins",
      advanced: true,
    },
    abandonAfterMinutes: {
      label: "Abandon After (minutes)",
      help: "Minutes after which to abandon incomplete check-in conversations",
      advanced: true,
    },
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// Helper Functions
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Extract Discord user ID from event.from field.
 * Handles formats like "discord:user:123456", "user:123456", or just "123456".
 */
function extractDiscordUserId(from: string): string | null {
  const match = from.match(/(?:discord:)?(?:user:)?(\d+)/);
  return match ? match[1] : null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Plugin Definition
// ─────────────────────────────────────────────────────────────────────────────

const checkinsPlugin = {
  id: "checkins",
  name: "Team Check-ins",
  description: "Manage team standup check-ins via Discord DM",
  configSchema: checkinsConfigSchema,

  register(api: ClawdbotPluginApi) {
    const cfg = checkinsConfigSchema.parse(api.pluginConfig);

    // Resolve database path in state directory
    const stateDir = api.runtime?.state?.resolveStateDir?.() ?? process.env.HOME + "/.clawdbot";
    const dbPath = `${stateDir}/checkins.db`;

    // Create storage instance (not initialized until service starts)
    let storage: CheckinsStorage | null = null;

    // Store clawdbot config reference for accessing Discord guilds
    let clawdbotConfig: ClawdbotConfig | null = null;

    // Getter for Discord config from clawdbot.json
    const getDiscordConfig = (): { guilds?: Record<string, DiscordGuildConfig> } | undefined => {
      if (!clawdbotConfig) {
        // Try to load config if not cached
        try {
          clawdbotConfig = api.runtime?.config?.loadConfig?.() ?? null;
        } catch {
          return undefined;
        }
      }
      const discord = clawdbotConfig?.channels?.discord;
      if (!discord || typeof discord !== "object") return undefined;
      return discord as { guilds?: Record<string, DiscordGuildConfig> };
    };

    // Register service for lifecycle management
    api.registerService({
      id: "checkins",
      start: async () => {
        if (!cfg.enabled) {
          api.logger.info("[checkins] Extension disabled");
          return;
        }

        api.logger.info("[checkins] Starting service...");

        // Create and initialize storage
        storage = createStorage(dbPath, cfg);
        storage.init();

        api.logger.info(`[checkins] Database initialized at ${dbPath}`);
      },
      stop: async () => {
        api.logger.info("[checkins] Stopping service...");

        // Close database connection
        if (storage) {
          storage.close();
          storage = null;
        }

        api.logger.info("[checkins] Database closed");
      },
    });

    // Register team management tools (Phase 2)
    api.registerTool(
      () => {
        if (!storage) return null;
        return [
          createTeamCreateTool(storage, getDiscordConfig),
          createTeamDeleteTool(storage, getDiscordConfig),
          createTeamListTool(storage, getDiscordConfig),
          createMemberAddTool(storage, getDiscordConfig),
          createMemberRemoveTool(storage, getDiscordConfig),
          createMemberListTool(storage, getDiscordConfig),
          createMemberTimezoneTool(storage, getDiscordConfig),
          createVacationTool(storage, getDiscordConfig),
        ];
      },
      {
        names: [
          "checkins_team_create",
          "checkins_team_delete",
          "checkins_team_list",
          "checkins_member_add",
          "checkins_member_remove",
          "checkins_member_list",
          "checkins_member_timezone",
          "checkins_vacation",
        ],
      },
    );

    // Register gateway methods for cron job management (Phase 3)
    api.registerGatewayMethod("checkins.getCronJobs", async () => {
      if (!storage) return { jobs: [] };
      const memberJobs = scheduleAllMembers(storage);
      const cleanupJobs = buildCleanupCronJobs(storage);
      return { jobs: [...memberJobs, ...cleanupJobs] };
    });

    api.registerGatewayMethod("checkins.scheduleMember", async (params) => {
      if (!storage) return { success: false, error: "Storage not initialized" };
      const { memberId, teamId } = params as { memberId: string; teamId: string };
      const member = storage.getMember(memberId);
      const team = storage.getTeam(teamId);
      if (!member || !team) return { success: false, error: "Member or team not found" };
      const job = buildCheckInCronJob(member, team);
      return { success: true, job };
    });

    api.registerGatewayMethod("checkins.unscheduleMember", async (params) => {
      const { memberId } = params as { memberId: string };
      return { success: true, jobId: getUnscheduleJobId(memberId) };
    });

    // Register gateway_start hook to log scheduling info (Phase 3)
    api.on("gateway_start", async () => {
      if (!storage) return;
      const memberJobs = scheduleAllMembers(storage);
      const cleanupJobs = buildCleanupCronJobs(storage);
      api.logger.info(`[checkins] Ready: ${memberJobs.length} member schedules, ${cleanupJobs.length} cleanup jobs`);
    });

    // Register before_message_dispatch hook for DM handling (Phase 3)
    // This hook can intercept messages before they reach the agent
    api.on("before_message_dispatch", async (event, context) => {
      api.logger.info(`[checkins] before_message_dispatch: channelId=${context.channelId}, from=${event.from}, senderId=${event.metadata?.senderId}, content=${event.content.slice(0, 50)}`);

      // Only process Discord channels for DM handling
      if (!context.channelId?.startsWith("discord")) {
        api.logger.info(`[checkins] Skipping: not a discord channel`);
        return;
      }

      // Only handle if storage is initialized
      if (!storage) {
        api.logger.info(`[checkins] Skipping: storage not initialized`);
        return;
      }

      // Extract Discord user ID:
      // - For channel messages: use event.metadata.senderId (from is discord:channel:{channelId})
      // - For DMs: extract from event.from (discord:{userId})
      const senderIdFromMeta = event.metadata?.senderId;
      const discordUserId =
        (typeof senderIdFromMeta === "string" ? senderIdFromMeta : null) ??
        extractDiscordUserId(event.from);
      if (!discordUserId) {
        api.logger.info(`[checkins] Skipping: could not extract discordUserId from from=${event.from} or senderId=${event.metadata?.senderId}`);
        return;
      }

      api.logger.info(`[checkins] Calling handleDmResponse for user ${discordUserId}`);

      // Handle DM response (returns true if message was handled)
      const handled = await handleDmResponse(storage, discordUserId, event.content, context.accountId);
      api.logger.info(`[checkins] handleDmResponse returned: ${handled}`);

      if (handled) {
        return { handled: true };
      }
    });

    // Register message_received hook for system events from cron jobs (Phase 3)
    api.on("message_received", async (event, context) => {
      // Handle system messages from cron jobs
      if (event.content.startsWith("[system] checkins:trigger:")) {
        const parts = event.content.replace("[system] checkins:trigger:", "").split(":");
        const [memberId, teamId] = parts;
        if (memberId && teamId && storage) {
          await triggerCheckIn(storage, memberId, teamId, context.accountId);
        }
        return;
      }

      if (event.content.startsWith("[system] checkins:cleanup:")) {
        const timezone = event.content.replace("[system] checkins:cleanup:", "");
        if (timezone && storage) {
          const count = cleanupExpiredConversations(storage, timezone);
          api.logger.info(`[checkins] Cleaned up ${count} expired conversations for ${timezone}`);
        }
        return;
      }
    });

    // Log registration
    api.logger.info(`[checkins] Plugin registered (enabled: ${cfg.enabled})`);
  },
};

export default checkinsPlugin;

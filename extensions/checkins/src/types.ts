/**
 * TypeScript types for the check-ins domain.
 * Defines entities for teams, members, conversations, and check-in records.
 */

// -----------------------------------------------------------------------------
// Team Entity
// -----------------------------------------------------------------------------

/**
 * A team within a Discord server.
 * Teams group members who participate in standup check-ins together.
 */
export type Team = {
  /** UUID identifier */
  id: string;
  /** Discord server/guild ID */
  serverId: string;
  /** Team name, e.g., "Engineering" */
  name: string;
  /** Discord channel for standup posts (null if not configured) */
  channelId: string | null;
  /** Which Discord account to use for DMs (null for default) */
  discordAccountId: string | null;
  /** Creation timestamp (Unix ms) */
  createdAt: number;
};

// -----------------------------------------------------------------------------
// Member Scheduling
// -----------------------------------------------------------------------------

/**
 * Per-member scheduling configuration.
 * Controls when and how check-in prompts are sent.
 */
export type MemberSchedule = {
  /** 24-hour format time for check-in, e.g., "17:00" */
  checkInTime: string;
  /** IANA timezone, e.g., "America/New_York" */
  timezone: string;
  /** Whether to skip weekend check-ins (default true) */
  skipWeekends: boolean;
};

// -----------------------------------------------------------------------------
// Member Entity
// -----------------------------------------------------------------------------

/**
 * A team member who participates in check-ins.
 * Each member belongs to one team and has their own schedule.
 */
export type Member = {
  /** UUID identifier */
  id: string;
  /** FK to Team */
  teamId: string;
  /** Discord user ID */
  discordUserId: string;
  /** Optional display name override */
  displayName: string | null;
  /** Member's check-in schedule */
  schedule: MemberSchedule;
  /** Unix timestamp (ms) until vacation ends, null if not on vacation */
  vacationUntil: number | null;
  /** Creation timestamp (Unix ms) */
  createdAt: number;
};

// -----------------------------------------------------------------------------
// Conversation State
// -----------------------------------------------------------------------------

/**
 * Tracks an active check-in conversation via DM.
 * Used to manage multi-question flows and reminders.
 */
export type ConversationState = {
  /** FK to Member */
  memberId: string;
  /** FK to Team */
  teamId: string;
  /** Current question number (1 = yesterday, 2 = today, 3 = blockers) */
  currentQuestion: 1 | 2 | 3;
  /** Accumulated answers */
  answers: {
    yesterday?: string;
    today?: string;
    blockers?: string;
  };
  /** When conversation started (Unix ms) */
  startedAt: number;
  /** Last message timestamp (Unix ms) */
  lastActivityAt: number;
  /** Whether the 1-hour reminder was sent */
  reminderSent: boolean;
};

// -----------------------------------------------------------------------------
// Check-in Record
// -----------------------------------------------------------------------------

/**
 * A completed check-in record.
 * Represents a member's submitted standup answers.
 */
export type Checkin = {
  /** UUID identifier */
  id: string;
  /** FK to Member */
  memberId: string;
  /** FK to Team */
  teamId: string;
  /** Answer to "What did you do?" */
  yesterday: string;
  /** Answer to "What's next?" */
  today: string;
  /** Answer to "Any blockers?" (null if no blockers) */
  blockers: string | null;
  /** Submission timestamp (Unix ms) */
  submittedAt: number;
  /** Whether posted to the standup channel */
  postedToChannel: boolean;
};

// -----------------------------------------------------------------------------
// Plugin Configuration
// -----------------------------------------------------------------------------

/**
 * Plugin configuration type.
 * Controls global defaults for the check-ins extension.
 */
export type CheckinsConfig = {
  /** Enable/disable the extension */
  enabled: boolean;
  /** Default timezone for new members */
  defaultTimezone: string;
  /** Default check-in time for new members */
  defaultCheckInTime: string;
  /** Minutes to wait before sending reminder */
  reminderDelayMinutes: number;
  /** Minutes after which to abandon incomplete check-in */
  abandonAfterMinutes: number;
};

// -----------------------------------------------------------------------------
// Discord Config Types (from clawdbot.json)
// -----------------------------------------------------------------------------

/**
 * Channel configuration within a guild.
 */
export type DiscordChannelConfig = {
  allow?: boolean;
  requireMention?: boolean;
};

/**
 * Guild configuration from channels.discord.guilds in clawdbot.json.
 */
export type DiscordGuildConfig = {
  slug?: string;
  requireMention?: boolean;
  channels?: Record<string, DiscordChannelConfig>;
};

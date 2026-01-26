/**
 * SQLite storage module for the check-ins extension.
 * Uses Node 22+ built-in node:sqlite for persistence.
 */

import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import type {
  Checkin,
  CheckinsConfig,
  ConversationState,
  Member,
  MemberSchedule,
  Team,
} from "./types.js";

// Re-export types for consumers
export type { Checkin, ConversationState, Member, MemberSchedule, Team };

/**
 * Storage interface for check-ins data.
 * All methods are synchronous (using DatabaseSync).
 */
export interface CheckinsStorage {
  /** Initialize the database (create tables, open connection) */
  init(): void;
  /** Close the database connection */
  close(): void;

  // ─────────────────────────────────────────────────────────────────────────
  // Teams
  // ─────────────────────────────────────────────────────────────────────────

  /** Create a new team */
  createTeam(params: {
    serverId: string;
    name: string;
    channelId?: string;
    discordAccountId?: string;
  }): Team;

  /** Get a team by ID */
  getTeam(id: string): Team | null;

  /** Get a team by name within a server */
  getTeamByName(serverId: string, name: string): Team | null;

  /** List all teams in a server */
  listTeams(serverId: string): Team[];

  /** Update a team's properties */
  updateTeam(
    id: string,
    updates: Partial<Pick<Team, "name" | "channelId" | "discordAccountId">>,
  ): boolean;

  /** Delete a team (cascades to members and checkins) */
  deleteTeam(id: string): boolean;

  /** List all teams across all servers (for scheduler bootstrap and cross-team member lookup) */
  getAllTeams(): Team[];

  // ─────────────────────────────────────────────────────────────────────────
  // Members
  // ─────────────────────────────────────────────────────────────────────────

  /** Add a member to a team */
  addMember(params: {
    teamId: string;
    discordUserId: string;
    displayName?: string;
    schedule?: Partial<MemberSchedule>;
  }): Member;

  /** Get a member by ID */
  getMember(id: string): Member | null;

  /** Get a member by Discord user ID within a team */
  getMemberByDiscordId(teamId: string, discordUserId: string): Member | null;

  /** List all members of a team */
  listMembers(teamId: string): Member[];

  /** Update a member's properties */
  updateMember(
    id: string,
    updates: Partial<Pick<Member, "displayName" | "schedule" | "vacationUntil">>,
  ): boolean;

  /** Remove a member from a team */
  removeMember(id: string): boolean;

  // ─────────────────────────────────────────────────────────────────────────
  // Check-ins
  // ─────────────────────────────────────────────────────────────────────────

  /** Save a completed check-in */
  saveCheckin(params: {
    memberId: string;
    teamId: string;
    yesterday: string;
    today: string;
    blockers?: string;
  }): Checkin;

  /** Get a check-in by ID */
  getCheckin(id: string): Checkin | null;

  /** List check-ins with optional filters */
  listCheckins(params: {
    teamId?: string;
    memberId?: string;
    since?: number;
    until?: number;
  }): Checkin[];

  /** Mark a check-in as posted to the channel */
  markPosted(checkinId: string): boolean;

  // ─────────────────────────────────────────────────────────────────────────
  // Conversation State
  // ─────────────────────────────────────────────────────────────────────────

  /** Get active conversation state for a member */
  getConversationState(memberId: string): ConversationState | null;

  /** Save/update conversation state */
  saveConversationState(state: ConversationState): void;

  /** Delete conversation state (on completion or timeout) */
  deleteConversationState(memberId: string): boolean;

  /** List all active conversations (for scheduler/timeout checks) */
  listActiveConversations(): ConversationState[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Schema Definition
// ─────────────────────────────────────────────────────────────────────────────

const SCHEMA_SQL = `
-- Enable foreign keys
PRAGMA foreign_keys = ON;

-- Teams table
CREATE TABLE IF NOT EXISTS teams (
  id TEXT PRIMARY KEY,
  server_id TEXT NOT NULL,
  name TEXT NOT NULL,
  channel_id TEXT,
  discord_account_id TEXT,
  created_at INTEGER NOT NULL,
  UNIQUE(server_id, name)
);
CREATE INDEX IF NOT EXISTS idx_teams_server ON teams(server_id);

-- Members table
CREATE TABLE IF NOT EXISTS members (
  id TEXT PRIMARY KEY,
  team_id TEXT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  discord_user_id TEXT NOT NULL,
  display_name TEXT,
  check_in_time TEXT NOT NULL DEFAULT '17:00',
  timezone TEXT NOT NULL DEFAULT 'America/New_York',
  skip_weekends INTEGER NOT NULL DEFAULT 1,
  vacation_until INTEGER,
  created_at INTEGER NOT NULL,
  UNIQUE(team_id, discord_user_id)
);
CREATE INDEX IF NOT EXISTS idx_members_team ON members(team_id);
CREATE INDEX IF NOT EXISTS idx_members_discord ON members(discord_user_id);

-- Checkins table
CREATE TABLE IF NOT EXISTS checkins (
  id TEXT PRIMARY KEY,
  member_id TEXT NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  team_id TEXT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  yesterday TEXT NOT NULL,
  today TEXT NOT NULL,
  blockers TEXT,
  submitted_at INTEGER NOT NULL,
  posted_to_channel INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_checkins_member ON checkins(member_id);
CREATE INDEX IF NOT EXISTS idx_checkins_team ON checkins(team_id);
CREATE INDEX IF NOT EXISTS idx_checkins_submitted ON checkins(submitted_at);

-- Conversation state table (for active check-in flows)
CREATE TABLE IF NOT EXISTS conversation_state (
  member_id TEXT PRIMARY KEY REFERENCES members(id) ON DELETE CASCADE,
  team_id TEXT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  current_question INTEGER NOT NULL,
  answer_yesterday TEXT,
  answer_today TEXT,
  answer_blockers TEXT,
  started_at INTEGER NOT NULL,
  last_activity_at INTEGER NOT NULL,
  reminder_sent INTEGER NOT NULL DEFAULT 0
);
`;

// ─────────────────────────────────────────────────────────────────────────────
// Row Types (raw database rows)
// ─────────────────────────────────────────────────────────────────────────────

type TeamRow = {
  id: string;
  server_id: string;
  name: string;
  channel_id: string | null;
  discord_account_id: string | null;
  created_at: number;
};

type MemberRow = {
  id: string;
  team_id: string;
  discord_user_id: string;
  display_name: string | null;
  check_in_time: string;
  timezone: string;
  skip_weekends: number;
  vacation_until: number | null;
  created_at: number;
};

type CheckinRow = {
  id: string;
  member_id: string;
  team_id: string;
  yesterday: string;
  today: string;
  blockers: string | null;
  submitted_at: number;
  posted_to_channel: number;
};

type ConversationStateRow = {
  member_id: string;
  team_id: string;
  current_question: number;
  answer_yesterday: string | null;
  answer_today: string | null;
  answer_blockers: string | null;
  started_at: number;
  last_activity_at: number;
  reminder_sent: number;
};

// ─────────────────────────────────────────────────────────────────────────────
// Row to Entity Conversions
// ─────────────────────────────────────────────────────────────────────────────

function rowToTeam(row: TeamRow): Team {
  return {
    id: row.id,
    serverId: row.server_id,
    name: row.name,
    channelId: row.channel_id,
    discordAccountId: row.discord_account_id,
    createdAt: row.created_at,
  };
}

function rowToMember(row: MemberRow): Member {
  return {
    id: row.id,
    teamId: row.team_id,
    discordUserId: row.discord_user_id,
    displayName: row.display_name,
    schedule: {
      checkInTime: row.check_in_time,
      timezone: row.timezone,
      skipWeekends: row.skip_weekends === 1,
    },
    vacationUntil: row.vacation_until,
    createdAt: row.created_at,
  };
}

function rowToCheckin(row: CheckinRow): Checkin {
  return {
    id: row.id,
    memberId: row.member_id,
    teamId: row.team_id,
    yesterday: row.yesterday,
    today: row.today,
    blockers: row.blockers,
    submittedAt: row.submitted_at,
    postedToChannel: row.posted_to_channel === 1,
  };
}

function rowToConversationState(row: ConversationStateRow): ConversationState {
  return {
    memberId: row.member_id,
    teamId: row.team_id,
    currentQuestion: row.current_question as 1 | 2 | 3,
    answers: {
      yesterday: row.answer_yesterday ?? undefined,
      today: row.answer_today ?? undefined,
      blockers: row.answer_blockers ?? undefined,
    },
    startedAt: row.started_at,
    lastActivityAt: row.last_activity_at,
    reminderSent: row.reminder_sent === 1,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Storage Implementation
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Create a storage instance for the check-ins extension.
 *
 * @param dbPath - Path to the SQLite database file
 * @param config - Optional plugin configuration for defaults
 * @returns CheckinsStorage instance
 */
export function createStorage(dbPath: string, config?: CheckinsConfig): CheckinsStorage {
  // Lazy-load node:sqlite to avoid issues on Node < 22
  type DatabaseSync = import("node:sqlite").DatabaseSync;
  let db: DatabaseSync | null = null;

  // Default schedule values from config or hardcoded defaults
  const defaultTimezone = config?.defaultTimezone ?? "America/New_York";
  const defaultCheckInTime = config?.defaultCheckInTime ?? "17:00";

  function getDb(): DatabaseSync {
    if (!db) {
      throw new Error("Database not initialized. Call init() first.");
    }
    return db;
  }

  function ensureDir(dirPath: string): void {
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
    }
  }

  return {
    init() {
      if (db) return; // Already initialized

      // Ensure parent directory exists
      ensureDir(path.dirname(dbPath));

      // Dynamically require node:sqlite (Node 22+)
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { DatabaseSync } = require("node:sqlite") as typeof import("node:sqlite");
      db = new DatabaseSync(dbPath);

      // Enable foreign keys and create schema
      db.exec("PRAGMA foreign_keys = ON;");

      // Execute schema (CREATE IF NOT EXISTS is safe to run multiple times)
      for (const statement of SCHEMA_SQL.split(";").filter((s) => s.trim())) {
        db.exec(statement + ";");
      }
    },

    close() {
      if (db) {
        db.close();
        db = null;
      }
    },

    // ─────────────────────────────────────────────────────────────────────────
    // Teams
    // ─────────────────────────────────────────────────────────────────────────

    createTeam({ serverId, name, channelId, discordAccountId }) {
      const d = getDb();
      const id = randomUUID();
      const now = Date.now();

      const stmt = d.prepare(`
        INSERT INTO teams (id, server_id, name, channel_id, discord_account_id, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `);
      stmt.run(id, serverId, name, channelId ?? null, discordAccountId ?? null, now);

      return {
        id,
        serverId,
        name,
        channelId: channelId ?? null,
        discordAccountId: discordAccountId ?? null,
        createdAt: now,
      };
    },

    getTeam(id) {
      const d = getDb();
      const stmt = d.prepare("SELECT * FROM teams WHERE id = ?");
      const row = stmt.get(id) as TeamRow | undefined;
      return row ? rowToTeam(row) : null;
    },

    getTeamByName(serverId, name) {
      const d = getDb();
      const stmt = d.prepare("SELECT * FROM teams WHERE server_id = ? AND name = ?");
      const row = stmt.get(serverId, name) as TeamRow | undefined;
      return row ? rowToTeam(row) : null;
    },

    listTeams(serverId) {
      const d = getDb();
      const stmt = d.prepare("SELECT * FROM teams WHERE server_id = ? ORDER BY name");
      const rows = stmt.all(serverId) as TeamRow[];
      return rows.map(rowToTeam);
    },

    updateTeam(id, updates) {
      const d = getDb();
      const sets: string[] = [];
      const params: unknown[] = [];

      if (updates.name !== undefined) {
        sets.push("name = ?");
        params.push(updates.name);
      }
      if (updates.channelId !== undefined) {
        sets.push("channel_id = ?");
        params.push(updates.channelId);
      }
      if (updates.discordAccountId !== undefined) {
        sets.push("discord_account_id = ?");
        params.push(updates.discordAccountId);
      }

      if (sets.length === 0) return false;

      params.push(id);
      const stmt = d.prepare(`UPDATE teams SET ${sets.join(", ")} WHERE id = ?`);
      const result = stmt.run(...params);
      return result.changes > 0;
    },

    deleteTeam(id) {
      const d = getDb();
      const stmt = d.prepare("DELETE FROM teams WHERE id = ?");
      const result = stmt.run(id);
      return result.changes > 0;
    },

    getAllTeams() {
      const d = getDb();
      const stmt = d.prepare("SELECT * FROM teams ORDER BY name");
      const rows = stmt.all() as TeamRow[];
      return rows.map(rowToTeam);
    },

    // ─────────────────────────────────────────────────────────────────────────
    // Members
    // ─────────────────────────────────────────────────────────────────────────

    addMember({ teamId, discordUserId, displayName, schedule }) {
      const d = getDb();
      const id = randomUUID();
      const now = Date.now();

      const checkInTime = schedule?.checkInTime ?? defaultCheckInTime;
      const timezone = schedule?.timezone ?? defaultTimezone;
      const skipWeekends = schedule?.skipWeekends ?? true;

      const stmt = d.prepare(`
        INSERT INTO members (id, team_id, discord_user_id, display_name, check_in_time, timezone, skip_weekends, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `);
      stmt.run(id, teamId, discordUserId, displayName ?? null, checkInTime, timezone, skipWeekends ? 1 : 0, now);

      return {
        id,
        teamId,
        discordUserId,
        displayName: displayName ?? null,
        schedule: { checkInTime, timezone, skipWeekends },
        vacationUntil: null,
        createdAt: now,
      };
    },

    getMember(id) {
      const d = getDb();
      const stmt = d.prepare("SELECT * FROM members WHERE id = ?");
      const row = stmt.get(id) as MemberRow | undefined;
      return row ? rowToMember(row) : null;
    },

    getMemberByDiscordId(teamId, discordUserId) {
      const d = getDb();
      const stmt = d.prepare("SELECT * FROM members WHERE team_id = ? AND discord_user_id = ?");
      const row = stmt.get(teamId, discordUserId) as MemberRow | undefined;
      return row ? rowToMember(row) : null;
    },

    listMembers(teamId) {
      const d = getDb();
      const stmt = d.prepare("SELECT * FROM members WHERE team_id = ? ORDER BY display_name, discord_user_id");
      const rows = stmt.all(teamId) as MemberRow[];
      return rows.map(rowToMember);
    },

    updateMember(id, updates) {
      const d = getDb();
      const sets: string[] = [];
      const params: unknown[] = [];

      if (updates.displayName !== undefined) {
        sets.push("display_name = ?");
        params.push(updates.displayName);
      }
      if (updates.vacationUntil !== undefined) {
        sets.push("vacation_until = ?");
        params.push(updates.vacationUntil);
      }
      if (updates.schedule !== undefined) {
        if (updates.schedule.checkInTime !== undefined) {
          sets.push("check_in_time = ?");
          params.push(updates.schedule.checkInTime);
        }
        if (updates.schedule.timezone !== undefined) {
          sets.push("timezone = ?");
          params.push(updates.schedule.timezone);
        }
        if (updates.schedule.skipWeekends !== undefined) {
          sets.push("skip_weekends = ?");
          params.push(updates.schedule.skipWeekends ? 1 : 0);
        }
      }

      if (sets.length === 0) return false;

      params.push(id);
      const stmt = d.prepare(`UPDATE members SET ${sets.join(", ")} WHERE id = ?`);
      const result = stmt.run(...params);
      return result.changes > 0;
    },

    removeMember(id) {
      const d = getDb();
      const stmt = d.prepare("DELETE FROM members WHERE id = ?");
      const result = stmt.run(id);
      return result.changes > 0;
    },

    // ─────────────────────────────────────────────────────────────────────────
    // Check-ins
    // ─────────────────────────────────────────────────────────────────────────

    saveCheckin({ memberId, teamId, yesterday, today, blockers }) {
      const d = getDb();
      const id = randomUUID();
      const now = Date.now();

      const stmt = d.prepare(`
        INSERT INTO checkins (id, member_id, team_id, yesterday, today, blockers, submitted_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `);
      stmt.run(id, memberId, teamId, yesterday, today, blockers ?? null, now);

      return {
        id,
        memberId,
        teamId,
        yesterday,
        today,
        blockers: blockers ?? null,
        submittedAt: now,
        postedToChannel: false,
      };
    },

    getCheckin(id) {
      const d = getDb();
      const stmt = d.prepare("SELECT * FROM checkins WHERE id = ?");
      const row = stmt.get(id) as CheckinRow | undefined;
      return row ? rowToCheckin(row) : null;
    },

    listCheckins({ teamId, memberId, since, until }) {
      const d = getDb();
      const conditions: string[] = [];
      const params: unknown[] = [];

      if (teamId !== undefined) {
        conditions.push("team_id = ?");
        params.push(teamId);
      }
      if (memberId !== undefined) {
        conditions.push("member_id = ?");
        params.push(memberId);
      }
      if (since !== undefined) {
        conditions.push("submitted_at >= ?");
        params.push(since);
      }
      if (until !== undefined) {
        conditions.push("submitted_at <= ?");
        params.push(until);
      }

      const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
      const stmt = d.prepare(`SELECT * FROM checkins ${whereClause} ORDER BY submitted_at DESC`);
      const rows = stmt.all(...params) as CheckinRow[];
      return rows.map(rowToCheckin);
    },

    markPosted(checkinId) {
      const d = getDb();
      const stmt = d.prepare("UPDATE checkins SET posted_to_channel = 1 WHERE id = ?");
      const result = stmt.run(checkinId);
      return result.changes > 0;
    },

    // ─────────────────────────────────────────────────────────────────────────
    // Conversation State
    // ─────────────────────────────────────────────────────────────────────────

    getConversationState(memberId) {
      const d = getDb();
      const stmt = d.prepare("SELECT * FROM conversation_state WHERE member_id = ?");
      const row = stmt.get(memberId) as ConversationStateRow | undefined;
      return row ? rowToConversationState(row) : null;
    },

    saveConversationState(state) {
      const d = getDb();
      const stmt = d.prepare(`
        INSERT OR REPLACE INTO conversation_state
          (member_id, team_id, current_question, answer_yesterday, answer_today, answer_blockers, started_at, last_activity_at, reminder_sent)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      stmt.run(
        state.memberId,
        state.teamId,
        state.currentQuestion,
        state.answers.yesterday ?? null,
        state.answers.today ?? null,
        state.answers.blockers ?? null,
        state.startedAt,
        state.lastActivityAt,
        state.reminderSent ? 1 : 0,
      );
    },

    deleteConversationState(memberId) {
      const d = getDb();
      const stmt = d.prepare("DELETE FROM conversation_state WHERE member_id = ?");
      const result = stmt.run(memberId);
      return result.changes > 0;
    },

    listActiveConversations() {
      const d = getDb();
      const stmt = d.prepare("SELECT * FROM conversation_state ORDER BY last_activity_at");
      const rows = stmt.all() as ConversationStateRow[];
      return rows.map(rowToConversationState);
    },
  };
}

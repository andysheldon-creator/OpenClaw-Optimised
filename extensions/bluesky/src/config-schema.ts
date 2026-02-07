import { MarkdownConfigSchema, buildChannelConfigSchema } from "openclaw/plugin-sdk";
import { z } from "zod";

const allowFromEntry = z.union([z.string(), z.number()]);

/**
 * Zod schema for channels.bluesky.* configuration
 */
export const BlueskyConfigSchema = z.object({
  /** Account name (optional display name) */
  name: z.string().optional(),

  /** Whether this channel is enabled */
  enabled: z.boolean().optional(),

  /** Markdown formatting overrides (tables). */
  markdown: MarkdownConfigSchema,

  /** Bluesky handle (e.g., "user.bsky.social") or DID */
  identifier: z.string().optional(),

  /** App password (generate at Settings > App Passwords on bsky.app) */
  appPassword: z.string().optional(),

  /** PDS service URL (defaults to https://bsky.social) */
  service: z.string().url().optional(),

  /** Polling interval in milliseconds for new DMs (default: 5000) */
  pollInterval: z.number().int().min(2000).max(60000).optional(),

  /** DM access policy: pairing, allowlist, open, or disabled */
  dmPolicy: z.enum(["pairing", "allowlist", "open", "disabled"]).optional(),

  /** Allowed sender DIDs or handles */
  allowFrom: z.array(allowFromEntry).optional(),
});

export type BlueskyConfig = z.infer<typeof BlueskyConfigSchema>;

/**
 * JSON Schema for Control UI (converted from Zod)
 */
export const blueskyChannelConfigSchema = buildChannelConfigSchema(BlueskyConfigSchema);

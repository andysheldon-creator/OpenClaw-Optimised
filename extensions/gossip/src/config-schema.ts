import { MarkdownConfigSchema, buildChannelConfigSchema } from "openclaw/plugin-sdk";
import { z } from "zod";

const allowFromEntry = z.union([z.string(), z.number()]);

/**
 * Zod schema for channels.gossip.* configuration
 */
export const GossipConfigSchema = z.object({
  /** Account name (optional display name) */
  name: z.string().optional(),

  /** Whether this channel is enabled */
  enabled: z.boolean().optional(),

  /** Markdown formatting overrides (tables). */
  markdown: MarkdownConfigSchema,

  /**
   * BIP39 mnemonic phrase for account recovery.
   * If not provided, a new account will be generated on first run.
   * Supports environment variable substitution (e.g., "${GOSSIP_MNEMONIC}").
   */
  mnemonic: z.string().optional(),

  /**
   * Username for the Gossip account.
   * Used when creating a new account.
   */
  username: z.string().optional(),

  /**
   * Gossip protocol API base URL.
   * Defaults to the official Gossip API endpoint.
   */
  protocolUrl: z.string().url().optional(),

  /** DM access policy: pairing, allowlist, open, or disabled */
  dmPolicy: z.enum(["pairing", "allowlist", "open", "disabled"]).optional(),

  /** Allowed sender user IDs (Gossip user ID format) */
  allowFrom: z.array(allowFromEntry).optional(),
});

export type GossipConfig = z.infer<typeof GossipConfigSchema>;

/**
 * JSON Schema for Control UI (converted from Zod)
 */
export const gossipChannelConfigSchema = buildChannelConfigSchema(GossipConfigSchema);

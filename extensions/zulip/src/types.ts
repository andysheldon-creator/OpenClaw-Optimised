import type { GroupPolicy } from "openclaw/plugin-sdk";

export type ZulipAccountConfig = {
  name?: string;
  enabled?: boolean;

  // Auth
  // apiBaseUrls allows configuring multiple API endpoints (e.g. LAN primary + tunnel fallback).
  // If set, it takes precedence over realm/site.
  apiBaseUrls?: string[];
  realm?: string; // preferred (ZULIP_REALM)
  site?: string; // alias for realm
  email?: string;
  apiKey?: string;

  // Access control
  allowFrom?: Array<string | number>;
  groupAllowFrom?: Array<string | number>;
  groupPolicy?: GroupPolicy;

  // Optional: keep a lightweight DM policy; defaults to pairing.
  dmPolicy?: "disabled" | "pairing" | "allowlist" | "open";

  // Outbound chunking (markdown). If set, overrides the default chunk limit.
  // Applies to replies generated from inbound messages as well as any manual chunking.
  textChunkLimit?: number;
};

export type CoreConfig = {
  channels?: {
    defaults?: {
      groupPolicy?: GroupPolicy;
    };
    zulip?: ZulipAccountConfig & {
      accounts?: Record<string, ZulipAccountConfig | undefined>;
    };
  };
};

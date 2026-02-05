import type { OpenClawConfig } from "openclaw/plugin-sdk";
import { normalizeAllowFrom } from "openclaw/plugin-sdk";
import type { ResolvedSimplexAccount } from "./types.js";

export type SimplexAllowlistEntry = {
  kind: "any" | "sender" | "group";
  value: string;
};

const SIMPLEX_PREFIX_RE = /^simplex:/i;
const SIMPLEX_GROUP_PREFIX_RE = /^(#|group:)/i;
const SIMPLEX_SENDER_PREFIX_RE = /^(@|contact:|user:|member:)/i;

function normalizeSimplexId(value: string): string {
  return value.trim().toLowerCase();
}

function stripSimplexPrefix(value: string): string {
  return value.replace(SIMPLEX_PREFIX_RE, "").trim();
}

export function parseSimplexAllowlistEntry(raw: string | number): SimplexAllowlistEntry | null {
  let entry = String(raw).trim();
  if (!entry) {
    return null;
  }
  if (entry === "*") {
    return { kind: "any", value: "*" };
  }
  entry = stripSimplexPrefix(entry);
  if (!entry) {
    return null;
  }
  if (SIMPLEX_GROUP_PREFIX_RE.test(entry)) {
    const value = entry.replace(SIMPLEX_GROUP_PREFIX_RE, "");
    return { kind: "group", value: normalizeSimplexId(value) };
  }
  if (SIMPLEX_SENDER_PREFIX_RE.test(entry)) {
    const value = entry.replace(SIMPLEX_SENDER_PREFIX_RE, "");
    return { kind: "sender", value: normalizeSimplexId(value) };
  }
  return { kind: "sender", value: normalizeSimplexId(entry) };
}

export function resolveSimplexAllowFrom(params: {
  cfg: OpenClawConfig;
  accountId?: string | null;
}): string[] {
  const accountId = params.accountId ?? "default";
  const accountAllow = params.cfg.channels?.simplex?.accounts?.[accountId]?.allowFrom;
  const baseAllow = params.cfg.channels?.simplex?.allowFrom;
  const raw = Array.isArray(accountAllow) ? accountAllow : baseAllow;
  return normalizeAllowFrom(raw ?? []);
}

export function formatSimplexAllowFrom(allowFrom: Array<string | number>): string[] {
  return normalizeAllowFrom(allowFrom)
    .map((entry) => stripSimplexPrefix(entry))
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => entry.toLowerCase());
}

export function resolveSimplexDmPolicy(params: {
  cfg: OpenClawConfig;
  account: ResolvedSimplexAccount;
}): { policy: string; allowFrom: string[] } {
  const policy =
    params.account.config.dmPolicy ?? params.cfg.channels?.simplex?.dmPolicy ?? "pairing";
  const allowFrom = resolveSimplexAllowFrom({
    cfg: params.cfg,
    accountId: params.account.accountId,
  });
  return { policy, allowFrom };
}

export function isSimplexAllowlisted(params: {
  allowFrom: Array<string | number>;
  senderId?: string | null;
  groupId?: string | null;
  allowGroupId?: boolean;
}): boolean {
  const allowFrom = params.allowFrom ?? [];
  if (allowFrom.length === 0) {
    return false;
  }
  const senderKey = params.senderId ? normalizeSimplexId(String(params.senderId)) : "";
  const groupKey = params.groupId ? normalizeSimplexId(String(params.groupId)) : "";

  for (const raw of allowFrom) {
    const entry = parseSimplexAllowlistEntry(raw);
    if (!entry) {
      continue;
    }
    if (entry.kind === "any") {
      return true;
    }
    if (entry.kind === "sender") {
      if (senderKey && entry.value === senderKey) {
        return true;
      }
      continue;
    }
    if (entry.kind === "group" && params.allowGroupId) {
      if (groupKey && entry.value === groupKey) {
        return true;
      }
    }
  }
  return false;
}

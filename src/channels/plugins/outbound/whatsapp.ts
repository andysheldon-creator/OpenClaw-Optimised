import type { ChannelOutboundAdapter } from "../types.js";
import { chunkText } from "../../../auto-reply/chunk.js";
import { shouldLogVerbose } from "../../../globals.js";
import { missingTargetError } from "../../../infra/outbound/target-errors.js";
import { resolveWhatsAppAccount } from "../../../web/accounts.js";
import { sendPollWhatsApp } from "../../../web/outbound.js";
import { isWhatsAppGroupJid, normalizeWhatsAppTarget } from "../../../whatsapp/normalize.js";

function normalizeSendToList(entries: unknown[] | undefined) {
  const raw = (entries ?? []).map((entry) => String(entry).trim()).filter(Boolean);
  const hasWildcard = raw.includes("*");
  const normalized = raw
    .filter((entry) => entry !== "*")
    .map((entry) => normalizeWhatsAppTarget(entry))
    .filter((entry): entry is string => Boolean(entry))
    .filter((entry) => !isWhatsAppGroupJid(entry));
  return {
    hasWildcard,
    entries: Array.from(new Set(normalized)),
  };
}

function notAllowedSendToError() {
  return new Error(
    "WhatsApp DM target is blocked by channels.whatsapp.sendTo (or channels.whatsapp.accounts.<id>.sendTo)",
  );
}

export const whatsappOutbound: ChannelOutboundAdapter = {
  deliveryMode: "gateway",
  chunker: chunkText,
  chunkerMode: "text",
  textChunkLimit: 4000,
  pollMaxOptions: 12,
  resolveTarget: ({ to, allowFrom, mode, cfg, accountId }) => {
    const trimmed = to?.trim() ?? "";
    const allowListRaw = (allowFrom ?? []).map((entry) => String(entry).trim()).filter(Boolean);
    const hasWildcard = allowListRaw.includes("*");
    const allowList = allowListRaw
      .filter((entry) => entry !== "*")
      .map((entry) => normalizeWhatsAppTarget(entry))
      .filter((entry): entry is string => Boolean(entry));
    const sendToRaw = cfg ? resolveWhatsAppAccount({ cfg, accountId }).sendTo : undefined;
    const sendTo = normalizeSendToList(sendToRaw);
    const hasSendToRestriction = !sendTo.hasWildcard && sendTo.entries.length > 0;

    if (trimmed) {
      const normalizedTo = normalizeWhatsAppTarget(trimmed);
      if (!normalizedTo) {
        if (mode === "implicit" || mode === "heartbeat") {
          if (hasSendToRestriction) {
            return { ok: true, to: sendTo.entries[0] };
          }
          if (allowList.length > 0) {
            return { ok: true, to: allowList[0] };
          }
        }
        return {
          ok: false,
          error: missingTargetError(
            "WhatsApp",
            "<E.164|group JID> or channels.whatsapp.allowFrom[0]",
          ),
        };
      }
      if (isWhatsAppGroupJid(normalizedTo)) {
        return { ok: true, to: normalizedTo };
      }
      if (hasSendToRestriction && !sendTo.entries.includes(normalizedTo)) {
        return { ok: false, error: notAllowedSendToError() };
      }
      if (mode === "implicit" || mode === "heartbeat") {
        if (hasWildcard || allowList.length === 0) {
          return { ok: true, to: normalizedTo };
        }
        if (allowList.includes(normalizedTo)) {
          return { ok: true, to: normalizedTo };
        }
        const fallback = allowList[0];
        if (hasSendToRestriction && !sendTo.entries.includes(fallback)) {
          return { ok: false, error: notAllowedSendToError() };
        }
        return { ok: true, to: fallback };
      }
      return { ok: true, to: normalizedTo };
    }

    if (hasSendToRestriction) {
      return { ok: true, to: sendTo.entries[0] };
    }
    if (allowList.length > 0) {
      return { ok: true, to: allowList[0] };
    }
    return {
      ok: false,
      error: missingTargetError("WhatsApp", "<E.164|group JID> or channels.whatsapp.allowFrom[0]"),
    };
  },
  sendText: async ({ to, text, accountId, deps, gifPlayback }) => {
    const send =
      deps?.sendWhatsApp ?? (await import("../../../web/outbound.js")).sendMessageWhatsApp;
    const result = await send(to, text, {
      verbose: false,
      accountId: accountId ?? undefined,
      gifPlayback,
    });
    return { channel: "whatsapp", ...result };
  },
  sendMedia: async ({ to, text, mediaUrl, accountId, deps, gifPlayback }) => {
    const send =
      deps?.sendWhatsApp ?? (await import("../../../web/outbound.js")).sendMessageWhatsApp;
    const result = await send(to, text, {
      verbose: false,
      mediaUrl,
      accountId: accountId ?? undefined,
      gifPlayback,
    });
    return { channel: "whatsapp", ...result };
  },
  sendPoll: async ({ to, poll, accountId }) =>
    await sendPollWhatsApp(to, poll, {
      verbose: shouldLogVerbose(),
      accountId: accountId ?? undefined,
    }),
};

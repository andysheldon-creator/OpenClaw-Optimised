import { jidToE164, normalizeE164 } from "../../../utils.js";
import type { WebInboundMsg } from "../types.js";
import type { WebInboundReaction } from "../../inbound/types.js";

export function resolvePeerId(msg: WebInboundMsg) {
  if (msg.chatType === "group") return msg.conversationId ?? msg.from;
  if (msg.senderE164) return normalizeE164(msg.senderE164) ?? msg.senderE164;
  if (msg.from.includes("@")) return jidToE164(msg.from) ?? msg.from;
  return normalizeE164(msg.from) ?? msg.from;
}

export function resolveReactionPeerId(reaction: WebInboundReaction) {
  if (reaction.chatType === "group") return reaction.chatJid;
  if (reaction.senderE164) return normalizeE164(reaction.senderE164) ?? reaction.senderE164;
  if (reaction.chatJid.includes("@")) return jidToE164(reaction.chatJid) ?? reaction.chatJid;
  return normalizeE164(reaction.chatJid) ?? reaction.chatJid;
}

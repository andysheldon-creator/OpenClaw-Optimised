import type { AgentToolResult } from "@mariozechner/pi-agent-core";
import type { OpenClawConfig } from "../../config/config.js";
import {
  sendReactionWhatsApp,
  updateGroupSubjectWhatsApp,
  updateGroupDescriptionWhatsApp,
  updateGroupPhotoWhatsApp,
  updateGroupParticipantsWhatsApp,
  updateGroupSettingsWhatsApp,
  type GroupParticipantAction,
  type GroupSettingValue,
} from "../../web/outbound.js";
import { loadWebMedia } from "../../web/media.js";
import { createActionGate, jsonResult, readReactionParams, readStringParam } from "./common.js";

export async function handleWhatsAppAction(
  params: Record<string, unknown>,
  cfg: OpenClawConfig,
): Promise<AgentToolResult<unknown>> {
  const action = readStringParam(params, "action", { required: true });
  const isActionEnabled = createActionGate(cfg.channels?.whatsapp?.actions);

  if (action === "react") {
    if (!isActionEnabled("reactions")) {
      throw new Error("WhatsApp reactions are disabled.");
    }
    const chatJid = readStringParam(params, "chatJid", { required: true });
    const messageId = readStringParam(params, "messageId", { required: true });
    const { emoji, remove, isEmpty } = readReactionParams(params, {
      removeErrorMessage: "Emoji is required to remove a WhatsApp reaction.",
    });
    const participant = readStringParam(params, "participant");
    const accountId = readStringParam(params, "accountId");
    const fromMeRaw = params.fromMe;
    const fromMe = typeof fromMeRaw === "boolean" ? fromMeRaw : undefined;
    const resolvedEmoji = remove ? "" : emoji;
    await sendReactionWhatsApp(chatJid, messageId, resolvedEmoji, {
      verbose: false,
      fromMe,
      participant: participant ?? undefined,
      accountId: accountId ?? undefined,
    });
    if (!remove && !isEmpty) {
      return jsonResult({ ok: true, added: emoji });
    }
    return jsonResult({ ok: true, removed: true });
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Group Admin Actions
  // ─────────────────────────────────────────────────────────────────────────────

  if (action === "updateGroupSubject") {
    if (!isActionEnabled("groupAdmin")) {
      throw new Error("WhatsApp group admin actions are disabled.");
    }
    const chatJid = readStringParam(params, "chatJid", { required: true });
    const subject = readStringParam(params, "subject", { required: true });
    const accountId = readStringParam(params, "accountId");
    await updateGroupSubjectWhatsApp(chatJid, subject, { accountId: accountId ?? undefined });
    return jsonResult({ ok: true, action: "updateGroupSubject", chatJid, subject });
  }

  if (action === "updateGroupDescription") {
    if (!isActionEnabled("groupAdmin")) {
      throw new Error("WhatsApp group admin actions are disabled.");
    }
    const chatJid = readStringParam(params, "chatJid", { required: true });
    const description = readStringParam(params, "description");
    const accountId = readStringParam(params, "accountId");
    await updateGroupDescriptionWhatsApp(chatJid, description ?? undefined, {
      accountId: accountId ?? undefined,
    });
    return jsonResult({ ok: true, action: "updateGroupDescription", chatJid });
  }

  if (action === "updateGroupPhoto") {
    if (!isActionEnabled("groupAdmin")) {
      throw new Error("WhatsApp group admin actions are disabled.");
    }
    const chatJid = readStringParam(params, "chatJid", { required: true });
    const image = readStringParam(params, "image", { required: true });
    const accountId = readStringParam(params, "accountId");
    // Load image from URL or base64
    const media = await loadWebMedia(image);
    await updateGroupPhotoWhatsApp(chatJid, media.buffer, { accountId: accountId ?? undefined });
    return jsonResult({ ok: true, action: "updateGroupPhoto", chatJid });
  }

  if (action === "updateGroupParticipants") {
    if (!isActionEnabled("groupAdmin")) {
      throw new Error("WhatsApp group admin actions are disabled.");
    }
    const chatJid = readStringParam(params, "chatJid", { required: true });
    const participantsRaw = params.participants;
    if (!Array.isArray(participantsRaw) || participantsRaw.length === 0) {
      throw new Error("participants must be a non-empty array of phone numbers or JIDs");
    }
    const participants = participantsRaw.map((p) => String(p));
    const operation = readStringParam(params, "operation", { required: true });
    const validOperations: GroupParticipantAction[] = ["add", "remove", "promote", "demote"];
    if (!validOperations.includes(operation as GroupParticipantAction)) {
      throw new Error(`Invalid operation: ${operation}. Must be one of: ${validOperations.join(", ")}`);
    }
    const accountId = readStringParam(params, "accountId");
    const result = await updateGroupParticipantsWhatsApp(
      chatJid,
      participants,
      operation as GroupParticipantAction,
      { accountId: accountId ?? undefined },
    );
    return jsonResult({ ok: true, action: "updateGroupParticipants", chatJid, operation, result });
  }

  if (action === "updateGroupSettings") {
    if (!isActionEnabled("groupAdmin")) {
      throw new Error("WhatsApp group admin actions are disabled.");
    }
    const chatJid = readStringParam(params, "chatJid", { required: true });
    const setting = readStringParam(params, "setting", { required: true });
    const validSettings: GroupSettingValue[] = ["announcement", "not_announcement", "locked", "unlocked"];
    if (!validSettings.includes(setting as GroupSettingValue)) {
      throw new Error(`Invalid setting: ${setting}. Must be one of: ${validSettings.join(", ")}`);
    }
    const accountId = readStringParam(params, "accountId");
    await updateGroupSettingsWhatsApp(chatJid, setting as GroupSettingValue, {
      accountId: accountId ?? undefined,
    });
    return jsonResult({ ok: true, action: "updateGroupSettings", chatJid, setting });
  }

  throw new Error(`Unsupported WhatsApp action: ${action}`);
}

import type { AgentToolResult } from "@mariozechner/pi-agent-core";
import {
  createActionGate,
  jsonResult,
  readNumberParam,
  readReactionParams,
  readStringParam,
} from "openclaw/plugin-sdk";
import type { CoreConfig } from "./types.js";
import {
  acceptMatrixVerification,
  cancelMatrixVerification,
  confirmMatrixVerificationReciprocateQr,
  confirmMatrixVerificationSas,
  deleteMatrixMessage,
  editMatrixMessage,
  generateMatrixVerificationQr,
  getMatrixEncryptionStatus,
  getMatrixMemberInfo,
  getMatrixRoomInfo,
  getMatrixVerificationSas,
  listMatrixPins,
  listMatrixReactions,
  listMatrixVerifications,
  mismatchMatrixVerificationSas,
  pinMatrixMessage,
  readMatrixMessages,
  requestMatrixVerification,
  removeMatrixReactions,
  scanMatrixVerificationQr,
  sendMatrixMessage,
  startMatrixVerification,
  unpinMatrixMessage,
} from "./matrix/actions.js";
import { reactMatrixMessage } from "./matrix/send.js";

const messageActions = new Set(["sendMessage", "editMessage", "deleteMessage", "readMessages"]);
const reactionActions = new Set(["react", "reactions"]);
const pinActions = new Set(["pinMessage", "unpinMessage", "listPins"]);
const verificationActions = new Set([
  "encryptionStatus",
  "verificationList",
  "verificationRequest",
  "verificationAccept",
  "verificationCancel",
  "verificationStart",
  "verificationGenerateQr",
  "verificationScanQr",
  "verificationSas",
  "verificationConfirm",
  "verificationMismatch",
  "verificationConfirmQr",
]);

function readRoomId(params: Record<string, unknown>, required = true): string {
  const direct = readStringParam(params, "roomId") ?? readStringParam(params, "channelId");
  if (direct) {
    return direct;
  }
  if (!required) {
    return readStringParam(params, "to") ?? "";
  }
  return readStringParam(params, "to", { required: true });
}

export async function handleMatrixAction(
  params: Record<string, unknown>,
  cfg: CoreConfig,
): Promise<AgentToolResult<unknown>> {
  const action = readStringParam(params, "action", { required: true });
  const isActionEnabled = createActionGate(cfg.channels?.matrix?.actions);

  if (reactionActions.has(action)) {
    if (!isActionEnabled("reactions")) {
      throw new Error("Matrix reactions are disabled.");
    }
    const roomId = readRoomId(params);
    const messageId = readStringParam(params, "messageId", { required: true });
    if (action === "react") {
      const { emoji, remove, isEmpty } = readReactionParams(params, {
        removeErrorMessage: "Emoji is required to remove a Matrix reaction.",
      });
      if (remove || isEmpty) {
        const result = await removeMatrixReactions(roomId, messageId, {
          emoji: remove ? emoji : undefined,
        });
        return jsonResult({ ok: true, removed: result.removed });
      }
      await reactMatrixMessage(roomId, messageId, emoji);
      return jsonResult({ ok: true, added: emoji });
    }
    const reactions = await listMatrixReactions(roomId, messageId);
    return jsonResult({ ok: true, reactions });
  }

  if (messageActions.has(action)) {
    if (!isActionEnabled("messages")) {
      throw new Error("Matrix messages are disabled.");
    }
    switch (action) {
      case "sendMessage": {
        const to = readStringParam(params, "to", { required: true });
        const content = readStringParam(params, "content", {
          required: true,
          allowEmpty: true,
        });
        const mediaUrl = readStringParam(params, "mediaUrl");
        const replyToId =
          readStringParam(params, "replyToId") ?? readStringParam(params, "replyTo");
        const threadId = readStringParam(params, "threadId");
        const result = await sendMatrixMessage(to, content, {
          mediaUrl: mediaUrl ?? undefined,
          replyToId: replyToId ?? undefined,
          threadId: threadId ?? undefined,
        });
        return jsonResult({ ok: true, result });
      }
      case "editMessage": {
        const roomId = readRoomId(params);
        const messageId = readStringParam(params, "messageId", { required: true });
        const content = readStringParam(params, "content", { required: true });
        const result = await editMatrixMessage(roomId, messageId, content);
        return jsonResult({ ok: true, result });
      }
      case "deleteMessage": {
        const roomId = readRoomId(params);
        const messageId = readStringParam(params, "messageId", { required: true });
        const reason = readStringParam(params, "reason");
        await deleteMatrixMessage(roomId, messageId, { reason: reason ?? undefined });
        return jsonResult({ ok: true, deleted: true });
      }
      case "readMessages": {
        const roomId = readRoomId(params);
        const limit = readNumberParam(params, "limit", { integer: true });
        const before = readStringParam(params, "before");
        const after = readStringParam(params, "after");
        const result = await readMatrixMessages(roomId, {
          limit: limit ?? undefined,
          before: before ?? undefined,
          after: after ?? undefined,
        });
        return jsonResult({ ok: true, ...result });
      }
      default:
        break;
    }
  }

  if (pinActions.has(action)) {
    if (!isActionEnabled("pins")) {
      throw new Error("Matrix pins are disabled.");
    }
    const roomId = readRoomId(params);
    if (action === "pinMessage") {
      const messageId = readStringParam(params, "messageId", { required: true });
      const result = await pinMatrixMessage(roomId, messageId);
      return jsonResult({ ok: true, pinned: result.pinned });
    }
    if (action === "unpinMessage") {
      const messageId = readStringParam(params, "messageId", { required: true });
      const result = await unpinMatrixMessage(roomId, messageId);
      return jsonResult({ ok: true, pinned: result.pinned });
    }
    const result = await listMatrixPins(roomId);
    return jsonResult({ ok: true, pinned: result.pinned, events: result.events });
  }

  if (action === "memberInfo") {
    if (!isActionEnabled("memberInfo")) {
      throw new Error("Matrix member info is disabled.");
    }
    const userId = readStringParam(params, "userId", { required: true });
    const roomId = readStringParam(params, "roomId") ?? readStringParam(params, "channelId");
    const result = await getMatrixMemberInfo(userId, {
      roomId: roomId ?? undefined,
    });
    return jsonResult({ ok: true, member: result });
  }

  if (action === "channelInfo") {
    if (!isActionEnabled("channelInfo")) {
      throw new Error("Matrix room info is disabled.");
    }
    const roomId = readRoomId(params);
    const result = await getMatrixRoomInfo(roomId);
    return jsonResult({ ok: true, room: result });
  }

  if (verificationActions.has(action)) {
    if (!isActionEnabled("verification")) {
      throw new Error("Matrix verification actions are disabled.");
    }

    const requestId =
      readStringParam(params, "requestId") ??
      readStringParam(params, "verificationId") ??
      readStringParam(params, "id");

    if (action === "encryptionStatus") {
      const includeRecoveryKey = params.includeRecoveryKey === true;
      const status = await getMatrixEncryptionStatus({ includeRecoveryKey });
      return jsonResult({ ok: true, status });
    }
    if (action === "verificationList") {
      const verifications = await listMatrixVerifications();
      return jsonResult({ ok: true, verifications });
    }
    if (action === "verificationRequest") {
      const userId = readStringParam(params, "userId");
      const deviceId = readStringParam(params, "deviceId");
      const roomId = readStringParam(params, "roomId") ?? readStringParam(params, "channelId");
      const ownUser = typeof params.ownUser === "boolean" ? params.ownUser : undefined;
      const verification = await requestMatrixVerification({
        ownUser,
        userId: userId ?? undefined,
        deviceId: deviceId ?? undefined,
        roomId: roomId ?? undefined,
      });
      return jsonResult({ ok: true, verification });
    }
    if (action === "verificationAccept") {
      const verification = await acceptMatrixVerification(
        readStringParam({ requestId }, "requestId", { required: true }),
      );
      return jsonResult({ ok: true, verification });
    }
    if (action === "verificationCancel") {
      const reason = readStringParam(params, "reason");
      const code = readStringParam(params, "code");
      const verification = await cancelMatrixVerification(
        readStringParam({ requestId }, "requestId", { required: true }),
        { reason: reason ?? undefined, code: code ?? undefined },
      );
      return jsonResult({ ok: true, verification });
    }
    if (action === "verificationStart") {
      const methodRaw = readStringParam(params, "method");
      const method = methodRaw?.trim().toLowerCase();
      if (method && method !== "sas") {
        throw new Error(
          "Matrix verificationStart only supports method=sas; use verificationGenerateQr/verificationScanQr for QR flows.",
        );
      }
      const verification = await startMatrixVerification(
        readStringParam({ requestId }, "requestId", { required: true }),
        { method: "sas" },
      );
      return jsonResult({ ok: true, verification });
    }
    if (action === "verificationGenerateQr") {
      const qr = await generateMatrixVerificationQr(
        readStringParam({ requestId }, "requestId", { required: true }),
      );
      return jsonResult({ ok: true, ...qr });
    }
    if (action === "verificationScanQr") {
      const qrDataBase64 =
        readStringParam(params, "qrDataBase64") ??
        readStringParam(params, "qrData") ??
        readStringParam(params, "qr");
      const verification = await scanMatrixVerificationQr(
        readStringParam({ requestId }, "requestId", { required: true }),
        readStringParam({ qrDataBase64 }, "qrDataBase64", { required: true }),
      );
      return jsonResult({ ok: true, verification });
    }
    if (action === "verificationSas") {
      const sas = await getMatrixVerificationSas(
        readStringParam({ requestId }, "requestId", { required: true }),
      );
      return jsonResult({ ok: true, sas });
    }
    if (action === "verificationConfirm") {
      const verification = await confirmMatrixVerificationSas(
        readStringParam({ requestId }, "requestId", { required: true }),
      );
      return jsonResult({ ok: true, verification });
    }
    if (action === "verificationMismatch") {
      const verification = await mismatchMatrixVerificationSas(
        readStringParam({ requestId }, "requestId", { required: true }),
      );
      return jsonResult({ ok: true, verification });
    }
    if (action === "verificationConfirmQr") {
      const verification = await confirmMatrixVerificationReciprocateQr(
        readStringParam({ requestId }, "requestId", { required: true }),
      );
      return jsonResult({ ok: true, verification });
    }
  }

  throw new Error(`Unsupported Matrix action: ${action}`);
}

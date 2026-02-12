import type { ResolvedBotAccount } from "../types/index.js";
import type { StreamState } from "./types.js";
import { encryptWecomPlaintext, computeWecomMsgSignature } from "../crypto.js";
import { truncateUtf8Bytes } from "./http-utils.js";
import { LIMITS } from "./state.js";

const STREAM_MAX_BYTES = LIMITS.STREAM_MAX_BYTES;

/**
 * **buildEncryptedJsonReply (构建加密回复)**
 *
 * 将明文 JSON 包装成企业微信要求的加密 XML/JSON 格式（此处实际返回 JSON 结构）。
 * 包含签名计算逻辑。
 */
export function buildEncryptedJsonReply(params: {
  account: ResolvedBotAccount;
  plaintextJson: unknown;
  nonce: string;
  timestamp: string;
}): { encrypt: string; msgsignature: string; timestamp: string; nonce: string } {
  const plaintext = JSON.stringify(params.plaintextJson ?? {});
  const encrypt = encryptWecomPlaintext({
    encodingAESKey: params.account.encodingAESKey ?? "",
    receiveId: params.account.receiveId ?? "",
    plaintext,
  });
  const msgsignature = computeWecomMsgSignature({
    token: params.account.token ?? "",
    timestamp: params.timestamp,
    nonce: params.nonce,
    encrypt,
  });
  return {
    encrypt,
    msgsignature,
    timestamp: params.timestamp,
    nonce: params.nonce,
  };
}

export function buildStreamPlaceholderReply(params: {
  streamId: string;
  placeholderContent?: string;
}): {
  msgtype: "stream";
  stream: { id: string; finish: boolean; content: string };
} {
  const content = params.placeholderContent?.trim() || "1";
  return {
    msgtype: "stream",
    stream: {
      id: params.streamId,
      finish: false,
      // Spec: "第一次回复内容为 1" works as a minimal placeholder.
      content,
    },
  };
}

export function buildStreamImmediateTextReply(params: { streamId: string; content: string }): {
  msgtype: "stream";
  stream: { id: string; finish: boolean; content: string };
} {
  return {
    msgtype: "stream",
    stream: {
      id: params.streamId,
      finish: true,
      content: params.content.trim() || "1",
    },
  };
}

export function buildStreamTextPlaceholderReply(params: { streamId: string; content: string }): {
  msgtype: "stream";
  stream: { id: string; finish: boolean; content: string };
} {
  return {
    msgtype: "stream",
    stream: {
      id: params.streamId,
      finish: false,
      content: params.content.trim() || "1",
    },
  };
}

export function buildStreamReplyFromState(state: StreamState): {
  msgtype: "stream";
  stream: { id: string; finish: boolean; content: string };
} {
  const content = truncateUtf8Bytes(state.content, STREAM_MAX_BYTES);
  // Images handled? The original code had image logic.
  // Ensure we return message item if images exist
  return {
    msgtype: "stream",
    stream: {
      id: state.streamId,
      finish: state.finished,
      content,
      ...(state.finished && state.images?.length
        ? {
            msg_item: state.images.map((img) => ({
              msgtype: "image",
              image: { base64: img.base64, md5: img.md5 },
            })),
          }
        : {}),
    },
  };
}

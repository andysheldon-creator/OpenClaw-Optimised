// @ts-nocheck
import { buildTelegramMessageContext } from "./bot-message-context.js";
import { dispatchTelegramMessage } from "./bot-message-dispatch.js";
import { handleBubbleReply } from "./claude-code-callbacks.js";

export const createTelegramMessageProcessor = (deps) => {
  const {
    bot,
    cfg,
    account,
    telegramCfg,
    historyLimit,
    groupHistories,
    dmPolicy,
    allowFrom,
    groupAllowFrom,
    ackReactionScope,
    logger,
    resolveGroupActivation,
    resolveGroupRequireMention,
    resolveTelegramGroupConfig,
    runtime,
    replyToMode,
    streamMode,
    textLimit,
    opts,
    resolveBotTopicsEnabled,
  } = deps;

  return async (primaryCtx, allMedia, storeAllowFrom, options) => {
    // Check for Claude Code bubble replies first (before normal message processing)
    // This allows users to reply to bubble messages with new instructions
    const msg = primaryCtx.message ?? primaryCtx.editedMessage ?? primaryCtx.channelPost;
    if (msg?.reply_to_message?.message_id && msg.text) {
      const chatId = msg.chat?.id;
      if (chatId) {
        const handled = await handleBubbleReply({
          chatId,
          replyToMessageId: msg.reply_to_message.message_id,
          text: msg.text,
          api: bot.api,
        });
        if (handled) {
          // Bubble reply was handled, skip normal message processing
          return;
        }
      }
    }

    const context = await buildTelegramMessageContext({
      primaryCtx,
      allMedia,
      storeAllowFrom,
      options,
      bot,
      cfg,
      account,
      historyLimit,
      groupHistories,
      dmPolicy,
      allowFrom,
      groupAllowFrom,
      ackReactionScope,
      logger,
      resolveGroupActivation,
      resolveGroupRequireMention,
      resolveTelegramGroupConfig,
    });
    if (!context) return;
    await dispatchTelegramMessage({
      context,
      bot,
      cfg,
      runtime,
      replyToMode,
      streamMode,
      textLimit,
      telegramCfg,
      opts,
      resolveBotTopicsEnabled,
    });
  };
};

import { type ChannelThreadingAdapter } from "clawdbot/plugin-sdk";

export const gmailThreading: ChannelThreadingAdapter = {
  buildToolContext: ({ context, hasRepliedRef }) => ({
    currentThreadTs: context.ReplyToId,
    hasRepliedRef,
  }),
};

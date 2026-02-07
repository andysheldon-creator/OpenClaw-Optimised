import { Routes } from "discord-api-types/v10";
import type { ExecApprovalRequest } from "../../../discord/monitor/exec-approvals.js";
import type { ChannelOutboundAdapter } from "../types.js";
import {
  buildExecApprovalComponents,
  formatExecApprovalEmbed,
} from "../../../discord/monitor/exec-approvals.js";
import { sendMessageDiscord, sendPollDiscord } from "../../../discord/send.js";
import {
  createDiscordClient,
  parseAndResolveRecipient,
  resolveChannelId,
} from "../../../discord/send.shared.js";

type ExecApprovalChannelData = {
  id: string;
  command: string;
  cwd?: string | null;
  host?: string | null;
  agentId?: string | null;
  security?: string | null;
  expiresAtMs: number;
};

function toExecApprovalRequest(data: ExecApprovalChannelData): ExecApprovalRequest {
  return {
    id: data.id,
    request: {
      command: data.command,
      cwd: data.cwd,
      host: data.host,
      agentId: data.agentId,
      security: data.security,
    },
    createdAtMs: Date.now(),
    expiresAtMs: data.expiresAtMs,
  };
}

export const discordOutbound: ChannelOutboundAdapter = {
  deliveryMode: "direct",
  chunker: null,
  textChunkLimit: 2000,
  pollMaxOptions: 10,
  sendText: async ({ to, text, accountId, deps, replyToId }) => {
    const send = deps?.sendDiscord ?? sendMessageDiscord;
    const result = await send(to, text, {
      verbose: false,
      replyTo: replyToId ?? undefined,
      accountId: accountId ?? undefined,
    });
    return { channel: "discord", ...result };
  },
  sendMedia: async ({ to, text, mediaUrl, accountId, deps, replyToId }) => {
    const send = deps?.sendDiscord ?? sendMessageDiscord;
    const result = await send(to, text, {
      verbose: false,
      mediaUrl,
      replyTo: replyToId ?? undefined,
      accountId: accountId ?? undefined,
    });
    return { channel: "discord", ...result };
  },
  sendPayload: async ({ to, payload, accountId }) => {
    const discordData = payload.channelData?.discord as
      | { execApproval?: ExecApprovalChannelData }
      | undefined;

    if (!discordData?.execApproval?.id) {
      // No exec approval data — fall back to text send
      const send = sendMessageDiscord;
      const result = await send(to, payload.text ?? "", {
        verbose: false,
        accountId: accountId ?? undefined,
      });
      return { channel: "discord", ...result };
    }

    // Build the approval embed and button components
    const request = toExecApprovalRequest(discordData.execApproval);
    const embed = formatExecApprovalEmbed(request);
    const components = buildExecApprovalComponents(request.id);

    // Resolve the target channel and send with embeds + components
    const { rest, request: discordRequest } = createDiscordClient({
      accountId: accountId ?? undefined,
    });
    const recipient = await parseAndResolveRecipient(to, accountId ?? undefined);
    const { channelId } = await resolveChannelId(rest, recipient, discordRequest);

    const message = (await discordRequest(
      () =>
        rest.post(Routes.channelMessages(channelId), {
          body: {
            embeds: [embed],
            components,
          },
        }) as Promise<{ id: string; channel_id: string }>,
      "approval",
    )) as { id: string; channel_id: string };

    return {
      channel: "discord",
      messageId: message?.id ? String(message.id) : "unknown",
      channelId: String(message?.channel_id ?? channelId),
    };
  },
  sendPoll: async ({ to, poll, accountId }) =>
    await sendPollDiscord(to, poll, {
      accountId: accountId ?? undefined,
    }),
};

import { html, nothing, type TemplateResult } from "lit";

import { formatAgo } from "../format";
import type { DiscordStatus } from "../types";
import { renderChannelIntegrationCard, renderProbeBadge, type ChannelCardFrame } from "./channels.shared";

export function renderDiscordCard(params: {
  discord?: DiscordStatus | null;
  frame: ChannelCardFrame;
  actions: TemplateResult;
  facts: TemplateResult;
  error: string | null;
}) {
  const { discord, frame, actions, facts, error } = params;

  const details = html`
    <div class="status-list" style="margin-top: 16px;">
      ${discord?.lastStartAt
        ? html`<div>
            <span class="label">Last start</span>
            <span>${formatAgo(discord.lastStartAt)}</span>
          </div>`
        : nothing}
      ${discord?.lastProbeAt
        ? html`<div>
            <span class="label">Last probe</span>
            <span>${formatAgo(discord.lastProbeAt)}</span>
          </div>`
        : nothing}
    </div>
    ${renderProbeBadge(discord?.probe)}
  `;

  return renderChannelIntegrationCard({
    frame,
    actions,
    facts,
    details,
    error: error ?? null,
  });
}

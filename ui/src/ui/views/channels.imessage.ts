import { html, nothing, type TemplateResult } from "lit";

import { formatAgo } from "../format";
import type { IMessageStatus } from "../types";
import { renderChannelIntegrationCard, renderProbeBadge, type ChannelCardFrame } from "./channels.shared";

export function renderIMessageCard(params: {
  imessage?: IMessageStatus | null;
  frame: ChannelCardFrame;
  actions: TemplateResult;
  facts: TemplateResult;
  error: string | null;
}) {
  const { imessage, frame, actions, facts, error } = params;

  const details = html`
    <div class="status-list" style="margin-top: 16px;">
      ${imessage?.lastStartAt
        ? html`<div>
            <span class="label">Last start</span>
            <span>${formatAgo(imessage.lastStartAt)}</span>
          </div>`
        : nothing}
      ${imessage?.lastProbeAt
        ? html`<div>
            <span class="label">Last probe</span>
            <span>${formatAgo(imessage.lastProbeAt)}</span>
          </div>`
        : nothing}
    </div>
    ${renderProbeBadge(imessage?.probe)}
  `;

  return renderChannelIntegrationCard({
    frame,
    actions,
    facts,
    details,
    error: error ?? null,
  });
}

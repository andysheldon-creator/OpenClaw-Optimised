import { html, nothing, type TemplateResult } from "lit";

import { formatAgo } from "../format";
import type { SlackStatus } from "../types";
import { renderChannelIntegrationCard, renderProbeBadge, type ChannelCardFrame } from "./channels.shared";

export function renderSlackCard(params: {
  slack?: SlackStatus | null;
  frame: ChannelCardFrame;
  actions: TemplateResult;
  facts: TemplateResult;
  error: string | null;
}) {
  const { slack, frame, actions, facts, error } = params;

  const details = html`
    <div class="status-list" style="margin-top: 16px;">
      ${slack?.lastStartAt
        ? html`<div>
            <span class="label">Last start</span>
            <span>${formatAgo(slack.lastStartAt)}</span>
          </div>`
        : nothing}
      ${slack?.lastProbeAt
        ? html`<div>
            <span class="label">Last probe</span>
            <span>${formatAgo(slack.lastProbeAt)}</span>
          </div>`
        : nothing}
    </div>
    ${renderProbeBadge(slack?.probe)}
  `;

  return renderChannelIntegrationCard({
    frame,
    actions,
    facts,
    details,
    error: error ?? null,
  });
}

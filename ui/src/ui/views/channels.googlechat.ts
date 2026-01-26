import { html, nothing, type TemplateResult } from "lit";

import { formatAgo } from "../format";
import type { GoogleChatStatus } from "../types";
import { renderChannelIntegrationCard, renderProbeBadge, type ChannelCardFrame } from "./channels.shared";

export function renderGoogleChatCard(params: {
  googlechat?: GoogleChatStatus | null;
  frame: ChannelCardFrame;
  actions: TemplateResult;
  facts: TemplateResult;
  error: string | null;
}) {
  const { googlechat, frame, actions, facts, error } = params;

  const details = html`
    <div class="status-list" style="margin-top: 16px;">
      ${googlechat?.credentialSource
        ? html`<div>
            <span class="label">Credential</span>
            <span>${googlechat.credentialSource}</span>
          </div>`
        : nothing}
      ${googlechat?.audienceType
        ? html`<div>
            <span class="label">Audience</span>
            <span>${googlechat.audienceType}${googlechat.audience ? ` \u00b7 ${googlechat.audience}` : ""}</span>
          </div>`
        : nothing}
      ${googlechat?.lastStartAt
        ? html`<div>
            <span class="label">Last start</span>
            <span>${formatAgo(googlechat.lastStartAt)}</span>
          </div>`
        : nothing}
      ${googlechat?.lastProbeAt
        ? html`<div>
            <span class="label">Last probe</span>
            <span>${formatAgo(googlechat.lastProbeAt)}</span>
          </div>`
        : nothing}
    </div>
    ${renderProbeBadge(googlechat?.probe)}
  `;

  return renderChannelIntegrationCard({
    frame,
    actions,
    facts,
    details,
    error: error ?? null,
  });
}

import { html, nothing, type TemplateResult } from "lit";

import { formatAgo } from "../format";
import type { SignalStatus } from "../types";
import { renderChannelIntegrationCard, renderProbeBadge, type ChannelCardFrame } from "./channels.shared";

export function renderSignalCard(params: {
  signal?: SignalStatus | null;
  frame: ChannelCardFrame;
  actions: TemplateResult;
  facts: TemplateResult;
  error: string | null;
}) {
  const { signal, frame, actions, facts, error } = params;

  const details = html`
    <div class="status-list" style="margin-top: 16px;">
      ${signal?.baseUrl
        ? html`<div>
            <span class="label">Base URL</span>
            <span>${signal.baseUrl}</span>
          </div>`
        : nothing}
      ${signal?.lastStartAt
        ? html`<div>
            <span class="label">Last start</span>
            <span>${formatAgo(signal.lastStartAt)}</span>
          </div>`
        : nothing}
      ${signal?.lastProbeAt
        ? html`<div>
            <span class="label">Last probe</span>
            <span>${formatAgo(signal.lastProbeAt)}</span>
          </div>`
        : nothing}
    </div>
    ${renderProbeBadge(signal?.probe)}
  `;

  return renderChannelIntegrationCard({
    frame,
    actions,
    facts,
    details,
    error: error ?? null,
  });
}

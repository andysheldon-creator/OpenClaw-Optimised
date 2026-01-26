import { html, nothing, type TemplateResult } from "lit";

import { formatAgo } from "../format";
import type { ChannelAccountSnapshot, TelegramStatus } from "../types";
import { renderChannelIntegrationCard, renderProbeBadge, type ChannelCardFrame } from "./channels.shared";

export function renderTelegramCard(params: {
  telegram?: TelegramStatus;
  telegramAccounts: ChannelAccountSnapshot[];
  frame: ChannelCardFrame;
  actions: TemplateResult;
  facts: TemplateResult;
  error: string | null;
}) {
  const { telegram, telegramAccounts, frame, actions, facts, error } = params;
  const hasMultipleAccounts = telegramAccounts.length > 1;

  const renderAccountCard = (account: ChannelAccountSnapshot) => {
    const probe = account.probe as { bot?: { username?: string } } | undefined;
    const botUsername = probe?.bot?.username;
    const label = account.name || account.accountId;
    return html`
      <div class="account-card">
        <div class="account-card-header">
          <div class="account-card-title">
            ${botUsername ? `@${botUsername}` : label}
          </div>
          <div class="account-card-id">${account.accountId}</div>
        </div>
        <div class="status-list account-card-status">
          <div>
            <span class="label">Running</span>
            <span>${account.running ? "Yes" : "No"}</span>
          </div>
          <div>
            <span class="label">Configured</span>
            <span>${account.configured ? "Yes" : "No"}</span>
          </div>
          <div>
            <span class="label">Last inbound</span>
            <span>${account.lastInboundAt ? formatAgo(account.lastInboundAt) : "n/a"}</span>
          </div>
          ${account.lastError
            ? html`
                <div class="account-card-error">
                  ${account.lastError}
                </div>
              `
            : nothing}
        </div>
      </div>
    `;
  };

  const details = html`
    ${hasMultipleAccounts
      ? html`
          <div class="account-card-list">
            ${telegramAccounts.map((account) => renderAccountCard(account))}
          </div>
        `
      : html`
          <div class="status-list" style="margin-top: 16px;">
            ${telegram?.mode
              ? html`<div>
                  <span class="label">Mode</span>
                  <span>${telegram.mode}</span>
                </div>`
              : nothing}
            ${telegram?.lastStartAt
              ? html`<div>
                  <span class="label">Last start</span>
                  <span>${formatAgo(telegram.lastStartAt)}</span>
                </div>`
              : nothing}
            ${telegram?.lastProbeAt
              ? html`<div>
                  <span class="label">Last probe</span>
                  <span>${formatAgo(telegram.lastProbeAt)}</span>
                </div>`
              : nothing}
          </div>
        `}

    ${renderProbeBadge(telegram?.probe)}
  `;

  return renderChannelIntegrationCard({
    frame,
    actions,
    facts,
    details,
    error: error ?? null,
  });
}

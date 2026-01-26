import { html, nothing, type TemplateResult } from "lit";

import { formatAgo } from "../format";
import { icon } from "../icons";
import type { WhatsAppStatus } from "../types";
import { formatDuration, renderChannelIntegrationCard, type ChannelCardFrame } from "./channels.shared";

export function renderWhatsAppCard(params: {
  whatsapp?: WhatsAppStatus;
  frame: ChannelCardFrame;
  actions: TemplateResult;
  facts: TemplateResult;
  error: string | null;
  // WhatsApp-specific props passed through from ChannelsProps
  whatsappMessage?: string | null;
  whatsappQrDataUrl?: string | null;
  whatsappBusy?: boolean;
  onWhatsAppWait?: () => void;
  onRefresh?: (probe: boolean) => void;
}) {
  const {
    whatsapp,
    frame,
    actions,
    facts,
    error,
    whatsappMessage,
    whatsappQrDataUrl,
    whatsappBusy,
    onWhatsAppWait,
    onRefresh,
  } = params;

  const linked = whatsapp?.linked ?? false;
  const hasActivity = Boolean(whatsapp?.lastConnectedAt || whatsapp?.lastMessageAt || whatsapp?.authAgeMs != null);

  const details = html`
    ${hasActivity
      ? html`
          <div class="status-list" style="margin-top: 16px;">
            ${whatsapp?.linked != null
              ? html`<div>
                  <span class="label">Linked</span>
                  <span>${whatsapp.linked ? "Yes" : "No"}</span>
                </div>`
              : nothing}
            ${whatsapp?.lastConnectedAt
              ? html`<div>
                  <span class="label">Last connect</span>
                  <span>${formatAgo(whatsapp.lastConnectedAt)}</span>
                </div>`
              : nothing}
            ${whatsapp?.lastMessageAt
              ? html`<div>
                  <span class="label">Last message</span>
                  <span>${formatAgo(whatsapp.lastMessageAt)}</span>
                </div>`
              : nothing}
            ${whatsapp?.authAgeMs != null
              ? html`<div>
                  <span class="label">Auth age</span>
                  <span>${formatDuration(whatsapp.authAgeMs)}</span>
                </div>`
              : nothing}
          </div>
        `
      : !linked
        ? html`
            <div class="callout" style="margin-top: 12px;">
              WhatsApp is not linked. Use the <strong>Link</strong> button above to scan a QR code.
            </div>
          `
        : nothing}

    ${whatsappMessage
      ? html`<div class="callout callout--info" style="margin-top: 12px;">
          ${whatsappMessage}
        </div>`
      : nothing}

    ${whatsappQrDataUrl
      ? html`
          <div class="channel-qr" style="margin-top: 12px;">
            <img class="channel-qr__image" src=${whatsappQrDataUrl} alt="WhatsApp QR" />
            <div class="channel-qr__message">
              Open WhatsApp \u2192 Settings \u2192 Linked devices \u2192 Link a device, then scan this QR.
            </div>
          </div>
        `
      : nothing}

    <div class="row" style="margin-top: 14px; flex-wrap: wrap;">
      ${whatsappQrDataUrl
        ? html`
            <button
              class="btn btn--sm channel-card__action"
              ?disabled=${whatsappBusy}
              @click=${() => onWhatsAppWait?.()}
            >
              Await QR Scan
            </button>
          `
        : nothing}
      <button class="btn btn--sm channel-card__action" @click=${() => onRefresh?.(false)}>
        <span aria-hidden="true">${icon("refresh-cw", { size: 16 })}</span>
        Refresh
      </button>
    </div>
  `;

  return renderChannelIntegrationCard({
    frame,
    actions,
    facts,
    details,
    error: error ?? (whatsapp?.lastError ?? null),
    detailsOpen: Boolean(whatsappQrDataUrl || whatsappMessage),
  });
}

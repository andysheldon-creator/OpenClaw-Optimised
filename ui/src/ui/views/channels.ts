import { html, nothing } from "lit";

import { formatAgo } from "../format";
import type {
  ChannelAccountSnapshot,
  ChannelsStatusSnapshot,
  DiscordStatus,
  IMessageStatus,
  NostrStatus,
  SignalStatus,
  SlackStatus,
  TelegramStatus,
  WhatsAppStatus,
} from "../types";
import type {
  ChannelKey,
  ChannelsChannelData,
  ChannelsProps,
} from "./channels.types";
import { channelEnabled, renderChannelAccountCount } from "./channels.shared";
import { renderChannelConfigSection } from "./channels.config";
import { renderDiscordCard } from "./channels.discord";
import { renderIMessageCard } from "./channels.imessage";
import { renderNostrCard } from "./channels.nostr";
import type { NostrProfileFormState, NostrProfileFormCallbacks } from "./channels.nostr-profile-form";
import { renderSignalCard } from "./channels.signal";
import { renderSlackCard } from "./channels.slack";
import { renderTelegramCard } from "./channels.telegram";
import { renderWhatsAppCard } from "./channels.whatsapp";

export function renderChannels(props: ChannelsProps) {
  const channels = props.snapshot?.channels as Record<string, unknown> | null;
  const whatsapp = (channels?.whatsapp ?? undefined) as
    | WhatsAppStatus
    | undefined;
  const telegram = (channels?.telegram ?? undefined) as
    | TelegramStatus
    | undefined;
  const discord = (channels?.discord ?? null) as DiscordStatus | null;
  const slack = (channels?.slack ?? null) as SlackStatus | null;
  const signal = (channels?.signal ?? null) as SignalStatus | null;
  const imessage = (channels?.imessage ?? null) as IMessageStatus | null;
  const nostr = (channels?.nostr ?? null) as NostrStatus | null;
  const channelOrder = resolveChannelOrder(props.snapshot);
  const orderedChannels = channelOrder
    .map((key, index) => ({
      key,
      enabled: channelEnabled(key, props),
      order: index,
    }))
    .sort((a, b) => {
      if (a.enabled !== b.enabled) return a.enabled ? -1 : 1;
      return a.order - b.order;
    });

  return html`
    <section class="grid grid-cols-2">
      ${orderedChannels.map((channel) =>
        renderChannel(channel.key, props, {
          whatsapp,
          telegram,
          discord,
          slack,
          signal,
          imessage,
          nostr,
          channelAccounts: props.snapshot?.channelAccounts ?? null,
        }),
      )}
    </section>

    <section class="card" style="margin-top: 18px;">
      <div class="row" style="justify-content: space-between;">
        <div>
          <div class="card-title">Channel health</div>
          <div class="card-sub">Channel status snapshots from the gateway.</div>
        </div>
        <div class="muted">${props.lastSuccessAt ? formatAgo(props.lastSuccessAt) : "n/a"}</div>
      </div>
      ${props.lastError
        ? html`<div class="callout danger" style="margin-top: 12px;">
            ${props.lastError}
          </div>`
        : nothing}
      <pre class="code-block" style="margin-top: 12px;">
${props.snapshot ? JSON.stringify(props.snapshot, null, 2) : "No snapshot yet."}
      </pre>
    </section>
  `;
}

function resolveChannelOrder(snapshot: ChannelsStatusSnapshot | null): ChannelKey[] {
  if (snapshot?.channelOrder?.length) {
    return snapshot.channelOrder;
  }
  return ["whatsapp", "telegram", "discord", "slack", "signal", "imessage"];
}

function renderChannel(
  key: ChannelKey,
  props: ChannelsProps,
  data: ChannelsChannelData,
) {
  const accountCountLabel = renderChannelAccountCount(
    key,
    data.channelAccounts,
  );
  switch (key) {
    case "whatsapp":
      return renderWhatsAppCard({
        props,
        whatsapp: data.whatsapp,
        accountCountLabel,
      });
    case "telegram":
      return renderTelegramCard({
        props,
        telegram: data.telegram,
        telegramAccounts: data.channelAccounts?.telegram ?? [],
        accountCountLabel,
      });
    case "discord":
      return renderDiscordCard({
        props,
        discord: data.discord,
        accountCountLabel,
      });
    case "slack":
      return renderSlackCard({
        props,
        slack: data.slack,
        accountCountLabel,
      });
    case "signal":
      return renderSignalCard({
        props,
        signal: data.signal,
        accountCountLabel,
      });
    case "imessage":
      return renderIMessageCard({
        props,
        imessage: data.imessage,
        accountCountLabel,
      });
    case "nostr": {
      // Build profile form state and callbacks if editing
      let profileFormState: NostrProfileFormState | null = null;
      let profileFormCallbacks: NostrProfileFormCallbacks | null = null;
      
      if (props.nostrProfileEditing && props.nostrProfileForm) {
        const nostrStatus = data.nostr;
        const currentProfile = nostrStatus?.profile ?? {};
        
        profileFormState = {
          values: props.nostrProfileForm,
          original: currentProfile,
          saving: props.nostrProfileSaving ?? false,
          importing: props.nostrProfileImporting ?? false,
          error: props.nostrProfileError ?? null,
          success: props.nostrProfileSuccess ?? null,
          fieldErrors: {},
          showAdvanced: false,
        };
        
        profileFormCallbacks = {
          onFieldChange: (field, value) => props.onNostrProfileFieldChange?.(field, value),
          onSave: () => props.onNostrSaveProfile?.(),
          onImport: () => props.onNostrImportProfile?.(),
          onCancel: () => props.onNostrCancelEdit?.(),
          onToggleAdvanced: () => {
            if (profileFormState) {
              profileFormState.showAdvanced = !profileFormState.showAdvanced;
            }
          },
        };
      }
      
      return renderNostrCard({
        props,
        nostr: data.nostr,
        nostrAccounts: data.channelAccounts?.nostr ?? [],
        accountCountLabel,
        profileFormState,
        profileFormCallbacks,
        onEditProfile: () => props.onNostrEditProfile?.(),
      });
    }
    default:
      return renderGenericChannelCard(key, props, data.channelAccounts ?? {});
  }
}

function renderGenericChannelCard(
  key: ChannelKey,
  props: ChannelsProps,
  channelAccounts: Record<string, ChannelAccountSnapshot[]>,
) {
  const label = props.snapshot?.channelLabels?.[key] ?? key;
  const status = props.snapshot?.channels?.[key] as Record<string, unknown> | undefined;
  const configured = typeof status?.configured === "boolean" ? status.configured : undefined;
  const running = typeof status?.running === "boolean" ? status.running : undefined;
  const connected = typeof status?.connected === "boolean" ? status.connected : undefined;
  const lastError = typeof status?.lastError === "string" ? status.lastError : undefined;
  const accounts = channelAccounts[key] ?? [];
  const accountCountLabel = renderChannelAccountCount(key, channelAccounts);

  return html`
    <div class="card">
      <div class="card-title">${label}</div>
      <div class="card-sub">Channel status and configuration.</div>
      ${accountCountLabel}

      ${accounts.length > 0
        ? html`
            <div class="account-card-list">
              ${accounts.map((account) => renderGenericAccount(account))}
            </div>
          `
        : html`
            <div class="status-list" style="margin-top: 16px;">
              <div>
                <span class="label">Configured</span>
                <span>${configured == null ? "n/a" : configured ? "Yes" : "No"}</span>
              </div>
              <div>
                <span class="label">Running</span>
                <span>${running == null ? "n/a" : running ? "Yes" : "No"}</span>
              </div>
              <div>
                <span class="label">Connected</span>
                <span>${connected == null ? "n/a" : connected ? "Yes" : "No"}</span>
              </div>
            </div>
          `}

      ${lastError
        ? html`<div class="callout danger" style="margin-top: 12px;">
            ${lastError}
          </div>`
        : nothing}

      ${renderChannelConfigSection({ channelId: key, props })}
    </div>
  `;
}

function renderGenericAccount(account: ChannelAccountSnapshot) {
  return html`
    <div class="account-card">
      <div class="account-card-header">
        <div class="account-card-title">${account.name || account.accountId}</div>
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
          <span class="label">Connected</span>
          <span>${account.connected ? "Yes" : "No"}</span>
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
}

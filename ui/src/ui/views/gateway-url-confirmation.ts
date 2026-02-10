import { html, nothing } from "lit";
import type { AppViewState } from "../app-view-state.ts";
import { t } from "../i18n/i18n-manager.ts";

export function renderGatewayUrlConfirmation(state: AppViewState) {
  const { pendingGatewayUrl } = state;
  if (!pendingGatewayUrl) {
    return nothing;
  }

  return html`
    <div class="exec-approval-overlay" role="dialog" aria-modal="true" aria-live="polite">
      <div class="exec-approval-card">
        <div class="exec-approval-header">
          <div>
            <div class="exec-approval-title">${t("gateway.changeUrl")}</div>
            <div class="exec-approval-sub">${t("gateway.changeUrlSubtitle")}</div>
          </div>
        </div>
        <div class="exec-approval-command mono">${pendingGatewayUrl}</div>
        <div class="callout danger" style="margin-top: 12px;">
          ${t("gateway.trustWarning")}
        </div>
        <div class="exec-approval-actions">
          <button
            class="btn primary"
            @click=${() => state.handleGatewayUrlConfirm()}
          >
            ${t("gateway.confirm")}
          </button>
          <button
            class="btn"
            @click=${() => state.handleGatewayUrlCancel()}
          >
            ${t("common.cancel")}
          </button>
        </div>
      </div>
    </div>
  `;
}

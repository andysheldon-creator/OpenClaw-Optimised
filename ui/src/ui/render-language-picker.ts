/**
 * Language picker widget for the navigation sidebar.
 */

import { html, type TemplateResult } from "lit";
import type { AppViewState } from "./app-view-state.ts";
import { t, getLocale, setLocale, getAvailableLocales } from "./i18n.ts";
import { icons } from "./icons.ts";

export function renderLanguagePicker(state: AppViewState): TemplateResult {
  return html`
    <div class="nav-group nav-group--language">
      <div class="nav-label nav-label--static">
        <span class="nav-label__icon" aria-hidden="true">${icons.globe ?? "🌐"}</span>
        <span class="nav-label__text">${t("language.label")}</span>
      </div>
      <div class="nav-group__items">
        <select
          class="nav-locale-select"
          .value=${getLocale()}
          @change=${(e: Event) => {
            const next = (e.target as HTMLSelectElement).value;
            setLocale(next);
            state.applySettings({ ...state.settings, locale: next });
          }}
        >
          ${getAvailableLocales().map(
            (entry) => html`
              <option value=${entry.code} ?selected=${entry.code === getLocale()}>
                ${entry.nativeLabel}
              </option>
            `,
          )}
        </select>
      </div>
    </div>
  `;
}

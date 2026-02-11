import { html } from "lit";
import type { AppViewState } from "./app-view-state.ts";
import { renderTab, renderThemeToggle } from "./app-render.helpers.ts";
import { i18n, t } from "./i18n/i18n-manager.ts";
import { icons } from "./icons.ts";
import { normalizeBasePath, TAB_GROUPS } from "./navigation.ts";

export function renderTopbar(state: AppViewState) {
  const basePath = normalizeBasePath(state.basePath ?? "");

  return html`
    <header class="topbar">
      <div class="topbar-left">
        <button
          class="nav-collapse-toggle"
          @click=${() =>
            state.applySettings({
              ...state.settings,
              navCollapsed: !state.settings.navCollapsed,
            })}
          title="${state.settings.navCollapsed ? t("topbar.expandSidebar") : t("topbar.collapseSidebar")}"
          aria-label="${state.settings.navCollapsed ? t("topbar.expandSidebar") : t("topbar.collapseSidebar")}"
        >
          <span class="nav-collapse-toggle__icon">${icons.menu}</span>
        </button>
        <div class="brand">
          <div class="brand-logo">
            <img src=${basePath ? `${basePath}/favicon.svg` : "/favicon.svg"} alt="OpenClaw" />
          </div>
          <div class="brand-text">
            <div class="brand-title">${t("topbar.brandTitle")}</div>
            <div class="brand-sub">${t("topbar.brandSubtitle")}</div>
          </div>
        </div>
      </div>
      <div class="topbar-status">
        <div class="pill">
          <span class="statusDot ${state.connected ? "ok" : ""}"></span>
          <span>${t("topbar.status")}</span>
          <span class="mono">${state.connected ? t("topbar.ok") : t("topbar.offline")}</span>
        </div>
        <!-- 添加语言选择器 -->
        <select
          class="language-selector"
          @change=${(e: Event) => {
            const target = e.target as HTMLSelectElement;
            if (target.value) {
              i18n.setLocale(target.value as "en" | "zh");
            }
          }}
          .value=${i18n.getLocale()}
        >
          <option value="en">English</option>
          <option value="zh">中文</option>
        </select>
        ${renderThemeToggle(state)}
      </div>
    </header>
  `;
}

export function renderNav(state: AppViewState) {
  return html`
    <aside class="nav ${state.settings.navCollapsed ? "nav--collapsed" : ""}">
      ${TAB_GROUPS.map((group) => {
        const isGroupCollapsed = state.settings.navGroupsCollapsed[group.label] ?? false;
        const hasActiveTab = group.tabs.some((tab) => tab === state.tab);
        return html`
          <div class="nav-group ${isGroupCollapsed && !hasActiveTab ? "nav-group--collapsed" : ""}">
            <button
              class="nav-label"
              @click=${() => {
                const next = { ...state.settings.navGroupsCollapsed };
                next[group.label] = !isGroupCollapsed;
                state.applySettings({
                  ...state.settings,
                  navGroupsCollapsed: next,
                });
              }}
              aria-expanded=${!isGroupCollapsed}
            >
              <span class="nav-label__text">${t(`navigation.${group.label.toLowerCase()}Group`)}</span>
              <span class="nav-label__chevron">${isGroupCollapsed ? "+" : "−"}</span>
            </button>
            <div class="nav-group__items">
              ${group.tabs.map((tab) => renderTab(state, tab))}
            </div>
          </div>
        `;
      })}
      <div class="nav-group nav-group--links">
        <div class="nav-label nav-label--static">
          <span class="nav-label__text">${t("navigation.resources")}</span>
        </div>
        <div class="nav-group__items">
          <a
            class="nav-item nav-item--external"
            href="https://docs.openclaw.ai"
            target="_blank"
            rel="noreferrer"
            title="${t("navigation.docsTitle")}"
          >
            <span class="nav-item__icon" aria-hidden="true">${icons.book}</span>
            <span class="nav-item__text">${t("navigation.docs")}</span>
          </a>
        </div>
      </div>
    </aside>
  `;
}

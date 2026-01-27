import { html } from "lit";

import type { AppViewState } from "./app-view-state";
import { hrefForTab, titleForTab, type Tab, PRIMARY_TABS, SECONDARY_TABS, ADVANCED_TABS } from "./navigation";
import { loadChatHistory } from "./controllers/chat";
import { syncUrlWithSessionKey } from "./app-settings";
import type { ThemeMode } from "./theme";
import type { ThemeTransitionContext } from "./theme-transition";
import { iconForTabSvg, icon, icons } from "./icons";
import {
  renderSessionNavigatorTrigger,
  renderSessionNavigatorPanel,
  type SessionNavigatorProps,
} from "./components/session-navigator";

export function renderNavigationTabs(state: AppViewState) {
  const showAdvanced = state.navShowAdvanced;

  return html`
    <!-- Primary Tabs -->
    <div class="nav-group">
      ${PRIMARY_TABS.map((tab) => renderTab(state, tab))}
    </div>

    <!-- Secondary Tabs -->
    <div class="nav-group">
      ${SECONDARY_TABS.map((tab) => renderTab(state, tab))}
    </div>

    <!-- Advanced Tabs (collapsible) -->
    <div class="nav-group ${!showAdvanced ? "nav-group--advanced" : ""}">
      <button
        class="nav-label"
        @click=${() => {
          state.navShowAdvanced = !state.navShowAdvanced;
          state.persistNavShowAdvanced(state.navShowAdvanced);
        }}
        aria-expanded=${showAdvanced}
      >
        <span class="nav-label__text">Advanced Features</span>
        <span class="nav-label__chevron">${icon(showAdvanced ? "chevron-up" : "chevron-down", { size: 14 })}</span>
      </button>
      <div class="nav-group__items">
        ${ADVANCED_TABS.map((tab) => renderTab(state, tab))}
      </div>
    </div>
  `;
}

export function renderTab(state: AppViewState, tab: Tab) {
  const href = hrefForTab(tab, state.basePath);
  const isActive = state.tab === tab;
  return html`
    <a
      href=${href}
      class="nav-item ${isActive ? "active" : ""}"
      aria-current=${isActive ? "page" : "false"}
      @click=${(event: MouseEvent) => {
        if (
          event.defaultPrevented ||
          event.button !== 0 ||
          event.metaKey ||
          event.ctrlKey ||
          event.shiftKey ||
          event.altKey
        ) {
          return;
        }
        event.preventDefault();
        state.setTab(tab);
      }}
      title=${titleForTab(tab)}
    >
      <span class="nav-item__icon" aria-hidden="true">${iconForTabSvg(tab, { size: 18 })}</span>
      <span class="nav-item__text">${titleForTab(tab)}</span>
    </a>
  `;
}

export function renderChatControls(state: AppViewState) {
  const disableThinkingToggle = state.onboarding;
  const disableFocusToggle = state.onboarding;
  const showThinking = state.onboarding ? false : state.settings.chatShowThinking;
  const focusActive = state.onboarding ? true : state.settings.chatFocusMode;
  // Refresh icon
  const refreshIcon = html`<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8"></path><path d="M21 3v5h-5"></path></svg>`;
  const focusIcon = html`<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7V4h3"></path><path d="M20 7V4h-3"></path><path d="M4 17v3h3"></path><path d="M20 17v3h-3"></path><circle cx="12" cy="12" r="3"></circle></svg>`;

  const selectSession = (next: string) => {
    state.sessionKey = next;
    state.chatMessage = "";
    state.chatStream = null;
    state.chatStreamStartedAt = null;
    state.chatRunId = null;
    state.resetToolStream();
    state.resetChatScroll();
    state.applySettings({
      ...state.settings,
      sessionKey: next,
      lastActiveSessionKey: next,
    });
    void state.loadAssistantIdentity();
    syncUrlWithSessionKey(state, next, true);
    void loadChatHistory(state);
  };

  const navProps: SessionNavigatorProps = {
    sessionKey: state.sessionKey,
    connected: state.connected,
    sessionsResult: state.sessionsResult,
    agentsList: state.agentsList,
    navigatorState: state.sessionNavigator,
    onSelectSession: selectSession,
    onToggleOpen: () => {
      state.sessionNavigator = {
        ...state.sessionNavigator,
        open: !state.sessionNavigator.open,
      };
    },
    onSelectAgent: (agentId: string) => {
      state.sessionNavigator = {
        ...state.sessionNavigator,
        selectedAgentId: agentId,
      };
    },
    onSearchChange: (search: string) => {
      state.sessionNavigator = {
        ...state.sessionNavigator,
        search,
      };
    },
    onToggleGroup: (groupKey: string) => {
      const next = new Set(state.sessionNavigator.expandedGroups);
      if (next.has(groupKey)) next.delete(groupKey);
      else next.add(groupKey);
      state.sessionNavigator = {
        ...state.sessionNavigator,
        expandedGroups: next,
      };
    },
    onClose: () => {
      state.sessionNavigator = {
        ...state.sessionNavigator,
        open: false,
        search: "",
      };
    },
  };

  return html`
    <div class="chat-controls">
      <div class="sn-wrapper">
        ${renderSessionNavigatorTrigger(navProps)}
        ${renderSessionNavigatorPanel(navProps)}
      </div>
      <button
        class="btn btn--sm btn--icon"
        ?disabled=${state.chatLoading || !state.connected}
        @click=${() => {
          state.resetToolStream();
          void loadChatHistory(state);
        }}
        title="Refresh chat history"
        aria-label="Refresh chat history"
      >
        ${refreshIcon}
      </button>
      <span class="chat-controls__separator">|</span>
      <button
        class="btn btn--sm btn--icon ${showThinking ? "active" : ""}"
        ?disabled=${disableThinkingToggle}
        @click=${() => {
          if (disableThinkingToggle) return;
          state.applySettings({
            ...state.settings,
            chatShowThinking: !state.settings.chatShowThinking,
          });
        }}
        aria-pressed=${showThinking}
        aria-label=${disableThinkingToggle
          ? "Toggle thinking (disabled during onboarding)"
          : "Toggle assistant thinking/working output"}
        title=${disableThinkingToggle
          ? "Disabled during onboarding"
          : "Toggle assistant thinking/working output"}
      >
        ${icons.brain}
      </button>
      <button
        class="btn btn--sm btn--icon ${focusActive ? "active" : ""}"
        ?disabled=${disableFocusToggle}
        @click=${() => {
          if (disableFocusToggle) return;
          state.applySettings({
            ...state.settings,
            chatFocusMode: !state.settings.chatFocusMode,
          });
        }}
        aria-pressed=${focusActive}
        aria-label=${disableFocusToggle
          ? "Toggle focus mode (disabled during onboarding)"
          : "Toggle focus mode (hide sidebar + page header)"}
        title=${disableFocusToggle
          ? "Disabled during onboarding"
          : "Toggle focus mode (hide sidebar + page header)"}
      >
        ${focusIcon}
      </button>
    </div>
  `;
}

const THEME_ORDER: ThemeMode[] = ["system", "light", "dark"];

export function renderThemeToggle(state: AppViewState) {
  const index = Math.max(0, THEME_ORDER.indexOf(state.theme));
  const applyTheme = (next: ThemeMode) => (event: MouseEvent) => {
    const element = event.currentTarget as HTMLElement;
    const context: ThemeTransitionContext = { element };
    if (event.clientX || event.clientY) {
      context.pointerClientX = event.clientX;
      context.pointerClientY = event.clientY;
    }
    state.setTheme(next, context);
  };

  return html`
    <div class="theme-toggle" style="--theme-index: ${index};">
      <div class="theme-toggle__track" role="group" aria-label="Theme">
        <span class="theme-toggle__indicator"></span>
        <button
          class="theme-toggle__button ${state.theme === "system" ? "active" : ""}"
          @click=${applyTheme("system")}
          aria-pressed=${state.theme === "system"}
          aria-label="System theme"
          title="System"
        >
          ${renderMonitorIcon()}
        </button>
        <button
          class="theme-toggle__button ${state.theme === "light" ? "active" : ""}"
          @click=${applyTheme("light")}
          aria-pressed=${state.theme === "light"}
          aria-label="Light theme"
          title="Light"
        >
          ${renderSunIcon()}
        </button>
        <button
          class="theme-toggle__button ${state.theme === "dark" ? "active" : ""}"
          @click=${applyTheme("dark")}
          aria-pressed=${state.theme === "dark"}
          aria-label="Dark theme"
          title="Dark"
        >
          ${renderMoonIcon()}
        </button>
      </div>
    </div>
  `;
}

function renderSunIcon() {
  return html`
    <svg class="theme-icon" viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="4"></circle>
      <path d="M12 2v2"></path>
      <path d="M12 20v2"></path>
      <path d="m4.93 4.93 1.41 1.41"></path>
      <path d="m17.66 17.66 1.41 1.41"></path>
      <path d="M2 12h2"></path>
      <path d="M20 12h2"></path>
      <path d="m6.34 17.66-1.41 1.41"></path>
      <path d="m19.07 4.93-1.41 1.41"></path>
    </svg>
  `;
}

function renderMoonIcon() {
  return html`
    <svg class="theme-icon" viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M20.985 12.486a9 9 0 1 1-9.473-9.472c.405-.022.617.46.402.803a6 6 0 0 0 8.268 8.268c.344-.215.825-.004.803.401"
      ></path>
    </svg>
  `;
}

function renderMonitorIcon() {
  return html`
    <svg class="theme-icon" viewBox="0 0 24 24" aria-hidden="true">
      <rect width="20" height="14" x="2" y="3" rx="2"></rect>
      <line x1="8" x2="16" y1="21" y2="21"></line>
      <line x1="12" x2="12" y1="17" y2="21"></line>
    </svg>
  `;
}

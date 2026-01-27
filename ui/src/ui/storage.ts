const KEY = "clawdbrain.control.settings.v1";

import type { ThemeMode } from "./theme";

export type UiSettings = {
  gatewayUrl: string;
  token: string;
  sessionKey: string;
  lastActiveSessionKey: string;
  theme: ThemeMode;
  chatFocusMode: boolean;
  chatShowThinking: boolean;
  splitRatio: number; // Sidebar split ratio (0.4 to 0.7, default 0.6)
  navCollapsed: boolean; // Collapsible sidebar state
  navGroupsCollapsed: Record<string, boolean>; // Which nav groups are collapsed
  // UX Revamp state variables
  logsPreset: "errors-only" | "warnings" | "debug" | "verbose" | "custom";
  sessionsPreset: "all" | "active" | "errored" | "cron" | "custom";
  overviewShowSystemMetrics: boolean;
  configShowQuickSetup: boolean;
  navShowAdvanced: boolean;
  sessionsShowAdvancedFilters: boolean;
};

export function loadSettings(): UiSettings {
  const runtimeDefaultGatewayUrl =
    typeof window !== "undefined" &&
    typeof (window as unknown as { __CLAWDBRAIN_CONTROL_UI_DEFAULT_GATEWAY_URL__?: unknown })
      .__CLAWDBRAIN_CONTROL_UI_DEFAULT_GATEWAY_URL__ === "string"
      ? String(
          (window as unknown as { __CLAWDBRAIN_CONTROL_UI_DEFAULT_GATEWAY_URL__?: string })
            .__CLAWDBRAIN_CONTROL_UI_DEFAULT_GATEWAY_URL__,
        ).trim()
      : "";
  const envDefaultGatewayUrl =
    typeof import.meta !== "undefined" &&
    typeof import.meta.env?.VITE_CLAWDBRAIN_CONTROL_UI_DEFAULT_GATEWAY_URL === "string"
      ? import.meta.env.VITE_CLAWDBRAIN_CONTROL_UI_DEFAULT_GATEWAY_URL.trim()
      : "";

  const defaultUrl = (() => {
    if (runtimeDefaultGatewayUrl) return runtimeDefaultGatewayUrl;
    if (envDefaultGatewayUrl) return envDefaultGatewayUrl;
    const proto = location.protocol === "https:" ? "wss" : "ws";
    return `${proto}://${location.host}`;
  })();

  const defaults: UiSettings = {
    gatewayUrl: defaultUrl,
    token: "",
    sessionKey: "main",
    lastActiveSessionKey: "main",
    theme: "system",
    chatFocusMode: false,
    chatShowThinking: true,
    splitRatio: 0.6,
    navCollapsed: false,
    navGroupsCollapsed: {},
    // UX Revamp defaults
    logsPreset: "warnings",
    sessionsPreset: "active",
    overviewShowSystemMetrics: false,
    configShowQuickSetup: true,
    navShowAdvanced: false,
    sessionsShowAdvancedFilters: false,
  };

  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return defaults;
    const parsed = JSON.parse(raw) as Partial<UiSettings>;
    return {
      gatewayUrl:
        typeof parsed.gatewayUrl === "string" && parsed.gatewayUrl.trim()
          ? parsed.gatewayUrl.trim()
          : defaults.gatewayUrl,
      token: typeof parsed.token === "string" ? parsed.token : defaults.token,
      sessionKey:
        typeof parsed.sessionKey === "string" && parsed.sessionKey.trim()
          ? parsed.sessionKey.trim()
          : defaults.sessionKey,
      lastActiveSessionKey:
        typeof parsed.lastActiveSessionKey === "string" &&
        parsed.lastActiveSessionKey.trim()
          ? parsed.lastActiveSessionKey.trim()
          : (typeof parsed.sessionKey === "string" &&
              parsed.sessionKey.trim()) ||
            defaults.lastActiveSessionKey,
      theme:
        parsed.theme === "light" ||
        parsed.theme === "dark" ||
        parsed.theme === "system"
          ? parsed.theme
          : defaults.theme,
      chatFocusMode:
        typeof parsed.chatFocusMode === "boolean"
          ? parsed.chatFocusMode
          : defaults.chatFocusMode,
      chatShowThinking:
        typeof parsed.chatShowThinking === "boolean"
          ? parsed.chatShowThinking
          : defaults.chatShowThinking,
      splitRatio:
        typeof parsed.splitRatio === "number" &&
        parsed.splitRatio >= 0.4 &&
        parsed.splitRatio <= 0.7
          ? parsed.splitRatio
          : defaults.splitRatio,
      navCollapsed:
        typeof parsed.navCollapsed === "boolean"
          ? parsed.navCollapsed
          : defaults.navCollapsed,
      navGroupsCollapsed:
        typeof parsed.navGroupsCollapsed === "object" &&
        parsed.navGroupsCollapsed !== null
          ? parsed.navGroupsCollapsed
          : defaults.navGroupsCollapsed,
      // UX Revamp state variables (with migration for existing users)
      logsPreset:
        parsed.logsPreset === "errors-only" ||
        parsed.logsPreset === "warnings" ||
        parsed.logsPreset === "debug" ||
        parsed.logsPreset === "verbose" ||
        parsed.logsPreset === "custom"
          ? parsed.logsPreset
          : defaults.logsPreset,
      sessionsPreset:
        parsed.sessionsPreset === "all" ||
        parsed.sessionsPreset === "active" ||
        parsed.sessionsPreset === "errored" ||
        parsed.sessionsPreset === "cron" ||
        parsed.sessionsPreset === "custom"
          ? parsed.sessionsPreset
          : defaults.sessionsPreset,
      overviewShowSystemMetrics:
        typeof parsed.overviewShowSystemMetrics === "boolean"
          ? parsed.overviewShowSystemMetrics
          : defaults.overviewShowSystemMetrics,
      configShowQuickSetup:
        typeof parsed.configShowQuickSetup === "boolean"
          ? parsed.configShowQuickSetup
          : defaults.configShowQuickSetup,
      navShowAdvanced:
        typeof parsed.navShowAdvanced === "boolean"
          ? parsed.navShowAdvanced
          : defaults.navShowAdvanced,
      sessionsShowAdvancedFilters:
        typeof parsed.sessionsShowAdvancedFilters === "boolean"
          ? parsed.sessionsShowAdvancedFilters
          : defaults.sessionsShowAdvancedFilters,
    };
  } catch {
    return defaults;
  }
}

export function saveSettings(next: UiSettings) {
  localStorage.setItem(KEY, JSON.stringify(next));
}

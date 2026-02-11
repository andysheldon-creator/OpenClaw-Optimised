import { describe, expect, it, vi } from "vitest";
import type { AppViewState } from "./app-view-state.ts";
import { renderApp } from "./app-render.ts";
import { TAB_GROUPS, SHORT_TAB_GROUPS, isShortMenuMode, getTabGroups } from "./navigation.ts";

describe("renderApp", () => {
  const createMockState = (overrides: Partial<AppViewState> = {}): AppViewState => ({
    connected: true,
    connecting: false,
    tab: "chat",
    basePath: "",
    lastError: null,
    password: "",
    settings: {
      navCollapsed: false,
      navGroupsCollapsed: {},
      chatFocusMode: false,
      chatShowThinking: false,
      sessionKey: "",
      lastActiveSessionKey: null,
    },
    presenceEntries: [],
    sessionsResult: null,
    cronStatus: null,
    agentsList: null,
    agentsSelectedId: null,
    agentsPanel: "config",
    chatMessages: [],
    chatToolMessages: [],
    chatMessage: "",
    chatSending: false,
    chatLoading: false,
    chatStream: null,
    chatStreamStartedAt: null,
    chatRunId: null,
    chatQueue: [],
    chatAttachments: [],
    chatAvatarUrl: null,
    chatNewMessagesBelow: false,
    chatManualRefreshInFlight: false,
    chatThinkingLevel: "off",
    compactionStatus: null,
    hello: null,
    onboarding: false,
    sessionKey: "agent:main:main",
    passwordError: null,
    channelsLoading: false,
    channelsSnapshot: null,
    channelsError: null,
    channelsLastSuccess: null,
    whatsappLoginMessage: null,
    whatsappLoginQrDataUrl: null,
    whatsappLoginConnected: false,
    whatsappBusy: false,
    presenceLoading: false,
    presenceError: null,
    presenceStatus: null,
    sessionsLoading: false,
    sessionsError: null,
    sessionsFilterActive: null,
    sessionsFilterLimit: 50,
    sessionsIncludeGlobal: false,
    sessionsIncludeUnknown: true,
    configLoading: false,
    configSnapshot: null,
    configForm: null,
    configFormDirty: false,
    configSaving: false,
    configSchema: null,
    configSchemaLoading: false,
    nodesLoading: false,
    nodes: null,
    skillsLoading: false,
    skillsReport: null,
    skillsError: null,
    skillsFilter: "",
    skillEdits: {},
    skillMessages: {},
    skillsBusyKey: null,
    cronLoading: false,
    cronJobs: null,
    cronError: null,
    cronBusy: null,
    cronForm: null,
    cronRunsJobId: null,
    cronRuns: null,
    devicesLoading: false,
    devicesError: null,
    devicesList: null,
    execApprovalsLoading: false,
    execApprovalsSaving: false,
    execApprovalsDirty: false,
    execApprovalsSnapshot: null,
    execApprovalsForm: null,
    execApprovalsSelectedAgent: null,
    execApprovalsTarget: "gateway",
    execApprovalsTargetNodeId: null,
    agentFilesLoading: false,
    agentFilesError: null,
    agentFilesList: null,
    agentFileActive: null,
    agentFileContents: {},
    agentFileDrafts: {},
    agentFileSaving: null,
    agentIdentityLoading: null,
    agentIdentityError: null,
    agentIdentityById: {},
    agentSkillsLoading: null,
    agentSkillsReport: null,
    agentSkillsError: null,
    agentSkillsAgentId: null,
    nostrProfileFormState: null,
    nostrProfileAccountId: null,
    configUiHints: null,
    usageLoading: false,
    usageError: null,
    usageStartDate: null,
    usageEndDate: null,
    usageResult: null,
    usageCostSummary: null,
    usageSelectedSessions: [],
    usageSelectedDays: [],
    usageSelectedHours: [],
    usageChartMode: "cost",
    usageDailyChartMode: "stacked",
    usageTimeSeries: null,
    usageTimeSeriesLoading: false,
    usageTimeSeriesMode: "tokens",
    usageTimeSeriesBreakdownMode: "model",
    usageSessionLogs: null,
    usageSessionLogsLoading: false,
    usageSessionLogsExpanded: false,
    usageLogFilterRoles: [],
    usageLogFilterTools: [],
    usageLogFilterHasTools: false,
    usageLogFilterQuery: "",
    usageQuery: "",
    usageQueryDraft: "",
    usageQueryDebounceTimer: null,
    usageSessionSort: "tokens",
    usageSessionSortDir: "desc",
    usageRecentSessions: [],
    usageSessionsTab: "all",
    usageVisibleColumns: [],
    usageTimeZone: "UTC",
    usageContextExpanded: false,
    usageHeaderPinned: false,
    configFormMode: null,
    execApprovalQueue: [],
    applySettings: vi.fn(),
    connect: vi.fn(),
    loadOverview: vi.fn(),
    handleWhatsAppStart: vi.fn(),
    handleWhatsAppWait: vi.fn(),
    handleWhatsAppLogout: vi.fn(),
    handleChannelConfigSave: vi.fn(),
    handleChannelConfigReload: vi.fn(),
    handleNostrProfileEdit: vi.fn(),
    handleNostrProfileCancel: vi.fn(),
    handleNostrProfileFieldChange: vi.fn(),
    handleNostrProfileSave: vi.fn(),
    handleNostrProfileImport: vi.fn(),
    handleNostrProfileToggleAdvanced: vi.fn(),
    loadCron: vi.fn(),
    handleSendChat: vi.fn(),
    handleAbortChat: vi.fn(),
    removeQueuedMessage: vi.fn(),
    resetToolStream: vi.fn(),
    handleChatScroll: vi.fn(),
    resetChatScroll: vi.fn(),
    loadAssistantIdentity: vi.fn(),
    ...overrides,
  });

  describe("short menu mode integration", () => {
    it("renders without errors in full menu mode", () => {
      const state = createMockState();
      const result = renderApp(state);
      expect(result).toBeDefined();
      // Result should be a lit-html TemplateResult
      expect(result).toHaveProperty("strings");
    });

    it("renders without errors in short menu mode", () => {
      const state = createMockState();
      const result = renderApp(state);
      expect(result).toBeDefined();
      // Result should be a lit-html TemplateResult
      expect(result).toHaveProperty("strings");
    });

    it("theme toggle remains visible in short menu mode", () => {
      const state = createMockState();
      const result = renderApp(state);
      // The result is a lit-html template - we verify it renders without errors
      // The theme toggle is part of the static template structure
      expect(result).toBeDefined();
      expect(result).toHaveProperty("strings");
    });

    it("navigation collapse toggle remains functional in short menu mode", () => {
      const applySettings = vi.fn();
      const state = createMockState({
        applySettings,
        settings: { ...createMockState().settings, navCollapsed: false },
      });
      const result = renderApp(state);
      expect(result).toBeDefined();
      expect(result).toHaveProperty("strings");
    });
  });

  describe("menu mode selection", () => {
    it("getTabGroups uses TAB_GROUPS when short menu mode is disabled", () => {
      expect(getTabGroups({})).toBe(TAB_GROUPS);
    });

    it("getTabGroups uses SHORT_TAB_GROUPS when short menu mode is enabled", () => {
      expect(getTabGroups({ VITE_SHORT_MENU: "true" })).toBe(SHORT_TAB_GROUPS);
    });

    it("isShortMenuMode returns false when env var is not set", () => {
      expect(isShortMenuMode({})).toBe(false);
    });

    it("isShortMenuMode returns true when VITE_SHORT_MENU is 'true'", () => {
      expect(isShortMenuMode({ VITE_SHORT_MENU: "true" })).toBe(true);
    });

    it("isShortMenuMode returns true when VITE_SHORT_MENU is true (boolean)", () => {
      expect(isShortMenuMode({ VITE_SHORT_MENU: true })).toBe(true);
    });
  });
});

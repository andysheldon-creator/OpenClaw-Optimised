import { loadChatHistory } from "./controllers/chat";
import { loadDevices } from "./controllers/devices";
import { loadNodes } from "./controllers/nodes";
import { loadAgents } from "./controllers/agents";
import { loadAutomations } from "./controllers/automations";
import { toast } from "./components/toast";
import type { GatewayEventFrame, GatewayHelloOk } from "./gateway";
import { GatewayBrowserClient } from "./gateway";
import type { EventLogEntry } from "./app-events";
import type { AgentsListResult, PresenceEntry, HealthSnapshot, StatusSummary } from "./types";
import type { Tab } from "./navigation";
import type { UiSettings } from "./storage";
import { handleAgentEvent, resetToolStream, type AgentEventPayload } from "./app-tool-stream";
import { flushChatQueueForEvent } from "./app-chat";
import {
  applySettings,
  loadCron,
  refreshActiveTab,
  setLastActiveSessionKey,
} from "./app-settings";
import { handleChatEvent, type ChatEventPayload } from "./controllers/chat";
import {
  addExecApproval,
  parseExecApprovalRequested,
  parseExecApprovalResolved,
  removeExecApproval,
} from "./controllers/exec-approval";
import type { ClawdbrainApp } from "./app";
import type { ExecApprovalRequest } from "./controllers/exec-approval";
import { loadAssistantIdentity } from "./controllers/assistant-identity";
import { formatDurationMs } from "./format";

type GatewayHost = {
  settings: UiSettings;
  password: string;
  client: GatewayBrowserClient | null;
  connected: boolean;
  hello: GatewayHelloOk | null;
  lastError: string | null;
  onboarding?: boolean;
  eventLogBuffer: EventLogEntry[];
  eventLog: EventLogEntry[];
  tab: Tab;
  presenceEntries: PresenceEntry[];
  presenceError: string | null;
  presenceStatus: StatusSummary | null;
  agentsLoading: boolean;
  agentsList: AgentsListResult | null;
  agentsError: string | null;
  debugHealth: HealthSnapshot | null;
  assistantName: string;
  assistantAvatar: string | null;
  assistantAgentId: string | null;
  sessionKey: string;
  chatRunId: string | null;
  execApprovalQueue: ExecApprovalRequest[];
  execApprovalError: string | null;
  handleAgentSessionActivity?: (payload?: AgentEventPayload) => void;
  // Automations progress tracking
  automationProgressModalOpen: boolean;
  automationProgressModalAutomationId: string | null;
  automationProgressModalAutomationName: string;
  automationProgressModalCurrentStep: number;
  automationProgressModalTotalSteps: number;
  automationProgressModalProgress: number;
  automationProgressModalMilestones: Array<{ id: string; title: string; status: "completed" | "current" | "pending"; timestamp?: string }>;
  automationProgressModalElapsedTime: string;
  automationProgressModalConflicts: number;
  automationProgressModalArtifactsCount: number;
  automationRunningIds: Set<string>;
};

type SessionDefaultsSnapshot = {
  defaultAgentId?: string;
  mainKey?: string;
  mainSessionKey?: string;
  scope?: string;
};

function normalizeSessionKeyForDefaults(
  value: string | undefined,
  defaults: SessionDefaultsSnapshot,
): string {
  const raw = (value ?? "").trim();
  const mainSessionKey = defaults.mainSessionKey?.trim();
  if (!mainSessionKey) return raw;
  if (!raw) return mainSessionKey;
  const mainKey = defaults.mainKey?.trim() || "main";
  const defaultAgentId = defaults.defaultAgentId?.trim();
  const isAlias =
    raw === "main" ||
    raw === mainKey ||
    (defaultAgentId &&
      (raw === `agent:${defaultAgentId}:main` ||
        raw === `agent:${defaultAgentId}:${mainKey}`));
  return isAlias ? mainSessionKey : raw;
}

function applySessionDefaults(host: GatewayHost, defaults?: SessionDefaultsSnapshot) {
  if (!defaults?.mainSessionKey) return;
  const resolvedSessionKey = normalizeSessionKeyForDefaults(host.sessionKey, defaults);
  const resolvedSettingsSessionKey = normalizeSessionKeyForDefaults(
    host.settings.sessionKey,
    defaults,
  );
  const resolvedLastActiveSessionKey = normalizeSessionKeyForDefaults(
    host.settings.lastActiveSessionKey,
    defaults,
  );
  const nextSessionKey = resolvedSessionKey || resolvedSettingsSessionKey || host.sessionKey;
  const nextSettings = {
    ...host.settings,
    sessionKey: resolvedSettingsSessionKey || nextSessionKey,
    lastActiveSessionKey: resolvedLastActiveSessionKey || nextSessionKey,
  };
  const shouldUpdateSettings =
    nextSettings.sessionKey !== host.settings.sessionKey ||
    nextSettings.lastActiveSessionKey !== host.settings.lastActiveSessionKey;
  if (nextSessionKey !== host.sessionKey) {
    host.sessionKey = nextSessionKey;
  }
  if (shouldUpdateSettings) {
    applySettings(host as unknown as Parameters<typeof applySettings>[0], nextSettings);
  }
}

export function connectGateway(host: GatewayHost) {
  host.lastError = null;
  host.hello = null;
  host.connected = false;
  host.execApprovalQueue = [];
  host.execApprovalError = null;

  host.client?.stop();
  host.client = new GatewayBrowserClient({
    url: host.settings.gatewayUrl,
    token: host.settings.token.trim() ? host.settings.token : undefined,
    password: host.password.trim() ? host.password : undefined,
    clientName: "clawdbrain-control-ui",
    mode: "webchat",
    onHello: (hello) => {
      host.connected = true;
      host.lastError = null;
      host.hello = hello;
      applySnapshot(host, hello);
      toast.success("Connected to gateway");
      // Reset orphaned chat run state from before disconnect.
      // Any in-flight run's final event was lost during the disconnect window.
      host.chatRunId = null;
      (host as unknown as { chatStream: string | null }).chatStream = null;
      (host as unknown as { chatStreamStartedAt: number | null }).chatStreamStartedAt = null;
      resetToolStream(host as unknown as Parameters<typeof resetToolStream>[0]);
      void loadAssistantIdentity(host as unknown as ClawdbrainApp);
      void loadAgents(host as unknown as ClawdbrainApp);
      void loadNodes(host as unknown as ClawdbrainApp, { quiet: true });
      void loadDevices(host as unknown as ClawdbrainApp, { quiet: true });
      void refreshActiveTab(host as unknown as Parameters<typeof refreshActiveTab>[0]);
    },
    onClose: ({ code, reason }) => {
      host.connected = false;
      // Code 1012 = Service Restart (expected during config saves, don't show as error)
      if (code !== 1012) {
        host.lastError = `disconnected (${code}): ${reason || "no reason"}`;
        toast.warning("Disconnected from gateway");
      }
    },
    onEvent: (evt) => handleGatewayEvent(host, evt),
    onGap: ({ expected, received }) => {
      host.lastError = `event gap detected (expected seq ${expected}, got ${received}); refresh recommended`;
    },
  });
  host.client.start();
}

export function handleGatewayEvent(host: GatewayHost, evt: GatewayEventFrame) {
  try {
    handleGatewayEventUnsafe(host, evt);
  } catch (err) {
    console.error("[gateway] handleGatewayEvent error:", evt.event, err);
  }
}

function handleGatewayEventUnsafe(host: GatewayHost, evt: GatewayEventFrame) {
  host.eventLogBuffer = [
    { ts: Date.now(), event: evt.event, payload: evt.payload },
    ...host.eventLogBuffer,
  ].slice(0, 250);
  if (host.tab === "debug") {
    host.eventLog = host.eventLogBuffer;
  }

  if (evt.event === "agent") {
    if (host.onboarding) return;
    host.handleAgentSessionActivity?.(evt.payload as AgentEventPayload | undefined);
    handleAgentEvent(
      host as unknown as Parameters<typeof handleAgentEvent>[0],
      evt.payload as AgentEventPayload | undefined,
    );
    return;
  }

  if (evt.event === "chat") {
    const payload = evt.payload as ChatEventPayload | undefined;
    if (payload?.sessionKey) {
      setLastActiveSessionKey(
        host as unknown as Parameters<typeof setLastActiveSessionKey>[0],
        payload.sessionKey,
      );
    }
    const state = handleChatEvent(host as unknown as ClawdbrainApp, payload);
    if (state === "final" || state === "error" || state === "aborted") {
      resetToolStream(host as unknown as Parameters<typeof resetToolStream>[0]);
      void flushChatQueueForEvent(
        host as unknown as Parameters<typeof flushChatQueueForEvent>[0],
      );
    }
    if (state === "final") void loadChatHistory(host as unknown as ClawdbrainApp);
    return;
  }

  if (evt.event === "presence") {
    const payload = evt.payload as { presence?: PresenceEntry[] } | undefined;
    if (payload?.presence && Array.isArray(payload.presence)) {
      host.presenceEntries = payload.presence;
      host.presenceError = null;
      host.presenceStatus = null;
    }
    return;
  }

  if (evt.event === "cron" && host.tab === "cron") {
    void loadCron(host as unknown as Parameters<typeof loadCron>[0]);
  }

  if (evt.event === "device.pair.requested" || evt.event === "device.pair.resolved") {
    void loadDevices(host as unknown as ClawdbrainApp, { quiet: true });
  }

  if (evt.event === "exec.approval.requested") {
    const entry = parseExecApprovalRequested(evt.payload);
    if (entry) {
      host.execApprovalQueue = addExecApproval(host.execApprovalQueue, entry);
      host.execApprovalError = null;
      const delay = Math.max(0, entry.expiresAtMs - Date.now() + 500);
      window.setTimeout(() => {
        host.execApprovalQueue = removeExecApproval(host.execApprovalQueue, entry.id);
      }, delay);
    }
    return;
  }

  if (evt.event === "exec.approval.resolved") {
    const resolved = parseExecApprovalResolved(evt.payload);
    if (resolved) {
      host.execApprovalQueue = removeExecApproval(host.execApprovalQueue, resolved.id);
    }
  }

  // Automations SSE event handlers
  if (evt.event === "automation.started") {
    const payload = evt.payload as {
      automationId?: string;
      automationName?: string;
      sessionId?: string;
      startedAt?: number;
    } | undefined;
    if (payload?.automationId && payload?.automationName) {
      // Add to running set
      host.automationRunningIds.add(payload.automationId);
      // Open progress modal if not already open
      if (host.automationProgressModalAutomationId !== payload.automationId) {
        host.automationProgressModalAutomationId = payload.automationId;
        host.automationProgressModalAutomationName = payload.automationName;
        host.automationProgressModalCurrentStep = 1;
        host.automationProgressModalTotalSteps = 3; // default
        host.automationProgressModalProgress = 0;
        host.automationProgressModalMilestones = [
          { id: "1", title: "Initializing", status: "current" },
          { id: "2", title: "Running", status: "pending" },
          { id: "3", title: "Completing", status: "pending" },
        ];
        host.automationProgressModalElapsedTime = "0s";
        host.automationProgressModalConflicts = 0;
        host.automationProgressModalArtifactsCount = 0;
        host.automationProgressModalOpen = true;
      }
      toast.info(`Started running ${payload.automationName}`);
    }
    return;
  }

  if (evt.event === "automation.progress") {
    const payload = evt.payload as {
      automationId?: string;
      milestone?: { id?: string; title?: string; status?: "completed" | "current" | "pending"; timestamp?: string };
      progress?: number;
      conflicts?: number;
      elapsedTime?: string;
      artifactsCount?: number;
    } | undefined;
    if (payload?.automationId && host.automationProgressModalAutomationId === payload.automationId) {
      // Update milestones
      if (payload.milestone?.id) {
        const milestoneIdx = host.automationProgressModalMilestones.findIndex(m => m.id === payload.milestone!.id);
        if (milestoneIdx >= 0) {
          // Update current milestone
          host.automationProgressModalMilestones[milestoneIdx] = {
            id: payload.milestone.id,
            title: payload.milestone.title || host.automationProgressModalMilestones[milestoneIdx].title,
            status: payload.milestone.status || "current",
            timestamp: payload.milestone.timestamp,
          };
          // Mark previous milestones as completed
          for (let i = 0; i < milestoneIdx; i++) {
            host.automationProgressModalMilestones[i] = {
              ...host.automationProgressModalMilestones[i],
              status: "completed" as const,
            };
          }
          // Update current step
          host.automationProgressModalCurrentStep = milestoneIdx + 1;
          host.automationProgressModalTotalSteps = host.automationProgressModalMilestones.length;
        }
      }
      // Update progress
      if (typeof payload.progress === "number") {
        host.automationProgressModalProgress = payload.progress;
      }
      // Update elapsed time
      if (payload.elapsedTime) {
        host.automationProgressModalElapsedTime = payload.elapsedTime;
      }
      // Update conflicts count
      if (typeof payload.conflicts === "number") {
        host.automationProgressModalConflicts = payload.conflicts;
      }
      // Update artifacts count
      if (typeof payload.artifactsCount === "number") {
        host.automationProgressModalArtifactsCount = payload.artifactsCount;
      }
    }
    return;
  }

  if (evt.event === "automation.completed") {
    const payload = evt.payload as {
      automationId?: string;
      automationName?: string;
      status?: string;
      completedAt?: number;
      durationMs?: number;
      summary?: string;
      artifacts?: Array<{ id: string; name: string; type: string; size: string; url: string }>;
    } | undefined;
    if (payload?.automationId) {
      // Remove from running set
      host.automationRunningIds.delete(payload.automationId);
      // Close progress modal
      if (host.automationProgressModalAutomationId === payload.automationId) {
        host.automationProgressModalOpen = false;
        host.automationProgressModalAutomationId = null;
      }
      // Show success toast
      const duration = payload.durationMs ? formatDurationMs(payload.durationMs) : "";
      const artifactMsg = payload.artifacts && payload.artifacts.length > 0
        ? ` (${payload.artifacts.length} artifact${payload.artifacts.length > 1 ? "s" : ""})`
        : "";
      toast.success(`Completed ${payload.automationName || "automation"}${duration ? ` in ${duration}` : ""}${artifactMsg}`);
      // Refresh automations list
      void loadAutomations(host as any);
    }
    return;
  }

  if (evt.event === "automation.failed") {
    const payload = evt.payload as {
      automationId?: string;
      automationName?: string;
      status?: string;
      error?: string;
      conflicts?: Array<{ type: string; description: string; resolution: string }>;
    } | undefined;
    if (payload?.automationId) {
      // Remove from running set
      host.automationRunningIds.delete(payload.automationId);
      // Close progress modal
      if (host.automationProgressModalAutomationId === payload.automationId) {
        host.automationProgressModalOpen = false;
        host.automationProgressModalAutomationId = null;
      }
      // Show error toast
      const errorMsg = payload.error || "Unknown error";
      const hasConflicts = payload.conflicts && payload.conflicts.length > 0;
      if (hasConflicts) {
        toast.warning(`Failed: ${errorMsg} (${payload.conflicts!.length} conflict${payload.conflicts!.length > 1 ? "s" : ""})`);
      } else {
        toast.error(`Failed: ${errorMsg}`);
      }
      // Refresh automations list
      void loadAutomations(host as any);
    }
    return;
  }

  if (evt.event === "automation.cancelled") {
    const payload = evt.payload as {
      automationId?: string;
      automationName?: string;
      status?: string;
    } | undefined;
    if (payload?.automationId) {
      // Remove from running set
      host.automationRunningIds.delete(payload.automationId);
      // Close progress modal
      if (host.automationProgressModalAutomationId === payload.automationId) {
        host.automationProgressModalOpen = false;
        host.automationProgressModalAutomationId = null;
      }
      // Show info toast
      toast.info(`Cancelled ${payload.automationName || "automation"}`);
      // Refresh automations list
      void loadAutomations(host as any);
    }
    return;
  }

  if (evt.event === "automation.blocked") {
    const payload = evt.payload as {
      automationId?: string;
      automationName?: string;
      blockType?: "user-input" | "approval" | "conflict" | "resource";
      message?: string;
      requiredAction?: string;
      sessionId?: string;
    } | undefined;
    if (payload?.automationId && host.automationProgressModalAutomationId === payload.automationId) {
      // Update progress modal status to blocked (keep it open)
      const action = payload.requiredAction || payload.message || "Automation blocked";
      // Show warning toast with action
      toast.warning(action);
    }
    return;
  }
}

export function applySnapshot(host: GatewayHost, hello: GatewayHelloOk) {
  const snapshot = hello.snapshot as
    | {
        presence?: PresenceEntry[];
        health?: HealthSnapshot;
        sessionDefaults?: SessionDefaultsSnapshot;
      }
    | undefined;
  if (snapshot?.presence && Array.isArray(snapshot.presence)) {
    host.presenceEntries = snapshot.presence;
  }
  if (snapshot?.health) {
    host.debugHealth = snapshot.health;
  }
  if (snapshot?.sessionDefaults) {
    applySessionDefaults(host, snapshot.sessionDefaults);
  }
}

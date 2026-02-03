# UI Layer Design

**Component:** Automations User Interface
**Status:** Design Phase
**Author:** AI Design Session
**Date:** 2025-01-26

## Overview

The UI Layer provides the user interface for creating, managing, and monitoring automations. It introduces a new "Automations" vertical tab in the existing Control group, following the design patterns established by the existing Cron tab. The UI is built with React components and integrates with Clawdbrain's existing navigation and controller patterns.

## Directory Structure

```
ui/src/ui/
├── views/
│   └── automations/              # New Automations view
│       ├── index.tsx             # Main view component
│       ├── automation-list.tsx   # List of automations
│       ├── automation-card.tsx   # Individual automation card
│       ├── automation-form.tsx   # Create/edit form
│       ├── run-history.tsx       # Run history view
│       ├── progress-modal.tsx    # Real-time progress modal
│       ├── ssh-keys-panel.tsx    # SSH key management
│       └── components/           # Reusable components
│           ├── schedule-editor.tsx
│           ├── repo-input.tsx
│           ├── confidence-slider.tsx
│           ├── uncertainty-selector.tsx
│           └── status-badge.tsx
├── controllers/
│   └── automations.ts            # Automation controller (API client)
├── navigation.ts                 # Updated with Automations tab
└── components/
    └── toast.ts                  # Existing (for notifications)
```

## Navigation Integration

### Tab Registration

```typescript
// ui/src/ui/navigation.ts

const TAB_GROUPS = [
  { label: "Chat", tabs: ["chat"] },
  {
    label: "Control",
    tabs: [
      "overview",
      "agents",
      "channels",
      "instances",
      "sessions",
      "cron",
      "overseer",
      "automations", // NEW
    ],
  },
  { label: "Agent", tabs: ["skills", "nodes"] },
  { label: "Settings", tabs: ["config", "debug", "logs"] },
] as const;

const TAB_CONFIG = {
  // ... existing tabs ...
  automations: {
    title: "Automations",
    subtitle: "Scheduled tasks with AI-powered automation",
    icon: "automation", // SVG icon name
    route: "/automations",
  },
} as const;
```

### Route Handler

```typescript
// ui/src/ui/router.tsx (or existing routing file)

// Add to route configuration
{
  path: "/automations",
  component: lazy(() => import("./views/automations/index")),
  meta: {
    title: "Automations",
    group: "Control",
  },
}
```

## Controller (API Client)

```typescript
// ui/src/ui/controllers/automations.ts

/**
 * Controller for automation API calls.
 * Follows the pattern of existing controllers (e.g., cron.ts).
 */
class AutomationsController {
  private baseUrl = "/api/automations";

  /**
   * List all automations.
   */
  async listAutomations(): Promise<AutomationConfig[]> {
    const response = await fetch(`${this.baseUrl}`);
    if (!response.ok) throw new Error("Failed to fetch automations");
    return response.json();
  }

  /**
   * Get a specific automation.
   */
  async getAutomation(id: string): Promise<AutomationConfig> {
    const response = await fetch(`${this.baseUrl}/${id}`);
    if (!response.ok) throw new Error("Failed to fetch automation");
    return response.json();
  }

  /**
   * Create a new automation.
   */
  async createAutomation(config: Partial<AutomationConfig>): Promise<AutomationConfig> {
    const response = await fetch(`${this.baseUrl}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(config),
    });
    if (!response.ok) throw new Error("Failed to create automation");
    return response.json();
  }

  /**
   * Update an automation.
   */
  async updateAutomation(id: string, config: Partial<AutomationConfig>): Promise<AutomationConfig> {
    const response = await fetch(`${this.baseUrl}/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(config),
    });
    if (!response.ok) throw new Error("Failed to update automation");
    return response.json();
  }

  /**
   * Delete an automation.
   */
  async deleteAutomation(id: string): Promise<void> {
    const response = await fetch(`${this.baseUrl}/${id}`, {
      method: "DELETE",
    });
    if (!response.ok) throw new Error("Failed to delete automation");
  }

  /**
   * Trigger a manual run.
   */
  async triggerRun(id: string): Promise<{ sessionId: string }> {
    const response = await fetch(`${this.baseUrl}/${id}/run`, {
      method: "POST",
    });
    if (!response.ok) throw new Error("Failed to trigger run");
    return response.json();
  }

  /**
   * Cancel a running automation.
   */
  async cancelRun(id: string): Promise<void> {
    const response = await fetch(`${this.baseUrl}/${id}/cancel`, {
      method: "POST",
    });
    if (!response.ok) throw new Error("Failed to cancel run");
  }

  /**
   * Suspend an automation (stop scheduled runs).
   */
  async suspendAutomation(id: string): Promise<void> {
    const response = await fetch(`${this.baseUrl}/${id}/suspend`, {
      method: "POST",
    });
    if (!response.ok) throw new Error("Failed to suspend automation");
  }

  /**
   * Resume an automation (enable scheduled runs).
   */
  async resumeAutomation(id: string): Promise<void> {
    const response = await fetch(`${this.baseUrl}/${id}/resume`, {
      method: "POST",
    });
    if (!response.ok) throw new Error("Failed to resume automation");
  }

  /**
   * Get run history for an automation.
   */
  async getRunHistory(id: string, limit: number = 50): Promise<RunInfo[]> {
    const response = await fetch(`${this.baseUrl}/${id}/history?limit=${limit}`);
    if (!response.ok) throw new Error("Failed to fetch run history");
    return response.json();
  }

  /**
   * Get current progress for a running automation.
   */
  async getProgress(id: string): Promise<ProgressState> {
    const response = await fetch(`${this.baseUrl}/${id}/progress`);
    if (!response.ok) throw new Error("Failed to fetch progress");
    return response.json();
  }

  /**
   * Get available SSH keys.
   */
  async getSSHKeys(): Promise<SSHKey[]> {
    const response = await fetch(`${this.baseUrl}/ssh-keys`);
    if (!response.ok) throw new Error("Failed to fetch SSH keys");
    return response.json();
  }

  /**
   * Get dispatcher configuration.
   */
  async getDispatcherConfig(): Promise<DispatcherConfig> {
    const response = await fetch(`${this.baseUrl}/dispatcher/config`);
    if (!response.ok) throw new Error("Failed to fetch dispatcher config");
    return response.json();
  }

  /**
   * Update dispatcher configuration.
   */
  async updateDispatcherConfig(config: Partial<DispatcherConfig>): Promise<DispatcherConfig> {
    const response = await fetch(`${this.baseUrl}/dispatcher/config`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(config),
    });
    if (!response.ok) throw new Error("Failed to update dispatcher config");
    return response.json();
  }

  /**
   * Stream progress updates (Server-Sent Events).
   */
  streamProgress(id: string, onProgress: (progress: ProgressUpdate) => void): EventSource {
    const eventSource = new EventSource(`${this.baseUrl}/${id}/progress/stream`);

    eventSource.onmessage = (event) => {
      const progress = JSON.parse(event.data);
      onProgress(progress);
    };

    eventSource.onerror = (error) => {
      console.error("Progress stream error:", error);
      eventSource.close();
    };

    return eventSource;
  }
}

// Types
interface AutomationConfig {
  id: string;
  type: string;
  name: string;
  description?: string;
  enabled: boolean;
  schedule: {
    type: "cron" | "interval" | "at";
    value: string;
  };
  config: Record<string, any>;
  lastRun?: {
    timestamp: string;
    status: "success" | "partial" | "failed" | "cancelled";
    duration: number;
    summary: string;
  };
  nextRun?: string;
  runHistory: Array<{
    timestamp: string;
    status: string;
    duration: number;
    summary: string;
  }>;
  created: string;
  modified: string;
}

interface RunInfo {
  timestamp: string;
  status: string;
  duration: number;
  summary: string;
  sessionId?: string;
  artifacts?: Artifact[];
}

interface ProgressState {
  automationId: string;
  sessionId: string;
  status: "running" | "complete" | "failed" | "cancelled";
  currentPhase: string;
  progress: {
    percentage: number;
    milestone: string;
    details: Record<string, any>;
  };
  startTime: string;
  lastUpdate: string;
}

interface ProgressUpdate {
  timestamp: string;
  milestone: string;
  percentage: number;
  details: Record<string, any>;
}

interface SSHKey {
  path: string;
  filename: string;
  type: "rsa" | "ed25519" | "unknown";
  hasPassphrase: boolean;
  fingerprint?: string;
}

interface Artifact {
  type: "branch" | "pr" | "issue" | "file" | "url";
  name: string;
  value: string;
  url?: string;
}

// Export singleton
export const automationsController = new AutomationsController();
```

## Main View Component

```typescript
// ui/src/ui/views/automations/index.tsx

import React, { useState, useEffect } from "react";
import { automationsController } from "../../controllers/automations";
import { toast } from "../../components/toast";
import { AutomationList } from "./automation-list";
import { AutomationForm } from "./automation-form";
import { ProgressModal } from "./progress-modal";
import { RunHistory } from "./run-history";
import { DispatcherConfig } from "./dispatcher-config";

/**
 * Main Automations view.
 * Displays list of automations with actions to create, edit, run, and manage.
 */
export function AutomationsView() {
  const [automations, setAutomations] = useState<AutomationConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingAutomation, setEditingAutomation] = useState<AutomationConfig | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [historyAutomation, setHistoryAutomation] = useState<AutomationConfig | null>(null);
  const [activeProgress, setActiveProgress] = useState<ProgressState | null>(null);
  const [showDispatcherConfig, setShowDispatcherConfig] = useState(false);

  // Load automations on mount
  useEffect(() => {
    loadAutomations();

    // Poll for updates every 30 seconds
    const interval = setInterval(loadAutomations, 30000);
    return () => clearInterval(interval);
  }, []);

  // Listen for progress updates
  useEffect(() => {
    const handleProgress = (event: MessageEvent) => {
      const update = JSON.parse(event.data);

      if (update.automationId && activeProgress?.automationId === update.automationId) {
        setActiveProgress((prev) => ({
          ...prev,
          ...update,
          progress: update,
        }));
      }
    };

    // TODO: Set up SSE connection for running automations
  }, [activeProgress]);

  const loadAutomations = async () => {
    try {
      setLoading(true);
      const data = await automationsController.listAutomations();
      setAutomations(data);
    } catch (error) {
      toast.error("Failed to load automations", { error });
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = () => {
    setEditingAutomation(null);
    setShowForm(true);
  };

  const handleEdit = (automation: AutomationConfig) => {
    setEditingAutomation(automation);
    setShowForm(true);
  };

  const handleDelete = async (automation: AutomationConfig) => {
    if (!confirm(`Delete automation "${automation.name}"?`)) {
      return;
    }

    try {
      await automationsController.deleteAutomation(automation.id);
      toast.success("Automation deleted");
      await loadAutomations();
    } catch (error) {
      toast.error("Failed to delete automation", { error });
    }
  };

  const handleTriggerRun = async (automation: AutomationConfig) => {
    try {
      const result = await automationsController.triggerRun(automation.id);

      // Open progress modal
      setActiveProgress({
        automationId: automation.id,
        sessionId: result.sessionId,
        status: "running",
        currentPhase: "initializing",
        progress: {
          percentage: 0,
          milestone: "Starting automation",
          details: {},
        },
        startTime: new Date().toISOString(),
        lastUpdate: new Date().toISOString(),
      });

      toast.success("Automation triggered", {
        action: {
          label: "View Progress",
          onClick: () => {
            // Progress modal already open
          },
        },
      });

      // Start streaming progress
      const eventSource = automationsController.streamProgress(
        automation.id,
        (progress) => {
          setActiveProgress((prev) => ({
            ...prev,
            progress,
            lastUpdate: progress.timestamp,
          }));

          if (progress.percentage === 100) {
            // Close modal after a delay
            setTimeout(() => {
              setActiveProgress(null);
              loadAutomations();
            }, 3000);
          }
        }
      );

      // Store event source for cleanup
      (activeProgress as any)._eventSource = eventSource;
    } catch (error) {
      toast.error("Failed to trigger automation", { error });
    }
  };

  const handleCancelRun = async (automation: AutomationConfig) => {
    try {
      await automationsController.cancelRun(automation.id);
      toast.success("Automation cancellation requested");
      setActiveProgress(null);
    } catch (error) {
      toast.error("Failed to cancel automation", { error });
    }
  };

  const handleSuspend = async (automation: AutomationConfig) => {
    try {
      await automationsController.suspendAutomation(automation.id);
      toast.success("Automation suspended");
      await loadAutomations();
    } catch (error) {
      toast.error("Failed to suspend automation", { error });
    }
  };

  const handleResume = async (automation: AutomationConfig) => {
    try {
      await automationsController.resumeAutomation(automation.id);
      toast.success("Automation resumed");
      await loadAutomations();
    } catch (error) {
      toast.error("Failed to resume automation", { error });
    }
  };

  const handleViewHistory = (automation: AutomationConfig) => {
    setHistoryAutomation(automation);
    setShowHistory(true);
  };

  const handleFormClose = (saved?: boolean) => {
    setShowForm(false);
    setEditingAutomation(null);

    if (saved) {
      loadAutomations();
    }
  };

  const handleProgressClose = () => {
    // Close event source if active
    if ((activeProgress as any)?._eventSource) {
      (activeProgress as any)._eventSource.close();
    }
    setActiveProgress(null);
    loadAutomations();
  };

  if (loading && automations.length === 0) {
    return <AutomationsView.Loading />;
  }

  return (
    <div className="automations-view">
      {/* Header */}
      <div className="automations-header">
        <div className="automations-header-text">
          <h1>Automations</h1>
          <p>Scheduled tasks with AI-powered automation</p>
        </div>

        <div className="automations-header-actions">
          <button
            className="btn btn-secondary"
            onClick={() => setShowDispatcherConfig(true)}
          >
            <SettingsIcon />
            Dispatcher Settings
          </button>

          <button className="btn btn-primary" onClick={handleCreate}>
            <PlusIcon />
            New Automation
          </button>
        </div>
      </div>

      {/* Automation List */}
      <AutomationList
        automations={automations}
        onEdit={handleEdit}
        onDelete={handleDelete}
        onTriggerRun={handleTriggerRun}
        onCancelRun={handleCancelRun}
        onSuspend={handleSuspend}
        onResume={handleResume}
        onViewHistory={handleViewHistory}
        activeRunIds={activeProgress ? [activeProgress.automationId] : []}
      />

      {/* Empty State */}
      {automations.length === 0 && (
        <div className="automations-empty">
          <EmptyStateIcon />
          <h2>No automations yet</h2>
          <p>Create your first automation to get started</p>
          <button className="btn btn-primary" onClick={handleCreate}>
            Create Automation
          </button>
        </div>
      )}

      {/* Form Modal */}
      {showForm && (
        <AutomationForm
          automation={editingAutomation}
          onClose={handleFormClose}
        />
      )}

      {/* Progress Modal */}
      {activeProgress && (
        <ProgressModal
          progress={activeProgress}
          onClose={handleProgressClose}
        />
      )}

      {/* Run History Modal */}
      {showHistory && historyAutomation && (
        <RunHistory
          automation={historyAutomation}
          onClose={() => {
            setShowHistory(false);
            setHistoryAutomation(null);
          }}
        />
      )}

      {/* Dispatcher Config Modal */}
      {showDispatcherConfig && (
        <DispatcherConfig
          onClose={() => setShowDispatcherConfig(false)}
        />
      )}
    </div>
  );
}

// Loading skeleton
AutomationsView.Loading = function Loading() {
  return (
    <div className="automations-view loading">
      <div className="automations-header">
        <div className="skeleton-text" style={{ width: 200, height: 32 }} />
        <div className="skeleton-text" style={{ width: 300, height: 20 }} />
      </div>

      <div className="automations-list">
        {[1, 2, 3].map((i) => (
          <div key={i} className="automation-card skeleton">
            <div className="skeleton-text" style={{ width: 150, height: 24 }} />
            <div className="skeleton-text" style={{ width: 200, height: 16 }} />
          </div>
        ))}
      </div>
    </div>
  );
};
```

## Automation List Component

```typescript
// ui/src/ui/views/automations/automation-list.tsx

import React from "react";
import { AutomationCard } from "./automation-card";

interface AutomationListProps {
  automations: AutomationConfig[];
  onEdit: (automation: AutomationConfig) => void;
  onDelete: (automation: AutomationConfig) => void;
  onTriggerRun: (automation: AutomationConfig) => void;
  onCancelRun: (automation: AutomationConfig) => void;
  onSuspend: (automation: AutomationConfig) => void;
  onResume: (automation: AutomationConfig) => void;
  onViewHistory: (automation: AutomationConfig) => void;
  activeRunIds: string[];
}

export function AutomationList({
  automations,
  onEdit,
  onDelete,
  onTriggerRun,
  onCancelRun,
  onSuspend,
  onResume,
  onViewHistory,
  activeRunIds,
}: AutomationListProps) {
  if (automations.length === 0) {
    return null;
  }

  // Group by type
  const grouped = automations.reduce((acc, automation) => {
    const type = automation.type || "other";
    if (!acc[type]) {
      acc[type] = [];
    }
    acc[type].push(automation);
    return acc;
  }, {} as Record<string, AutomationConfig[]>);

  return (
    <div className="automation-list">
      {Object.entries(grouped).map(([type, items]) => (
        <div key={type} className="automation-group">
          <h2 className="automation-group-title">
            {formatTypeLabel(type)}
          </h2>

          <div className="automation-grid">
            {items.map((automation) => (
              <AutomationCard
                key={automation.id}
                automation={automation}
                isRunning={activeRunIds.includes(automation.id)}
                onEdit={onEdit}
                onDelete={onDelete}
                onTriggerRun={onTriggerRun}
                onCancelRun={onCancelRun}
                onSuspend={onSuspend}
                onResume={onResume}
                onViewHistory={onViewHistory}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function formatTypeLabel(type: string): string {
  const labels: Record<string, string> = {
    "smart-sync-fork": "Smart-Sync Fork",
    "dependency-updater": "Dependency Updater",
  };

  return labels[type] || type.charAt(0).toUpperCase() + type.slice(1);
}
```

## Automation Card Component

```typescript
// ui/src/ui/views/automations/automation-card.tsx

import React from "react";
import { formatDistanceToNow } from "date-fns";
import { StatusBadge } from "./components/status-badge";

interface AutomationCardProps {
  automation: AutomationConfig;
  isRunning: boolean;
  onEdit: (automation: AutomationConfig) => void;
  onDelete: (automation: AutomationConfig) => void;
  onTriggerRun: (automation: AutomationConfig) => void;
  onCancelRun: (automation: AutomationConfig) => void;
  onSuspend: (automation: AutomationConfig) => void;
  onResume: (automation: AutomationConfig) => void;
  onViewHistory: (automation: AutomationConfig) => void;
}

export function AutomationCard({
  automation,
  isRunning,
  onEdit,
  onDelete,
  onTriggerRun,
  onCancelRun,
  onSuspend,
  onResume,
  onViewHistory,
}: AutomationCardProps) {
  const canRun = automation.enabled && !isRunning;
  const canCancel = isRunning;
  const canSuspend = automation.enabled && !isRunning;
  const canResume = !automation.enabled;

  return (
    <div className={`automation-card ${isRunning ? "running" : ""} ${!automation.enabled ? "suspended" : ""}`}>
      {/* Header */}
      <div className="automation-card-header">
        <div className="automation-card-title">
          <h3>{automation.name}</h3>
          {automation.description && (
            <p className="automation-card-description">
              {automation.description}
            </p>
          )}
        </div>

        <div className="automation-card-status">
          <StatusBadge
            enabled={automation.enabled}
            isRunning={isRunning}
            lastRun={automation.lastRun}
          />
        </div>
      </div>

      {/* Info */}
      <div className="automation-card-info">
        <div className="automation-card-info-item">
          <ScheduleIcon />
          <span>{formatSchedule(automation.schedule)}</span>
        </div>

        {automation.nextRun && (
          <div className="automation-card-info-item">
            <ClockIcon />
            <span>
              Next run: {formatDistanceToNow(new Date(automation.nextRun), { addSuffix: true })}
            </span>
          </div>
        )}

        {automation.lastRun && (
          <div className="automation-card-info-item">
            <HistoryIcon />
            <span>
              Last: {automation.lastRun.status} • {formatDuration(automation.lastRun.duration)}
            </span>
          </div>
        )}
      </div>

      {/* Last run summary */}
      {automation.lastRun && (
        <div className="automation-card-summary">
          {automation.lastRun.summary}
        </div>
      )}

      {/* Actions */}
      <div className="automation-card-actions">
        {/* Primary action */}
        {isRunning ? (
          <button
            className="btn btn-danger btn-sm"
            onClick={() => onCancelRun(automation)}
            title="Cancel running automation"
          >
            <CancelIcon />
            Cancel
          </button>
        ) : (
          <button
            className="btn btn-primary btn-sm"
            onClick={() => onTriggerRun(automation)}
            disabled={!canRun}
            title={canRun ? "Run now" : "Automation is disabled"}
          >
            <PlayIcon />
            Run Now
          </button>
        )}

        {/* Secondary actions */}
        <div className="automation-card-actions-secondary">
          {automation.enabled ? (
            <button
              className="btn btn-secondary btn-sm"
              onClick={() => onSuspend(automation)}
              disabled={!canSuspend}
              title="Suspend scheduled runs"
            >
              <PauseIcon />
            </button>
          ) : (
            <button
              className="btn btn-secondary btn-sm"
              onClick={() => onResume(automation)}
              disabled={!canResume}
              title="Resume scheduled runs"
            >
              <PlayIcon />
            </button>
          )}

          <button
            className="btn btn-secondary btn-sm"
            onClick={() => onViewHistory(automation)}
            title="View run history"
          >
            <HistoryIcon />
          </button>

          <button
            className="btn btn-secondary btn-sm"
            onClick={() => onEdit(automation)}
            title="Edit automation"
          >
            <EditIcon />
          </button>

          <button
            className="btn btn-secondary btn-sm btn-danger"
            onClick={() => onDelete(automation)}
            title="Delete automation"
          >
            <TrashIcon />
          </button>
        </div>
      </div>
    </div>
  );
}

function formatSchedule(schedule: AutomationConfig["schedule"]): string {
  switch (schedule.type) {
    case "interval":
      return `Every ${schedule.value}`;
    case "cron":
      return `Cron: ${schedule.value}`;
    case "at":
      return `At ${schedule.value}`;
  }
}

function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);

  if (hours > 0) {
    return `${hours}h ${minutes % 60}m`;
  } else if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`;
  } else {
    return `${seconds}s`;
  }
}
```

## Automation Form Component

```typescript
// ui/src/ui/views/automations/automation-form.tsx

import React, { useState, useEffect } from "react";
import { automationsController } from "../../controllers/automations";
import { toast } from "../../components/toast";
import { ScheduleEditor } from "./components/schedule-editor";
import { RepoInput } from "./components/repo-input";
import { ConfidenceSlider } from "./components/confidence-slider";
import { UncertaintySelector } from "./components/uncertainty-selector";

interface AutomationFormProps {
  automation?: AutomationConfig | null;
  onClose: (saved?: boolean) => void;
}

export function AutomationForm({ automation, onClose }: AutomationFormProps) {
  const [type, setType] = useState<string>(automation?.type || "smart-sync-fork");
  const [name, setName] = useState(automation?.name || "");
  const [description, setDescription] = useState(automation?.description || "");
  const [enabled, setEnabled] = useState(automation?.enabled ?? true);
  const [schedule, setSchedule] = useState(automation?.schedule || { type: "interval" as const, value: "2h" });

  // Smart-Sync Fork specific config
  const [forkRepoUrl, setForkRepoUrl] = useState("");
  const [upstreamRepoUrl, setUpstreamRepoUrl] = useState("");
  const [forkBranch, setForkBranch] = useState("main");
  const [upstreamBranch, setUpstreamBranch] = useState("main");
  const [aiModel, setAiModel] = useState("");
  const [confidenceThreshold, setConfidenceThreshold] = useState(90);
  const [uncertaintyAction, setUncertaintyAction] = useState<"report-at-end" | "pause-and-ask" | "skip-file">("report-at-end");
  const [autoMerge, setAutoMerge] = useState(false);
  const [maxWrongPathCorrections, setMaxWrongPathCorrections] = useState(3);
  const [maxMinutesPerConflict, setMaxMinutesPerConflict] = useState(5);
  const [sshKeyPath, setSshKeyPath] = useState("");
  const [notifyOnSuccess, setNotifyOnSuccess] = useState(true);
  const [notifyOnFailure, setNotifyOnFailure] = useState(true);
  const [notifyOnAttention, setNotifyOnAttention] = useState(true);

  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Load SSH keys
  const [sshKeys, setSshKeys] = useState<SSHKey[]>([]);
  useEffect(() => {
    automationsController.getSSHKeys().then(setSshKeys).catch(console.error);
  }, []);

  // Load existing automation config
  useEffect(() => {
    if (automation) {
      const config = automation.config as any;

      setForkRepoUrl(config.forkRepoUrl || "");
      setUpstreamRepoUrl(config.upstreamRepoUrl || "");
      setForkBranch(config.forkBranch || "main");
      setUpstreamBranch(config.upstreamBranch || "main");
      setAiModel(config.aiModel || "");
      setConfidenceThreshold(config.confidenceThreshold || 90);
      setUncertaintyAction(config.uncertaintyAction || "report-at-end");
      setAutoMerge(config.autoMerge || false);
      setMaxWrongPathCorrections(config.maxWrongPathCorrections || 3);
      setMaxMinutesPerConflict(config.maxMinutesPerConflict || 5);
      setSshKeyPath(config.sshKeyPath || "");
      setNotifyOnSuccess(config.notifyOnSuccess ?? true);
      setNotifyOnFailure(config.notifyOnFailure ?? true);
      setNotifyOnAttention(config.notifyOnAttention ?? true);
    }
  }, [automation]);

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!name.trim()) {
      newErrors.name = "Name is required";
    }

    if (type === "smart-sync-fork") {
      if (!forkRepoUrl.trim()) {
        newErrors.forkRepoUrl = "Fork repository URL is required";
      }
      if (!upstreamRepoUrl.trim()) {
        newErrors.upstreamRepoUrl = "Upstream repository URL is required";
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();

    if (!validate()) {
      return;
    }

    setSaving(true);

    try {
      const config: Partial<AutomationConfig> = {
        type,
        name: name.trim(),
        description: description.trim() || undefined,
        enabled,
        schedule,
        config: {},
      };

      if (type === "smart-sync-fork") {
        config.config = {
          forkRepoUrl: forkRepoUrl.trim(),
          upstreamRepoUrl: upstreamRepoUrl.trim(),
          forkBranch: forkBranch.trim() || "main",
          upstreamBranch: upstreamBranch.trim() || "main",
          aiModel: aiModel.trim() || undefined,
          confidenceThreshold,
          uncertaintyAction,
          autoMerge,
          maxWrongPathCorrections,
          maxMinutesPerConflict,
          sshKeyPath: sshKeyPath.trim() || undefined,
          notifyOnSuccess,
          notifyOnFailure,
          notifyOnAttention,
        };
      }

      if (automation) {
        await automationsController.updateAutomation(automation.id, config);
        toast.success("Automation updated");
      } else {
        await automationsController.createAutomation(config);
        toast.success("Automation created");
      }

      onClose(true);
    } catch (error: any) {
      // Parse validation errors from response
      if (error.errors) {
        const fieldErrors: Record<string, string> = {};
        for (const err of error.errors) {
          fieldErrors[err.field] = err.message;
        }
        setErrors(fieldErrors);
      } else {
        toast.error("Failed to save automation", { error });
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal automation-form-modal">
        <div className="modal-header">
          <h2>{automation ? "Edit Automation" : "New Automation"}</h2>
          <button className="btn btn-icon" onClick={() => onClose()}>
            <CloseIcon />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="modal-body">
          {/* Basic Info */}
          <fieldset>
            <legend>Basic Information</legend>

            <div className="form-group">
              <label htmlFor="type">Automation Type</label>
              <select
                id="type"
                value={type}
                onChange={(e) => setType(e.target.value)}
                disabled={!!automation}
              >
                <option value="smart-sync-fork">Smart-Sync Fork</option>
                {/* Future types will be added here */}
              </select>
            </div>

            <div className="form-group">
              <label htmlFor="name">Name *</label>
              <input
                id="name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g., Sync Main Fork"
                className={errors.name ? "error" : ""}
              />
              {errors.name && <span className="error-message">{errors.name}</span>}
            </div>

            <div className="form-group">
              <label htmlFor="description">Description</label>
              <textarea
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Optional description of what this automation does"
                rows={3}
              />
            </div>

            <div className="form-group checkbox-group">
              <label>
                <input
                  type="checkbox"
                  checked={enabled}
                  onChange={(e) => setEnabled(e.target.checked)}
                />
                <span>Enabled</span>
              </label>
              <span className="help-text">
                Disabled automations won't run on schedule but can still be triggered manually
              </span>
            </div>
          </fieldset>

          {/* Schedule */}
          <fieldset>
            <legend>Schedule</legend>
            <ScheduleEditor
              schedule={schedule}
              onChange={setSchedule}
            />
          </fieldset>

          {/* Type-specific config */}
          {type === "smart-sync-fork" && (
            <fieldset>
              <legend>Smart-Sync Fork Configuration</legend>

              {/* Repository URLs */}
              <div className="form-group">
                <label htmlFor="forkRepoUrl">Fork Repository URL *</label>
                <RepoInput
                  id="forkRepoUrl"
                  value={forkRepoUrl}
                  onChange={setForkRepoUrl}
                  placeholder="git@github.com:user/repo.git"
                  error={errors.forkRepoUrl}
                />
              </div>

              <div className="form-group">
                <label htmlFor="upstreamRepoUrl">Upstream Repository URL *</label>
                <RepoInput
                  id="upstreamRepoUrl"
                  value={upstreamRepoUrl}
                  onChange={setUpstreamRepoUrl}
                  placeholder="git@github.com:original/repo.git"
                  error={errors.upstreamRepoUrl}
                />
              </div>

              {/* Branches */}
              <div className="form-row">
                <div className="form-group">
                  <label htmlFor="forkBranch">Fork Branch</label>
                  <input
                    id="forkBranch"
                    type="text"
                    value={forkBranch}
                    onChange={(e) => setForkBranch(e.target.value)}
                    placeholder="main"
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="upstreamBranch">Upstream Branch</label>
                  <input
                    id="upstreamBranch"
                    type="text"
                    value={upstreamBranch}
                    onChange={(e) => setUpstreamBranch(e.target.value)}
                    placeholder="main"
                  />
                </div>
              </div>

              {/* SSH Key */}
              <div className="form-group">
                <label htmlFor="sshKey">SSH Key</label>
                <select
                  id="sshKey"
                  value={sshKeyPath}
                  onChange={(e) => setSshKeyPath(e.target.value)}
                >
                  <option value="">Auto-detect</option>
                  {sshKeys.map((key) => (
                    <option key={key.path} value={key.path}>
                      {key.filename} {key.hasPassphrase && "(passphrase protected)"}
                    </option>
                  ))}
                </select>
                <span className="help-text">
                  Select the SSH key to use for Git operations. Auto-detect will use the default key.
                </span>
              </div>

              {/* AI Settings */}
              <fieldset className="nested">
                <legend>AI Conflict Resolution</legend>

                <div className="form-group">
                  <label htmlFor="aiModel">AI Model</label>
                  <input
                    id="aiModel"
                    type="text"
                    value={aiModel}
                    onChange={(e) => setAiModel(e.target.value)}
                    placeholder="Leave empty to use default"
                  />
                  <span className="help-text">
                    Leave empty to use the global default model from Clawdbrain config
                  </span>
                </div>

                <ConfidenceSlider
                  value={confidenceThreshold}
                  onChange={setConfidenceThreshold}
                />

                <UncertaintySelector
                  value={uncertaintyAction}
                  onChange={setUncertaintyAction}
                />

                <div className="form-row">
                  <div className="form-group">
                    <label htmlFor="maxWrongPath">Max Wrong-Path Corrections</label>
                    <input
                      id="maxWrongPath"
                      type="number"
                      min={1}
                      max={10}
                      value={maxWrongPathCorrections}
                      onChange={(e) => setMaxWrongPathCorrections(parseInt(e.target.value) || 3)}
                    />
                  </div>

                  <div className="form-group">
                    <label htmlFor="maxMinutes">Max Minutes Per Conflict</label>
                    <input
                      id="maxMinutes"
                      type="number"
                      min={1}
                      max={60}
                      value={maxMinutesPerConflict}
                      onChange={(e) => setMaxMinutesPerConflict(parseInt(e.target.value) || 5)}
                    />
                  </div>
                </div>
              </fieldset>

              {/* Merge Settings */}
              <fieldset className="nested">
                <legend>Merge Behavior</legend>

                <div className="form-group checkbox-group">
                  <label>
                    <input
                      type="checkbox"
                      checked={autoMerge}
                      onChange={(e) => setAutoMerge(e.target.checked)}
                    />
                    <span>Auto-Merge</span>
                  </label>
                  <span className="help-text">
                    Automatically merge the PR if all conflicts are resolved successfully
                  </span>
                </div>
              </fieldset>

              {/* Notifications */}
              <fieldset className="nested">
                <legend>Notifications</legend>

                <div className="form-group checkbox-group">
                  <label>
                    <input
                      type="checkbox"
                      checked={notifyOnSuccess}
                      onChange={(e) => setNotifyOnSuccess(e.target.checked)}
                    />
                    <span>Notify on success</span>
                  </label>
                </div>

                <div className="form-group checkbox-group">
                  <label>
                    <input
                      type="checkbox"
                      checked={notifyOnFailure}
                      onChange={(e) => setNotifyOnFailure(e.target.checked)}
                    />
                    <span>Notify on failure</span>
                  </label>
                </div>

                <div className="form-group checkbox-group">
                  <label>
                    <input
                      type="checkbox"
                      checked={notifyOnAttention}
                      onChange={(e) => setNotifyOnAttention(e.target.checked)}
                    />
                    <span>Notify when attention needed</span>
                  </label>
                </div>
              </fieldset>
            </fieldset>
          )}

          {/* Form Actions */}
          <div className="form-actions">
            <button type="button" className="btn btn-secondary" onClick={() => onClose()}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? "Saving..." : automation ? "Save Changes" : "Create Automation"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
```

## Progress Modal Component

```typescript
// ui/src/ui/views/automations/progress-modal.tsx

import React, { useState, useEffect } from "react";
import { formatDistanceToNow } from "date-fns";
import { automationsController } from "../../controllers/automations";

interface ProgressModalProps {
  progress: ProgressState;
  onClose: () => void;
}

export function ProgressModal({ progress, onClose }: ProgressModalProps) {
  const [elapsed, setElapsed] = useState(0);

  // Update elapsed time every second
  useEffect(() => {
    const interval = setInterval(() => {
      setElapsed(Date.now() - new Date(progress.startTime).getTime());
    }, 1000);

    return () => clearInterval(interval);
  }, [progress.startTime]);

  const handleJumpToChat = () => {
    // Navigate to the agent session
    window.location.hash = `#sessions?sessionId=${progress.sessionId}`;
  };

  const handleCancel = async () => {
    if (!confirm("Cancel this automation run?")) {
      return;
    }

    try {
      await automationsController.cancelRun(progress.automationId);
      toast.info("Cancellation requested");
    } catch (error) {
      toast.error("Failed to cancel", { error });
    }
  };

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal progress-modal">
        <div className="modal-header">
          <div className="progress-modal-header">
            <div className={`status-indicator ${progress.status}`}>
              {progress.status === "running" && <SpinnerIcon />}
              {progress.status === "complete" && <SuccessIcon />}
              {progress.status === "failed" && <ErrorIcon />}
            </div>

            <div>
              <h2>Automation Running</h2>
              <p className="progress-modal-subtitle">
                {progress.progress.milestone}
              </p>
            </div>
          </div>

          <button className="btn btn-icon" onClick={onClose}>
            <CloseIcon />
          </button>
        </div>

        <div className="modal-body progress-modal-body">
          {/* Progress bar */}
          <div className="progress-bar-container">
            <div className="progress-bar">
              <div
                className="progress-bar-fill"
                style={{ width: `${progress.progress.percentage}%` }}
              />
            </div>
            <span className="progress-percentage">
              {progress.progress.percentage}%
            </span>
          </div>

          {/* Current milestone */}
          <div className="progress-milestone">
            <h3>{progress.progress.milestone}</h3>

            {/* Details */}
            {Object.keys(progress.progress.details).length > 0 && (
              <div className="progress-details">
                {Object.entries(progress.progress.details).map(([key, value]) => (
                  <div key={key} className="progress-detail-item">
                    <span className="progress-detail-key">{formatKey(key)}:</span>
                    <span className="progress-detail-value">{formatValue(value)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Timeline */}
          <div className="progress-timeline">
            <h4>Execution Timeline</h4>
            <div className="timeline">
              {getTimelineMilestones(progress).map((milestone, index) => (
                <div
                  key={index}
                  className={`timeline-item ${milestone.completed ? "completed" : ""} ${milestone.current ? "current" : ""}`}
                >
                  <div className="timeline-marker">
                    {milestone.completed && <CheckIcon />}
                    {milestone.current && <SpinnerIcon />}
                  </div>
                  <div className="timeline-content">
                    <span className="timeline-label">{milestone.label}</span>
                    {milestone.time && (
                      <span className="timeline-time">{milestone.time}</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Stats */}
          <div className="progress-stats">
            <div className="progress-stat">
              <span className="progress-stat-label">Elapsed Time</span>
              <span className="progress-stat-value">
                {formatDuration(elapsed)}
              </span>
            </div>

            {progress.progress.details.totalConflicts && (
              <>
                <div className="progress-stat">
                  <span className="progress-stat-label">Total Conflicts</span>
                  <span className="progress-stat-value">
                    {progress.progress.details.totalConflicts}
                  </span>
                </div>

                {progress.progress.details.resolvedConflicts !== undefined && (
                  <div className="progress-stat">
                    <span className="progress-stat-label">Resolved</span>
                    <span className="progress-stat-value">
                      {progress.progress.details.resolvedConflicts}
                    </span>
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="modal-footer progress-modal-footer">
          <button
            className="btn btn-secondary"
            onClick={handleJumpToChat}
          >
            <ChatIcon />
            Jump to Chat
          </button>

          {progress.status === "running" && (
            <button
              className="btn btn-danger"
              onClick={handleCancel}
            >
              <CancelIcon />
              Cancel
            </button>
          )}

          {progress.status !== "running" && (
            <button className="btn btn-primary" onClick={onClose}>
              Close
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function getTimelineMilestones(progress: ProgressState) {
  const milestones = [
    { label: "Initialize", key: "initializing" },
    { label: "Clone Repository", key: "cloning" },
    { label: "Fetch Upstream", key: "fetching" },
    { label: "Detect Conflicts", key: "detecting" },
    { label: "Resolve Conflicts", key: "resolving" },
    { label: "Push Changes", key: "pushing" },
    { label: "Create PR", key: "creating-pr" },
    { label: "Complete", key: "complete" },
  ];

  const currentPhase = progress.currentPhase.toLowerCase();
  const currentIndex = milestones.findIndex(m => currentPhase.includes(m.key));

  return milestones.map((m, i) => ({
    ...m,
    completed: i < currentIndex,
    current: i === currentIndex,
  }));
}

function formatKey(key: string): string {
  return key
    .replace(/([A-Z])/g, " $1")
    .replace(/^./, (s) => s.toUpperCase())
    .trim();
}

function formatValue(value: any): string {
  if (typeof value === "boolean") {
    return value ? "Yes" : "No";
  }
  if (typeof value === "number") {
    return value.toLocaleString();
  }
  return String(value);
}

function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);

  if (hours > 0) {
    return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
  } else if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`;
  } else {
    return `${seconds}s`;
  }
}
```

## Status Badge Component

```typescript
// ui/src/ui/views/automations/components/status-badge.tsx

interface StatusBadgeProps {
  enabled: boolean;
  isRunning: boolean;
  lastRun?: {
    status: "success" | "partial" | "failed" | "cancelled";
    timestamp: string;
  };
}

export function StatusBadge({ enabled, isRunning, lastRun }: StatusBadgeProps) {
  if (isRunning) {
    return (
      <span className="status-badge running">
        <SpinnerIcon />
        Running
      </span>
    );
  }

  if (!enabled) {
    return (
      <span className="status-badge suspended">
        <PauseIcon />
        Suspended
      </span>
    );
  }

  if (!lastRun) {
    return (
      <span className="status-badge never-run">
        <ClockIcon />
        Never Run
      </span>
    );
  }

  const statusConfig = {
    success: { icon: <SuccessIcon />, label: "Success", className: "success" },
    partial: { icon: <WarningIcon />, label: "Partial", className: "warning" },
    failed: { icon: <ErrorIcon />, label: "Failed", className: "error" },
    cancelled: { icon: <CancelIcon />, label: "Cancelled", className: "cancelled" },
  };

  const config = statusConfig[lastRun.status];

  return (
    <span className={`status-badge ${config.className}`}>
      {config.icon}
      {config.label}
    </span>
  );
}
```

## Styles (CSS)

```css
/* ui/src/ui/views/automations/index.css */

.automations-view {
  padding: 2rem;
  max-width: 1400px;
  margin: 0 auto;
}

.automations-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 2rem;
}

.automations-header h1 {
  margin: 0;
  font-size: 2rem;
}

.automations-header p {
  margin: 0.5rem 0 0 0;
  color: var(--color-text-secondary);
}

.automations-header-actions {
  display: flex;
  gap: 0.5rem;
}

.automation-group {
  margin-bottom: 2rem;
}

.automation-group-title {
  font-size: 1.25rem;
  margin-bottom: 1rem;
  color: var(--color-text-secondary);
}

.automation-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(400px, 1fr));
  gap: 1rem;
}

.automation-card {
  background: var(--color-bg-card);
  border: 1px solid var(--color-border);
  border-radius: var(--border-radius);
  padding: 1.5rem;
  transition: all 0.2s;
}

.automation-card:hover {
  box-shadow: var(--shadow-md);
}

.automation-card.running {
  border-color: var(--color-primary);
  box-shadow: 0 0 0 2px var(--color-primary-light);
}

.automation-card.suspended {
  opacity: 0.7;
}

.automation-card-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 1rem;
}

.automation-card-title h3 {
  margin: 0;
  font-size: 1.25rem;
}

.automation-card-description {
  margin: 0.5rem 0 0 0;
  color: var(--color-text-secondary);
  font-size: 0.875rem;
}

.automation-card-info {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  margin-bottom: 1rem;
}

.automation-card-info-item {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.875rem;
  color: var(--color-text-secondary);
}

.automation-card-summary {
  padding: 0.75rem;
  background: var(--color-bg-secondary);
  border-radius: var(--border-radius);
  font-size: 0.875rem;
  margin-bottom: 1rem;
}

.automation-card-actions {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.automation-card-actions-secondary {
  display: flex;
  gap: 0.25rem;
}

.status-badge {
  display: inline-flex;
  align-items: center;
  gap: 0.375rem;
  padding: 0.25rem 0.75rem;
  border-radius: 999px;
  font-size: 0.75rem;
  font-weight: 600;
}

.status-badge.running {
  background: var(--color-primary-light);
  color: var(--color-primary);
}

.status-badge.suspended {
  background: var(--color-bg-tertiary);
  color: var(--color-text-secondary);
}

.status-badge.success {
  background: var(--color-success-light);
  color: var(--color-success);
}

.status-badge.warning {
  background: var(--color-warning-light);
  color: var(--color-warning);
}

.status-badge.error {
  background: var(--color-error-light);
  color: var(--color-error);
}

/* Progress Modal */
.progress-modal {
  max-width: 600px;
}

.progress-modal-header {
  display: flex;
  align-items: center;
  gap: 1rem;
}

.status-indicator {
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.status-indicator.running {
  color: var(--color-primary);
}

.status-indicator.complete {
  color: var(--color-success);
}

.status-indicator.failed {
  color: var(--color-error);
}

.progress-bar-container {
  display: flex;
  align-items: center;
  gap: 1rem;
  margin-bottom: 2rem;
}

.progress-bar {
  flex: 1;
  height: 8px;
  background: var(--color-bg-tertiary);
  border-radius: 999px;
  overflow: hidden;
}

.progress-bar-fill {
  height: 100%;
  background: var(--color-primary);
  transition: width 0.3s ease;
}

.progress-percentage {
  font-weight: 600;
  min-width: 3ch;
}

.progress-milestone {
  margin-bottom: 2rem;
}

.progress-milestone h3 {
  margin: 0 0 1rem 0;
}

.progress-details {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 0.5rem;
}

.progress-detail-item {
  display: flex;
  justify-content: space-between;
  padding: 0.5rem;
  background: var(--color-bg-secondary);
  border-radius: var(--border-radius);
}

.progress-detail-key {
  color: var(--color-text-secondary);
}

.progress-detail-value {
  font-weight: 600;
}

.progress-timeline {
  margin-bottom: 2rem;
}

.timeline {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.timeline-item {
  display: flex;
  gap: 0.75rem;
  opacity: 0.5;
}

.timeline-item.completed {
  opacity: 1;
}

.timeline-item.current {
  opacity: 1;
  font-weight: 600;
}

.timeline-marker {
  width: 20px;
  height: 20px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.timeline-content {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex: 1;
}

.timeline-time {
  font-size: 0.75rem;
  color: var(--color-text-secondary);
}

.progress-stats {
  display: flex;
  gap: 2rem;
  padding: 1rem;
  background: var(--color-bg-secondary);
  border-radius: var(--border-radius);
}

.progress-stat {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.progress-stat-label {
  font-size: 0.75rem;
  color: var(--color-text-secondary);
}

.progress-stat-value {
  font-size: 1.5rem;
  font-weight: 600;
}

.progress-modal-footer {
  display: flex;
  justify-content: space-between;
}

/* Form Modal */
.automation-form-modal {
  max-width: 700px;
  max-height: 90vh;
  overflow-y: auto;
}

.form-group {
  margin-bottom: 1rem;
}

.form-group label {
  display: block;
  margin-bottom: 0.375rem;
  font-weight: 500;
}

.form-group input,
.form-group select,
.form-group textarea {
  width: 100%;
  padding: 0.5rem 0.75rem;
  border: 1px solid var(--color-border);
  border-radius: var(--border-radius);
  font-size: 0.875rem;
}

.form-group input.error,
.form-group select.error {
  border-color: var(--color-error);
}

.error-message {
  display: block;
  margin-top: 0.25rem;
  font-size: 0.75rem;
  color: var(--color-error);
}

.help-text {
  display: block;
  margin-top: 0.25rem;
  font-size: 0.75rem;
  color: var(--color-text-secondary);
}

.form-row {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 1rem;
}

.checkbox-group {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.checkbox-group label {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-weight: 400;
}

.checkbox-group input[type="checkbox"] {
  width: auto;
}

fieldset {
  margin-bottom: 1.5rem;
  padding: 1rem;
  border: 1px solid var(--color-border);
  border-radius: var(--border-radius);
}

fieldset legend {
  font-weight: 600;
  padding: 0 0.5rem;
}

fieldset.nested {
  margin-left: 0;
  margin-right: 0;
  padding-left: 0.5rem;
  border-left: 2px solid var(--color-border);
  border-top: none;
  border-right: none;
  border-bottom: none;
}

.form-actions {
  display: flex;
  justify-content: flex-end;
  gap: 0.5rem;
  margin-top: 2rem;
}

/* Empty State */
.automations-empty {
  text-align: center;
  padding: 4rem 2rem;
}

.automations-empty h2 {
  margin: 1rem 0 0.5rem 0;
}

.automations-empty p {
  color: var(--color-text-secondary);
  margin-bottom: 2rem;
}
```

## Component Reusability

### Common UI Patterns

The Automations UI should follow these Clawdbrain UI patterns:

1. **Modals:** Use existing modal components and overlay styles
2. **Toasts:** Use existing toast system for notifications
3. **Buttons:** Follow existing button style conventions (primary, secondary, danger, icon-only)
4. **Forms:** Use existing form input styles and validation patterns
5. **Loading States:** Use existing skeleton components
6. **Icons:** Use existing icon library or add new icons following the same pattern

### Shared Components

These components from `automation-form.tsx` should be extracted as reusable:

- **ScheduleEditor:** Generic cron/interval/at schedule input
- **RepoInput:** Git repository URL input with validation
- **ConfidenceSlider:** Slider with percentage display and help text
- **UncertaintySelector:** Dropdown with descriptions for each option

## Real-time Updates

### Server-Sent Events (SSE)

For real-time progress updates, the UI uses Server-Sent Events:

```typescript
// In progress modal or automation card
useEffect(() => {
  if (!activeProgress) return;

  const eventSource = automationsController.streamProgress(
    activeProgress.automationId,
    (progress) => {
      // Update state with new progress
      setActiveProgress((prev) => ({
        ...prev,
        progress,
      }));
    },
  );

  return () => {
    eventSource.close();
  };
}, [activeProgress?.automationId]);
```

### Polling Fallback

If SSE is not available, fall back to polling:

```typescript
useEffect(() => {
  if (!activeProgress) return;

  const interval = setInterval(async () => {
    const progress = await automationsController.getProgress(activeProgress.automationId);
    setActiveProgress(progress);

    if (progress.status !== "running") {
      clearInterval(interval);
    }
  }, 2000); // Poll every 2 seconds

  return () => clearInterval(interval);
}, [activeProgress?.automationId]);
```

## Responsive Design

The Automations UI should be responsive:

- **Desktop (>1200px):** 3-column grid for automation cards
- **Tablet (768-1200px):** 2-column grid
- **Mobile (<768px):** Single column, stacked form fields

## Accessibility

- Keyboard navigation for all interactive elements
- ARIA labels for icons without text
- Focus management in modals
- Screen reader announcements for progress updates
- High contrast mode support

## Future Enhancements

### Phase 2 Features

- **Dashboard View:** Aggregate statistics and health overview
- **Bulk Actions:** Enable/disable/delete multiple automations
- **Import/Export:** Share automation configurations
- **Templates:** Pre-built automation templates for common workflows
- **Advanced Filters:** Filter by status, type, schedule, last run time
- **Drag & Drop:** Reorder automation priority
- **Diff View:** See what changed in each run

### Phase 3 Features

- **Custom Metrics:** User-defined metrics and dashboards
- **Alert Rules:** Custom alert conditions and thresholds
- **Webhooks:** External notifications on automation events
- **Schedule Builder:** Visual cron expression builder
- **Comparison:** Compare runs side-by-side
- **Rollback:** Revert to previous automation state

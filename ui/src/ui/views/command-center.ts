import { html, nothing } from "lit";
import type { AppViewState } from "../app-view-state.ts";
import type { IconName } from "../icons.ts";
import { icons } from "../icons.ts";
import { restartGateway } from "../controllers/gateway.ts";
import { runUpdate } from "../controllers/config.ts";

type CommandAction = {
  id: string;
  title: string;
  description: string;
  icon: IconName;
  // Display only. Keyboard handling is centralized in this modal.
  shortcut?: string;
  // Default true. Some actions (copy-to-clipboard, etc.) keep the palette open.
  closeOnRun?: boolean;
  enabled?: boolean;
  keywords?: string[];
  run: () => void | Promise<void>;
};

function normalizeQuery(raw: string): string {
  return raw.trim().toLowerCase();
}

function scoreAction(action: CommandAction, query: string): number {
  if (!query) {
    return 0;
  }
  const hay = [
    action.title,
    action.description,
    ...(action.keywords ?? []),
    action.id.replaceAll(".", " "),
  ]
    .join(" ")
    .toLowerCase();
  if (hay.includes(query)) {
    // Prefer prefix matches on the title.
    const title = action.title.toLowerCase();
    if (title.startsWith(query)) {
      return 100;
    }
    if (title.includes(query)) {
      return 80;
    }
    return 60;
  }
  return -1;
}

async function copyTextToClipboard(text: string): Promise<boolean> {
  if (!text) {
    return false;
  }
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

function isActionDisabled(action: CommandAction): boolean {
  return action.enabled === false;
}

function renderShortcut(value?: string) {
  if (!value) {
    return nothing;
  }
  return html`<span class="command-center__kbd" aria-hidden="true">${value}</span>`;
}

function renderActionIcon(name: IconName) {
  const icon = icons[name];
  return html`<span class="command-center__item-icon" aria-hidden="true">${icon}</span>`;
}

function resolveActions(state: AppViewState): CommandAction[] {
  const basePath = state.basePath;
  const connected = state.connected;
  const canRestart = connected; // Gateway may still reject if commands.restart=false; that's ok.
  const canUpdate = connected && !state.updateRunning;
  const canDesktopUninstall = Boolean(window.openclawDesktop?.gatewayUninstall);
  const canLegacyServiceControl = Boolean(
    window.openclawDesktop?.legacyGatewayStop && window.openclawDesktop?.legacyGatewayUninstall,
  );

  return [
    {
      id: "nav.chat",
      title: "Chat",
      description: "Send a message and switch per-session settings.",
      icon: "messageSquare",
      shortcut: "G C",
      keywords: ["model", "thinking", "reasoning", "session"],
      run: () => state.setTab("chat"),
    },
    {
      id: "nav.overview",
      title: "Overview",
      description: "Gateway status, quick actions, and health hints.",
      icon: "barChart",
      shortcut: "G O",
      run: () => state.setTab("overview"),
    },
    {
      id: "nav.config",
      title: "Config",
      description: "Edit ~/.openclaw/openclaw.json safely.",
      icon: "settings",
      shortcut: "G ,",
      keywords: ["json", "gateway", "channels", "skills"],
      run: () => state.setTab("config"),
    },
    {
      id: "nav.skills",
      title: "Skills",
      description: "Enable skills and manage API keys/env overrides.",
      icon: "zap",
      shortcut: "G S",
      keywords: ["clawhub", "marketplace", "registry"],
      run: () => state.setTab("skills"),
    },
    {
      id: "nav.channels",
      title: "Channels",
      description: "Manage Feishu/Telegram/Discord/etc.",
      icon: "link",
      shortcut: "G H",
      keywords: ["feishu", "lark", "telegram", "discord", "slack", "whatsapp"],
      run: () => state.setTab("channels"),
    },
    {
      id: "nav.sessions",
      title: "Sessions",
      description: "Inspect active sessions and overrides.",
      icon: "fileText",
      shortcut: "G J",
      keywords: ["model", "tokens", "reset"],
      run: () => state.setTab("sessions"),
    },
    {
      id: "nav.logs",
      title: "Logs",
      description: "Tail gateway logs for debugging.",
      icon: "scrollText",
      shortcut: "G L",
      keywords: ["errors", "tail"],
      run: () => state.setTab("logs"),
    },
    {
      id: "gateway.restart",
      title: "Restart gateway",
      description: "In-place restart (SIGUSR1); dashboard reconnects automatically.",
      icon: "refreshCw",
      shortcut: "R R",
      enabled: canRestart,
      keywords: ["restart", "reload", "daemon"],
      run: async () => {
        await restartGateway(state, { reason: "command-center" });
      },
    },
    {
      id: "gateway.update",
      title: "Run update",
      description: "Pull latest and restart gateway (update.run).",
      icon: "download",
      shortcut: "U U",
      enabled: canUpdate,
      keywords: ["upgrade", "sync", "channel"],
      run: async () => {
        await runUpdate(state);
      },
    },
    {
      id: "gateway.uninstall",
      title: "Remove gateway data…",
      description: "Desktop only: stop embedded gateway and remove its local state/config.",
      icon: "trash2",
      shortcut: "X X",
      enabled: canDesktopUninstall,
      keywords: ["remove", "cleanup", "卸载"],
      run: async () => {
        const api = window.openclawDesktop;
        if (!api?.gatewayUninstall) {
          return;
        }
        await api.gatewayUninstall({});
      },
    },
    {
      id: "legacy.gateway.stop",
      title: "Stop legacy gateway service…",
      description: "Desktop only: stop an older system-installed OpenClaw gateway service.",
      icon: "x",
      enabled: canLegacyServiceControl,
      keywords: ["old", "legacy", "service", "daemon", "旧版", "老版本"],
      run: async () => {
        const api = window.openclawDesktop;
        if (!api?.legacyGatewayStop) {
          return;
        }
        await api.legacyGatewayStop();
      },
    },
    {
      id: "legacy.gateway.uninstall",
      title: "Uninstall legacy gateway service…",
      description: "Desktop only: uninstall an older system-installed gateway service.",
      icon: "trash2",
      enabled: canLegacyServiceControl,
      keywords: ["old", "legacy", "service", "daemon", "卸载", "旧版"],
      run: async () => {
        const api = window.openclawDesktop;
        if (!api?.legacyGatewayUninstall) {
          return;
        }
        await api.legacyGatewayUninstall();
      },
    },
    {
      id: "help.docs.zh",
      title: "Docs (zh-CN)",
      description: "Open the Chinese documentation site in a new tab.",
      icon: "book",
      shortcut: "D Z",
      keywords: ["help", "中文", "文档"],
      run: () => window.open("https://docs.openclaw.ai/zh-CN/index", "_blank", "noreferrer"),
    },
    {
      id: "help.clawhub",
      title: "Skills marketplace",
      description: "Open ClawHub (skill registry) in a new tab.",
      icon: "globe",
      shortcut: "M K",
      keywords: ["market", "registry", "skills"],
      run: () => window.open("https://clawhub.com", "_blank", "noreferrer"),
    },
    {
      id: "copy.doctor",
      title: "Copy: openclaw doctor",
      description: "Copy the diagnostic command to clipboard.",
      icon: "copy",
      shortcut: "C D",
      closeOnRun: false,
      keywords: ["diagnose", "health", "proxy", "network"],
      run: async () => {
        const ok = await copyTextToClipboard("openclaw doctor");
        state.commandCenterNotice = ok ? "Copied" : "Copy failed";
        window.setTimeout(() => {
          state.commandCenterNotice = null;
        }, 1500);
      },
    },
    {
      id: "copy.dashboard",
      title: "Copy: openclaw dashboard --no-open",
      description: "Copy a tokenized dashboard URL helper command.",
      icon: "copy",
      closeOnRun: false,
      keywords: ["token", "gatewayUrl", "web"],
      run: async () => {
        const ok = await copyTextToClipboard("openclaw dashboard --no-open");
        state.commandCenterNotice = ok ? "Copied" : "Copy failed";
        window.setTimeout(() => {
          state.commandCenterNotice = null;
        }, 1500);
      },
    },
    {
      id: "copy.uninstall",
      title: "Copy: openclaw uninstall --service --state --yes --non-interactive",
      description: "Copy the safe uninstall command (keeps external workspaces).",
      icon: "copy",
      closeOnRun: false,
      keywords: ["uninstall", "remove", "cleanup", "卸载"],
      run: async () => {
        const ok = await copyTextToClipboard(
          "openclaw uninstall --service --state --yes --non-interactive",
        );
        state.commandCenterNotice = ok ? "Copied" : "Copy failed";
        window.setTimeout(() => {
          state.commandCenterNotice = null;
        }, 1500);
      },
    },
    {
      id: "copy.gateway.stop",
      title: "Copy: openclaw gateway stop",
      description: "Copy the command to stop a system-installed gateway service.",
      icon: "copy",
      closeOnRun: false,
      keywords: ["gateway", "stop", "service", "旧版", "老版本"],
      run: async () => {
        const ok = await copyTextToClipboard("openclaw gateway stop");
        state.commandCenterNotice = ok ? "Copied" : "Copy failed";
        window.setTimeout(() => {
          state.commandCenterNotice = null;
        }, 1500);
      },
    },
    {
      id: "copy.gateway.uninstall",
      title: "Copy: openclaw gateway uninstall",
      description: "Copy the command to uninstall a system-installed gateway service.",
      icon: "copy",
      closeOnRun: false,
      keywords: ["gateway", "uninstall", "service", "旧版", "老版本", "卸载"],
      run: async () => {
        const ok = await copyTextToClipboard("openclaw gateway uninstall");
        state.commandCenterNotice = ok ? "Copied" : "Copy failed";
        window.setTimeout(() => {
          state.commandCenterNotice = null;
        }, 1500);
      },
    },
    {
      id: "copy.uninstall.all",
      title: "Copy: openclaw uninstall --all --yes --non-interactive",
      description: "Copy the full uninstall command (service + state + workspaces).",
      icon: "copy",
      closeOnRun: false,
      keywords: ["uninstall", "remove", "cleanup", "卸载"],
      run: async () => {
        const ok = await copyTextToClipboard("openclaw uninstall --all --yes --non-interactive");
        state.commandCenterNotice = ok ? "Copied" : "Copy failed";
        window.setTimeout(() => {
          state.commandCenterNotice = null;
        }, 1500);
      },
    },
  ];
}

function resolveFilteredActions(state: AppViewState): CommandAction[] {
  const query = normalizeQuery(state.commandCenterQuery);
  const actions = resolveActions(state)
    .map((action) => ({ action, score: scoreAction(action, query) }))
    .filter((row) => (query ? row.score >= 0 : true))
    .sort((a, b) => b.score - a.score || a.action.title.localeCompare(b.action.title))
    .map((row) => row.action);
  return actions;
}

export function renderCommandCenter(state: AppViewState) {
  if (!state.commandCenterOpen) {
    return nothing;
  }

  const actions = resolveFilteredActions(state);
  const selectedIndex = Math.min(Math.max(0, state.commandCenterSelectedIndex), actions.length - 1);

  // Keep selection stable as the query changes.
  if (state.commandCenterSelectedIndex !== selectedIndex) {
    state.commandCenterSelectedIndex = selectedIndex;
  }

  const selected = actions[selectedIndex] ?? null;

  const onClose = () => {
    state.commandCenterOpen = false;
    state.commandCenterQuery = "";
    state.commandCenterSelectedIndex = 0;
    state.commandCenterNotice = null;
  };

  const runSelected = async () => {
    if (!selected || isActionDisabled(selected)) {
      return;
    }
    try {
      await selected.run();
    } finally {
      if (selected.closeOnRun !== false) {
        onClose();
      }
    }
  };

  return html`
    <div
      class="command-center-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="Command center"
      @click=${(e: MouseEvent) => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
      @keydown=${(e: KeyboardEvent) => {
        if (e.key === "Escape") {
          e.preventDefault();
          onClose();
          return;
        }
        if (e.key === "ArrowDown") {
          e.preventDefault();
          state.commandCenterSelectedIndex = Math.min(
            actions.length - 1,
            state.commandCenterSelectedIndex + 1,
          );
          return;
        }
        if (e.key === "ArrowUp") {
          e.preventDefault();
          state.commandCenterSelectedIndex = Math.max(0, state.commandCenterSelectedIndex - 1);
          return;
        }
        if (e.key === "Enter") {
          e.preventDefault();
          void runSelected();
        }
      }}
    >
      <div class="command-center-card">
        <div class="command-center__top">
          <div class="command-center__brand">
            <span class="command-center__brand-dot" aria-hidden="true"></span>
            <div>
              <div class="command-center__title">Command Center</div>
              <div class="command-center__subtitle">
                ${state.connected ? "Connected" : "Disconnected"}
                ${state.commandCenterNotice ? html` · ${state.commandCenterNotice}` : nothing}
              </div>
            </div>
          </div>
          <button class="btn btn--sm" type="button" @click=${onClose}>Close</button>
        </div>

        <div class="command-center__search">
          <span class="command-center__search-icon" aria-hidden="true">${icons.search}</span>
          <input
            id="command-center-search"
            placeholder="Search actions, settings, models, skills…"
            .value=${state.commandCenterQuery}
            @input=${(e: Event) => {
              state.commandCenterQuery = (e.target as HTMLInputElement).value;
              state.commandCenterSelectedIndex = 0;
            }}
          />
          <span class="command-center__hint" aria-hidden="true">
            <span class="command-center__kbd">↑</span>
            <span class="command-center__kbd">↓</span>
            <span class="command-center__kbd">Enter</span>
            <span class="command-center__kbd">Esc</span>
          </span>
        </div>

        <div class="command-center__list" role="listbox" aria-label="Actions">
          ${
            actions.length === 0
              ? html`<div class="command-center__empty">No matches.</div>`
              : actions.map((action, idx) => {
                  const active = idx === selectedIndex;
                  const disabled = isActionDisabled(action);
                  return html`
                    <button
                      type="button"
                      class="command-center__item ${active ? "is-active" : ""}"
                      role="option"
                      aria-selected=${active ? "true" : "false"}
                      ?disabled=${disabled}
                      @mouseenter=${() => (state.commandCenterSelectedIndex = idx)}
                      @click=${async () => {
                        if (disabled) {
                          return;
                        }
                        await action.run();
                        if (action.closeOnRun !== false) {
                          onClose();
                        }
                      }}
                    >
                      ${renderActionIcon(action.icon)}
                      <span class="command-center__item-main">
                        <span class="command-center__item-title">${action.title}</span>
                        <span class="command-center__item-desc">${action.description}</span>
                      </span>
                      <span class="command-center__item-meta">
                        ${disabled ? html`<span class="command-center__pill">disabled</span>` : nothing}
                        ${renderShortcut(action.shortcut)}
                      </span>
                    </button>
                  `;
                })
          }
        </div>
      </div>
    </div>
  `;
}

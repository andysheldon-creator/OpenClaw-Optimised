import { html, nothing } from "lit";
import type { ProgressModalState, AutomationRunMilestone } from "../controllers/automations";
import { icon } from "../icons";

type MilestoneStatus = AutomationRunMilestone["status"];

export interface ProgressModalProps {
  state: ProgressModalState;
  onClose: () => void;
  onJumpToChat: () => void;
  onCancel: () => void;
}

function getMilestoneStatusIcon(status: MilestoneStatus) {
  switch (status) {
    case "completed":
      return html`${icon("check-circle", { size: 20, class: "text-ok" })}`;
    case "current":
      return html`${icon("loader", { size: 20, class: "text-accent animate-spin" })}`;
    case "pending":
      return html`
        <div class="milestone-icon milestone-icon--pending"></div>
      `;
  }
}

function getMilestoneStatusColor(status: MilestoneStatus): string {
  switch (status) {
    case "completed":
      return "text-ok";
    case "current":
      return "text-accent";
    case "pending":
      return "text-muted-foreground";
  }
}

function renderTimelineItem(
  milestone: AutomationRunMilestone,
  index: number,
  allMilestones: AutomationRunMilestone[],
) {
  const statusColor = getMilestoneStatusColor(milestone.status);

  return html`
    <div class="timeline-item">
      <div class="timeline-item__icon">
        ${getMilestoneStatusIcon(milestone.status)}
      </div>
      ${
        index < allMilestones.length - 1
          ? html`
            <div class="timeline-item__line ${
              milestone.status === "completed" ? "timeline-item__line--completed" : ""
            }"></div>
          `
          : nothing
      }
      <div class="timeline-item__content">
        <div class="timeline-item__title ${statusColor}">${milestone.title}</div>
        ${
          milestone.timestamp
            ? html`<div class="timeline-item__timestamp">${milestone.timestamp}</div>`
            : nothing
        }
        ${
          milestone.status === "current"
            ? html`
                <div class="timeline-item__status">Processing...</div>
              `
            : nothing
        }
      </div>
    </div>
  `;
}

export function renderProgressModal(props: ProgressModalProps) {
  const { state, onClose, onJumpToChat, onCancel } = props;

  if (!state.isOpen) return nothing;

  const isRunning = state.status === "running";
  const isComplete =
    state.status === "complete" || state.status === "failed" || state.status === "cancelled";

  return html`
    <div class="modal-overlay" @click=${onClose}>
      <div class="modal modal--large" @click=${(e: Event) => e.stopPropagation()}>
        <!-- Header -->
        <div class="modal-header">
          <div class="modal-header__left">
            <div class="modal-header__icon">
              ${icon(
                isRunning
                  ? "loader"
                  : isComplete && state.status === "complete"
                    ? "check"
                    : state.status === "failed"
                      ? "x-circle"
                      : "info",
                {
                  size: 24,
                  class: isRunning ? "animate-spin" : "",
                },
              )}
            </div>
            <div>
              <h2 class="modal-title">${state.automationName}</h2>
              <p class="modal-subtitle">
                ${
                  state.status === "running"
                    ? "Execution in progress"
                    : state.status === "complete"
                      ? "Completed successfully"
                      : state.status === "failed"
                        ? "Execution failed"
                        : state.status === "cancelled"
                          ? "Cancelled"
                          : "Automation"
                }
              </p>
            </div>
          </div>
          <button class="modal-close" @click=${onClose} aria-label="Close">
            ${icon("x", { size: 20 })}
          </button>
        </div>

        <!-- Progress Section -->
        <div class="progress-section">
          <div class="progress-header">
            <div class="progress-header__label">${state.currentMilestone}</div>
            <div class="progress-header__percentage">${state.progress}%</div>
          </div>
          <div class="progress-bar">
            <div class="progress-bar__fill" style="width: ${state.progress}%"></div>
          </div>
        </div>

        <!-- Timeline -->
        <div class="timeline-section">
          <h3 class="timeline-section__title">Execution Timeline</h3>
          <div class="timeline">
            ${state.milestones.map((milestone, index) =>
              renderTimelineItem(milestone, index, state.milestones),
            )}
          </div>
        </div>

        <!-- Statistics -->
        <div class="stats-grid">
          <div class="stat-card">
            <div class="stat-card__icon">${icon("clock", { size: 18 })}</div>
            <div class="stat-card__content">
              <div class="stat-card__label">Elapsed Time</div>
              <div class="stat-card__value">${state.elapsedTime}</div>
            </div>
          </div>
          <div class="stat-card">
            <div class="stat-card__icon">${icon("alert-triangle", { size: 18 })}</div>
            <div class="stat-card__content">
              <div class="stat-card__label">Conflicts</div>
              <div class="stat-card__value">${state.conflicts}</div>
            </div>
          </div>
        </div>

        <!-- Actions -->
        <div class="modal-footer">
          <button
            class="btn btn-primary"
            @click=${onJumpToChat}
          >
            ${icon("message-square", { size: 16 })}
            Jump to Chat
          </button>
          ${
            isRunning
              ? html`
                <button class="btn btn-secondary" @click=${onCancel}>
                  Cancel
                </button>
              `
              : html`
                <button class="btn btn-secondary" @click=${onClose}>
                  Close
                </button>
              `
          }
        </div>
      </div>
    </div>

    <style>
      .modal-overlay {
        position: fixed;
        inset: 0;
        z-index: 100;
        background: rgba(0, 0, 0, 0.8);
        animation: fadeIn 0.2s ease-out;
      }

      .modal--large {
        max-width: 600px;
        width: 90vw;
        max-height: 90vh;
        overflow-y: auto;
      }

      @keyframes fadeIn {
        from { opacity: 0; }
        to { opacity: 1; }
      }

      @keyframes spin {
        from { transform: rotate(0deg); }
        to { transform: rotate(360deg); }
      }

      .animate-spin {
        animation: spin 1s linear infinite;
      }

      .timeline-item__icon {
        width: 24px;
        height: 24px;
        display: flex;
        align-items: center;
        justify-content: center;
        flex-shrink: 0;
      }

      .milestone-icon {
        width: 16px;
        height: 16px;
        border-radius: 50%;
        border: 2px solid var(--border);
      }

      .milestone-icon--pending {
        background: var(--bg-overlay);
      }

      .timeline-item__line {
        width: 2px;
        margin-left: 11px;
        flex-grow: 1;
        background: var(--border);
      }

      .timeline-item__line--completed {
        background: var(--ok);
      }
    </style>
  `;
}

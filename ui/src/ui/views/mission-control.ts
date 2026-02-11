import { html, nothing } from "lit";
import type { MissionControlJob } from "../controllers/mission-control.ts";

const COLUMNS = [
  { id: "pending", label: "Pending", color: "#fbbf24" },
  { id: "running", label: "In Progress", color: "#60a5fa" },
  { id: "review", label: "Review", color: "#a78bfa" },
  { id: "revising", label: "Revising", color: "#fb923c" },
  { id: "done", label: "Done", color: "#34d399" },
  { id: "failed", label: "Failed", color: "#f87171" },
] as const;

export type MissionControlFormState = {
  title: string;
  description: string;
  priority: string;
  tags: string;
};

type MissionControlViewProps = {
  loading: boolean;
  tasks: MissionControlJob[];
  error: string | null;
  form: MissionControlFormState;
  onRefresh: () => void;
  onFormChange: (patch: Partial<MissionControlFormState>) => void;
  onCreate: () => void;
  onDeleteTask: (id: string) => void;
};

function getTasksByStatus(tasks: MissionControlJob[], status: string): MissionControlJob[] {
  // Map "success" to "done" for backward compatibility
  if (status === "done") {
    return tasks.filter((t) => t.status === "done" || t.status === "success");
  }
  return tasks.filter((t) => t.status === status);
}

function formatDate(ts: number): string {
  return new Date(ts).toLocaleString();
}

export function renderMissionControl(props: MissionControlViewProps) {
  const { loading, tasks, error, form, onRefresh, onFormChange, onCreate, onDeleteTask } = props;

  return html`
    <div class="mission-control">
      <div class="page-actions">
        <button class="btn btn-primary" @click=${onRefresh} ?disabled=${loading}>
          ${loading ? "Loading..." : "Refresh"}
        </button>
      </div>

      ${
        error
          ? html`
            <div class="error-banner">
              <span>⚠️ ${error}</span>
            </div>
          `
          : nothing
      }

      ${
        loading && tasks.length === 0
          ? html`
              <div class="loading-spinner">
                <div class="spinner"></div>
                <span>Loading missions...</span>
              </div>
            `
          : html`
            <div class="kanban-board">
              ${COLUMNS.map(
                (col) => html`
                  <div class="kanban-column">
                    <h3 class="kanban-column-header" style="color: ${col.color}">
                      ${col.label}
                      <span class="kanban-count">${getTasksByStatus(tasks, col.id).length}</span>
                    </h3>
                    <div class="kanban-cards">
                      ${getTasksByStatus(tasks, col.id).map(
                        (task) => html`
                          <div class="kanban-card">
                            <div class="kanban-card-title">${task.title}</div>
                            ${
                              task.description
                                ? html`
                                  <div class="kanban-card-desc">
                                    ${task.description.slice(0, 100)}${
                                      task.description.length > 100 ? "..." : ""
                                    }
                                  </div>
                                `
                                : nothing
                            }
                            <div class="kanban-card-meta">
                              Created: ${formatDate(task.created_at)}
                            </div>
                            ${
                              task.result_summary
                                ? html`
                                  <div class="kanban-card-result">
                                    ${task.result_summary.slice(0, 50)}
                                  </div>
                                `
                                : nothing
                            }
                            <div class="kanban-card-actions">
                              <button
                                class="btn btn-sm btn-danger"
                                @click=${() => onDeleteTask(task.id)}
                                title="Delete task"
                              >
                                🗑️ Delete
                              </button>
                            </div>
                          </div>
                        `,
                      )}
                    </div>
                  </div>
                `,
              )}
            </div>
          `
      }
    </div>
  `;
}

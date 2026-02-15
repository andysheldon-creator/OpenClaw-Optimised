import { html, nothing } from "lit";

import type { Task, TaskFormState, TaskStep } from "../controllers/tasks";

// ── Props ─────────────────────────────────────────────────────────────────────

export type TasksProps = {
  loading: boolean;
  tasks: Task[];
  error: string | null;
  filter: string;
  form: TaskFormState;
  busy: boolean;
  detail: Task | null;
  onFilterChange: (next: string) => void;
  onFormChange: (patch: Partial<TaskFormState>) => void;
  onRefresh: () => void;
  onCreate: () => void;
  onCancel: (taskId: string) => void;
  onPause: (taskId: string) => void;
  onResume: (taskId: string) => void;
  onViewDetail: (taskId: string) => void;
  onCloseDetail: () => void;
};

// ── Main Render ───────────────────────────────────────────────────────────────

export function renderTasks(props: TasksProps) {
  const filtered = filterTasks(props.tasks, props.filter);
  const counts = countByStatus(props.tasks);

  return html`
    ${props.detail ? renderDetail(props) : nothing}

    <section class="card">
      <div class="row" style="justify-content: space-between;">
        <div>
          <div class="card-title">Tasks</div>
          <div class="card-sub">Create and monitor autonomous multi-step tasks.</div>
        </div>
        <button class="btn" ?disabled=${props.loading} @click=${props.onRefresh}>
          ${props.loading ? "Loading\u2026" : "Refresh"}
        </button>
      </div>

      ${renderStatusBar(counts)}

      ${props.error
        ? html`<div class="callout danger" style="margin-top: 12px;">${props.error}</div>`
        : nothing}
    </section>

    ${renderCreateForm(props)}

    <section class="card">
      <div class="row" style="justify-content: space-between; margin-bottom: 12px;">
        <div class="card-title">Task List</div>
        <input
          type="text"
          class="input"
          placeholder="Filter by name\u2026"
          style="max-width: 240px;"
          .value=${props.filter}
          @input=${(e: Event) => props.onFilterChange((e.target as HTMLInputElement).value)}
        />
      </div>

      <div class="list">
        ${filtered.length === 0
          ? html`<div class="muted">No tasks found.</div>`
          : filtered.map((t) => renderTaskRow(t, props))}
      </div>
    </section>
  `;
}

// ── Status Summary Bar ────────────────────────────────────────────────────────

function renderStatusBar(counts: Record<string, number>) {
  return html`
    <div class="chip-row" style="margin-top: 12px; gap: 8px;">
      <span class="chip">Total: ${counts.total}</span>
      ${counts.in_progress > 0
        ? html`<span class="chip chip-ok">Running: ${counts.in_progress}</span>`
        : nothing}
      ${counts.pending > 0
        ? html`<span class="chip">Pending: ${counts.pending}</span>`
        : nothing}
      ${counts.completed > 0
        ? html`<span class="chip chip-ok">Done: ${counts.completed}</span>`
        : nothing}
      ${counts.failed > 0
        ? html`<span class="chip chip-warn">Failed: ${counts.failed}</span>`
        : nothing}
      ${counts.paused > 0
        ? html`<span class="chip">Paused: ${counts.paused}</span>`
        : nothing}
    </div>
  `;
}

// ── Create Form ───────────────────────────────────────────────────────────────

function renderCreateForm(props: TasksProps) {
  return html`
    <section class="card">
      <div class="card-title">New Task</div>
      <div class="card-sub" style="margin-bottom: 12px;">
        Define a multi-step task for autonomous execution.
      </div>

      <div class="field">
        <label>Name</label>
        <input
          type="text"
          class="input"
          placeholder="e.g. Refactor auth module"
          .value=${props.form.name}
          @input=${(e: Event) =>
            props.onFormChange({ name: (e.target as HTMLInputElement).value })}
        />
      </div>

      <div class="field">
        <label>Description</label>
        <input
          type="text"
          class="input"
          placeholder="Optional detailed description"
          .value=${props.form.description}
          @input=${(e: Event) =>
            props.onFormChange({ description: (e.target as HTMLInputElement).value })}
        />
      </div>

      <div class="field">
        <label>Steps (one per line)</label>
        <textarea
          class="input"
          rows="5"
          placeholder="Analyse the current code structure\nIdentify areas for improvement\nImplement changes\nWrite tests"
          .value=${props.form.steps}
          @input=${(e: Event) =>
            props.onFormChange({ steps: (e.target as HTMLTextAreaElement).value })}
        ></textarea>
      </div>

      <button
        class="btn primary"
        ?disabled=${props.busy || !props.form.name.trim() || !props.form.steps.trim()}
        @click=${props.onCreate}
      >
        ${props.busy ? "Creating\u2026" : "Create Task"}
      </button>
    </section>
  `;
}

// ── Task Row ──────────────────────────────────────────────────────────────────

function renderTaskRow(task: Task, props: TasksProps) {
  const completedSteps = task.steps.filter((s) => s.status === "completed").length;
  const progress = task.steps.length > 0
    ? Math.round((completedSteps / task.steps.length) * 100)
    : 0;
  const statusChip = statusToChip(task.status);

  return html`
    <div class="list-item">
      <div class="list-main" style="flex: 1;">
        <div class="list-title" style="cursor: pointer;" @click=${() => props.onViewDetail(task.id)}>
          ${task.name}
        </div>
        <div class="list-sub">
          ${task.description !== task.name ? task.description : ""}
        </div>
        <div class="chip-row" style="margin-top: 6px; gap: 6px;">
          <span class="chip ${statusChip.cls}">${statusChip.label}</span>
          <span class="chip">${completedSteps}/${task.steps.length} steps</span>
          <span class="chip">${progress}%</span>
          <span class="chip">${formatAge(task.createdAtMs)}</span>
        </div>

        ${task.status === "in_progress" ? html`
          <div style="margin-top: 8px; background: var(--bg-2, #1a1a2e); border-radius: 4px; height: 6px; overflow: hidden;">
            <div style="width: ${progress}%; height: 100%; background: var(--accent, #4ade80); transition: width 0.3s;"></div>
          </div>
        ` : nothing}
      </div>

      <div class="list-meta" style="display: flex; gap: 6px; flex-shrink: 0;">
        ${task.status === "in_progress" || task.status === "pending"
          ? html`
              <button class="btn" style="font-size: 12px;" ?disabled=${props.busy}
                @click=${() => props.onPause(task.id)}>Pause</button>
              <button class="btn danger" style="font-size: 12px;" ?disabled=${props.busy}
                @click=${() => props.onCancel(task.id)}>Cancel</button>
            `
          : nothing}
        ${task.status === "paused"
          ? html`
              <button class="btn primary" style="font-size: 12px;" ?disabled=${props.busy}
                @click=${() => props.onResume(task.id)}>Resume</button>
              <button class="btn danger" style="font-size: 12px;" ?disabled=${props.busy}
                @click=${() => props.onCancel(task.id)}>Cancel</button>
            `
          : nothing}
      </div>
    </div>
  `;
}

// ── Task Detail View ──────────────────────────────────────────────────────────

function renderDetail(props: TasksProps) {
  const task = props.detail;
  if (!task) return nothing;

  return html`
    <section class="card">
      <div class="row" style="justify-content: space-between;">
        <div>
          <div class="card-title">${task.name}</div>
          <div class="card-sub">${task.description}</div>
        </div>
        <button class="btn" @click=${props.onCloseDetail}>Close</button>
      </div>

      <div class="chip-row" style="margin-top: 12px; gap: 8px;">
        <span class="chip ${statusToChip(task.status).cls}">${statusToChip(task.status).label}</span>
        <span class="chip">Created: ${formatDate(task.createdAtMs)}</span>
        ${task.completedAtMs
          ? html`<span class="chip">Completed: ${formatDate(task.completedAtMs)}</span>`
          : nothing}
      </div>

      ${task.finalSummary
        ? html`<div class="callout" style="margin-top: 12px; white-space: pre-wrap;">${task.finalSummary}</div>`
        : nothing}

      <div class="card-title" style="margin-top: 16px; font-size: 14px;">Steps</div>
      <div class="list" style="margin-top: 8px;">
        ${task.steps.map((step) => renderStepRow(step))}
      </div>
    </section>
  `;
}

function renderStepRow(step: TaskStep) {
  const statusChip = stepStatusToChip(step.status);
  return html`
    <div class="list-item" style="padding: 8px 0;">
      <div class="list-main">
        <div class="list-title" style="font-size: 13px;">
          Step ${step.index + 1}: ${step.description}
        </div>
        <div class="chip-row" style="margin-top: 4px; gap: 4px;">
          <span class="chip ${statusChip.cls}" style="font-size: 11px;">${statusChip.label}</span>
          ${step.retryCount
            ? html`<span class="chip" style="font-size: 11px;">Retries: ${step.retryCount}</span>`
            : nothing}
        </div>
        ${step.result
          ? html`<div class="muted" style="margin-top: 4px; font-size: 12px; white-space: pre-wrap;">${step.result.slice(0, 300)}</div>`
          : nothing}
        ${step.error
          ? html`<div class="callout danger" style="margin-top: 4px; font-size: 12px;">${step.error}</div>`
          : nothing}
      </div>
    </div>
  `;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function filterTasks(tasks: Task[], filter: string): Task[] {
  if (!filter.trim()) return tasks;
  const lower = filter.toLowerCase();
  return tasks.filter(
    (t) =>
      t.name.toLowerCase().includes(lower) ||
      t.description.toLowerCase().includes(lower) ||
      t.status.toLowerCase().includes(lower),
  );
}

function countByStatus(tasks: Task[]): Record<string, number> {
  const counts: Record<string, number> = { total: tasks.length };
  for (const t of tasks) {
    counts[t.status] = (counts[t.status] ?? 0) + 1;
  }
  return counts;
}

function statusToChip(status: string): { label: string; cls: string } {
  switch (status) {
    case "in_progress":
      return { label: "Running", cls: "chip-ok" };
    case "completed":
      return { label: "Done", cls: "chip-ok" };
    case "failed":
      return { label: "Failed", cls: "chip-warn" };
    case "cancelled":
      return { label: "Cancelled", cls: "" };
    case "paused":
      return { label: "Paused", cls: "" };
    case "pending":
      return { label: "Pending", cls: "" };
    default:
      return { label: status, cls: "" };
  }
}

function stepStatusToChip(status: string): { label: string; cls: string } {
  switch (status) {
    case "in_progress":
      return { label: "Running", cls: "chip-ok" };
    case "completed":
      return { label: "Done", cls: "chip-ok" };
    case "failed":
      return { label: "Failed", cls: "chip-warn" };
    case "cancelled":
      return { label: "Skipped", cls: "" };
    case "pending":
      return { label: "Pending", cls: "" };
    default:
      return { label: status, cls: "" };
  }
}

function formatAge(ms: number): string {
  const diff = Date.now() - ms;
  if (diff < 60_000) return "just now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return `${Math.floor(diff / 86_400_000)}d ago`;
}

function formatDate(ms: number): string {
  return new Date(ms).toLocaleString();
}

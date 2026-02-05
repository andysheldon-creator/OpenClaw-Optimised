import { useMemo } from 'react';
import { useDashboardStore } from '../../stores/dashboardStore';
import { Badge, Progress } from '../ui';
import type { ReactNode } from 'react';

interface ContextPanelProps {
  children?: ReactNode;
}

interface ContextSectionProps {
  title: string;
  children: ReactNode;
  action?: ReactNode;
}

interface ContextRowProps {
  label: string;
  value: ReactNode;
}

export function ContextSection({ title, children, action }: ContextSectionProps) {
  return (
    <div className="border-b border-[var(--color-border)]">
      <div className="flex items-center justify-between px-4 py-3 text-[11px] font-semibold text-[var(--color-text-muted)] uppercase tracking-[0.5px]">
        <span>{title}</span>
        {action}
      </div>
      <div className="px-4 pb-4">{children}</div>
    </div>
  );
}

export function ContextRow({ label, value }: ContextRowProps) {
  return (
    <div className="flex items-center justify-between py-1.5 text-[13px]">
      <span className="text-[var(--color-text-secondary)]">{label}</span>
      <span className="text-[var(--color-text-primary)] font-medium">{value}</span>
    </div>
  );
}

export function ContextPanel({ children }: ContextPanelProps) {
  const contextPanelOpen = useDashboardStore((s) => s.contextPanelOpen);

  if (!contextPanelOpen) {
    return null;
  }

  return (
    <aside className="w-full min-w-0 flex flex-col overflow-hidden">
      {children}
    </aside>
  );
}

// Pre-built context panels for different views
export function TrackContextPanel() {
  const tracks = useDashboardStore((s) => s.tracks);
  const selectedTrackId = useDashboardStore((s) => s.selectedTrackId);
  const tasks = useDashboardStore((s) => s.tasks);

  // Find track and related tasks
  const track = useMemo(() =>
    tracks.find((t) => t.id === selectedTrackId),
    [tracks, selectedTrackId]
  );

  const trackTasks = useMemo(() =>
    tasks.filter((t) => t.trackId === selectedTrackId),
    [tasks, selectedTrackId]
  );

  if (!track) {
    return (
      <ContextPanel>
        <div className="p-4 text-center text-[13px] text-[var(--color-text-muted)]">
          Select a track to view details
        </div>
      </ContextPanel>
    );
  }

  const completedTasks = trackTasks.filter((t) => t.status === 'complete').length;
  const progress = trackTasks.length > 0 ? (completedTasks / trackTasks.length) * 100 : 0;

  return (
    <ContextPanel>
      <div className="p-4">
        <div className="text-sm font-semibold text-[var(--color-text-primary)] mb-1">
          {track.name}
        </div>
        {track.description && (
          <div className="text-xs text-[var(--color-text-secondary)] mb-3">
            {track.description}
          </div>
        )}
        <Badge
          variant={
            track.status === 'active'
              ? 'success'
              : track.status === 'pending'
              ? 'warning'
              : 'muted'
          }
        >
          {track.status}
        </Badge>
      </div>

      <ContextSection title="Progress">
        <div className="mt-3">
          <div className="flex justify-between text-[11px] text-[var(--color-text-muted)] mb-1">
            <span>{completedTasks} of {trackTasks.length} tasks</span>
            <span>{Math.round(progress)}%</span>
          </div>
          <Progress value={progress} />
        </div>
      </ContextSection>

      <ContextSection title="Task Breakdown">
        <div className="grid grid-cols-2 gap-2">
          <div className="p-3 bg-[var(--color-bg-primary)] rounded-md text-center">
            <div className="text-lg font-semibold text-[var(--color-text-primary)]">
              {trackTasks.filter((t) => t.status === 'running').length}
            </div>
            <div className="text-[11px] text-[var(--color-text-muted)] mt-0.5">Running</div>
          </div>
          <div className="p-3 bg-[var(--color-bg-primary)] rounded-md text-center">
            <div className="text-lg font-semibold text-[var(--color-text-primary)]">
              {trackTasks.filter((t) => t.status === 'pending' || t.status === 'queued').length}
            </div>
            <div className="text-[11px] text-[var(--color-text-muted)] mt-0.5">Pending</div>
          </div>
          <div className="p-3 bg-[var(--color-bg-primary)] rounded-md text-center">
            <div className="text-lg font-semibold text-[var(--color-text-primary)]">
              {trackTasks.filter((t) => t.status === 'complete').length}
            </div>
            <div className="text-[11px] text-[var(--color-text-muted)] mt-0.5">Complete</div>
          </div>
          <div className="p-3 bg-[var(--color-bg-primary)] rounded-md text-center">
            <div className="text-lg font-semibold text-[var(--color-text-primary)]">
              {trackTasks.filter((t) => t.status === 'failed').length}
            </div>
            <div className="text-[11px] text-[var(--color-text-muted)] mt-0.5">Failed</div>
          </div>
        </div>
      </ContextSection>

      <ContextSection title="Context Files">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2 px-2 py-1.5 text-xs font-mono text-[var(--color-text-secondary)] bg-[var(--color-bg-primary)] rounded cursor-pointer transition-colors hover:text-[var(--color-accent)] hover:bg-[var(--color-bg-tertiary)]">
            <span className="text-xs">📄</span>
            <span>spec.md</span>
          </div>
          <div className="flex items-center gap-2 px-2 py-1.5 text-xs font-mono text-[var(--color-text-secondary)] bg-[var(--color-bg-primary)] rounded cursor-pointer transition-colors hover:text-[var(--color-accent)] hover:bg-[var(--color-bg-tertiary)]">
            <span className="text-xs">📄</span>
            <span>plan.md</span>
          </div>
          <div className="flex items-center gap-2 px-2 py-1.5 text-xs font-mono text-[var(--color-text-secondary)] bg-[var(--color-bg-primary)] rounded cursor-pointer transition-colors hover:text-[var(--color-accent)] hover:bg-[var(--color-bg-tertiary)]">
            <span className="text-xs">📄</span>
            <span>context.md</span>
          </div>
        </div>
      </ContextSection>
    </ContextPanel>
  );
}

export function TaskContextPanel() {
  const tasks = useDashboardStore((s) => s.tasks);
  const selectedTaskId = useDashboardStore((s) => s.selectedTaskId);

  const task = useMemo(() =>
    tasks.find((t) => t.id === selectedTaskId),
    [tasks, selectedTaskId]
  );

  if (!task) {
    return (
      <ContextPanel>
        <div className="p-4 text-center text-[13px] text-[var(--color-text-muted)]">
          Select a task to view details
        </div>
      </ContextPanel>
    );
  }

  return (
    <ContextPanel>
      <ContextSection title="Task Info">
        <ContextRow label="Status" value={<Badge variant={task.status === 'running' ? 'success' : 'muted'}>{task.status}</Badge>} />
        <ContextRow label="Worker" value={task.workerType} />
        <ContextRow label="Created" value={new Date(task.createdAt).toLocaleString()} />
        {task.startedAt && (
          <ContextRow label="Started" value={new Date(task.startedAt).toLocaleString()} />
        )}
        {task.completedAt && (
          <ContextRow label="Completed" value={new Date(task.completedAt).toLocaleString()} />
        )}
      </ContextSection>

      <ContextSection title="Configuration">
        <ContextRow label="Max Retries" value={task.maxRetries} />
        <ContextRow label="Timeout" value={`${task.timeoutMinutes} min`} />
        <ContextRow label="Requires Review" value={task.requiresReview ? 'Yes' : 'No'} />
      </ContextSection>
    </ContextPanel>
  );
}

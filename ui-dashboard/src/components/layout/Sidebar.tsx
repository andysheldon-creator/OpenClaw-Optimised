import { Link } from 'react-router-dom';
import { useDashboardStore } from '../../stores/dashboardStore';
import { Badge } from '../ui';
import { cn } from '@/lib/utils';
import type { Track, Worker } from '../../types';

export interface SidebarProps {
  tracks?: Track[];
  workers?: Worker[];
  reviewCount?: number;
  selectedTrackId?: string | null;
  onTrackSelect?: (id: string) => void;
  onCreateTrack?: () => void;
}

export function Sidebar({
  tracks: propTracks,
  workers: propWorkers,
  reviewCount: propReviewCount,
  selectedTrackId: propSelectedTrackId,
  onTrackSelect,
  onCreateTrack,
}: SidebarProps) {
  // Use individual selectors
  const storeTracks = useDashboardStore((s) => s.tracks);
  const storeWorkers = useDashboardStore((s) => s.workers);
  const storeSelectedTrackId = useDashboardStore((s) => s.selectedTrackId);
  const storeReviews = useDashboardStore((s) => s.reviews);
  const selectTrack = useDashboardStore((s) => s.selectTrack);

  const tracks = propTracks ?? storeTracks;
  const workers = propWorkers ?? storeWorkers;
  const selectedTrackId = propSelectedTrackId ?? storeSelectedTrackId;
  const pendingReviews = propReviewCount ?? storeReviews.filter((r) => r.status === 'pending').length;

  const handleTrackClick = (id: string) => {
    onTrackSelect?.(id);
    selectTrack(id);
  };

  const getTrackIcon = (status: Track['status']) => {
    switch (status) {
      case 'active':
        return <span className="text-xs text-[var(--color-success)]">◐</span>;
      case 'pending':
        return <span className="text-xs text-[var(--color-warning)]">○</span>;
      case 'completed':
        return <span className="text-xs">✓</span>;
      default:
        return <span className="text-xs text-[var(--color-text-muted)]">○</span>;
    }
  };

  const getWorkerDotClass = (status: Worker['status']) => {
    return cn(
      'inline-block w-2 h-2 rounded-full',
      status === 'active' && 'bg-[var(--color-success)] shadow-[0_0_8px_var(--color-success)] animate-pulse',
      status === 'error' && 'bg-[var(--color-error)]',
      status !== 'active' && status !== 'error' && 'bg-[var(--color-text-muted)]',
    );
  };

  return (
    <aside className="h-full flex flex-col overflow-hidden">
      {/* Tracks Section */}
      <div className="border-b border-[var(--color-border)]">
        <div className="flex items-center justify-between px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">
          <span>Tracks</span>
          <span className="px-1.5 py-0.5 text-[10px] bg-[var(--color-bg-tertiary)] rounded-full">
            {tracks.length}
          </span>
        </div>
        <div className="px-2 pb-2">
          {tracks.map((track) => (
            <div
              key={track.id}
              className={cn(
                'flex items-center gap-2.5 px-2.5 py-2 mb-0.5 rounded-md cursor-pointer text-[13px] text-[var(--color-text-secondary)] border-l-2 border-transparent hover:bg-[var(--color-bg-tertiary)] hover:text-[var(--color-text-primary)] transition-colors',
                selectedTrackId === track.id && 'bg-[var(--color-bg-tertiary)] text-[var(--color-text-primary)] border-l-[var(--color-accent)]',
              )}
              onClick={() => handleTrackClick(track.id)}
            >
              {getTrackIcon(track.status)}
              <span className="flex-1 overflow-hidden text-ellipsis whitespace-nowrap">
                {track.name}
              </span>
              {track.taskCount > 0 && (
                <span className="text-[10px] px-1.5 py-0.5 bg-[var(--color-bg-tertiary)] rounded-full">
                  {track.taskCount}
                </span>
              )}
            </div>
          ))}
        </div>
        <button
          className="flex items-center justify-center gap-1.5 w-[calc(100%-16px)] mx-2 mb-2 py-2 text-xs text-[var(--color-text-secondary)] bg-transparent border border-dashed border-[var(--color-border)] rounded-md cursor-pointer hover:text-[var(--color-accent)] hover:border-[var(--color-accent)] hover:bg-[rgba(88,166,255,0.1)] transition-colors"
          onClick={onCreateTrack}
        >
          <span>+</span>
          <span>New Track</span>
        </button>
      </div>

      {/* Active Workers Section */}
      <div className="border-b border-[var(--color-border)]">
        <div className="flex items-center justify-between px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">
          <span>Workers</span>
          <span className="px-1.5 py-0.5 text-[10px] bg-[var(--color-bg-tertiary)] rounded-full">
            {workers.filter((w) => w.status === 'active').length}
          </span>
        </div>
        <div className="px-2 pb-2">
          {workers.map((worker) => (
            <div
              key={worker.id}
              className="flex items-center gap-2.5 px-2.5 py-2 mb-0.5 text-[13px] text-[var(--color-text-secondary)] rounded-md hover:bg-[var(--color-bg-tertiary)] transition-colors"
            >
              <span className={getWorkerDotClass(worker.status)} />
              <div className="flex-1 min-w-0">
                <span className="block overflow-hidden text-ellipsis whitespace-nowrap">
                  {worker.name}
                </span>
                {worker.currentTask && (
                  <span className="block text-[11px] text-[var(--color-text-muted)] overflow-hidden text-ellipsis whitespace-nowrap">
                    {worker.taskDescription}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Review Queue Link */}
      <div className="border-b border-[var(--color-border)]">
        <Link
          to="/reviews"
          className="flex items-center gap-2.5 px-2.5 py-2 mx-2 mb-2 text-[13px] text-[var(--color-text-secondary)] no-underline rounded-md hover:bg-[var(--color-bg-tertiary)] hover:text-[var(--color-text-primary)] transition-colors"
        >
          <span>👁</span>
          <span>Review Queue</span>
          {pendingReviews > 0 && (
            <Badge variant="purple" size="sm" className="ml-auto">
              {pendingReviews}
            </Badge>
          )}
        </Link>
      </div>
    </aside>
  );
}

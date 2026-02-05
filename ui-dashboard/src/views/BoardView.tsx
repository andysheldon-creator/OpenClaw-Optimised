import { ResizableLayout, Sidebar, TaskContextPanel } from '../components/layout';
import { TaskBoard } from '../components/features/board';
import { useDashboardStore } from '../stores/dashboardStore';

export function BoardView() {
  const tracks = useDashboardStore((s) => s.tracks);
  const workers = useDashboardStore((s) => s.workers);
  const reviews = useDashboardStore((s) => s.reviews);
  const selectedTrackId = useDashboardStore((s) => s.selectedTrackId);
  const selectTrack = useDashboardStore((s) => s.selectTrack);

  return (
    <ResizableLayout
      sidebar={
        <Sidebar
          tracks={tracks}
          workers={workers}
          reviewCount={reviews.filter((r) => r.status === 'pending').length}
          selectedTrackId={selectedTrackId}
          onTrackSelect={selectTrack}
        />
      }
      main={<TaskBoard />}
      context={<TaskContextPanel />}
    />
  );
}

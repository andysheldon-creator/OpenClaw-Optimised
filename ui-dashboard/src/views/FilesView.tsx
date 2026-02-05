import { ResizableLayout, Sidebar, ContextPanel, ContextSection } from '../components/layout';
import { useDashboardStore } from '../stores/dashboardStore';
import styles from './FilesView.module.css';

export function FilesView() {
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
      main={
        <div className={styles.container}>
          <div className={styles.header}>
            <h2 className={styles.title}>Files</h2>
          </div>
          <div className={styles.content}>
            <div className={styles.empty}>
              <div className={styles.emptyIcon}>📁</div>
              <div className={styles.emptyText}>File browser coming soon</div>
              <div className={styles.emptyHint}>
                Browse project files with syntax highlighting
              </div>
            </div>
          </div>
        </div>
      }
      context={
        <ContextPanel>
          <ContextSection title="File Info">
            <div style={{ padding: '16px', color: 'var(--text-muted)', fontSize: '13px' }}>
              Select a file to view details
            </div>
          </ContextSection>
        </ContextPanel>
      }
    />
  );
}

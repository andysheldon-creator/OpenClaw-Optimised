import { ResizableLayout, Sidebar, ContextPanel, ContextSection } from '../components/layout';
import { useDashboardStore } from '../stores/dashboardStore';
import styles from './TimelineView.module.css';

export function TimelineView() {
  const tracks = useDashboardStore((s) => s.tracks);
  const workers = useDashboardStore((s) => s.workers);
  const reviews = useDashboardStore((s) => s.reviews);
  const tasks = useDashboardStore((s) => s.tasks);
  const selectedTrackId = useDashboardStore((s) => s.selectedTrackId);
  const selectTrack = useDashboardStore((s) => s.selectTrack);

  // Combine all events for timeline
  const events = [
    ...tasks.map((t) => ({
      id: t.id,
      type: 'task' as const,
      title: t.title,
      status: t.status,
      timestamp: t.createdAt,
    })),
    ...reviews.map((r) => ({
      id: r.id,
      type: 'review' as const,
      title: r.title,
      status: r.status,
      timestamp: r.createdAt,
    })),
  ].sort((a, b) => b.timestamp - a.timestamp);

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
            <h2 className={styles.title}>Timeline</h2>
          </div>
          <div className={styles.content}>
            {events.length === 0 ? (
              <div className={styles.empty}>
                <div className={styles.emptyIcon}>◷</div>
                <div className={styles.emptyText}>No events yet</div>
              </div>
            ) : (
              <div className={styles.timeline}>
                {events.map((event) => (
                  <div key={event.id} className={styles.event}>
                    <div className={styles.eventDot} />
                    <div className={styles.eventContent}>
                      <div className={styles.eventHeader}>
                        <span className={styles.eventType}>{event.type}</span>
                        <span className={styles.eventTime}>
                          {new Date(event.timestamp).toLocaleString()}
                        </span>
                      </div>
                      <div className={styles.eventTitle}>{event.title}</div>
                      <div className={styles.eventStatus}>{event.status}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      }
      context={
        <ContextPanel>
          <ContextSection title="Activity Stats">
            <div style={{ padding: '16px' }}>
              <div style={{ marginBottom: '12px' }}>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Total Events</div>
                <div style={{ fontSize: '18px', fontWeight: 600 }}>{events.length}</div>
              </div>
              <div style={{ marginBottom: '12px' }}>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Tasks Created</div>
                <div style={{ fontSize: '18px', fontWeight: 600 }}>{tasks.length}</div>
              </div>
              <div>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Reviews Submitted</div>
                <div style={{ fontSize: '18px', fontWeight: 600 }}>{reviews.length}</div>
              </div>
            </div>
          </ContextSection>
        </ContextPanel>
      }
    />
  );
}

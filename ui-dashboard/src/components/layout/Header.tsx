import { NavLink } from 'react-router-dom';
import { Zap, Cog } from 'lucide-react';
import { useDashboardStore } from '../../stores/dashboardStore';
import { useGateway } from '../../hooks/useGateway';
import { Badge } from '../ui';
import { cn } from '@/lib/utils';

const navItems = [
  { path: '/', label: 'Chat' },
  { path: '/board', label: 'Board' },
  { path: '/git', label: 'Git' },
  { path: '/files', label: 'Files' },
  { path: '/timeline', label: 'Timeline' },
  { path: '/reviews', label: 'Reviews' },
];

export function Header() {
  // Use individual selectors
  const tasks = useDashboardStore((s) => s.tasks);
  const workers = useDashboardStore((s) => s.workers);
  const reviews = useDashboardStore((s) => s.reviews);
  const { connected, connecting } = useGateway();

  const activeTasks = tasks.filter((t) => t.status === 'running').length;
  const activeWorkers = workers.filter((w) => w.status === 'active').length;
  const pendingReviews = reviews.filter((r) => r.status === 'pending').length;

  const connectionDotClass = cn(
    'inline-block w-2 h-2 rounded-full',
    connected && 'bg-[var(--color-success)] shadow-[0_0_8px_var(--color-success)]',
    connecting && 'bg-[var(--color-warning)] animate-pulse',
    !connected && !connecting && 'bg-[var(--color-error)]',
  );

  const connectionText = connected
    ? 'Connected'
    : connecting
      ? 'Connecting...'
      : 'Disconnected';

  return (
    <header className="flex items-center h-12 px-4 bg-[var(--color-bg-secondary)] border-b border-[var(--color-border)] gap-4">
      <div className="flex items-center gap-2 text-sm font-semibold text-[var(--color-text-primary)]">
        <span className="text-lg">🦞</span>
        <span>OpenClaw</span>
      </div>

      <div className="flex items-center gap-1 px-2.5 py-1 text-[13px] text-[var(--color-text-secondary)] bg-[var(--color-bg-tertiary)] border border-[var(--color-border)] rounded-md cursor-pointer hover:text-[var(--color-text-primary)] hover:border-[var(--color-accent)] transition-colors">
        <span>my-project</span>
        <span>▼</span>
      </div>

      <nav className="flex items-center gap-1">
        {navItems.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            className={({ isActive }) =>
              cn(
                'text-[13px] px-3 py-1.5 rounded-md text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-bg-tertiary)] transition-colors no-underline font-medium',
                isActive && 'bg-[var(--color-bg-tertiary)] text-[var(--color-text-primary)]',
              )
            }
          >
            {item.label}
            {item.path === '/reviews' && pendingReviews > 0 && (
              <Badge variant="purple" size="sm" className="ml-1.5">
                {pendingReviews}
              </Badge>
            )}
          </NavLink>
        ))}
      </nav>

      <div className="flex-1" />

      <div className="ml-auto flex items-center gap-4 text-[12px] text-[var(--color-text-muted)]">
        <div className="flex items-center gap-1">
          <Zap className="w-3 h-3" />
          <span>{activeTasks} tasks</span>
        </div>
        <div className="flex items-center gap-1">
          <Cog className="w-3 h-3" />
          <span>{activeWorkers} workers</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className={connectionDotClass} />
          <span>{connectionText}</span>
        </div>
      </div>
    </header>
  );
}

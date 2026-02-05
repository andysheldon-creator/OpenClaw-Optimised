import { Group, Panel, Separator } from 'react-resizable-panels'
import { cn } from '@/lib/utils'

interface ResizableLayoutProps {
  sidebar?: React.ReactNode
  main: React.ReactNode
  context?: React.ReactNode
  terminal?: React.ReactNode
  defaultSidebarSize?: number
  defaultContextSize?: number
  defaultTerminalSize?: number
}

function ResizeHandle({ className, orientation = 'horizontal' }: { className?: string; orientation?: 'horizontal' | 'vertical' }) {
  return (
    <Separator
      className={cn(
        orientation === 'horizontal'
          ? 'w-[1px] bg-[var(--color-border)] hover:bg-[var(--color-accent)] transition-colors duration-150 data-[separator]:active:bg-[var(--color-accent)]'
          : 'h-[1px] bg-[var(--color-border)] hover:bg-[var(--color-accent)] transition-colors duration-150 data-[separator]:active:bg-[var(--color-accent)]',
        className
      )}
    />
  )
}

export function ResizableLayout({
  sidebar,
  main,
  context,
  terminal,
  defaultSidebarSize = 18,
  defaultContextSize = 22,
  defaultTerminalSize = 30,
}: ResizableLayoutProps) {
  return (
    <Group orientation="horizontal" className="h-full">
      {sidebar && (
        <>
          <Panel defaultSize={defaultSidebarSize} minSize={12} maxSize={30} className="bg-[var(--color-bg-secondary)]">
            {sidebar}
          </Panel>
          <ResizeHandle />
        </>
      )}
      <Panel minSize={30}>
        {terminal ? (
          <Group orientation="vertical">
            <Panel minSize={20}>{main}</Panel>
            <ResizeHandle orientation="vertical" />
            <Panel defaultSize={defaultTerminalSize} minSize={10} maxSize={60} className="bg-[var(--color-bg-primary)]">
              {terminal}
            </Panel>
          </Group>
        ) : (
          main
        )}
      </Panel>
      {context && (
        <>
          <ResizeHandle />
          <Panel defaultSize={defaultContextSize} minSize={15} maxSize={35} className="bg-[var(--color-bg-secondary)]">
            {context}
          </Panel>
        </>
      )}
    </Group>
  )
}

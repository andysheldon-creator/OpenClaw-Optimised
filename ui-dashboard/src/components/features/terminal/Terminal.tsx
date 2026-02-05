import { useEffect, useRef } from 'react'
import { Terminal as XTerm } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { WebLinksAddon } from '@xterm/addon-web-links'
import '@xterm/xterm/css/xterm.css'
import { cn } from '@/lib/utils'
import { gateway } from '../../../lib/gateway'

interface TerminalProps {
  className?: string
}

export function Terminal({ className }: TerminalProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const terminalRef = useRef<XTerm | null>(null)
  const sessionIdRef = useRef<string | null>(null)
  const fitAddonRef = useRef<FitAddon | null>(null)

  useEffect(() => {
    if (!containerRef.current) return

    const terminal = new XTerm({
      theme: {
        background: '#0d1117',
        foreground: '#c9d1d9',
        cursor: '#58a6ff',
        selectionBackground: 'rgba(88, 166, 255, 0.3)',
        black: '#484f58',
        red: '#f85149',
        green: '#3fb950',
        yellow: '#d29922',
        blue: '#58a6ff',
        magenta: '#a371f7',
        cyan: '#56d4dd',
        white: '#c9d1d9',
      },
      fontFamily: "'JetBrains Mono', monospace",
      fontSize: 13,
      cursorBlink: true,
    })

    const fitAddon = new FitAddon()
    fitAddonRef.current = fitAddon
    terminal.loadAddon(fitAddon)
    terminal.loadAddon(new WebLinksAddon())

    terminal.open(containerRef.current)
    fitAddon.fit()

    terminalRef.current = terminal

    const resizeObserver = new ResizeObserver(() => {
      fitAddon.fit()
      // Send resize to backend if we have a session
      if (sessionIdRef.current) {
        const dims = fitAddon.proposeDimensions()
        if (dims) {
          gateway.callMethod('dashboard.pty.resize', {
            sessionId: sessionIdRef.current,
            cols: dims.cols,
            rows: dims.rows,
          }).catch(() => {})
        }
      }
    })
    resizeObserver.observe(containerRef.current)

    terminal.writeln('\x1b[1;34m● OpenClaw Terminal\x1b[0m')
    terminal.writeln('\x1b[2mConnecting...\x1b[0m')

    // Spawn PTY session
    const dims = fitAddon.proposeDimensions()
    gateway.callMethod('dashboard.pty.spawn', {
      cols: dims?.cols ?? 120,
      rows: dims?.rows ?? 30,
    }).then(
      (data) => {
        const result = data as { sessionId: string }
        sessionIdRef.current = result.sessionId
        terminal.writeln('\x1b[1;32m● Connected\x1b[0m')
        terminal.writeln('')

        // Send terminal input to PTY
        terminal.onData((inputData: string) => {
          if (sessionIdRef.current) {
            gateway.callMethod('dashboard.pty.write', {
              sessionId: sessionIdRef.current,
              data: inputData,
            }).catch(() => {})
          }
        })
      },
      (err) => {
        terminal.writeln(`\x1b[1;31m● Failed to connect: ${String(err)}\x1b[0m`)
      },
    )

    // Listen for PTY data events
    const unsubscribe = gateway.onEvent((event: string, payload: unknown) => {
      const p = payload as { sessionId?: string; data?: string; code?: number }
      if (event === 'dashboard.pty.data' && p.sessionId === sessionIdRef.current && p.data) {
        terminal.write(p.data)
      }
      if (event === 'dashboard.pty.exit' && p.sessionId === sessionIdRef.current) {
        terminal.writeln('')
        terminal.writeln(`\x1b[2mProcess exited with code ${p.code ?? 'unknown'}\x1b[0m`)
        sessionIdRef.current = null
      }
    })

    return () => {
      resizeObserver.disconnect()
      unsubscribe()

      // Destroy PTY session
      if (sessionIdRef.current) {
        gateway.callMethod('dashboard.pty.destroy', {
          sessionId: sessionIdRef.current,
        }).catch(() => {})
        sessionIdRef.current = null
      }

      terminal.dispose()
    }
  }, [])

  return <div ref={containerRef} className={cn('h-full w-full', className)} />
}

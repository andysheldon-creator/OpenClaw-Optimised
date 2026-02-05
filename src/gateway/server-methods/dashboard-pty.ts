import { randomUUID } from "node:crypto";
import type { GatewayRequestHandlers } from "./types.js";
import { ErrorCodes, errorShape } from "../protocol/index.js";

// ---------------------------------------------------------------------------
// Types from @lydell/node-pty (dynamic import, avoid hard dep)
// ---------------------------------------------------------------------------

interface IPty {
  onData: (callback: (data: string) => void) => { dispose: () => void };
  onExit: (callback: (e: { exitCode: number; signal?: number }) => void) => { dispose: () => void };
  write: (data: string) => void;
  resize: (cols: number, rows: number) => void;
  kill: (signal?: string) => void;
  pid: number;
}

type PtySpawn = (
  file: string,
  args: string[],
  options: {
    name?: string;
    cols?: number;
    rows?: number;
    cwd?: string;
    env?: Record<string, string>;
  },
) => IPty;

// ---------------------------------------------------------------------------
// Session map
// ---------------------------------------------------------------------------

interface PtySession {
  pty: IPty;
  connId: string;
  createdAt: number;
  disposers: Array<{ dispose: () => void }>;
}

const ptySessions = new Map<string, PtySession>();

// ---------------------------------------------------------------------------
// Cleanup
// ---------------------------------------------------------------------------

export function cleanupPtyForConnection(connId: string): void {
  for (const [id, session] of ptySessions) {
    if (session.connId === connId) {
      try {
        for (const d of session.disposers) d.dispose();
        session.pty.kill();
      } catch {
        // ignore
      }
      ptySessions.delete(id);
    }
  }
}

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

export const dashboardPtyHandlers: GatewayRequestHandlers = {
  "dashboard.pty.spawn": async ({ params, client, respond, context }) => {
    const cols = typeof params.cols === "number" ? params.cols : 120;
    const rows = typeof params.rows === "number" ? params.rows : 30;
    const connId = client?.connId;

    if (!connId) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "not connected"));
      return;
    }

    let spawnPty: PtySpawn;
    try {
      const ptyModule = (await import("@lydell/node-pty")) as unknown as {
        spawn?: PtySpawn;
        default?: { spawn?: PtySpawn };
      };
      const fn = ptyModule.spawn ?? ptyModule.default?.spawn;
      if (!fn) throw new Error("node-pty spawn not found");
      spawnPty = fn;
    } catch (err) {
      respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, `PTY unavailable: ${String(err)}`));
      return;
    }

    const shell = process.env.SHELL || "/bin/bash";
    const sessionId = randomUUID();
    const connIds = new Set([connId]);

    try {
      const pty = spawnPty(shell, [], {
        name: process.env.TERM ?? "xterm-256color",
        cols,
        rows,
        cwd: process.cwd(),
      });

      const disposers: Array<{ dispose: () => void }> = [];

      disposers.push(
        pty.onData((data: string) => {
          context.broadcastToConnIds("dashboard.pty.data", { sessionId, data }, connIds);
        }),
      );

      disposers.push(
        pty.onExit((e: { exitCode: number; signal?: number }) => {
          context.broadcastToConnIds("dashboard.pty.exit", { sessionId, code: e.exitCode }, connIds);
          ptySessions.delete(sessionId);
        }),
      );

      ptySessions.set(sessionId, { pty, connId, createdAt: Date.now(), disposers });
      respond(true, { sessionId });
    } catch (err) {
      respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, `pty spawn failed: ${String(err)}`));
    }
  },

  "dashboard.pty.write": ({ params, respond }) => {
    const sessionId = params.sessionId as string | undefined;
    const data = params.data as string | undefined;
    if (!sessionId || data == null) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "sessionId and data are required"));
      return;
    }

    const session = ptySessions.get(sessionId);
    if (!session) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "unknown session"));
      return;
    }

    session.pty.write(data);
    respond(true, {});
  },

  "dashboard.pty.resize": ({ params, respond }) => {
    const sessionId = params.sessionId as string | undefined;
    const cols = params.cols as number | undefined;
    const rows = params.rows as number | undefined;
    if (!sessionId || !cols || !rows) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "sessionId, cols, and rows are required"));
      return;
    }

    const session = ptySessions.get(sessionId);
    if (!session) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "unknown session"));
      return;
    }

    session.pty.resize(cols, rows);
    respond(true, {});
  },

  "dashboard.pty.destroy": ({ params, respond }) => {
    const sessionId = params.sessionId as string | undefined;
    if (!sessionId) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "sessionId is required"));
      return;
    }

    const session = ptySessions.get(sessionId);
    if (!session) {
      respond(true, {});
      return;
    }

    try {
      for (const d of session.disposers) d.dispose();
      session.pty.kill();
    } catch {
      // ignore
    }
    ptySessions.delete(sessionId);
    respond(true, {});
  },
};

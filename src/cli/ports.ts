import { execFileSync } from "node:child_process";
import { resolveLsofCommandSync } from "../infra/ports-lsof.js";
import { sleep } from "../utils.js";

export type PortProcess = { pid: number; command?: string };

export type ForceFreePortResult = {
  killed: PortProcess[];
  waitedMs: number;
  escalatedToSigkill: boolean;
};

export function parseLsofOutput(output: string): PortProcess[] {
  const lines = output.split(/\r?\n/).filter(Boolean);
  const results: PortProcess[] = [];
  let current: Partial<PortProcess> = {};
  for (const line of lines) {
    if (line.startsWith("p")) {
      if (current.pid) {
        results.push(current as PortProcess);
      }
      current = { pid: Number.parseInt(line.slice(1), 10) };
    } else if (line.startsWith("c")) {
      current.command = line.slice(1);
    }
  }
  if (current.pid) {
    results.push(current as PortProcess);
  }
  return results;
}

export function listPortListeners(port: number): PortProcess[] {
  if (process.platform === "win32") {
    return listPortListenersWindows(port);
  }
  return listPortListenersUnix(port);
}

function listPortListenersUnix(port: number): PortProcess[] {
  try {
    const lsof = resolveLsofCommandSync();
    const out = execFileSync(lsof, ["-nP", `-iTCP:${port}`, "-sTCP:LISTEN", "-FpFc"], {
      encoding: "utf-8",
    });
    return parseLsofOutput(out);
  } catch (err: unknown) {
    const status = (err as { status?: number }).status;
    const code = (err as { code?: string }).code;
    if (code === "ENOENT") {
      throw new Error("lsof not found; required for --force", { cause: err });
    }
    if (status === 1) {
      return [];
    } // no listeners
    throw err instanceof Error ? err : new Error(String(err));
  }
}

function listPortListenersWindows(port: number): PortProcess[] {
  try {
    const out = execFileSync("netstat", ["-ano", "-p", "tcp"], {
      encoding: "utf-8",
    });
    return parseNetstatOutput(out, port);
  } catch (err: unknown) {
    const code = (err as { code?: string }).code;
    if (code === "ENOENT") {
      throw new Error("netstat not found; required for --force on Windows", { cause: err });
    }
    throw err instanceof Error ? err : new Error(String(err));
  }
}

function parseNetstatOutput(output: string, port: number): PortProcess[] {
  const results: PortProcess[] = [];
  const portToken = `:${port}`;

  for (const rawLine of output.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) {
      continue;
    }
    // Look for LISTENING state
    if (!line.toLowerCase().includes("listening")) {
      continue;
    }

    // netstat output format: Proto  Local Address  Foreign Address  State  PID
    const parts = line.split(/\s+/);
    if (parts.length < 5) {
      continue;
    }

    // Check if the Local Address (index 1) contains our port
    const localAddr = parts[1];
    if (!localAddr || !localAddr.includes(portToken)) {
      continue;
    }

    const pidRaw = parts.at(-1);
    const pid = pidRaw ? Number.parseInt(pidRaw, 10) : NaN;

    if (Number.isFinite(pid)) {
      results.push({ pid });
    }
  }

  return results;
}

export function forceFreePort(port: number): PortProcess[] {
  const listeners = listPortListeners(port);
  for (const proc of listeners) {
    try {
      if (process.platform === "win32") {
        // On Windows, use taskkill for more reliable termination
        execFileSync("taskkill", ["/PID", String(proc.pid), "/F"], {
          encoding: "utf-8",
        });
      } else {
        process.kill(proc.pid, "SIGTERM");
      }
    } catch (err) {
      throw new Error(
        `failed to kill pid ${proc.pid}${proc.command ? ` (${proc.command})` : ""}: ${String(err)}`,
        { cause: err },
      );
    }
  }
  return listeners;
}

function killPids(listeners: PortProcess[], signal: NodeJS.Signals) {
  for (const proc of listeners) {
    try {
      if (process.platform === "win32") {
        // Windows doesn't support SIGKILL, use taskkill /F
        execFileSync("taskkill", ["/PID", String(proc.pid), "/F"], {
          encoding: "utf-8",
        });
      } else {
        process.kill(proc.pid, signal);
      }
    } catch (err) {
      throw new Error(
        `failed to kill pid ${proc.pid}${proc.command ? ` (${proc.command})` : ""}: ${String(err)}`,
        { cause: err },
      );
    }
  }
}

export async function forceFreePortAndWait(
  port: number,
  opts: {
    /** Total wait budget across signals. */
    timeoutMs?: number;
    /** Poll interval for checking whether lsof reports listeners. */
    intervalMs?: number;
    /** How long to wait after SIGTERM before escalating to SIGKILL. */
    sigtermTimeoutMs?: number;
  } = {},
): Promise<ForceFreePortResult> {
  const timeoutMs = Math.max(opts.timeoutMs ?? 1500, 0);
  const intervalMs = Math.max(opts.intervalMs ?? 100, 1);
  const sigtermTimeoutMs = Math.min(Math.max(opts.sigtermTimeoutMs ?? 600, 0), timeoutMs);

  const killed = forceFreePort(port);
  if (killed.length === 0) {
    return { killed, waitedMs: 0, escalatedToSigkill: false };
  }

  let waitedMs = 0;
  const triesSigterm = intervalMs > 0 ? Math.ceil(sigtermTimeoutMs / intervalMs) : 0;
  for (let i = 0; i < triesSigterm; i++) {
    if (listPortListeners(port).length === 0) {
      return { killed, waitedMs, escalatedToSigkill: false };
    }
    await sleep(intervalMs);
    waitedMs += intervalMs;
  }

  if (listPortListeners(port).length === 0) {
    return { killed, waitedMs, escalatedToSigkill: false };
  }

  const remaining = listPortListeners(port);
  killPids(remaining, "SIGKILL");

  const remainingBudget = Math.max(timeoutMs - waitedMs, 0);
  const triesSigkill = intervalMs > 0 ? Math.ceil(remainingBudget / intervalMs) : 0;
  for (let i = 0; i < triesSigkill; i++) {
    if (listPortListeners(port).length === 0) {
      return { killed, waitedMs, escalatedToSigkill: true };
    }
    await sleep(intervalMs);
    waitedMs += intervalMs;
  }

  const still = listPortListeners(port);
  if (still.length === 0) {
    return { killed, waitedMs, escalatedToSigkill: true };
  }

  throw new Error(
    `port ${port} still has listeners after --force: ${still.map((p) => p.pid).join(", ")}`,
  );
}

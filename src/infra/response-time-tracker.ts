import { createSubsystemLogger } from "../logging/subsystem.js";
import { emitDiagnosticEvent } from "./diagnostic-events.js";

const log = createSubsystemLogger("infra/response-time");

export type ResponseTimeKpi = {
  simple: number; // target ms for simple tasks
  complex: number; // target ms for complex tasks
};

const DEFAULT_KPI: ResponseTimeKpi = {
  simple: 10_000, // 10s
  complex: 60_000, // 60s
};

type ActiveTimer = {
  startMs: number;
  sessionKey?: string;
  sessionId?: string;
  complexity?: "simple" | "medium" | "complex";
};

const activeTimers = new Map<string, ActiveTimer>();

export function startResponseTimer(params: {
  requestId: string;
  sessionKey?: string;
  sessionId?: string;
  complexity?: "simple" | "medium" | "complex";
}): void {
  activeTimers.set(params.requestId, {
    startMs: Date.now(),
    sessionKey: params.sessionKey,
    sessionId: params.sessionId,
    complexity: params.complexity,
  });
}

export function endResponseTimer(params: {
  requestId: string;
  kpi?: Partial<ResponseTimeKpi>;
}): { durationMs: number; exceeded: boolean } | null {
  const timer = activeTimers.get(params.requestId);
  if (!timer) {
    return null;
  }
  activeTimers.delete(params.requestId);

  const durationMs = Date.now() - timer.startMs;
  const kpi = { ...DEFAULT_KPI, ...params.kpi };

  const target =
    timer.complexity === "simple"
      ? kpi.simple
      : timer.complexity === "complex"
        ? kpi.complex
        : kpi.simple; // medium uses simple target

  const exceeded = durationMs > target;

  emitDiagnosticEvent({
    type: "response.time.kpi",
    sessionKey: timer.sessionKey,
    sessionId: timer.sessionId,
    durationMs,
    complexity: timer.complexity,
    targetMs: target,
    exceeded,
  } as never); // type will be added to diagnostic-events union

  if (exceeded) {
    log.warn(
      `Response time ${durationMs}ms exceeded ${target}ms target (complexity: ${timer.complexity ?? "unknown"})`,
      {
        durationMs,
        target,
        complexity: timer.complexity,
        sessionKey: timer.sessionKey,
      },
    );
  }

  return { durationMs, exceeded };
}

export function getActiveTimerCount(): number {
  return activeTimers.size;
}

export function resetTimers(): void {
  activeTimers.clear();
}

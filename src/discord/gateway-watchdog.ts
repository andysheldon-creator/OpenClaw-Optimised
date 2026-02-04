/**
 * Discord Gateway Watchdog
 *
 * Monitors the Discord WebSocket connection health and forces reconnection
 * when the connection appears stale (no events received for too long).
 *
 * Problem: After gateway restarts, the Discord WS can enter a state where
 * it's technically "connected" but not receiving any events. The @buape/carbon
 * library handles reconnects on close/error, but doesn't detect silent failures
 * where the connection just stops receiving data.
 *
 * Solution: Periodically check if any Discord events have been received.
 * If no events arrive within the stale threshold, force a full disconnect
 * and fresh connect (not resume, since resume may reconnect to the same
 * broken state).
 */

import type { EventEmitter } from "node:events";
import type { RuntimeEnv } from "../runtime.js";
import { danger } from "../globals.js";

export interface GatewayWatchdogOpts {
  /** The gateway plugin instance */
  gateway: {
    isConnected: boolean;
    disconnect: () => void;
    connect: (resume?: boolean) => void;
    state?: { sessionId: string | null; resumeGatewayUrl: string | null; sequence: number | null };
    sequence?: number | null;
    emitter?: EventEmitter;
  };
  /** Runtime for logging */
  runtime: RuntimeEnv;
  /** How often to check health (ms). Default: 60_000 (1 min) */
  checkIntervalMs?: number;
  /**
   * How long without events before considering the connection stale (ms).
   * Default: 120_000 (2 min). Discord sends heartbeat acks ~every 41s,
   * so 2 minutes without ANY event is a strong signal the connection is dead.
   */
  staleThresholdMs?: number;
  /**
   * Maximum consecutive stale checks before forcing a fresh (non-resume)
   * reconnect. Default: 3. First stale detection tries resume, after this
   * many it clears session state and does a full identify.
   */
  maxStaleBeforeFreshConnect?: number;
  /** AbortSignal to stop the watchdog */
  abortSignal?: AbortSignal;
}

export class GatewayWatchdog {
  private lastEventAt: number = Date.now();
  private consecutiveStale: number = 0;
  private checkTimer: ReturnType<typeof setInterval> | undefined;
  private eventListener: ((msg: unknown) => void) | undefined;
  private readonly opts: Required<
    Pick<GatewayWatchdogOpts, "checkIntervalMs" | "staleThresholdMs" | "maxStaleBeforeFreshConnect">
  > &
    GatewayWatchdogOpts;

  constructor(opts: GatewayWatchdogOpts) {
    this.opts = {
      checkIntervalMs: 60_000,
      staleThresholdMs: 120_000,
      maxStaleBeforeFreshConnect: 3,
      ...opts,
    };
  }

  start(): void {
    const { gateway, runtime, checkIntervalMs, abortSignal } = this.opts;

    // Listen to ALL gateway debug events as a liveness signal.
    // The gateway emitter fires "debug" for every WS message, heartbeat, etc.
    if (gateway.emitter) {
      this.eventListener = () => {
        this.lastEventAt = Date.now();
        this.consecutiveStale = 0;
      };
      // "debug" fires on every WS event including heartbeats
      gateway.emitter.on("debug", this.eventListener);
      // Also track actual message dispatches
      gateway.emitter.on("metrics", this.eventListener);
    }

    this.checkTimer = setInterval(() => {
      if (abortSignal?.aborted) {
        this.stop();
        return;
      }
      this.check();
    }, checkIntervalMs);

    // Ensure timer doesn't prevent process exit
    if (this.checkTimer && typeof this.checkTimer === "object" && "unref" in this.checkTimer) {
      this.checkTimer.unref();
    }

    runtime.log?.("discord: gateway watchdog started");
  }

  stop(): void {
    if (this.checkTimer) {
      clearInterval(this.checkTimer);
      this.checkTimer = undefined;
    }
    if (this.eventListener && this.opts.gateway.emitter) {
      this.opts.gateway.emitter.removeListener("debug", this.eventListener);
      this.opts.gateway.emitter.removeListener("metrics", this.eventListener);
      this.eventListener = undefined;
    }
  }

  private check(): void {
    const { gateway, runtime, staleThresholdMs, maxStaleBeforeFreshConnect } = this.opts;

    const silentMs = Date.now() - this.lastEventAt;

    if (silentMs < staleThresholdMs) {
      // Connection is healthy
      return;
    }

    this.consecutiveStale++;

    if (!gateway.isConnected) {
      // Already disconnected, carbon's own reconnect logic should handle it
      runtime.log?.(
        `discord: watchdog: connection not active, silent for ${Math.round(silentMs / 1000)}s — waiting for library reconnect`,
      );
      return;
    }

    if (this.consecutiveStale >= maxStaleBeforeFreshConnect) {
      // Too many stale cycles — force a FRESH connect (clear session, full identify)
      runtime.log?.(
        danger(
          `discord: watchdog: connection stale for ${Math.round(silentMs / 1000)}s (${this.consecutiveStale} checks) — forcing fresh connect`,
        ),
      );

      // Clear session state to prevent resume from reconnecting to the same broken state
      if (gateway.state) {
        gateway.state.sessionId = null;
        gateway.state.resumeGatewayUrl = null;
        gateway.state.sequence = null;
      }
      if ("sequence" in gateway) {
        (gateway as { sequence: number | null }).sequence = null;
      }

      gateway.disconnect();
      // Small delay to let WS cleanup happen
      setTimeout(() => {
        gateway.connect(false);
      }, 1000);

      // Reset counter
      this.consecutiveStale = 0;
      this.lastEventAt = Date.now(); // Prevent immediate re-trigger
    } else {
      // First stale detection — try resume first (less disruptive)
      runtime.log?.(
        danger(
          `discord: watchdog: connection stale for ${Math.round(silentMs / 1000)}s — forcing reconnect (attempt ${this.consecutiveStale}/${maxStaleBeforeFreshConnect} before fresh connect)`,
        ),
      );

      gateway.disconnect();
      setTimeout(() => {
        gateway.connect(true);
      }, 1000);

      this.lastEventAt = Date.now(); // Prevent immediate re-trigger
    }
  }
}

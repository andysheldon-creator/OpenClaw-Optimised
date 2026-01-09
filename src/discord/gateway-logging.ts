import type { EventEmitter } from "node:events";

import { logVerbose } from "../globals.js";
import type { RuntimeEnv } from "../runtime.js";

type GatewayEmitter = Pick<EventEmitter, "on" | "removeListener">;

/**
 * Gateway handle for zombie connection detection.
 * Allows the logging module to check connection state and force reconnection.
 */
type GatewayHandle = {
  /** True once HELLO is received and session is established */
  isConnected: boolean;
  /** Disconnect from the gateway */
  disconnect: () => void;
  /** Connect to the gateway (resume=false for fresh connection) */
  connect: (resume: boolean) => void;
};

/** Timeout (ms) to receive HELLO after WebSocket opens before forcing reconnect */
const HELLO_TIMEOUT_MS = 30_000;

const INFO_DEBUG_MARKERS = [
  "WebSocket connection closed",
  "Reconnecting with backoff",
  "Attempting resume with backoff",
];

const shouldPromoteGatewayDebug = (message: string) =>
  INFO_DEBUG_MARKERS.some((marker) => message.includes(marker));

const formatGatewayMetrics = (metrics: unknown) => {
  if (metrics === null || metrics === undefined) return String(metrics);
  if (typeof metrics === "string") return metrics;
  if (
    typeof metrics === "number" ||
    typeof metrics === "boolean" ||
    typeof metrics === "bigint"
  ) {
    return String(metrics);
  }
  try {
    return JSON.stringify(metrics);
  } catch {
    return "[unserializable metrics]";
  }
};

export function attachDiscordGatewayLogging(params: {
  emitter?: GatewayEmitter;
  runtime: RuntimeEnv;
  /** Optional gateway handle for zombie connection detection */
  gateway?: GatewayHandle;
}) {
  const { emitter, runtime, gateway } = params;
  if (!emitter) return () => {};

  // Timeout ID for detecting zombie connections (WebSocket open but no HELLO)
  let helloTimeoutId: ReturnType<typeof setTimeout> | undefined;

  const onGatewayDebug = (msg: unknown) => {
    const message = String(msg);
    logVerbose(`discord gateway: ${message}`);
    if (shouldPromoteGatewayDebug(message)) {
      runtime.log?.(`discord gateway: ${message}`);
    }

    // Zombie connection detection: start timeout when WebSocket opens
    if (gateway && message.includes("WebSocket connection opened")) {
      if (helloTimeoutId) clearTimeout(helloTimeoutId);
      helloTimeoutId = setTimeout(() => {
        if (!gateway.isConnected) {
          runtime.error?.(
            `discord gateway: connection stalled - no HELLO received within ${HELLO_TIMEOUT_MS}ms, forcing reconnect`,
          );
          gateway.disconnect();
          gateway.connect(false);
        }
        helloTimeoutId = undefined;
      }, HELLO_TIMEOUT_MS);
    }
  };

  const onGatewayWarning = (warning: unknown) => {
    logVerbose(`discord gateway warning: ${String(warning)}`);
  };

  const onGatewayMetrics = (metrics: unknown) => {
    logVerbose(`discord gateway metrics: ${formatGatewayMetrics(metrics)}`);
  };

  emitter.on("debug", onGatewayDebug);
  emitter.on("warning", onGatewayWarning);
  emitter.on("metrics", onGatewayMetrics);

  return () => {
    if (helloTimeoutId) clearTimeout(helloTimeoutId);
    emitter.removeListener("debug", onGatewayDebug);
    emitter.removeListener("warning", onGatewayWarning);
    emitter.removeListener("metrics", onGatewayMetrics);
  };
}

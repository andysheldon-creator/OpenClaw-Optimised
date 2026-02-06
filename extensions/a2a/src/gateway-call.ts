import { randomUUID } from "node:crypto";

/**
 * Minimal WebSocket-based gateway call for internal plugin use.
 * Connects to the local gateway via WebSocket, performs the connect handshake,
 * makes a single request, and returns the response.
 */
export async function callGateway<T = Record<string, unknown>>(params: {
  method: string;
  params?: Record<string, unknown>;
  timeoutMs?: number;
  url?: string;
  token?: string;
}): Promise<{ ok: boolean; data?: T; error?: string }> {
  const { method, params: methodParams, timeoutMs = 60_000, url, token } = params;

  // Determine gateway URL - default to local loopback
  const gatewayUrl = url || process.env.OPENCLAW_GATEWAY_URL || "ws://127.0.0.1:18789";
  const gatewayToken = token || process.env.OPENCLAW_GATEWAY_TOKEN || "";

  return new Promise((resolve) => {
    let settled = false;
    let ws: import("ws").WebSocket | null = null;

    const cleanup = () => {
      if (ws) {
        try {
          ws.close();
        } catch {
          // ignore
        }
        ws = null;
      }
    };

    const done = (result: { ok: boolean; data?: T; error?: string }) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      cleanup();
      resolve(result);
    };

    const timer = setTimeout(() => {
      done({ ok: false, error: `Gateway timeout after ${timeoutMs}ms` });
    }, timeoutMs);

    // Dynamic import ws to avoid bundling issues
    import("ws")
      .then(({ default: WebSocket }) => {
        if (settled) {
          return;
        }

        ws = new WebSocket(gatewayUrl);

        ws.on("open", () => {
          if (settled || !ws) {
            return;
          }

          // Send connect handshake (gateway protocol v1)
          const connectId = randomUUID();
          ws.send(
            JSON.stringify({
              type: "req",
              id: connectId,
              method: "connect",
              params: {
                minProtocol: 3,
                maxProtocol: 3,
                client: {
                  id: "gateway-client",
                  version: "1.0.0",
                  platform: "node",
                  mode: "backend",
                },
                auth: gatewayToken ? { token: gatewayToken } : undefined,
                role: "operator",
                scopes: ["operator.admin"],
              },
            }),
          );
        });

        ws.on("message", (data: Buffer | string) => {
          if (settled || !ws) {
            return;
          }

          try {
            const msg = JSON.parse(data.toString());
            console.log("[a2a:gateway-call] frame:", msg.type, JSON.stringify(msg).slice(0, 500));

            // All gateway frames are { type: "res", id, ok, payload?, error? }
            // (plus { type: "event" } for events like connect.challenge)
            //
            // Connect handshake: res with payload.type === "hello-ok"
            // Agent responses: two res frames:
            //   1. payload = { runId, status: "accepted" } — ack, skip
            //   2. payload = { runId, status: "ok", result: { payloads: OutboundPayloadJson[], meta } }
            if (msg.type === "event") {
              console.log("[a2a:gateway-call] event:", msg.event);
              return;
            }

            if (msg.type === "res") {
              const payload = msg.payload;
              console.log("[a2a:gateway-call] res ok=%s payload.type=%s payload.status=%s",
                msg.ok, payload?.type, payload?.status);

              if (!msg.ok) {
                const errMsg =
                  typeof msg.error === "string"
                    ? msg.error
                    : msg.error?.message ?? "Request failed";
                console.log("[a2a:gateway-call] res error:", errMsg);
                done({ ok: false, error: errMsg });
                return;
              }

              // hello-ok — connection established, send the actual method request
              if (payload?.type === "hello-ok") {
                console.log("[a2a:gateway-call] connected, sending method:", method);
                const requestId = randomUUID();
                ws.send(
                  JSON.stringify({
                    type: "req",
                    id: requestId,
                    method,
                    params: methodParams,
                  }),
                );
                return;
              }

              // "accepted" ack — skip, wait for final result
              if (payload?.status === "accepted") {
                console.log("[a2a:gateway-call] accepted, waiting for final result...");
                return;
              }

              // Final result
              console.log("[a2a:gateway-call] final payload keys:", Object.keys(payload ?? {}));
              console.log("[a2a:gateway-call] final payload:", JSON.stringify(payload).slice(0, 500));
              done({ ok: true, data: payload as T });
              return;
            }
          } catch (parseErr) {
            console.log("[a2a:gateway-call] parse error:", parseErr);
          }
        });

        ws.on("error", (err) => {
          done({ ok: false, error: `WebSocket error: ${err.message}` });
        });

        ws.on("close", (code, reason) => {
          if (!settled) {
            done({
              ok: false,
              error: `Gateway connection closed (${code}): ${reason?.toString() || "no reason"}`,
            });
          }
        });
      })
      .catch((err) => {
        done({ ok: false, error: `Failed to load WebSocket: ${err.message}` });
      });
  });
}

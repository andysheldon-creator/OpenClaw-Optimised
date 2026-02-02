/**
 * Gateway WebSocket Client for the Clawdbrain Web UI.
 *
 * Protocol v3 implementation with device authentication support.
 * Handles:
 * - WebSocket connection management
 * - Challenge-response device authentication
 * - Request/response correlation via message IDs
 * - Automatic reconnection with exponential backoff
 * - Event subscriptions with gap detection
 */

import { uuidv7 } from "@/lib/ids";
import { loadOrCreateDeviceIdentity, signDevicePayload, isSecureContext as checkSecureContext, type DeviceIdentity } from "./device-identity";
import {
  loadDeviceAuthToken,
  storeDeviceAuthToken,
  clearDeviceAuthToken,
  loadSharedGatewayToken,
  storeSharedGatewayToken,
} from "./device-auth-storage";

function newMessageId(): string {
  return uuidv7();
}

// =====================================================================
// Connection State Machine
// =====================================================================

export type GatewayConnectionState =
  | { status: "disconnected" }
  | { status: "connecting" }
  | { status: "auth_required"; error?: string }
  | { status: "connected" }
  | { status: "error"; error: string };

export type GatewayStatus = GatewayConnectionState["status"];

export interface GatewayEvent {
  event: string;
  payload?: unknown;
  seq?: number;
  stateVersion?: { presence: number; health: number };
}

export interface GatewayRequestOptions {
  timeout?: number;
}

export interface GatewayAuthCredentials {
  type: "token" | "password";
  value: string;
}

export interface GatewayHelloOk {
  protocol: number;
  features?: { methods?: string[]; events?: string[] };
  snapshot?: unknown;
  auth?: {
    deviceToken?: string;
    role?: string;
    scopes?: string[];
    issuedAtMs?: number;
  };
  policy?: { tickIntervalMs?: number };
}

export interface GatewayClientConfig {
  url?: string;
  token?: string;
  password?: string;
  clientName?: string;
  clientVersion?: string;
  platform?: string;
  mode?: string;
  instanceId?: string;
  onStatusChange?: (status: GatewayStatus) => void;
  onStateChange?: (state: GatewayConnectionState) => void;
  onEvent?: (event: GatewayEvent) => void;
  onError?: (error: Error) => void;
  onHello?: (hello: GatewayHelloOk) => void;
  onGap?: (info: { expected: number; received: number }) => void;
}

type PendingRequest = {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
};

type EventHandler = (event: GatewayEvent) => void;

const DEFAULT_GATEWAY_URL = "ws://127.0.0.1:18789";
const DEFAULT_TIMEOUT = 30000;
const MAX_BACKOFF = 15000;
const CONNECT_FAILED_CLOSE_CODE = 4008;
const CONNECT_DELAY = 50;

// Gateway client names and modes (matching gateway protocol)
const GATEWAY_CLIENT_NAMES = {
  CONTROL_UI: "control-ui",
  WEB_UI: "web-ui",
} as const;

const GATEWAY_CLIENT_MODES = {
  WEBCHAT: "webchat",
  CONTROL: "control",
} as const;

class GatewayClient {
  private ws: WebSocket | null = null;
  private config: GatewayClientConfig;
  private connectionState: GatewayConnectionState = { status: "disconnected" };
  private pending = new Map<string, PendingRequest>();
  private backoffMs = 800;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private connectTimer: ReturnType<typeof setTimeout> | null = null;
  private stopped = false;
  private connectPromise: Promise<void> | null = null;
  private connectResolve: (() => void) | null = null;
  private connectReject: ((error: Error) => void) | null = null;

  // Protocol v3 state
  private lastSeq: number | null = null;
  private connectNonce: string | null = null;
  private connectSent = false;
  private helloData: GatewayHelloOk | null = null;

  // Auth state
  private authToken: string | null = null;
  private authPassword: string | null = null;
  private deviceIdentity: DeviceIdentity | null = null;

  // Subscription handlers
  private subscribers = new Map<string, Set<EventHandler>>();
  private stateListeners = new Set<(state: GatewayConnectionState) => void>();

  constructor(config: GatewayClientConfig = {}) {
    this.config = config;
    this.authToken = config.token ?? null;
    this.authPassword = config.password ?? null;
  }

  private setConnectionState(state: GatewayConnectionState) {
    if (
      this.connectionState.status !== state.status ||
      (state.status === "auth_required" && this.connectionState.status === "auth_required" &&
        (state as { error?: string }).error !== (this.connectionState as { error?: string }).error) ||
      (state.status === "error" && this.connectionState.status === "error" &&
        (state as { error: string }).error !== (this.connectionState as { error: string }).error)
    ) {
      this.connectionState = state;
      this.config.onStateChange?.(state);
      this.notifyStateChange();
    }
  }

  private notifyStateChange() {
    for (const listener of this.stateListeners) {
      try {
        listener(this.connectionState);
      } catch (err) {
        console.error("[gateway] state listener error:", err);
      }
    }
  }

  getConnectionState(): GatewayConnectionState {
    return this.connectionState;
  }

  getStatus(): GatewayStatus {
    return this.connectionState.status;
  }

  isConnected(): boolean {
    return this.connectionState.status === "connected" && this.ws?.readyState === WebSocket.OPEN;
  }

  /**
   * Subscribe to connection state changes.
   * Returns an unsubscribe function.
   */
  onStateChange(listener: (state: GatewayConnectionState) => void): () => void {
    this.stateListeners.add(listener);
    return () => this.stateListeners.delete(listener);
  }

  /**
   * Set auth credentials from the auth modal.
   * Call retryConnect() after setting credentials to attempt connection.
   */
  setAuthCredentials(credentials: GatewayAuthCredentials) {
    if (credentials.type === "token") {
      this.authToken = credentials.value;
      this.authPassword = null;
      // Store for persistence
      storeSharedGatewayToken(credentials.value);
    } else {
      this.authPassword = credentials.value;
      // Don't store password
    }
  }

  /**
   * Clear stored credentials.
   */
  clearCredentials() {
    this.authToken = null;
    this.authPassword = null;
    if (this.deviceIdentity) {
      clearDeviceAuthToken({ deviceId: this.deviceIdentity.deviceId, role: "operator" });
    }
  }

  /**
   * Retry connection after setting credentials.
   */
  retryConnect(): Promise<void> {
    this.setConnectionState({ status: "connecting" });
    return this.connect();
  }

  getHelloData(): GatewayHelloOk | null {
    return this.helloData;
  }

  /**
   * Subscribe to gateway events.
   * @param event Event name to subscribe to, or "*" for all events
   * @param handler Event handler function
   * @returns Unsubscribe function
   */
  subscribe(event: string, handler: EventHandler): () => void {
    let handlers = this.subscribers.get(event);
    if (!handlers) {
      handlers = new Set();
      this.subscribers.set(event, handlers);
    }
    handlers.add(handler);

    return () => {
      handlers?.delete(handler);
      if (handlers?.size === 0) {
        this.subscribers.delete(event);
      }
    };
  }

  connect(): Promise<void> {
    if (this.connectPromise) {
      return this.connectPromise;
    }

    this.stopped = false;
    this.connectPromise = new Promise((resolve, reject) => {
      this.connectResolve = resolve;
      this.connectReject = reject;
      this.doConnect();
    });

    return this.connectPromise;
  }

  private doConnect() {
    if (this.stopped) return;

    const url = this.config.url || DEFAULT_GATEWAY_URL;
    this.setConnectionState({ status: "connecting" });

    try {
      this.ws = new WebSocket(url);

      this.ws.onopen = () => {
        this.queueConnect();
      };

      this.ws.onmessage = (event) => {
        this.handleMessage(String(event.data ?? ""));
      };

      this.ws.onclose = (event) => {
        const reason = String(event.reason ?? "");
        this.ws = null;
        this.flushPending(new Error(`Connection closed (${event.code}): ${reason}`));

        // Check if this was an auth failure
        if (event.code === CONNECT_FAILED_CLOSE_CODE || reason.includes("auth") || reason.includes("unauthorized")) {
          this.setConnectionState({
            status: "auth_required",
            error: reason || "Authentication failed",
          });
          // Don't auto-reconnect on auth failure
          this.connectPromise = null;
          this.connectReject?.(new Error(reason || "Authentication failed"));
          this.connectReject = null;
          this.connectResolve = null;
          return;
        }

        if (!this.stopped) {
          this.setConnectionState({ status: "disconnected" });
          this.scheduleReconnect();
        }
      };

      this.ws.onerror = () => {
        // Error will be followed by close, so we let close handler manage state
      };
    } catch (error) {
      this.setConnectionState({ status: "error", error: String(error) });
      this.config.onError?.(error instanceof Error ? error : new Error(String(error)));
      this.scheduleReconnect();
    }
  }

  private queueConnect() {
    this.connectNonce = null;
    this.connectSent = false;
    if (this.connectTimer !== null) {
      clearTimeout(this.connectTimer);
    }
    // Wait for challenge event, but send connect anyway after timeout
    this.connectTimer = setTimeout(() => {
      void this.sendConnect();
    }, CONNECT_DELAY);
  }

  private async sendConnect() {
    if (this.connectSent) return;
    this.connectSent = true;
    if (this.connectTimer !== null) {
      clearTimeout(this.connectTimer);
      this.connectTimer = null;
    }

    // crypto.subtle is only available in secure contexts (HTTPS, localhost).
    // Over plain HTTP, we skip device identity and fall back to token-only auth.
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;

    // crypto.subtle is only available in secure contexts (HTTPS, localhost)
    const isSecureContext = typeof crypto !== "undefined" && !!crypto.subtle;

    const scopes = ["operator.admin", "operator.approvals", "operator.pairing"];
    const role = "operator";
    let canFallbackToShared = false;

    // Try to load or use provided credentials
    let authToken = this.authToken || this.config.token || loadSharedGatewayToken();

    if (checkSecureContext()) {
      // Load or create device identity
      this.deviceIdentity = await loadOrCreateDeviceIdentity();

      // Check for stored device token
      const storedToken = loadDeviceAuthToken({
        deviceId: this.deviceIdentity.deviceId,
        role,
      })?.token;

      if (storedToken) {
        canFallbackToShared = Boolean(authToken);
        authToken = storedToken;
      }
    }

    const auth =
      authToken || this.authPassword || this.config.password
        ? {
            token: authToken ?? undefined,
            password: this.authPassword ?? this.config.password ?? undefined,
          }
        : undefined;

    let device:
      | {
          id: string;
          publicKey: string;
          signature: string;
          signedAt: number;
          nonce: string | undefined;
        }
      | undefined;

    if (checkSecureContext() && this.deviceIdentity) {
      const signedAtMs = Date.now();
      const nonce = this.connectNonce ?? undefined;
      const payload = buildDeviceAuthPayload({
        deviceId: this.deviceIdentity.deviceId,
        clientId: this.config.clientName ?? GATEWAY_CLIENT_NAMES.WEB_UI,
        clientMode: this.config.mode ?? GATEWAY_CLIENT_MODES.WEBCHAT,
        role,
        scopes,
        signedAtMs,
        token: authToken ?? null,
        nonce,
      });
      const signature = await signDevicePayload(this.deviceIdentity.privateKey, payload);
      device = {
        id: this.deviceIdentity.deviceId,
        publicKey: this.deviceIdentity.publicKey,
        signature,
        signedAt: signedAtMs,
        nonce,
      };
    }

    const params = {
      minProtocol: 3,
      maxProtocol: 3,
      client: {
        id: this.config.clientName ?? GATEWAY_CLIENT_NAMES.WEB_UI,
        version: this.config.clientVersion ?? "1.0.0",
        platform: this.config.platform ?? "web",
        mode: this.config.mode ?? GATEWAY_CLIENT_MODES.WEBCHAT,
        instanceId: this.config.instanceId,
        displayName: "Clawdbrain Web UI",
      },
      role,
      scopes,
      device,
      caps: [],
      auth,
      userAgent: navigator.userAgent,
      locale: navigator.language,
    };

    try {
      const hello = await this.request<GatewayHelloOk>("connect", params);

      // Store device token for future connections
      if (hello?.auth?.deviceToken && this.deviceIdentity) {
        storeDeviceAuthToken({
          deviceId: this.deviceIdentity.deviceId,
          role: hello.auth.role ?? role,
          token: hello.auth.deviceToken,
          scopes: hello.auth.scopes ?? [],
        });
      }

      this.helloData = hello;
      this.backoffMs = 800;
      this.setConnectionState({ status: "connected" });
      this.config.onHello?.(hello);
      this.connectResolve?.();
      this.connectPromise = null;
      this.connectResolve = null;
      this.connectReject = null;
    } catch (error) {
      if (canFallbackToShared && this.deviceIdentity) {
        clearDeviceAuthToken({ deviceId: this.deviceIdentity.deviceId, role });
      }
      this.ws?.close(CONNECT_FAILED_CLOSE_CODE, "connect failed");
      this.connectReject?.(error instanceof Error ? error : new Error(String(error)));
      this.connectPromise = null;
      this.connectResolve = null;
      this.connectReject = null;
    }
  }

  private handleMessage(raw: string) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return;
    }

    const frame = parsed as { type?: unknown; event?: string; id?: string };

    // Handle events
    if (frame.type === "event" || frame.event) {
      const evt = parsed as GatewayEvent;

      // Handle connect.challenge specially
      if (evt.event === "connect.challenge") {
        const payload = evt.payload as { nonce?: unknown } | undefined;
        const nonce = payload && typeof payload.nonce === "string" ? payload.nonce : null;
        if (nonce) {
          this.connectNonce = nonce;
          void this.sendConnect();
        }
        return;
      }

      // Track sequence numbers for gap detection
      const seq = typeof evt.seq === "number" ? evt.seq : null;
      if (seq !== null) {
        if (this.lastSeq !== null && seq > this.lastSeq + 1) {
          this.config.onGap?.({ expected: this.lastSeq + 1, received: seq });
        }
        this.lastSeq = seq;
      }

      // Notify subscribers
      this.notifySubscribers(evt);

      // Legacy callback
      try {
        this.config.onEvent?.(evt);
      } catch (err) {
        console.error("[gateway] event handler error:", err);
      }
      return;
    }

    // Handle responses
    if (frame.type === "res" && frame.id) {
      const res = parsed as {
        id: string;
        ok: boolean;
        payload?: unknown;
        error?: { code: string; message: string; details?: unknown };
      };
      const pending = this.pending.get(res.id);
      if (!pending) return;
      this.pending.delete(res.id);
      clearTimeout(pending.timer);

      if (res.ok) {
        pending.resolve(res.payload);
      } else {
        pending.reject(new Error(res.error?.message ?? "Request failed"));
      }
    }
  }

  private notifySubscribers(event: GatewayEvent) {
    // Notify specific event subscribers
    const handlers = this.subscribers.get(event.event);
    if (handlers) {
      for (const handler of handlers) {
        try {
          handler(event);
        } catch (err) {
          console.error(`[gateway] subscriber error for "${event.event}":`, err);
        }
      }
    }

    // Notify wildcard subscribers
    const wildcardHandlers = this.subscribers.get("*");
    if (wildcardHandlers) {
      for (const handler of wildcardHandlers) {
        try {
          handler(event);
        } catch (err) {
          console.error("[gateway] wildcard subscriber error:", err);
        }
      }
    }
  }

  private scheduleReconnect() {
    if (this.stopped || this.reconnectTimer) return;

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.backoffMs = Math.min(this.backoffMs * 1.7, MAX_BACKOFF);
      this.doConnect();
    }, this.backoffMs);
  }

  private flushPending(error: Error) {
    for (const [, pending] of this.pending) {
      clearTimeout(pending.timer);
      pending.reject(error);
    }
    this.pending.clear();
  }

  stop() {
    this.stopped = true;

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    if (this.connectTimer) {
      clearTimeout(this.connectTimer);
      this.connectTimer = null;
    }

    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }

    this.flushPending(new Error("Client stopped"));
    this.setConnectionState({ status: "disconnected" });
    this.connectPromise = null;
    this.connectResolve = null;
    this.connectReject = null;
    this.helloData = null;
    this.lastSeq = null;
  }

  async request<T = unknown>(
    method: string,
    params?: unknown,
    options?: GatewayRequestOptions
  ): Promise<T> {
    // Allow connect request to be sent even when not fully connected
    if (method !== "connect" && !this.isConnected()) {
      throw new Error("Not connected to gateway");
    }

    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error("WebSocket not open");
    }

    const id = newMessageId();
    const timeout = options?.timeout || DEFAULT_TIMEOUT;

    const frame = {
      type: "req",
      id,
      method,
      params,
    };

    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Request timeout: ${method}`));
      }, timeout);

      this.pending.set(id, {
        resolve: resolve as (value: unknown) => void,
        reject,
        timer,
      });

      this.ws!.send(JSON.stringify(frame));
    });
  }
}

// =====================================================================
// Device Auth Payload Builder (copied from src/gateway/device-auth.ts)
// =====================================================================

interface DeviceAuthPayloadParams {
  deviceId: string;
  clientId: string;
  clientMode: string;
  role: string;
  scopes: string[];
  signedAtMs: number;
  token?: string | null;
  nonce?: string | null;
  version?: "v1" | "v2";
}

function buildDeviceAuthPayload(params: DeviceAuthPayloadParams): string {
  const version = params.version ?? (params.nonce ? "v2" : "v1");
  const scopes = params.scopes.join(",");
  const token = params.token ?? "";
  const base = [
    version,
    params.deviceId,
    params.clientId,
    params.clientMode,
    params.role,
    scopes,
    String(params.signedAtMs),
    token,
  ];
  if (version === "v2") {
    base.push(params.nonce ?? "");
  }
  return base.join("|");
}

// =====================================================================
// Singleton & Factory
// =====================================================================

let gatewayClient: GatewayClient | null = null;

export function getGatewayClient(config?: GatewayClientConfig): GatewayClient {
  if (!gatewayClient) {
    gatewayClient = new GatewayClient(config);
  }
  return gatewayClient;
}

export function createGatewayClient(config?: GatewayClientConfig): GatewayClient {
  return new GatewayClient(config);
}

export function resetGatewayClient(): void {
  if (gatewayClient) {
    gatewayClient.stop();
    gatewayClient = null;
  }
}

export { GatewayClient };

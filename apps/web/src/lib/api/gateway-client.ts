/**
 * Gateway WebSocket Client for the Clawdbrain Web UI.
 *
 * This provides a simplified interface to connect to the gateway server
 * and make RPC-style requests. The client handles:
 * - WebSocket connection management with Protocol v3
 * - Device authentication with ed25519 keypairs
 * - Challenge-response flow for secure auth
 * - Request/response correlation via message IDs
 * - Automatic reconnection with exponential backoff
 * - Event subscriptions
 * - Connection state machine for UI integration
 */

import { uuidv7 } from "@/lib/ids";
import { loadOrCreateDeviceIdentity, signDevicePayload, type DeviceIdentity } from "./device-identity";
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
  onStateChange?: (state: GatewayConnectionState) => void;
  onEvent?: (event: GatewayEvent) => void;
  onError?: (error: Error) => void;
  onHello?: (hello: GatewayHelloOk) => void;
}

type PendingRequest = {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
};

const DEFAULT_GATEWAY_URL = "ws://127.0.0.1:18789";
const DEFAULT_TIMEOUT = 30000;
const MAX_BACKOFF = 15000;
const INITIAL_BACKOFF = 800;
const CONNECT_DELAY = 750; // Wait for challenge before sending connect

// 4008 = application-defined code (browser rejects 1008 "Policy Violation")
const CONNECT_FAILED_CLOSE_CODE = 4008;

class GatewayClient {
  private ws: WebSocket | null = null;
  private config: GatewayClientConfig;
  private connectionState: GatewayConnectionState = { status: "disconnected" };
  private pending = new Map<string, PendingRequest>();
  private backoffMs = INITIAL_BACKOFF;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private connectTimer: ReturnType<typeof setTimeout> | null = null;
  private stopped = false;
  private connectPromise: Promise<void> | null = null;
  private connectResolve: (() => void) | null = null;
  private connectReject: ((error: Error) => void) | null = null;
  private connectNonce: string | null = null;
  private connectSent = false;
  private lastSeq: number | null = null;
  private deviceIdentity: DeviceIdentity | null = null;
  private stateListeners = new Set<(state: GatewayConnectionState) => void>();

  // Credentials that can be updated from the auth modal
  private authToken: string | null = null;
  private authPassword: string | null = null;

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

      this.ws.onclose = (ev) => {
        const reason = String(ev.reason ?? "");
        this.ws = null;
        this.flushPending(new Error(`gateway closed (${ev.code}): ${reason}`));

        // Check if this was an auth failure
        if (ev.code === CONNECT_FAILED_CLOSE_CODE || reason.includes("auth") || reason.includes("unauthorized")) {
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

    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;

    // crypto.subtle is only available in secure contexts (HTTPS, localhost)
    const isSecureContext = typeof crypto !== "undefined" && !!crypto.subtle;

    const scopes = ["operator.admin", "operator.approvals", "operator.pairing"];
    const role = "operator";
    let canFallbackToShared = false;

    // Try to load or use provided credentials
    let authToken = this.authToken || loadSharedGatewayToken();

    if (isSecureContext) {
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
      authToken || this.authPassword
        ? {
            token: authToken ?? undefined,
            password: this.authPassword ?? undefined,
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

    if (isSecureContext && this.deviceIdentity) {
      const signedAtMs = Date.now();
      const nonce = this.connectNonce ?? undefined;
      const payload = buildDeviceAuthPayload({
        deviceId: this.deviceIdentity.deviceId,
        clientId: "clawdbrain-web",
        clientMode: "webchat",
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

    const connectParams = {
      minProtocol: 3,
      maxProtocol: 3,
      client: {
        id: "clawdbrain-web",
        displayName: "Clawdbrain Web UI",
        version: "1.0.0",
        platform: navigator.platform ?? "web",
        mode: "webchat",
      },
      role,
      scopes,
      device,
      caps: [],
      auth,
      userAgent: navigator.userAgent,
      locale: navigator.language,
    };

    const frame = {
      type: "req",
      id: newMessageId(),
      method: "connect",
      params: connectParams,
    };

    this.ws.send(JSON.stringify(frame));

    // Track the connect request ID for response handling
    const connectId = frame.id;
    const originalHandler = this.handleResponse.bind(this);

    const connectHandler = (id: string, ok: boolean, payload: unknown, error?: { code: string; message: string }) => {
      if (id !== connectId) {
        originalHandler(id, ok, payload, error);
        return;
      }

      this.handleResponse = originalHandler;

      if (ok) {
        const hello = payload as GatewayHelloOk;

        // Store device token if provided
        if (hello?.auth?.deviceToken && this.deviceIdentity) {
          storeDeviceAuthToken({
            deviceId: this.deviceIdentity.deviceId,
            role: hello.auth.role ?? role,
            token: hello.auth.deviceToken,
            scopes: hello.auth.scopes ?? [],
          });
        }

        this.backoffMs = INITIAL_BACKOFF;
        this.setConnectionState({ status: "connected" });
        this.config.onHello?.(hello);
        this.connectResolve?.();
        this.connectPromise = null;
        this.connectResolve = null;
        this.connectReject = null;
      } else {
        // Auth failed
        if (canFallbackToShared && this.deviceIdentity) {
          clearDeviceAuthToken({ deviceId: this.deviceIdentity.deviceId, role });
        }

        const errorMsg = error?.message ?? "Connect failed";
        this.setConnectionState({ status: "auth_required", error: errorMsg });
        this.ws?.close(CONNECT_FAILED_CLOSE_CODE, errorMsg);
      }
    };

    this.handleResponse = connectHandler;
  }

  private handleResponse(id: string, ok: boolean, payload: unknown, error?: { code: string; message: string }) {
    const pending = this.pending.get(id);
    if (!pending) return;

    clearTimeout(pending.timer);
    this.pending.delete(id);

    if (ok) {
      pending.resolve(payload);
    } else {
      pending.reject(new Error(error?.message ?? "Request failed"));
    }
  }

  private handleMessage(raw: string) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return;
    }

    const frame = parsed as { type?: string; id?: string; event?: string; ok?: boolean; payload?: unknown; error?: unknown; seq?: number };

    // Handle challenge event
    if (frame.type === "event" && frame.event === "connect.challenge") {
      const payload = (frame as { payload?: { nonce?: string } }).payload;
      const nonce = payload?.nonce;
      if (nonce && typeof nonce === "string") {
        this.connectNonce = nonce;
        void this.sendConnect();
      }
      return;
    }

    // Handle events
    if (frame.type === "event" && frame.event) {
      const seq = typeof frame.seq === "number" ? frame.seq : null;
      if (seq !== null) {
        if (this.lastSeq !== null && seq > this.lastSeq + 1) {
          console.warn(`[gateway] event sequence gap: expected ${this.lastSeq + 1}, got ${seq}`);
        }
        this.lastSeq = seq;
      }
      this.config.onEvent?.({
        event: frame.event,
        payload: frame.payload,
        seq: frame.seq,
      });
      return;
    }

    // Handle responses
    if (frame.type === "res" && frame.id) {
      const error = frame.error as { code: string; message: string } | undefined;
      this.handleResponse(frame.id, frame.ok === true, frame.payload, error);
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
  }

  async request<T = unknown>(
    method: string,
    params?: unknown,
    options?: GatewayRequestOptions
  ): Promise<T> {
    if (!this.isConnected()) {
      throw new Error("Not connected to gateway");
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

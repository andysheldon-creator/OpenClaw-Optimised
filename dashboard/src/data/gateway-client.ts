export type GatewayDashboardConfig = {
  url: string;
  token?: string;
  password?: string;
};

type PendingCall = {
  resolve: (value: unknown) => void;
  reject: (reason?: unknown) => void;
};

type GatewayRequestFrame = {
  type: "req";
  id: string;
  method: string;
  params?: unknown;
};

type GatewayResponseFrame = {
  type: "res";
  id: string;
  ok: boolean;
  payload?: unknown;
  error?: {
    message?: string;
    code?: string;
  };
};

type GatewayEventFrame = {
  type: "event";
  event: string;
  payload?: unknown;
};

const LOCALSTORAGE_KEY = "openclaw.dashboard.gateway";

function isLocalDevDashboardHost(hostname: string, port: string): boolean {
  if (port !== "5174") {
    return false;
  }
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
}

function resolveDefaultGatewayUrl(): string {
  if (typeof window === "undefined") {
    return "ws://127.0.0.1:18789";
  }
  const { protocol, host, hostname, port } = window.location;
  if (isLocalDevDashboardHost(hostname, port)) {
    return "ws://127.0.0.1:18789";
  }
  const wsProtocol = protocol === "https:" ? "wss:" : "ws:";
  return `${wsProtocol}//${host}/gateway/ws`;
}

function randomId(prefix: string): string {
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  return `${prefix}-${Array.from(bytes)
    .map((item) => item.toString(16).padStart(2, "0"))
    .join("")}`;
}

export function loadGatewayDashboardConfig(): GatewayDashboardConfig {
  const fallback: GatewayDashboardConfig = {
    url: resolveDefaultGatewayUrl(),
  };

  try {
    const raw = window.localStorage.getItem(LOCALSTORAGE_KEY);
    if (!raw) {
      return fallback;
    }
    const parsed = JSON.parse(raw) as Partial<GatewayDashboardConfig>;
    const url =
      typeof parsed.url === "string" && parsed.url.trim() ? parsed.url.trim() : fallback.url;
    return {
      url,
      token:
        typeof parsed.token === "string" && parsed.token.trim() ? parsed.token.trim() : undefined,
      password:
        typeof parsed.password === "string" && parsed.password.trim()
          ? parsed.password.trim()
          : undefined,
    };
  } catch {
    return fallback;
  }
}

export function saveGatewayDashboardConfig(config: GatewayDashboardConfig): void {
  const payload: GatewayDashboardConfig = {
    url: config.url,
    token: config.token?.trim() || undefined,
    password: config.password?.trim() || undefined,
  };
  window.localStorage.setItem(LOCALSTORAGE_KEY, JSON.stringify(payload));
}

export class DashboardGatewayClient {
  private ws: WebSocket | null = null;
  private pending = new Map<string, PendingCall>();
  private connectResolved = false;
  private connectPromise: Promise<void> | null = null;

  constructor(private readonly config: GatewayDashboardConfig) {}

  async connect(): Promise<void> {
    if (this.connectResolved && this.ws?.readyState === WebSocket.OPEN) {
      return;
    }
    if (this.connectPromise) {
      return await this.connectPromise;
    }

    this.connectPromise = new Promise<void>((resolve, reject) => {
      const ws = new WebSocket(this.config.url);
      this.ws = ws;
      let handshakeSent = false;

      const closeWithError = (message: string) => {
        reject(new Error(message));
      };

      ws.addEventListener("message", (event) => {
        let parsed: GatewayResponseFrame | GatewayEventFrame;
        try {
          parsed = JSON.parse(String(event.data)) as GatewayResponseFrame | GatewayEventFrame;
        } catch {
          return;
        }

        if (parsed.type === "event" && parsed.event === "connect.challenge" && !handshakeSent) {
          handshakeSent = true;
          const auth =
            this.config.token || this.config.password
              ? {
                  ...(this.config.token ? { token: this.config.token } : {}),
                  ...(this.config.password ? { password: this.config.password } : {}),
                }
              : undefined;
          const connectFrame: GatewayRequestFrame = {
            type: "req",
            id: randomId("connect"),
            method: "connect",
            params: {
              minProtocol: 1,
              maxProtocol: 99,
              client: {
                id: "openclaw-control-ui",
                displayName: "Dashboard",
                version: "dev",
                platform: "web",
                mode: "ui",
                instanceId: randomId("dashboard"),
              },
              role: "operator",
              scopes: ["operator.admin", "operator.approvals", "operator.pairing"],
              auth,
              locale: navigator.language,
              userAgent: navigator.userAgent,
            },
          };
          ws.send(JSON.stringify(connectFrame));
          return;
        }

        if (parsed.type !== "res") {
          return;
        }

        if (parsed.id.startsWith("connect-")) {
          if (!parsed.ok) {
            closeWithError(parsed.error?.message || "Gateway connect failed");
            return;
          }
          this.connectResolved = true;
          resolve();
          return;
        }

        const pending = this.pending.get(parsed.id);
        if (!pending) {
          return;
        }
        this.pending.delete(parsed.id);

        if (parsed.ok) {
          pending.resolve(parsed.payload);
        } else {
          pending.reject(new Error(parsed.error?.message || "Gateway request failed"));
        }
      });

      ws.addEventListener("open", () => {
        // Wait for connect.challenge event.
      });

      ws.addEventListener("error", () => {
        closeWithError(`Failed to connect to gateway at ${this.config.url}`);
      });

      ws.addEventListener("close", () => {
        if (!this.connectResolved) {
          closeWithError(`Gateway closed before handshake at ${this.config.url}`);
        }
        this.connectResolved = false;
        this.connectPromise = null;
        for (const call of this.pending.values()) {
          call.reject(new Error("Gateway closed"));
        }
        this.pending.clear();
      });
    });

    try {
      await this.connectPromise;
    } finally {
      this.connectPromise = null;
    }
  }

  async request<T>(method: string, params?: unknown): Promise<T> {
    await this.connect();
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error("Gateway socket is not open.");
    }

    const id = randomId("req");
    const frame: GatewayRequestFrame = {
      type: "req",
      id,
      method,
      params,
    };

    const result = await new Promise<T>((resolve, reject) => {
      this.pending.set(id, { resolve: resolve as (value: unknown) => void, reject });
      this.ws?.send(JSON.stringify(frame));
      setTimeout(() => {
        const pending = this.pending.get(id);
        if (!pending) {
          return;
        }
        this.pending.delete(id);
        reject(new Error(`Gateway timeout for ${method}`));
      }, 20_000);
    });

    return result;
  }

  disconnect(): void {
    this.ws?.close();
    this.ws = null;
    this.connectResolved = false;
    this.connectPromise = null;
  }
}

let clientSingleton: DashboardGatewayClient | null = null;

export function getDashboardGatewayClient(): DashboardGatewayClient {
  if (!clientSingleton) {
    clientSingleton = new DashboardGatewayClient(loadGatewayDashboardConfig());
  }
  return clientSingleton;
}

export function resetDashboardGatewayClient(
  config?: GatewayDashboardConfig,
): DashboardGatewayClient {
  clientSingleton?.disconnect();
  clientSingleton = new DashboardGatewayClient(config ?? loadGatewayDashboardConfig());
  return clientSingleton;
}

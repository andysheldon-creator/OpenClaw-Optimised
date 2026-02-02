/**
 * React hook for Gateway connection state management.
 *
 * Provides reactive access to the Gateway connection state and authentication.
 * Used by GatewayAuthModal to manage the auth flow.
 */

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import {
  getGatewayClient,
  type GatewayConnectionState,
  type GatewayAuthCredentials,
  type GatewayEvent,
  type GatewayClientConfig,
  type GatewayHelloOk,
} from "@/lib/api/gateway-client";

export interface GapInfo {
  expected: number;
  received: number;
}

export interface UseGatewayConnectionOptions {
  /** Gateway WebSocket URL (defaults to ws://127.0.0.1:18789) */
  url?: string;
  /** Authentication token */
  token?: string;
  /** Password for authentication */
  password?: string;
  /** Auto-connect on mount */
  autoConnect?: boolean;
  /** Event handler */
  onEvent?: (event: GatewayEvent) => void;
  /** Gap detection handler */
  onGap?: (info: GapInfo) => void;
  /** Hello handler (called after successful connection) */
  onHello?: (hello: GatewayHelloOk) => void;
}

export interface UseGatewayConnectionResult {
  /** Current connection state */
  state: GatewayConnectionState;
  /** Legacy status for backward compatibility */
  status: GatewayConnectionState["status"];
  /** Whether connected to the gateway */
  isConnected: boolean;
  /** Whether authentication is required (modal should be shown) */
  needsAuth: boolean;
  /** Whether currently connecting */
  isConnecting: boolean;
  /** Error message if auth failed */
  authError: string | undefined;
  /** Connection error */
  error: Error | null;
  /** Authenticate with credentials and retry connection */
  authenticate: (credentials: GatewayAuthCredentials) => Promise<void>;
  /** Clear stored credentials */
  clearCredentials: () => void;
  /** Connect to the gateway */
  connect: () => Promise<void>;
  /** Retry connection with current credentials */
  retryConnect: () => Promise<void>;
  /** Stop the gateway connection */
  disconnect: () => void;
  /** Hello data from the gateway (features, auth info, etc.) */
  helloData: GatewayHelloOk | null;
  /** Number of reconnection attempts */
  reconnectAttempts: number;
  /** Last gap info if any sequence gaps were detected */
  lastGap: GapInfo | null;
}

/**
 * Hook to manage Gateway connection state.
 *
 * @param options - Connection options
 * @returns Connection state and control functions
 */
export function useGatewayConnection(
  options: UseGatewayConnectionOptions = {}
): UseGatewayConnectionResult {
  const { url, token, password, autoConnect = true, onEvent, onGap, onHello } = options;

  const mountedRef = useRef(true);
  const wasConnectedRef = useRef(false);
  const clientRef = useRef<ReturnType<typeof getGatewayClient> | null>(null);

  // Legacy state for backward compatibility
  const [helloData, setHelloData] = useState<GatewayHelloOk | null>(null);
  const [reconnectAttempts, setReconnectAttempts] = useState(0);
  const [lastGap, setLastGap] = useState<GapInfo | null>(null);

  // Initialize client once with config
  const client = useMemo(() => {
    const config: GatewayClientConfig = {
      url,
      token,
      password,
      onEvent,
      onHello: (hello) => {
        if (mountedRef.current) {
          setHelloData(hello);
          setReconnectAttempts(0); // Reset on successful connection
          wasConnectedRef.current = true;
          onHello?.(hello);
        }
      },
      onGap: (info) => {
        if (mountedRef.current) {
          setLastGap(info);
          onGap?.(info);
        }
      },
    };
    const c = getGatewayClient(config);
    clientRef.current = c;
    return c;
  }, [url, token, password, onEvent, onGap, onHello]);

  const [state, setState] = useState<GatewayConnectionState>(client.getConnectionState());
  const [error, setError] = useState<Error | null>(null);

  // Subscribe to state changes
  useEffect(() => {
    const unsubscribe = client.onStateChange((newState) => {
      if (mountedRef.current) {
        setState(newState);

        // Track reconnection attempts
        if (newState.status === "connecting" && wasConnectedRef.current) {
          setReconnectAttempts((prev) => prev + 1);
        }

        // Update error for backward compatibility
        if (newState.status === "error") {
          setError(new Error((newState as { error: string }).error));
        } else if (newState.status === "auth_required") {
          const authState = newState as { error?: string };
          if (authState.error) {
            setError(new Error(authState.error));
          }
        } else if (newState.status === "connected") {
          setError(null);
        }
      }
    });

    return () => {
      unsubscribe();
    };
  }, [client]);

  // Auto-connect on mount if enabled
  useEffect(() => {
    mountedRef.current = true;

    if (autoConnect && state.status === "disconnected") {
      const timer = window.setTimeout(() => {
        client.connect().catch(() => {
          // Error will be reflected in state
        });
      }, 0);

      return () => {
        window.clearTimeout(timer);
        mountedRef.current = false;
      };
    }

    return () => {
      mountedRef.current = false;
    };
  }, [autoConnect, client, state.status]);

  const authenticate = useCallback(
    async (credentials: GatewayAuthCredentials) => {
      client.setAuthCredentials(credentials);

      // Wait for connection or failure
      return new Promise<void>((resolve, reject) => {
        const unsub = client.onStateChange((newState) => {
          if (newState.status === "connected") {
            unsub();
            resolve();
          } else if (newState.status === "auth_required" || newState.status === "error") {
            unsub();
            const errorMsg =
              newState.status === "auth_required"
                ? (newState as { error?: string }).error
                : (newState as { error: string }).error;
            reject(new Error(errorMsg ?? "Connection failed"));
          }
        });

        // Trigger reconnect
        client.retryConnect().catch((err) => {
          unsub();
          reject(err);
        });
      });
    },
    [client]
  );

  const clearCredentials = useCallback(() => {
    client.clearCredentials();
  }, [client]);

  const connect = useCallback(async () => {
    setError(null);
    try {
      await client.connect();
    } catch (err) {
      if (mountedRef.current) {
        setError(err instanceof Error ? err : new Error(String(err)));
      }
    }
  }, [client]);

  const retryConnect = useCallback(async () => {
    await client.retryConnect();
  }, [client]);

  const disconnect = useCallback(() => {
    client.stop();
    setHelloData(null);
    wasConnectedRef.current = false;
  }, [client]);

  const isConnected = state.status === "connected";
  const needsAuth = state.status === "auth_required";
  const isConnecting = state.status === "connecting";
  const authError = state.status === "auth_required" ? (state as { error?: string }).error : undefined;

  return {
    state,
    status: state.status,
    isConnected,
    needsAuth,
    isConnecting,
    authError,
    error,
    authenticate,
    clearCredentials,
    connect,
    retryConnect,
    disconnect,
    helloData,
    reconnectAttempts,
    lastGap,
  };
}

/**
 * Hook to get the current gateway URL from config or environment.
 */
export function useGatewayUrl(): string {
  // In the future, this could read from user settings or environment
  return "ws://127.0.0.1:18789";
}

export default useGatewayConnection;

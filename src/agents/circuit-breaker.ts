import { createSubsystemLogger } from "../logging/subsystem.js";

const log = createSubsystemLogger("agent/circuit-breaker");

export type CircuitBreakerState = "closed" | "open" | "half-open";

type ProviderCircuit = {
  failures: number;
  lastFailure: number;
  state: CircuitBreakerState;
  openedAt: number;
};

export type CircuitBreakerConfig = {
  /** Number of consecutive failures before opening the circuit. Default: 3. */
  failureThreshold?: number;
  /** Duration in ms the circuit stays open before transitioning to half-open. Default: 300_000 (5 min). */
  resetTimeoutMs?: number;
  /** Enable/disable circuit breaker globally. Default: false. */
  enabled?: boolean;
};

const DEFAULT_FAILURE_THRESHOLD = 3;
const DEFAULT_RESET_TIMEOUT_MS = 300_000; // 5 minutes

const circuits = new Map<string, ProviderCircuit>();

function resolveConfig(config?: CircuitBreakerConfig): Required<CircuitBreakerConfig> {
  return {
    failureThreshold: config?.failureThreshold ?? DEFAULT_FAILURE_THRESHOLD,
    resetTimeoutMs: config?.resetTimeoutMs ?? DEFAULT_RESET_TIMEOUT_MS,
    enabled: config?.enabled ?? false,
  };
}

function getOrCreate(providerKey: string): ProviderCircuit {
  let circuit = circuits.get(providerKey);
  if (!circuit) {
    circuit = { failures: 0, lastFailure: 0, state: "closed", openedAt: 0 };
    circuits.set(providerKey, circuit);
  }
  return circuit;
}

export function isCircuitOpen(providerKey: string, config?: CircuitBreakerConfig): boolean {
  const resolved = resolveConfig(config);
  if (!resolved.enabled) {
    return false;
  }

  const circuit = circuits.get(providerKey);
  if (!circuit || circuit.state === "closed") {
    return false;
  }

  if (circuit.state === "open") {
    const elapsed = Date.now() - circuit.openedAt;
    if (elapsed >= resolved.resetTimeoutMs) {
      circuit.state = "half-open";
      log.debug(`Circuit half-open for ${providerKey}`, { elapsed });
      return false; // allow one probe request
    }
    return true;
  }

  // half-open: allow the probe
  return false;
}

export function recordFailure(providerKey: string, config?: CircuitBreakerConfig): void {
  const resolved = resolveConfig(config);
  if (!resolved.enabled) {
    return;
  }

  const circuit = getOrCreate(providerKey);
  circuit.failures += 1;
  circuit.lastFailure = Date.now();

  if (circuit.state === "half-open") {
    // probe failed, re-open
    circuit.state = "open";
    circuit.openedAt = Date.now();
    log.warn(`Circuit re-opened for ${providerKey} (probe failed)`);
    return;
  }

  if (circuit.failures >= resolved.failureThreshold) {
    circuit.state = "open";
    circuit.openedAt = Date.now();
    log.warn(`Circuit opened for ${providerKey} after ${circuit.failures} consecutive failures`);
  }
}

export function recordSuccess(providerKey: string, config?: CircuitBreakerConfig): void {
  const resolved = resolveConfig(config);
  if (!resolved.enabled) {
    return;
  }

  const circuit = circuits.get(providerKey);
  if (!circuit) {
    return;
  }

  if (circuit.state === "half-open") {
    log.info(`Circuit closed for ${providerKey} (probe succeeded)`);
  }

  circuit.failures = 0;
  circuit.state = "closed";
  circuit.openedAt = 0;
}

export function getCircuitState(providerKey: string): CircuitBreakerState {
  return circuits.get(providerKey)?.state ?? "closed";
}

export function resetCircuits(): void {
  circuits.clear();
}

export function resetCircuit(providerKey: string): void {
  circuits.delete(providerKey);
}

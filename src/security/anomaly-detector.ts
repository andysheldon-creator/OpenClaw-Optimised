/**
 * OpenClaw Anomaly Detector
 *
 * Monitors for suspicious patterns that may indicate attacks:
 * - Authentication failure bursts
 * - Request rate spikes
 * - Abnormal write volumes
 *
 * On trigger:
 * - Logs SECURITY_EVENT (no secrets)
 * - Optional webhook notification
 * - Optional temporary IP blocking
 */

import { createSubsystemLogger } from "../logging/subsystem.js";

const log = createSubsystemLogger("security/anomaly");

export type AnomalyType =
  | "auth_failure_burst"
  | "request_rate_spike"
  | "abnormal_write_volume"
  | "identity_manipulation"
  | "dangerous_command"
  | "public_bind_attempt";

export type AnomalyEvent = {
  type: AnomalyType;
  timestamp: Date;
  sourceIp?: string;
  details: Record<string, unknown>;
  severity: "low" | "medium" | "high" | "critical";
};

export type AnomalyDetectorConfig = {
  /** Webhook URL for security alerts */
  webhookUrl?: string;
  /** Enable in-memory IP blocking */
  enableIpBlocking?: boolean;
  /** Duration to block IPs (ms) */
  ipBlockDurationMs?: number;
  /** Auth failures before triggering */
  authFailureThreshold?: number;
  /** Time window for auth failures (ms) */
  authFailureWindowMs?: number;
  /** Requests per second before triggering */
  requestRateThreshold?: number;
  /** Write operations per minute before triggering */
  writeVolumeThreshold?: number;
};

const DEFAULT_CONFIG: Required<AnomalyDetectorConfig> = {
  webhookUrl: "",
  enableIpBlocking: false,
  ipBlockDurationMs: 5 * 60 * 1000, // 5 minutes
  authFailureThreshold: 10,
  authFailureWindowMs: 60 * 1000, // 1 minute
  requestRateThreshold: 100, // per second
  writeVolumeThreshold: 1000, // per minute
};

/**
 * In-memory state for anomaly detection
 */
class AnomalyDetectorState {
  private authFailures = new Map<string, number[]>(); // IP -> timestamps
  private requestCounts = new Map<string, number[]>(); // IP -> timestamps
  private writeCounts: number[] = [];
  private blockedIps = new Map<string, number>(); // IP -> unblock timestamp
  private config: Required<AnomalyDetectorConfig>;

  constructor(config?: AnomalyDetectorConfig) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Records an authentication failure
   */
  recordAuthFailure(sourceIp: string): AnomalyEvent | null {
    const now = Date.now();
    const windowStart = now - this.config.authFailureWindowMs;

    // Get or create failure list for this IP
    let failures = this.authFailures.get(sourceIp) ?? [];

    // Remove old entries
    failures = failures.filter((ts) => ts > windowStart);

    // Add new failure
    failures.push(now);
    this.authFailures.set(sourceIp, failures);

    // Check threshold
    if (failures.length >= this.config.authFailureThreshold) {
      const event: AnomalyEvent = {
        type: "auth_failure_burst",
        timestamp: new Date(),
        sourceIp,
        severity: "high",
        details: {
          failureCount: failures.length,
          windowMs: this.config.authFailureWindowMs,
          threshold: this.config.authFailureThreshold,
        },
      };

      this.handleAnomalyEvent(event);

      // Clear the counter to avoid repeated triggers
      this.authFailures.delete(sourceIp);

      return event;
    }

    return null;
  }

  /**
   * Records a request for rate limiting
   */
  recordRequest(sourceIp: string): AnomalyEvent | null {
    const now = Date.now();
    const windowStart = now - 1000; // 1 second window

    // Get or create request list for this IP
    let requests = this.requestCounts.get(sourceIp) ?? [];

    // Remove old entries
    requests = requests.filter((ts) => ts > windowStart);

    // Add new request
    requests.push(now);
    this.requestCounts.set(sourceIp, requests);

    // Check threshold
    if (requests.length >= this.config.requestRateThreshold) {
      const event: AnomalyEvent = {
        type: "request_rate_spike",
        timestamp: new Date(),
        sourceIp,
        severity: "medium",
        details: {
          requestCount: requests.length,
          windowMs: 1000,
          threshold: this.config.requestRateThreshold,
        },
      };

      this.handleAnomalyEvent(event);
      return event;
    }

    return null;
  }

  /**
   * Records a write operation
   */
  recordWrite(): AnomalyEvent | null {
    const now = Date.now();
    const windowStart = now - 60 * 1000; // 1 minute window

    // Remove old entries
    this.writeCounts = this.writeCounts.filter((ts) => ts > windowStart);

    // Add new write
    this.writeCounts.push(now);

    // Check threshold
    if (this.writeCounts.length >= this.config.writeVolumeThreshold) {
      const event: AnomalyEvent = {
        type: "abnormal_write_volume",
        timestamp: new Date(),
        severity: "high",
        details: {
          writeCount: this.writeCounts.length,
          windowMs: 60 * 1000,
          threshold: this.config.writeVolumeThreshold,
        },
      };

      this.handleAnomalyEvent(event);
      return event;
    }

    return null;
  }

  /**
   * Records a custom anomaly event
   */
  recordAnomaly(event: Omit<AnomalyEvent, "timestamp">): void {
    const fullEvent: AnomalyEvent = {
      ...event,
      timestamp: new Date(),
    };
    this.handleAnomalyEvent(fullEvent);
  }

  /**
   * Checks if an IP is currently blocked
   */
  isIpBlocked(ip: string): boolean {
    const unblockTime = this.blockedIps.get(ip);
    if (!unblockTime) {
      return false;
    }

    if (Date.now() >= unblockTime) {
      this.blockedIps.delete(ip);
      return false;
    }

    return true;
  }

  /**
   * Blocks an IP temporarily
   */
  blockIp(ip: string): void {
    if (!this.config.enableIpBlocking) {
      return;
    }

    const unblockTime = Date.now() + this.config.ipBlockDurationMs;
    this.blockedIps.set(ip, unblockTime);
    log.warn(`SECURITY_EVENT: temporarily blocked IP ${ip} for ${this.config.ipBlockDurationMs}ms`);
  }

  /**
   * Handles an anomaly event
   */
  private handleAnomalyEvent(event: AnomalyEvent): void {
    // Log the event (redact sensitive data)
    const logEvent = {
      type: event.type,
      timestamp: event.timestamp.toISOString(),
      sourceIp: event.sourceIp ? this.redactIp(event.sourceIp) : undefined,
      severity: event.severity,
      details: event.details,
    };

    log.warn(`SECURITY_EVENT: ${JSON.stringify(logEvent)}`);

    // Block IP if enabled and severity is high enough
    if (
      this.config.enableIpBlocking &&
      event.sourceIp &&
      (event.severity === "high" || event.severity === "critical")
    ) {
      this.blockIp(event.sourceIp);
    }

    // Send webhook if configured
    if (this.config.webhookUrl) {
      this.sendWebhook(event).catch((err) => {
        log.error(`failed to send security webhook: ${String(err)}`);
      });
    }
  }

  /**
   * Sends a webhook notification
   */
  private async sendWebhook(event: AnomalyEvent): Promise<void> {
    if (!this.config.webhookUrl) {
      return;
    }

    const payload = {
      event: "SECURITY_EVENT",
      type: event.type,
      timestamp: event.timestamp.toISOString(),
      sourceIp: event.sourceIp ? this.redactIp(event.sourceIp) : undefined,
      severity: event.severity,
      details: event.details,
    };

    try {
      const response = await fetch(this.config.webhookUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(5000),
      });

      if (!response.ok) {
        log.error(`security webhook returned ${response.status}`);
      }
    } catch (err) {
      log.error(`security webhook failed: ${String(err)}`);
    }
  }

  /**
   * Partially redacts an IP for logging
   */
  private redactIp(ip: string): string {
    // Keep first octet, redact rest
    const parts = ip.split(".");
    if (parts.length === 4) {
      return `${parts[0]}.xxx.xxx.xxx`;
    }
    // IPv6 - keep first segment
    const v6parts = ip.split(":");
    if (v6parts.length > 1) {
      return `${v6parts[0]}:xxxx:xxxx:xxxx`;
    }
    return "xxx.xxx.xxx.xxx";
  }

  /**
   * Gets current blocked IPs count
   */
  getBlockedIpsCount(): number {
    // Clean up expired blocks
    const now = Date.now();
    for (const [ip, unblockTime] of this.blockedIps.entries()) {
      if (now >= unblockTime) {
        this.blockedIps.delete(ip);
      }
    }
    return this.blockedIps.size;
  }

  /**
   * Clears all state (for testing)
   */
  clear(): void {
    this.authFailures.clear();
    this.requestCounts.clear();
    this.writeCounts = [];
    this.blockedIps.clear();
  }
}

// Singleton instance
let detector: AnomalyDetectorState | null = null;

/**
 * Initializes the anomaly detector with configuration
 */
export function initAnomalyDetector(config?: AnomalyDetectorConfig): void {
  detector = new AnomalyDetectorState(config);
  log.info("anomaly detector initialized");
}

/**
 * Gets the anomaly detector instance
 */
export function getAnomalyDetector(): AnomalyDetectorState {
  if (!detector) {
    detector = new AnomalyDetectorState();
  }
  return detector;
}

/**
 * Records an authentication failure
 */
export function recordAuthFailure(sourceIp: string): AnomalyEvent | null {
  return getAnomalyDetector().recordAuthFailure(sourceIp);
}

/**
 * Records a request for rate limiting
 */
export function recordRequest(sourceIp: string): AnomalyEvent | null {
  return getAnomalyDetector().recordRequest(sourceIp);
}

/**
 * Records a write operation
 */
export function recordWrite(): AnomalyEvent | null {
  return getAnomalyDetector().recordWrite();
}

/**
 * Records a custom anomaly
 */
export function recordAnomaly(event: Omit<AnomalyEvent, "timestamp">): void {
  getAnomalyDetector().recordAnomaly(event);
}

/**
 * Checks if an IP is blocked
 */
export function isIpBlocked(ip: string): boolean {
  return getAnomalyDetector().isIpBlocked(ip);
}

/**
 * Resets the detector (for testing)
 */
export function resetAnomalyDetector(): void {
  detector?.clear();
  detector = null;
}

/**
 * OBS-002 (#86) -- Metrics: success rate + latency
 *
 * Types and in-memory implementation for collecting runtime metrics
 * (counters, gauges, histograms) to track success rates, latency
 * distributions, and other operational signals.
 */

// ---------------------------------------------------------------------------
// Metric types
// ---------------------------------------------------------------------------

/** The kind of metric being recorded. */
export type MetricType = "counter" | "gauge" | "histogram";

/** A single metric data point. */
export type Metric = {
  /** Metric name (e.g. "run.success", "step.latency_ms"). */
  name: string;
  /** The kind of metric. */
  type: MetricType;
  /** Current numeric value. */
  value: number;
  /** ISO-8601 timestamp of when this value was last updated. */
  updatedAt: string;
  /** Key-value labels for dimensional filtering (e.g. skill, environment). */
  labels: Record<string, string>;
};

// ---------------------------------------------------------------------------
// Metric bucket (histogram)
// ---------------------------------------------------------------------------

/** A single bucket in a histogram distribution. */
export type MetricBucket = {
  /** Upper bound of this bucket (inclusive). */
  le: number;
  /** Number of observations that fell into this bucket. */
  count: number;
};

/** Full histogram representation with buckets and summary stats. */
export type HistogramData = {
  /** Ordered list of buckets. */
  buckets: MetricBucket[];
  /** Total number of observations recorded. */
  totalCount: number;
  /** Sum of all observed values. */
  totalSum: number;
};

// ---------------------------------------------------------------------------
// Metrics snapshot
// ---------------------------------------------------------------------------

/** Point-in-time snapshot of all collected metrics. */
export type MetricsSnapshot = {
  /** ISO-8601 timestamp of when the snapshot was taken. */
  timestamp: string;
  /** All counter and gauge metrics. */
  metrics: Metric[];
  /** Histogram data keyed by metric name. */
  histograms: Record<string, HistogramData>;
};

// ---------------------------------------------------------------------------
// MetricsCollector interface
// ---------------------------------------------------------------------------

/** Contract for a metrics collection backend. */
export interface MetricsCollector {
  /**
   * Increment a counter by the given amount (default 1).
   *
   * @param name - Counter name.
   * @param amount - Value to add (must be positive).
   * @param labels - Dimensional labels.
   */
  increment(name: string, amount?: number, labels?: Record<string, string>): void;

  /**
   * Set a gauge to an absolute value.
   *
   * @param name - Gauge name.
   * @param value - Current value.
   * @param labels - Dimensional labels.
   */
  gauge(name: string, value: number, labels?: Record<string, string>): void;

  /**
   * Record an observation in a histogram.
   *
   * @param name - Histogram name.
   * @param value - Observed value (e.g. latency in ms).
   * @param labels - Dimensional labels.
   */
  observe(name: string, value: number, labels?: Record<string, string>): void;

  /**
   * Return a point-in-time snapshot of all collected metrics.
   */
  snapshot(): MetricsSnapshot;

  /**
   * Reset all metrics to their initial state.
   */
  reset(): void;
}

// ---------------------------------------------------------------------------
// Default histogram bucket boundaries
// ---------------------------------------------------------------------------

/** Default latency bucket boundaries in milliseconds. */
export const DEFAULT_HISTOGRAM_BUCKETS: readonly number[] = [
  5, 10, 25, 50, 100, 250, 500, 1_000, 2_500, 5_000, 10_000,
];

// ---------------------------------------------------------------------------
// InMemoryMetrics implementation
// ---------------------------------------------------------------------------

/**
 * In-memory metrics collector for development and testing.
 *
 * Data is lost when the process exits. For production, replace with a
 * backend that exports to Prometheus, Datadog, or a similar system.
 */
export class InMemoryMetrics implements MetricsCollector {
  private counters = new Map<string, Metric>();
  private gauges = new Map<string, Metric>();
  private histogramObservations = new Map<string, number[]>();

  constructor(
    /** Bucket boundaries for histogram metrics. */
    private readonly bucketBoundaries: readonly number[] = DEFAULT_HISTOGRAM_BUCKETS,
  ) {}

  increment(name: string, amount: number = 1, labels: Record<string, string> = {}): void {
    const key = this.metricKey(name, labels);
    const existing = this.counters.get(key);

    if (existing) {
      existing.value += amount;
      existing.updatedAt = new Date().toISOString();
    } else {
      this.counters.set(key, {
        name,
        type: "counter",
        value: amount,
        updatedAt: new Date().toISOString(),
        labels,
      });
    }
  }

  gauge(name: string, value: number, labels: Record<string, string> = {}): void {
    const key = this.metricKey(name, labels);
    this.gauges.set(key, {
      name,
      type: "gauge",
      value,
      updatedAt: new Date().toISOString(),
      labels,
    });
  }

  observe(name: string, value: number, _labels: Record<string, string> = {}): void {
    const observations = this.histogramObservations.get(name) ?? [];
    observations.push(value);
    this.histogramObservations.set(name, observations);
  }

  snapshot(): MetricsSnapshot {
    const histograms: Record<string, HistogramData> = {};

    for (const [name, observations] of this.histogramObservations) {
      const buckets: MetricBucket[] = this.bucketBoundaries.map((le) => ({
        le,
        count: observations.filter((v) => v <= le).length,
      }));

      histograms[name] = {
        buckets,
        totalCount: observations.length,
        totalSum: observations.reduce((sum, v) => sum + v, 0),
      };
    }

    return {
      timestamp: new Date().toISOString(),
      metrics: [...Array.from(this.counters.values()), ...Array.from(this.gauges.values())],
      histograms,
    };
  }

  reset(): void {
    this.counters.clear();
    this.gauges.clear();
    this.histogramObservations.clear();
  }

  // -------------------------------------------------------------------------
  // Internal
  // -------------------------------------------------------------------------

  /** Build a deterministic map key from name + sorted labels. */
  private metricKey(name: string, labels: Record<string, string>): string {
    const sorted = Object.entries(labels)
      .toSorted(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}=${v}`)
      .join(",");
    return sorted ? `${name}{${sorted}}` : name;
  }
}

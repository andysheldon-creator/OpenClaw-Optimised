export type NodeHealthFrame = {
  /** Node-local timestamp (ms since epoch) if available; otherwise gateway receive time. */
  ts: number;
  /** Optional schema version for forward/backward compatibility. */
  v?: number;
  /** Opaque "kind" so we can add other frame shapes later (telemetry, alerts, etc.). */
  kind?: string;
  /**
   * Free-form payload (kept intentionally flexible).
   * Consumers should feature-detect fields rather than assuming a fixed shape.
   */
  data: Record<string, unknown>;
};

export type NodeHealthEntry = {
  nodeId: string;
  receivedAtMs: number;
  frame: NodeHealthFrame;
};

// In-memory recent-frame store per node. ("Persist" here means "retain in gateway memory".)
const framesByNode = new Map<string, NodeHealthEntry[]>();

// Keep it lightweight but useful for dashboards.
const NODE_HEALTH_MAX_FRAMES_PER_NODE = 20;

// Backstop eviction for transient/ephemeral node IDs.
const NODE_HEALTH_TTL_MS = 10 * 60 * 1000;

function evictStaleNodeHealthEntries(now = Date.now()) {
  for (const [nodeId, entries] of framesByNode.entries()) {
    const last = entries.at(-1);
    if (!last) {
      framesByNode.delete(nodeId);
      continue;
    }
    if (now - last.receivedAtMs > NODE_HEALTH_TTL_MS) {
      framesByNode.delete(nodeId);
    }
  }
}

function sanitizeNodeHealthFrame(frame: NodeHealthFrame, now: number): NodeHealthFrame {
  return {
    // Ensure ts is always present.
    ts: typeof frame.ts === "number" && Number.isFinite(frame.ts) ? frame.ts : now,
    v: frame.v,
    kind: frame.kind,
    data: typeof frame.data === "object" && frame.data !== null ? frame.data : {},
  };
}

export function upsertNodeHealthFrame(params: { nodeId: string; frame: NodeHealthFrame }) {
  const now = Date.now();
  evictStaleNodeHealthEntries(now);

  const entry: NodeHealthEntry = {
    nodeId: params.nodeId,
    receivedAtMs: now,
    frame: sanitizeNodeHealthFrame(params.frame, now),
  };

  const list = framesByNode.get(params.nodeId) ?? [];
  list.push(entry);
  while (list.length > NODE_HEALTH_MAX_FRAMES_PER_NODE) {
    list.shift();
  }
  framesByNode.set(params.nodeId, list);
  return entry;
}

/** Latest (most recent) frame per node. */
export function getLatestNodeHealthFrames(): NodeHealthEntry[] {
  evictStaleNodeHealthEntries();
  const out: NodeHealthEntry[] = [];
  for (const entries of framesByNode.values()) {
    const last = entries.at(-1);
    if (last) {
      out.push(last);
    }
  }
  return out;
}

/** Recent frames for a specific node, ordered oldest -> newest. */
export function getRecentNodeHealthFrames(params: {
  nodeId: string;
  limit?: number;
}): NodeHealthEntry[] {
  evictStaleNodeHealthEntries();
  const entries = framesByNode.get(params.nodeId) ?? [];
  const limitRaw = params.limit;
  const limit =
    typeof limitRaw === "number" && Number.isFinite(limitRaw)
      ? Math.max(1, Math.min(200, Math.trunc(limitRaw)))
      : undefined;
  if (!limit) {
    return [...entries];
  }
  return entries.slice(Math.max(0, entries.length - limit));
}

export function clearNodeHealthFramesForNode(nodeId: string) {
  framesByNode.delete(nodeId);
}

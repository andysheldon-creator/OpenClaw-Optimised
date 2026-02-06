// @ts-expect-error - echarts doesn't have proper ESM types
import * as echarts from "echarts";
import { html, nothing, type TemplateResult } from "lit";
import type {
  AgentHierarchyNode,
  AgentHierarchyResult,
  AgentHierarchyUsage,
  CollaborationEdge,
} from "../types.ts";
import { renderEmptyState } from "../app-render.helpers.ts";
import { formatAgo } from "../format.ts";
import { icons } from "../icons.ts";

export type AgentsHierarchyProps = {
  loading: boolean;
  error: string | null;
  data: AgentHierarchyResult | null;
  onRefresh: () => void;
  onNodeClick?: (sessionKey: string) => void;
};

type NodeMeta = {
  sessionKey: string;
  runId?: string;
  agentId?: string;
  agentRole?: string;
  task?: string;
  status: string;
  startedAt?: number;
  endedAt?: number;
  usage?: AgentHierarchyUsage;
};

type GraphNodeData = {
  id: string;
  name: string;
  symbolSize: number;
  category: number;
  fixed?: boolean;
  x?: number;
  y?: number;
  itemStyle?: Record<string, unknown>;
  label?: Record<string, unknown>;
  _meta?: NodeMeta;
};

type GraphEdgeData = {
  source: string;
  target: string;
  lineStyle?: Record<string, unknown>;
  label?: Record<string, unknown>;
};

type GraphData = {
  nodes: GraphNodeData[];
  edges: GraphEdgeData[];
};

const STATUS_COLORS: Record<string, { bg: string; border: string; text: string }> = {
  running: { bg: "#3b82f6", border: "#2563eb", text: "#ffffff" },
  completed: { bg: "#22c55e", border: "#16a34a", text: "#ffffff" },
  error: { bg: "#ef4444", border: "#dc2626", text: "#ffffff" },
  pending: { bg: "#6b7280", border: "#4b5563", text: "#ffffff" },
};

const ROLE_COLORS: Record<string, { bg: string; text: string }> = {
  orchestrator: { bg: "#7c3aed", text: "#ffffff" },
  lead: { bg: "#2563eb", text: "#ffffff" },
  specialist: { bg: "#0891b2", text: "#ffffff" },
  worker: { bg: "#6b7280", text: "#ffffff" },
};

// Force graph constants
const ROLE_CATEGORIES = [
  { name: "orchestrator", itemStyle: { color: "#7c3aed" } },
  { name: "lead", itemStyle: { color: "#2563eb" } },
  { name: "specialist", itemStyle: { color: "#0891b2" } },
  { name: "worker", itemStyle: { color: "#6b7280" } },
];

const ROLE_CATEGORY_INDEX: Record<string, number> = {
  orchestrator: 0,
  lead: 1,
  specialist: 2,
  worker: 3,
};

const NODE_SIZE_BY_ROLE: Record<string, number> = {
  orchestrator: 30,
  lead: 22,
  specialist: 16,
  worker: 12,
};

function computeRepulsion(nodeCount: number): number {
  if (nodeCount <= 5) return 120;
  if (nodeCount <= 15) return 250;
  if (nodeCount <= 30) return 400;
  return 500;
}

function computeEdgeLength(nodeCount: number): number {
  if (nodeCount <= 5) return 80;
  if (nodeCount <= 15) return 120;
  if (nodeCount <= 30) return 160;
  return 200;
}

function formatTokenCount(tokens: number): string {
  if (tokens >= 1_000_000) {
    return `${(tokens / 1_000_000).toFixed(1)}M `;
  }
  if (tokens >= 1_000) {
    return `${(tokens / 1_000).toFixed(1)}K `;
  }
  return `${tokens} `;
}

function formatDurationMs(ms: number): string {
  if (ms >= 60_000) {
    return `${(ms / 60_000).toFixed(1)}m`;
  }
  if (ms >= 1_000) {
    return `${(ms / 1_000).toFixed(1)}s`;
  }
  return `${ms}ms`;
}

function extractAgentName(sessionKey: string): string {
  // Extract a readable name from session key
  // Format: agent:<agentId>:main or agent:<agentId>:subagent:<uuid>
  const parts = sessionKey.split(":");
  if (parts.length >= 4 && parts[2] === "subagent") {
    // subagent - return "subagent" or a short uuid prefix
    const uuid = parts[3];
    return `Subagent ${uuid.slice(0, 8)}`;
  }
  if (parts.length >= 3) {
    // Main agent - return the agent ID
    const agentId = parts[1];
    const role = parts[2];
    if (role === "main") {
      return agentId ? `Agent: ${agentId}` : "Main Agent";
    }
    return role;
  }
  if (parts.length >= 2) {
    return parts[1] || sessionKey.slice(0, 20);
  }
  return sessionKey.slice(0, 20);
}

const COLLAB_EDGE_COLORS: Record<string, string> = {
  proposal: "rgba(124, 58, 237, 0.5)", // purple
  challenge: "rgba(239, 68, 68, 0.5)", // red
  agreement: "rgba(34, 197, 94, 0.5)", // green
  decision: "rgba(245, 158, 11, 0.5)", // amber
  clarification: "rgba(59, 130, 246, 0.4)", // blue
};

function transformToGraphData(
  roots: AgentHierarchyNode[],
  containerWidth: number,
  containerHeight: number,
  collaborationEdges?: CollaborationEdge[],
): GraphData {
  const nodes: GraphNodeData[] = [];
  const edges: GraphEdgeData[] = [];
  let isFirstRoot = true;

  // Map agentId → sessionKey for collaboration edge resolution
  const agentIdToSessionKey = new Map<string, string>();

  function traverse(node: AgentHierarchyNode, parentKey?: string) {
    const colors = STATUS_COLORS[node.status] ?? STATUS_COLORS.pending;
    const label = node.label || extractAgentName(node.sessionKey);
    const role = node.agentRole ?? "worker";
    const symbolSize = NODE_SIZE_BY_ROLE[role] ?? 12;
    const isRunning = node.status === "running";

    // Track agentId → sessionKey mapping
    if (node.agentId) {
      agentIdToSessionKey.set(node.agentId, node.sessionKey);
    }

    const graphNode: GraphNodeData = {
      id: node.sessionKey,
      name: label,
      symbolSize,
      category: ROLE_CATEGORY_INDEX[role] ?? 3,
      itemStyle: {
        color: colors.bg,
        borderColor: colors.border,
        borderWidth: 2,
        ...(isRunning ? { shadowBlur: 12, shadowColor: "rgba(59, 130, 246, 0.6)" } : {}),
      },
      // label inherited from series-level config (graph-label-overlap style)
      _meta: {
        sessionKey: node.sessionKey,
        runId: node.runId,
        agentId: node.agentId,
        agentRole: node.agentRole,
        task: node.task,
        status: node.status,
        startedAt: node.startedAt,
        endedAt: node.endedAt,
        usage: node.usage,
      },
    };

    // Fix first root at center
    if (!parentKey && isFirstRoot) {
      graphNode.fixed = true;
      graphNode.x = containerWidth / 2;
      graphNode.y = containerHeight / 2;
      isFirstRoot = false;
    }

    nodes.push(graphNode);

    if (parentKey) {
      edges.push({ source: parentKey, target: node.sessionKey });
    }

    for (const child of node.children) {
      traverse(child, node.sessionKey);
    }
  }

  for (const root of roots) {
    traverse(root);
  }

  // Add collaboration edges (agent-to-agent communication)
  if (collaborationEdges && collaborationEdges.length > 0) {
    const seen = new Set<string>();
    for (const collab of collaborationEdges) {
      const sourceSession = agentIdToSessionKey.get(collab.source);
      const targetSession = agentIdToSessionKey.get(collab.target);
      if (!sourceSession || !targetSession || sourceSession === targetSession) continue;

      const pairKey = `${sourceSession}→${targetSession}:${collab.type}`;
      if (seen.has(pairKey)) continue;
      seen.add(pairKey);

      edges.push({
        source: sourceSession,
        target: targetSession,
        lineStyle: {
          color: COLLAB_EDGE_COLORS[collab.type] ?? "rgba(161, 161, 170, 0.3)",
          width: 1.5,
          type: "dashed",
          curveness: 0.3,
        },
      });
    }
  }

  // Infer sibling edges: children of the same parent likely collaborate
  // Connect completed siblings to running siblings (feedback/handoff pattern)
  const childrenByParent = new Map<string, GraphNodeData[]>();
  for (const edge of edges) {
    if (!edge.lineStyle) {
      // Only spawn edges (no lineStyle = spawn)
      const siblings = childrenByParent.get(edge.source) ?? [];
      const childNode = nodes.find((n) => n.id === edge.target);
      if (childNode) siblings.push(childNode);
      childrenByParent.set(edge.source, siblings);
    }
  }
  for (const siblings of childrenByParent.values()) {
    if (siblings.length < 2) continue;
    // Connect siblings that share context (completed→running or same-role clusters)
    for (let i = 0; i < siblings.length; i++) {
      for (let j = i + 1; j < siblings.length; j++) {
        const a = siblings[i];
        const b = siblings[j];
        // Connect completed→running (implies the running agent can use completed output)
        const aCompleted = a._meta?.status === "completed";
        const bCompleted = b._meta?.status === "completed";
        if (aCompleted !== bCompleted) {
          edges.push({
            source: aCompleted ? a.id : b.id,
            target: aCompleted ? b.id : a.id,
            lineStyle: {
              color: "rgba(34, 197, 94, 0.25)",
              width: 1,
              type: "dotted",
              curveness: 0.4,
            },
          });
        }
      }
    }
  }

  return { nodes, edges };
}

function countTotalNodes(nodes: AgentHierarchyNode[]): number {
  let count = nodes.length;
  for (const node of nodes) {
    if (node.children.length > 0) {
      count += countTotalNodes(node.children);
    }
  }
  return count;
}

function countByStatus(nodes: AgentHierarchyNode[]): Record<string, number> {
  const counts: Record<string, number> = { running: 0, completed: 0, error: 0, pending: 0 };
  function traverse(n: AgentHierarchyNode[]) {
    for (const node of n) {
      counts[node.status] = (counts[node.status] ?? 0) + 1;
      if (node.children.length > 0) {
        traverse(node.children);
      }
    }
  }
  traverse(nodes);
  return counts;
}

export function renderAgentsHierarchy(props: AgentsHierarchyProps) {
  const { loading, error, data, onRefresh, onNodeClick } = props;
  const roots = data?.roots ?? [];
  const collabEdges = data?.collaborationEdges ?? [];
  const totalNodes = countTotalNodes(roots);
  const statusCounts = countByStatus(roots);
  const updatedAt = data?.updatedAt ?? null;

  return html`
    <section class="card">
      <div class="row" style="justify-content: space-between;">
        <div>
          <div class="card-title">Agent Hierarchy</div>
          <div class="card-sub">
            Visualize agent-subagent spawn relationships.
            ${totalNodes > 0 ? html`<span class="mono">${totalNodes}</span> nodes` : nothing}
          </div>
        </div>
        <button class="btn btn--sm" ?disabled=${loading} @click=${onRefresh}>
          ${loading ? "Loading..." : "Refresh"}
        </button>
      </div>

      ${
        updatedAt
          ? html`<div class="muted" style="margin-top: 8px; font-size: 11px;">
              Last updated: ${formatAgo(updatedAt)}
            </div>`
          : nothing
      }

      ${error ? html`<div class="callout danger" style="margin-top: 12px;">${error}</div>` : nothing}

      ${
        roots.length > 0
          ? html`
              <div class="hierarchy-stats" style="margin-top: 16px; display: flex; gap: 12px; flex-wrap: wrap;">
                <div class="hierarchy-stat">
                  <span class="hierarchy-stat-dot" style="background: ${STATUS_COLORS.running.bg};"></span>
                  <span>Running: ${statusCounts.running}</span>
                </div>
                <div class="hierarchy-stat">
                  <span class="hierarchy-stat-dot" style="background: ${STATUS_COLORS.completed.bg};"></span>
                  <span>Completed: ${statusCounts.completed}</span>
                </div>
                <div class="hierarchy-stat">
                  <span class="hierarchy-stat-dot" style="background: ${STATUS_COLORS.error.bg};"></span>
                  <span>Error: ${statusCounts.error}</span>
                </div>
                <div class="hierarchy-stat">
                  <span class="hierarchy-stat-dot" style="background: ${STATUS_COLORS.pending.bg};"></span>
                  <span>Pending: ${statusCounts.pending}</span>
                </div>
              </div>
            `
          : nothing
      }

      ${
        roots.length === 0
          ? html`
              <div style="margin-top: 16px;">
                ${renderEmptyState({
                  icon: icons.link,
                  title: "No hierarchy data",
                  subtitle: loading
                    ? "Loading hierarchy..."
                    : "Spawn subagents to see their relationships here.",
                })}
              </div>
            `
          : html`
              <div
                class="hierarchy-chart-container"
                id="hierarchy-echarts-container"
                style="margin-top: 16px; min-height: 400px;"
              >
                ${renderHierarchyTree(roots, onNodeClick)}
              </div>
              ${scheduleEChartsInit(roots, collabEdges, onNodeClick)}
            `
      }
    </section>
  `;
}

function renderHierarchyTree(
  nodes: AgentHierarchyNode[],
  onNodeClick?: (sessionKey: string) => void,
  depth = 0,
): TemplateResult | typeof nothing {
  if (nodes.length === 0) {
    return nothing;
  }

  return html`
    <div class="hierarchy-tree" style="padding-left: ${depth * 24}px;">
      ${nodes.map((node): TemplateResult => {
        const colors = STATUS_COLORS[node.status] ?? STATUS_COLORS.pending;
        const label = node.label || extractAgentName(node.sessionKey);
        const hasChildren = node.children.length > 0;

        const roleColor = node.agentRole ? ROLE_COLORS[node.agentRole] : undefined;
        const usage = node.usage;

        return html`
          <div class="hierarchy-node" data-status=${node.status}>
            <button
              class="hierarchy-node-header"
              style="--node-color: ${colors.bg}; --node-border: ${colors.border};"
              data-status=${node.status}
              @click=${() => onNodeClick?.(node.sessionKey)}
              type="button"
            >
              <span
                class="hierarchy-node-indicator"
                style="background: ${colors.bg};"
                data-status=${node.status}
              ></span>
              <div class="hierarchy-node-content">
                <div class="hierarchy-node-label">
                  ${label}
                  ${
                    node.agentRole
                      ? html`<span
                        class="hierarchy-role-badge"
                        style="background: ${roleColor?.bg ?? "#6b7280"}; color: ${roleColor?.text ?? "#fff"};"
                      >${node.agentRole}</span>`
                      : nothing
                  }
                </div>
                <div class="hierarchy-node-meta">
                  <span class="hierarchy-node-status">${node.status}</span>
                  ${node.task ? html`<span class="hierarchy-node-task">${node.task.slice(0, 60)}${node.task.length > 60 ? "..." : ""}</span>` : nothing}
                  ${node.startedAt ? html`<span class="hierarchy-node-time">Started ${formatAgo(node.startedAt)}</span>` : nothing}
                </div>
                ${
                  usage
                    ? html`<div class="hierarchy-node-usage">
                      <span class="hierarchy-usage-item" title="Input / Output tokens">${formatTokenCount(usage.inputTokens)}in / ${formatTokenCount(usage.outputTokens)}out</span>
                      <span class="hierarchy-usage-item" title="Tool calls">Tools: ${usage.toolCalls}</span>
                      <span class="hierarchy-usage-item" title="Duration">${formatDurationMs(usage.durationMs)}</span>
                      ${usage.costUsd > 0 ? html`<span class="hierarchy-usage-item" title="Cost">$${usage.costUsd.toFixed(4)}</span>` : nothing}
                    </div>`
                    : nothing
                }
              </div>
              ${
                hasChildren
                  ? html`
                      <span class="hierarchy-node-expand">▼</span>
                    `
                  : nothing
              }
            </button>
            ${hasChildren ? renderHierarchyTree(node.children, onNodeClick, depth + 1) : nothing}
          </div>
        `;
      })}
    </div>
  `;
}

// Track chart instance and last data hash to avoid unnecessary re-renders
// eslint-disable-next-line @typescript-eslint/no-redundant-type-constituents
let chartInstance: echarts.ECharts | null = null;
let lastDataHash = "";
let clickHandlerAttached = false;

function computeDataHash(roots: AgentHierarchyNode[]): string {
  const keys: string[] = [];
  function collect(nodes: AgentHierarchyNode[]) {
    for (const node of nodes) {
      keys.push(node.sessionKey);
      keys.push(node.status);
      keys.push(node.agentRole ?? "");
      const u = node.usage;
      if (u) {
        keys.push(`${u.inputTokens}:${u.outputTokens}:${u.toolCalls}`);
      }
      if (node.children.length > 0) {
        collect(node.children);
      }
    }
  }
  collect(roots);
  return keys.join("|");
}

function scheduleEChartsInit(
  roots: AgentHierarchyNode[],
  collabEdges: CollaborationEdge[],
  onNodeClick?: (sessionKey: string) => void,
): typeof nothing {
  // Schedule update after DOM is ready
  requestAnimationFrame(() => {
    const container = document.getElementById("hierarchy-echarts-container");
    if (!container) {
      return;
    }

    const newHash = computeDataHash(roots);

    // Check if chart already exists and data hasn't changed
    const existingChart = echarts.getInstanceByDom(container);
    if (existingChart && chartInstance === existingChart && lastDataHash === newHash) {
      return;
    }

    const w = container.clientWidth || 800;
    const h = container.clientHeight || 500;
    const graphData = transformToGraphData(roots, w, h, collabEdges);

    // If chart exists but data changed, just update the data
    if (existingChart && chartInstance === existingChart) {
      lastDataHash = newHash;
      const nodeCount = graphData.nodes.length;
      existingChart.setOption({
        series: [
          {
            data: graphData.nodes,
            edges: graphData.edges,
            force: {
              repulsion: computeRepulsion(nodeCount),
              edgeLength: computeEdgeLength(nodeCount),
            },
          },
        ],
      });
      return;
    }

    // Initialize new chart
    initECharts(container, graphData, onNodeClick);
    lastDataHash = newHash;
  });

  return nothing;
}

function initECharts(
  container: HTMLElement,
  graphData: GraphData,
  onNodeClick?: (sessionKey: string) => void,
) {
  // Dispose existing chart if any
  const existingChart = echarts.getInstanceByDom(container);
  if (existingChart) {
    existingChart.dispose();
  }

  const nodeCount = graphData.nodes.length;
  const chartHeight = Math.max(500, Math.min(700, nodeCount * 60));

  chartInstance = echarts.init(container, undefined, {
    renderer: "canvas",
    width: container.clientWidth || 800,
    height: chartHeight,
  });

  const option = {
    tooltip: {
      trigger: "item",
      triggerOn: "mousemove",
      formatter: (params: { data?: GraphNodeData; dataType?: string }) => {
        if (params.dataType === "edge") return "";
        const meta = params.data?._meta;
        if (!meta) {
          return params.data?.name ?? "";
        }
        const statusColors = STATUS_COLORS[meta.status] ?? STATUS_COLORS.pending;
        const roleLabel = meta.agentRole
          ? `<span style="display:inline-block;padding:1px 6px;border-radius:3px;font-size:10px;background:${ROLE_COLORS[meta.agentRole]?.bg ?? "#6b7280"};color:${ROLE_COLORS[meta.agentRole]?.text ?? "#fff"};">${meta.agentRole}</span>`
          : "";
        const usageLines = meta.usage
          ? `<div style="margin-top:4px;font-size:11px;color:#aaa;">Tokens: ${formatTokenCount(meta.usage.inputTokens)}in / ${formatTokenCount(meta.usage.outputTokens)}out<br/>Tools: ${meta.usage.toolCalls} | Duration: ${formatDurationMs(meta.usage.durationMs)}${meta.usage.costUsd > 0 ? `<br/>Cost: $${meta.usage.costUsd.toFixed(4)}` : ""}</div>`
          : "";
        return `<div style="max-width:350px;">
          <strong>${params.data?.name ?? ""}</strong> ${roleLabel}<br/>
          <span style="display:inline-block;padding:1px 6px;border-radius:3px;font-size:10px;background:${statusColors.bg};color:${statusColors.text};">${meta.status}</span>
          ${meta.task ? `<div style="margin-top:4px;font-size:12px;color:#ccc;">${meta.task.slice(0, 120)}</div>` : ""}
          ${usageLines}
          <div style="margin-top:4px;font-size:10px;color:#666;">${meta.sessionKey}</div>
        </div>`;
      },
    },
    legend: {
      data: ROLE_CATEGORIES.map((c) => c.name),
      bottom: 10,
      textStyle: { color: "#a1a1aa", fontSize: 11 },
      icon: "circle",
      itemWidth: 10,
      itemHeight: 10,
    },
    series: [
      {
        type: "graph",
        layout: "force",
        data: graphData.nodes,
        edges: graphData.edges,
        categories: ROLE_CATEGORIES,
        roam: true,
        draggable: true,
        label: {
          show: true,
          position: "right",
          formatter: "{b}",
        },
        force: {
          repulsion: computeRepulsion(nodeCount),
          gravity: 0.1,
          edgeLength: computeEdgeLength(nodeCount),
          friction: 0.6,
        },
        lineStyle: {
          width: 1.5,
          curveness: 0.3,
          color: "source",
        },
        edgeSymbol: ["none", "arrow"],
        edgeSymbolSize: [0, 8],
        emphasis: {
          focus: "adjacency",
          lineStyle: { width: 10 },
        },
        labelLayout: {
          hideOverlap: true,
        },
        scaleLimit: {
          min: 0.4,
          max: 2,
        },
        animationDuration: 1500,
        animationEasingUpdate: "quinticInOut",
      },
    ],
  };

  chartInstance.setOption(option);

  if (onNodeClick && !clickHandlerAttached) {
    clickHandlerAttached = true;
    chartInstance.on("click", (params: unknown) => {
      const p = params as { data?: GraphNodeData };
      const meta = p.data?._meta;
      if (meta?.sessionKey) {
        onNodeClick(meta.sessionKey);
      }
    });
  }

  const resizeObserver = new ResizeObserver(() => {
    chartInstance?.resize();
  });
  resizeObserver.observe(container);
}

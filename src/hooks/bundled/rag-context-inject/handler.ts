/**
 * RAG context injection hook handler
 *
 * Automatically queries all configured RAG sources (Graphiti, LightRAG, Memory Service)
 * and injects relevant context as a synthetic bootstrap file on session start.
 */

import type { OpenClawConfig } from "../../../config/config.js";
import type { GraphitiConfig, LightRAGConfig, MemoryServiceConfig } from "../../../config/types.rag.js";
import { resolveHookConfig } from "../../config.js";
import type { HookHandler } from "../../hooks.js";
import type { AgentBootstrapHookContext } from "../../internal-hooks.js";
import { GraphitiClient } from "../../../memory/graphiti-client.js";
import { LightRAGClient } from "../../../memory/lightrag-client.js";
import { MemoryServiceClient } from "../../../memory/memory-service-client.js";
import type {
  GraphitiEntity,
  GraphitiRelationship,
} from "../../../memory/graphiti-client.js";
import type { LightRAGQueryResponse } from "../../../memory/lightrag-client.js";
import type { MemoryServiceMemory } from "../../../memory/memory-service-client.js";

type RAGContextResult = {
  graphiti?: {
    entities: GraphitiEntity[];
    relationships: GraphitiRelationship[];
  };
  lightrag?: LightRAGQueryResponse;
  memoryService?: {
    memories: MemoryServiceMemory[];
  };
};

/**
 * Format RAG results into a markdown context file
 */
function formatRAGContext(result: RAGContextResult, timestamp: Date): string {
  const sections: string[] = [];

  sections.push("# RAG Context");
  sections.push("");
  sections.push(`Generated: ${timestamp.toISOString()}`);
  sections.push("");
  sections.push(
    "This file contains automatically retrieved context from your knowledge graph and memory systems.",
  );
  sections.push("");

  // Graphiti entities and relationships
  if (result.graphiti && (result.graphiti.entities.length > 0 || result.graphiti.relationships.length > 0)) {
    sections.push("## Temporal Knowledge Graph (Graphiti)");
    sections.push("");

    if (result.graphiti.entities.length > 0) {
      sections.push("### Entities");
      sections.push("");
      for (const entity of result.graphiti.entities) {
        sections.push(`- **${entity.name}** (${entity.type || "unknown"})`);
        if (entity.summary) {
          sections.push(`  - ${entity.summary}`);
        }
        if (entity.createdAt) {
          sections.push(`  - Created: ${entity.createdAt}`);
        }
      }
      sections.push("");
    }

    if (result.graphiti.relationships.length > 0) {
      sections.push("### Relationships");
      sections.push("");
      for (const rel of result.graphiti.relationships) {
        const label = rel.type ? `[${rel.type}]` : "";
        sections.push(`- ${rel.source} ${label} → ${rel.target}`);
        if (rel.summary) {
          sections.push(`  - ${rel.summary}`);
        }
      }
      sections.push("");
    }
  }

  // LightRAG document context
  if (result.lightrag) {
    sections.push("## Long-term Document Context (LightRAG)");
    sections.push("");

    if (result.lightrag.answer) {
      sections.push("### Answer");
      sections.push("");
      sections.push(result.lightrag.answer);
      sections.push("");
    }

    if (result.lightrag.sources && result.lightrag.sources.length > 0) {
      sections.push("### Sources");
      sections.push("");
      for (const source of result.lightrag.sources) {
        sections.push(`- ${source}`);
      }
      sections.push("");
    }

    if (result.lightrag.entities && result.lightrag.entities.length > 0) {
      sections.push("### Related Entities");
      sections.push("");
      sections.push(result.lightrag.entities.join(", "));
      sections.push("");
    }
  }

  // Memory Service memories
  if (result.memoryService && result.memoryService.memories.length > 0) {
    sections.push("## Universal Memory Layer (Memory Service)");
    sections.push("");
    for (const memory of result.memoryService.memories) {
      sections.push(`### Memory ${memory.id}`);
      if (memory.score !== undefined) {
        sections.push(`*Relevance: ${memory.score.toFixed(3)}*`);
      }
      sections.push("");
      sections.push(memory.content);
      if (memory.createdAt) {
        sections.push("");
        sections.push(`*Created: ${memory.createdAt}*`);
      }
      sections.push("");
    }
  }

  // If no results from any source
  if (
    (!result.graphiti || (result.graphiti.entities.length === 0 && result.graphiti.relationships.length === 0)) &&
    !result.lightrag &&
    (!result.memoryService || result.memoryService.memories.length === 0)
  ) {
    sections.push("*No relevant context found from RAG sources.*");
    sections.push("");
  }

  return sections.join("\n");
}

/**
 * Query Graphiti for recent entities and relationships
 */
async function queryGraphiti(
  config: GraphitiConfig | undefined,
  sessionKey: string,
  maxEntities: number,
  maxRelations: number,
): Promise<{ entities: GraphitiEntity[]; relationships: GraphitiRelationship[] } | null> {
  if (!config?.enabled) {
    return null;
  }

  try {
    const client = new GraphitiClient({
      endpoint: config.endpoint,
      timeout: config.timeout,
    });

    // Health check
    const healthy = await client.health();
    if (!healthy) {
      console.log("[rag-context-inject] Graphiti service not available");
      return null;
    }

    // Search for recent context related to this session
    const searchResult = await client.search({
      query: `session context for ${sessionKey}`,
      limit: maxEntities,
    });

    return {
      entities: searchResult.entities.slice(0, maxEntities),
      relationships: searchResult.relationships?.slice(0, maxRelations) || [],
    };
  } catch (err) {
    console.error(
      "[rag-context-inject] Graphiti query failed:",
      err instanceof Error ? err.message : String(err),
    );
    return null;
  }
}

/**
 * Query LightRAG for relevant document context
 */
async function queryLightRAG(
  config: LightRAGConfig | undefined,
  sessionKey: string,
  maxDocuments: number,
): Promise<LightRAGQueryResponse | null> {
  if (!config?.enabled) {
    return null;
  }

  try {
    const client = new LightRAGClient({
      endpoint: config.endpoint,
      timeout: config.timeout,
    });

    // Health check
    const healthy = await client.health();
    if (!healthy) {
      console.log("[rag-context-inject] LightRAG service not available");
      return null;
    }

    // Query for relevant context
    const result = await client.query({
      query: `What is the relevant context for session ${sessionKey}?`,
      mode: config.defaultMode || "hybrid",
      topK: maxDocuments,
      includeSources: true,
    });

    return result;
  } catch (err) {
    console.error(
      "[rag-context-inject] LightRAG query failed:",
      err instanceof Error ? err.message : String(err),
    );
    return null;
  }
}

/**
 * Query Memory Service for related memories
 */
async function queryMemoryService(
  config: MemoryServiceConfig | undefined,
  sessionKey: string,
  maxMemories: number,
): Promise<{ memories: MemoryServiceMemory[] } | null> {
  if (!config?.enabled) {
    return null;
  }

  try {
    const client = new MemoryServiceClient({
      endpoint: config.endpoint,
      timeout: config.timeout,
    });

    // Health check
    const healthy = await client.health();
    if (!healthy) {
      console.log("[rag-context-inject] Memory Service not available");
      return null;
    }

    // Search for related memories
    const result = await client.search({
      query: `session ${sessionKey}`,
      limit: maxMemories,
    });

    return {
      memories: result.memories,
    };
  } catch (err) {
    console.error(
      "[rag-context-inject] Memory Service query failed:",
      err instanceof Error ? err.message : String(err),
    );
    return null;
  }
}

/**
 * Inject RAG context into bootstrap files
 */
const injectRAGContext: HookHandler = async (event) => {
  // Only trigger on agent:bootstrap event
  if (event.type !== "agent" || event.action !== "bootstrap") {
    return;
  }

  const context = event.context as AgentBootstrapHookContext;
  const cfg = context.cfg;

  // Get hook configuration
  const hookConfig = resolveHookConfig(cfg, "rag-context-inject");
  if (hookConfig?.enabled === false) {
    return;
  }

  // Get RAG service configs from memorySearch
  const memorySearch = cfg?.agents?.defaults?.memorySearch;
  const graphitiConfig = memorySearch?.graphiti;
  const lightragConfig = memorySearch?.lightrag;
  const memoryServiceConfig = memorySearch?.memoryService;

  // Check if any RAG service is enabled
  const anyEnabled =
    graphitiConfig?.enabled ||
    lightragConfig?.enabled ||
    memoryServiceConfig?.enabled;

  if (!anyEnabled) {
    return;
  }

  try {
    console.log("[rag-context-inject] Querying RAG sources for session:", event.sessionKey);

    // Get max limits from hook config (with defaults)
    const maxEntities = (hookConfig?.maxEntities as number | undefined) ?? 20;
    const maxRelations = (hookConfig?.maxRelations as number | undefined) ?? 30;
    const maxMemories = (hookConfig?.maxMemories as number | undefined) ?? 10;
    const maxDocuments = (hookConfig?.maxDocuments as number | undefined) ?? 5;

    // Query all RAG sources in parallel
    const [graphitiResult, lightragResult, memoryServiceResult] = await Promise.all([
      queryGraphiti(graphitiConfig, event.sessionKey, maxEntities, maxRelations),
      queryLightRAG(lightragConfig, event.sessionKey, maxDocuments),
      queryMemoryService(memoryServiceConfig, event.sessionKey, maxMemories),
    ]);

    // Aggregate results
    const ragContext: RAGContextResult = {};
    if (graphitiResult) {
      ragContext.graphiti = graphitiResult;
    }
    if (lightragResult) {
      ragContext.lightrag = lightragResult;
    }
    if (memoryServiceResult) {
      ragContext.memoryService = memoryServiceResult;
    }

    // Format context as markdown
    const contextMarkdown = formatRAGContext(ragContext, event.timestamp);

    // Inject as synthetic bootstrap file
    // We'll use "RAG_CONTEXT.md" as the name, but since WorkspaceBootstrapFileName is
    // restricted, we'll cast it. The bootstrap system should handle it gracefully.
    context.bootstrapFiles.push({
      name: "RAG_CONTEXT.md" as any,
      path: "<synthetic>",
      content: contextMarkdown,
      missing: false,
    });

    console.log("[rag-context-inject] RAG context injected successfully");
  } catch (err) {
    console.error(
      "[rag-context-inject] Failed to inject RAG context:",
      err instanceof Error ? err.message : String(err),
    );
  }
};

export default injectRAGContext;

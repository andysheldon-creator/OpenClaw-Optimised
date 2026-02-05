import type { MemoryContentObject, MemoryProvenance, MemoryTemporalMetadata } from "./types.js";

export type GraphNode = {
  id: string;
  label: string;
  properties?: Record<string, unknown>;
  provenance?: MemoryProvenance;
  temporal?: MemoryTemporalMetadata;
};

export type GraphEdge = {
  id: string;
  sourceId: string;
  targetId: string;
  type: string;
  properties?: Record<string, unknown>;
  provenance?: MemoryProvenance;
  temporal?: MemoryTemporalMetadata;
};

export type GraphQuery = {
  text?: string;
  entityIds?: string[];
  filters?: Record<string, unknown>;
  limit?: number;
};

export type GraphQueryResult = {
  nodes: GraphNode[];
  edges: GraphEdge[];
};

export interface GraphAdapter {
  upsertNodes(nodes: GraphNode[]): Promise<void>;
  upsertEdges(edges: GraphEdge[]): Promise<void>;
  query(query: GraphQuery): Promise<GraphQueryResult>;
  health?(): Promise<{ ok: boolean; message?: string }>;
}

export type VectorRecord = {
  id: string;
  values: number[];
  metadata?: Record<string, unknown>;
};

export type VectorQuery = {
  vector: number[];
  topK: number;
  filter?: Record<string, unknown>;
};

export type VectorQueryResult = {
  matches: Array<{ id: string; score: number; metadata?: Record<string, unknown> }>;
};

export interface VectorAdapter {
  upsert(records: VectorRecord[]): Promise<void>;
  query(query: VectorQuery): Promise<VectorQueryResult>;
  delete?(ids: string[]): Promise<void>;
  health?(): Promise<{ ok: boolean; message?: string }>;
}

export type EmbedderInput = {
  id?: string;
  text: string;
  metadata?: Record<string, unknown>;
};

export interface EmbedderAdapter {
  embed(input: EmbedderInput): Promise<number[]>;
  embedBatch?(inputs: EmbedderInput[]): Promise<number[][]>;
  dimensions?: number;
}

export type ExtractedEntity = {
  id?: string;
  label: string;
  type?: string;
  properties?: Record<string, unknown>;
};

export interface EntityExtractor {
  extract(content: MemoryContentObject): Promise<ExtractedEntity[]>;
}

export type TemporalPolicyDecision = {
  ttlSeconds?: number;
  validFrom?: string;
  validTo?: string;
  confidence?: number;
};

export interface TemporalPolicy {
  evaluate(content: MemoryContentObject): Promise<TemporalPolicyDecision>;
}

export type QueryRequest = {
  query: string;
  sessionKey?: string;
  limit?: number;
};

export type QueryResult = MemoryContentObject & {
  score?: number;
  source?: "graph" | "vector" | "hybrid" | (string & {});
};

export type QueryResponse = {
  results: QueryResult[];
  latencyMs?: number;
};

export interface QueryOrchestrator {
  query(request: QueryRequest): Promise<QueryResponse>;
  contextPack?(request: QueryRequest): Promise<{ pack: string; sources?: MemoryContentObject[] }>;
}

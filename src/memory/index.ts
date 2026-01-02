/**
 * Memory subsystem - persistent semantic memory using Qdrant.
 */

// Contact tracking
export {
  type ContactInteraction,
  type ContactSummary,
  ContactTracker,
} from "./contact-tracker.js";
export { createEmbeddingClient, type EmbeddingClient } from "./embedding.js";
export {
  extractFromAgentResponse,
  extractFromUserMessage,
  extractMemories,
} from "./extraction.js";
// Graph database exports
export {
  createGraphStore,
  handleGraphAdd,
  handleGraphQuery,
  handleGraphStats,
  handleGraphTraverse,
  resetGraphStore,
  SQLiteGraphStore,
  type SQLiteGraphStoreConfig,
} from "./graph.js";
export type {
  ContactEntity,
  CustomEntity,
  EntityOfType,
  EventEntity,
  GraphEntity,
  GraphEntityBase,
  GraphEntityInput,
  GraphEntitySearchOptions,
  GraphEntitySearchResult,
  GraphEntityType,
  GraphEntityUpdateInput,
  GraphPath,
  GraphPathHop,
  GraphRelationship,
  GraphRelationshipInput,
  GraphRelationshipSearchOptions,
  GraphRelationshipType,
  GraphRelationshipUpdateInput,
  GraphStats,
  GraphStore,
  GraphTraversalOptions,
  GraphTraversalResult,
  NoteEntity,
  PersonEntity,
  ProjectEntity,
  TaskEntity,
  TraversalDirection,
} from "./graph-types.js";
export { createTypedEntity, isEntityType } from "./graph-types.js";
export { type MemoryStore, QdrantMemoryStore } from "./qdrant.js";
export {
  extractSearchTerms,
  formatMemoriesForContext,
} from "./search-helper.js";
export {
  createMemoryService,
  isMemoryEnabled,
  MemoryService,
  resetMemoryService,
} from "./service.js";
export type {
  ExtractedMemory,
  Memory,
  MemoryCategory,
  MemoryListOptions,
  MemorySaveInput,
  MemorySearchOptions,
  MemorySearchResult,
  MemorySource,
} from "./types.js";

// Relationship tracking
export {
  calculateRelationshipStats,
  calculateRelationshipStrength,
  createRelationshipService,
  generateSuggestions,
  isRelationshipEnabled,
  RelationshipService,
  RelationshipStore,
  resetRelationshipService,
} from "./relationships.js";
export type {
  CommunicationDirection,
  CommunicationQueryOptions,
  CommunicationRecord,
  CommunicationRecordInput,
  Contact,
  ContactCreateInput,
  ContactSearchOptions,
  ContactSearchResult,
  ContactUpdateInput,
  ContactWithStats,
  MessageType,
  Platform,
  PlatformIdentifiers,
  RelationshipStats,
  RelationshipSuggestion,
  StatsOptions,
  SuggestedActionType,
  SuggestionOptions,
  SuggestionPriority,
} from "./relationships.js";

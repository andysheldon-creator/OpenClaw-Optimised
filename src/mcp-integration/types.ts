/**
 * Multi-tenant MCP integration types
 *
 * This module defines the core types for integrating MCP servers
 * with multi-tenant credential management and security isolation.
 */

/**
 * Tenant context identifies the organizational hierarchy
 */
export interface TenantContext {
  /**
   * Organization ID - top level tenant identifier
   */
  organizationId: string;

  /**
   * Workspace ID - mid-level isolation within organization
   */
  workspaceId: string;

  /**
   * Team ID - optional team-level isolation
   */
  teamId?: string;

  /**
   * User ID - individual user identifier
   */
  userId: string;
}

/**
 * HubSpot OAuth credentials stored per tenant
 */
export interface HubSpotCredentials {
  accessToken: string;
  refreshToken: string;
  hubId: string;
  scopes: string[];
  expiresIn: number;
  expiresAt?: Date;
}

/**
 * BigQuery credentials per tenant
 */
export interface BigQueryCredentials {
  projectId: string;
  credentialsJson: string; // JSON key file content
}

/**
 * Qdrant credentials per tenant
 */
export interface QdrantCredentials {
  apiKey?: string;
  collectionName: string;
}

/**
 * MongoDB connection credentials per tenant
 */
export interface MongoDBCredentials {
  connectionString: string;
  database: string;
}

/**
 * Unified tenant credentials
 */
export interface TenantCredentials {
  context: TenantContext;
  hubspot?: HubSpotCredentials;
  bigquery?: BigQueryCredentials;
  qdrant?: QdrantCredentials;
  mongodb?: MongoDBCredentials;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * MCP tool information
 */
export interface MCPTool {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  server: string;
}

/**
 * MCP server configuration
 */
export interface MCPServerConfig {
  name: string;
  url: string;
  transport: 'http' | 'sse' | 'stdio';
  requiresAuth: boolean;
}

/**
 * MCP call result
 */
export interface MCPCallResult {
  success: boolean;
  data?: unknown;
  error?: string;
  isError?: boolean;
  content?: unknown[];
}

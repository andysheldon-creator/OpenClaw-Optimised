/**
 * MCP Integration Configuration Types
 *
 * Multi-tenant Model Context Protocol integration with organization/workspace/team isolation.
 */

export type MCPServerConfig = {
  /** HubSpot MCP OAuth credentials */
  hubspot?: {
    /** OAuth client ID */
    clientId?: string;
    /** OAuth client secret */
    clientSecret?: string;
  };

  /** BigQuery MCP server URL (HTTP/JSON-RPC transport) */
  bigquery?: {
    /** MCP server URL */
    url?: string;
  };

  /** Qdrant MCP server URL (SSE transport) */
  qdrant?: {
    /** MCP server URL */
    url?: string;
  };
};

export type MCPCredentialConfig = {
  /** MongoDB connection URL for credential storage */
  mongoUrl?: string;

  /** MongoDB database name (default: "openclaw_mcp") */
  database?: string;

  /** MongoDB collection name (default: "tenant_credentials") */
  collection?: string;
};

export type MCPTenantIsolation = "organization" | "workspace" | "user";

export type MCPConfig = {
  /** Enable MCP integration */
  enabled?: boolean;

  /** Credential storage configuration */
  credentials?: MCPCredentialConfig;

  /** MCP server configurations */
  servers?: MCPServerConfig;

  /** Tenant isolation level (default: "workspace") */
  isolationLevel?: MCPTenantIsolation;

  /** Enable intelligent tool discovery (limit to top N relevant tools) */
  intelligentDiscovery?: {
    /** Enable intelligent tool discovery */
    enabled?: boolean;
    /** Maximum number of tools to suggest (default: 5) */
    maxTools?: number;
  };

  /** Tool call timeout in milliseconds (default: 30000) */
  toolTimeoutMs?: number;

  /** Enable automatic credential refresh */
  autoRefresh?: boolean;
};

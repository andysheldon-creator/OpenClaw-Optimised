/**
 * Agent Configuration System
 *
 * Enables organizations to create and manage multiple specialized agents
 * (e.g., sales agent, marketing agent, RevOps agent) with custom configurations.
 */

import { MongoClient, type Collection, type Db } from "mongodb";

export type AgentType = "sales" | "marketing" | "revops" | "support" | "custom";

export type AgentMemoryScope = "customer" | "agent" | "team" | "organization";

export type AgentConfig = {
  _id?: string;
  /** Organization identifier (required) */
  organizationId: string;
  /** Workspace identifier (optional) */
  workspaceId?: string;
  /** Unique agent identifier within the organization */
  agentId: string;
  /** Agent type/category */
  agentType: AgentType;

  /** Human-readable agent name */
  name: string;
  /** Agent description */
  description: string;
  /** Whether the agent is enabled */
  enabled: boolean;

  /** System prompt customization */
  systemPrompt?: {
    /** Use default template or custom prompt */
    template?: "default" | "custom";
    /** Custom system prompt text (when template=custom) */
    customPrompt?: string;
    /** Agent personality description */
    personality?: string;
    /** Communication tone */
    tone?: string;
  };

  /** List of explicitly enabled tools/MCPs */
  enabledTools?: string[];
  /** List of explicitly disabled tools/MCPs */
  disabledTools?: string[];

  /** Agent-specific settings */
  settings?: Record<string, unknown>;

  /** Allowed communication channels */
  allowedChannels?: string[];

  /** Memory configuration */
  memorySettings?: {
    /** Default memory scope for this agent */
    scope?: AgentMemoryScope;
    /** Memory retention in days */
    retentionDays?: number;
  };

  /** Creation timestamp */
  createdAt?: Date;
  /** Last update timestamp */
  updatedAt?: Date;
};

export type CreateAgentConfigInput = Omit<AgentConfig, "_id" | "createdAt" | "updatedAt">;
export type UpdateAgentConfigInput = Partial<Omit<AgentConfig, "_id" | "organizationId" | "agentId" | "createdAt">>;

export class AgentConfigManager {
  private client: MongoClient | null = null;
  private db: Db | null = null;
  private collection: Collection<AgentConfig> | null = null;

  constructor(
    private mongoUrl?: string,
    private databaseName: string = "openclaw_agents",
    private collectionName: string = "agent_configs",
  ) {}

  private async ensureConnection(): Promise<Collection<AgentConfig>> {
    if (this.collection) {
      return this.collection;
    }

    if (!this.mongoUrl) {
      this.mongoUrl = process.env.MONGODB_URL || process.env.MCP_MONGODB_URL;
    }

    if (!this.mongoUrl) {
      throw new Error(
        "MongoDB URL not configured. Set MONGODB_URL or MCP_MONGODB_URL environment variable, or pass mongoUrl to constructor.",
      );
    }

    this.client = new MongoClient(this.mongoUrl);
    await this.client.connect();
    this.db = this.client.db(this.databaseName);
    this.collection = this.db.collection<AgentConfig>(this.collectionName);

    // Create indexes for efficient queries
    await this.collection.createIndex({ organizationId: 1, agentId: 1 }, { unique: true });
    await this.collection.createIndex({ organizationId: 1, workspaceId: 1 });
    await this.collection.createIndex({ organizationId: 1, enabled: 1 });

    return this.collection;
  }

  async close(): Promise<void> {
    if (this.client) {
      await this.client.close();
      this.client = null;
      this.db = null;
      this.collection = null;
    }
  }

  /**
   * Get agent configuration by organization and agent ID
   */
  async getAgentConfig(params: {
    organizationId: string;
    workspaceId?: string;
    agentId: string;
  }): Promise<AgentConfig | null> {
    const collection = await this.ensureConnection();

    // Try exact match first (org + workspace + agentId)
    if (params.workspaceId) {
      const exactMatch = await collection.findOne({
        organizationId: params.organizationId,
        workspaceId: params.workspaceId,
        agentId: params.agentId,
      });
      if (exactMatch) {
        return exactMatch;
      }
    }

    // Fall back to organization-level config
    const orgMatch = await collection.findOne({
      organizationId: params.organizationId,
      agentId: params.agentId,
      workspaceId: { $exists: false },
    });

    return orgMatch;
  }

  /**
   * Create a new agent configuration
   */
  async createAgentConfig(config: CreateAgentConfigInput): Promise<AgentConfig> {
    const collection = await this.ensureConnection();

    const now = new Date();
    const agentConfig: AgentConfig = {
      ...config,
      createdAt: now,
      updatedAt: now,
    };

    const result = await collection.insertOne(agentConfig);
    return { ...agentConfig, _id: result.insertedId.toString() };
  }

  /**
   * Update an existing agent configuration
   */
  async updateAgentConfig(params: {
    organizationId: string;
    workspaceId?: string;
    agentId: string;
    updates: UpdateAgentConfigInput;
  }): Promise<AgentConfig | null> {
    const collection = await this.ensureConnection();

    const filter: Record<string, unknown> = {
      organizationId: params.organizationId,
      agentId: params.agentId,
    };

    if (params.workspaceId) {
      filter.workspaceId = params.workspaceId;
    } else {
      filter.workspaceId = { $exists: false };
    }

    const result = await collection.findOneAndUpdate(
      filter,
      {
        $set: {
          ...params.updates,
          updatedAt: new Date(),
        },
      },
      { returnDocument: "after" },
    );

    return result || null;
  }

  /**
   * Delete an agent configuration
   */
  async deleteAgentConfig(params: {
    organizationId: string;
    workspaceId?: string;
    agentId: string;
  }): Promise<boolean> {
    const collection = await this.ensureConnection();

    const filter: Record<string, unknown> = {
      organizationId: params.organizationId,
      agentId: params.agentId,
    };

    if (params.workspaceId) {
      filter.workspaceId = params.workspaceId;
    } else {
      filter.workspaceId = { $exists: false };
    }

    const result = await collection.deleteOne(filter);
    return result.deletedCount > 0;
  }

  /**
   * List all agent configurations for an organization/workspace
   */
  async listAgentConfigs(params: {
    organizationId: string;
    workspaceId?: string;
    enabledOnly?: boolean;
  }): Promise<AgentConfig[]> {
    const collection = await this.ensureConnection();

    const filter: Record<string, unknown> = {
      organizationId: params.organizationId,
    };

    if (params.workspaceId) {
      filter.workspaceId = params.workspaceId;
    }

    if (params.enabledOnly) {
      filter.enabled = true;
    }

    return collection.find(filter).sort({ createdAt: -1 }).toArray();
  }
}

// Singleton instance
let agentConfigManager: AgentConfigManager | null = null;

export function getAgentConfigManager(): AgentConfigManager {
  if (!agentConfigManager) {
    agentConfigManager = new AgentConfigManager();
  }
  return agentConfigManager;
}

/**
 * Multi-tenant Credential Manager
 *
 * Securely stores and retrieves MCP credentials from MongoDB
 * with organization/workspace/team level isolation.
 */

import { MongoClient, Db, Collection } from 'mongodb';
import type { TenantContext, TenantCredentials, HubSpotCredentials } from './types.js';

export class CredentialManager {
  private client: MongoClient | null = null;
  private db: Db | null = null;
  private credentials: Collection<TenantCredentials> | null = null;
  private readonly mongoUrl: string;
  private readonly dbName: string;
  private readonly collectionName: string;

  constructor(config: {
    mongoUrl: string;
    dbName?: string;
    collectionName?: string;
  }) {
    this.mongoUrl = config.mongoUrl;
    this.dbName = config.dbName || 'openclaw_mcp';
    this.collectionName = config.collectionName || 'tenant_credentials';
  }

  /**
   * Connect to MongoDB
   */
  async connect(): Promise<void> {
    if (this.client) {
      return; // Already connected
    }

    this.client = new MongoClient(this.mongoUrl);
    await this.client.connect();
    this.db = this.client.db(this.dbName);
    this.credentials = this.db.collection<TenantCredentials>(this.collectionName);

    // Create indexes for efficient queries
    await this.credentials.createIndex({
      'context.organizationId': 1,
      'context.workspaceId': 1,
      'context.userId': 1,
    }, { unique: true });

    await this.credentials.createIndex({
      'context.organizationId': 1,
      'context.workspaceId': 1,
      'context.teamId': 1,
    });
  }

  /**
   * Get credentials for a specific tenant
   */
  async getCredentials(context: TenantContext): Promise<TenantCredentials | null> {
    await this.connect();

    if (!this.credentials) {
      throw new Error('Not connected to MongoDB');
    }

    const query = {
      'context.organizationId': context.organizationId,
      'context.workspaceId': context.workspaceId,
      'context.userId': context.userId,
    };

    const result = await this.credentials.findOne(query);
    return result;
  }

  /**
   * Store or update credentials for a tenant
   */
  async setCredentials(creds: Omit<TenantCredentials, 'createdAt' | 'updatedAt'>): Promise<void> {
    await this.connect();

    if (!this.credentials) {
      throw new Error('Not connected to MongoDB');
    }

    const query = {
      'context.organizationId': creds.context.organizationId,
      'context.workspaceId': creds.context.workspaceId,
      'context.userId': creds.context.userId,
    };

    const now = new Date();

    await this.credentials.updateOne(
      query,
      {
        $set: {
          ...creds,
          updatedAt: now,
        },
        $setOnInsert: {
          createdAt: now,
        },
      },
      { upsert: true }
    );
  }

  /**
   * Get HubSpot credentials and refresh if expired
   */
  async getHubSpotCredentials(
    context: TenantContext,
    hubspotConfig?: { clientId: string; clientSecret: string }
  ): Promise<HubSpotCredentials | null> {
    const creds = await this.getCredentials(context);

    if (!creds?.hubspot) {
      return null;
    }

    // Check if token is expired
    if (creds.hubspot.expiresAt && creds.hubspot.expiresAt < new Date()) {
      if (!hubspotConfig) {
        throw new Error('HubSpot credentials expired and no refresh config provided');
      }

      // Refresh the token
      const refreshed = await this.refreshHubSpotToken(
        creds.hubspot.refreshToken,
        hubspotConfig
      );

      // Update stored credentials
      creds.hubspot = refreshed;
      await this.setCredentials(creds);

      return refreshed;
    }

    return creds.hubspot;
  }

  /**
   * Refresh HubSpot OAuth token
   */
  private async refreshHubSpotToken(
    refreshToken: string,
    config: { clientId: string; clientSecret: string }
  ): Promise<HubSpotCredentials> {
    const response = await fetch('https://api.hubapi.com/oauth/v1/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        client_id: config.clientId,
        client_secret: config.clientSecret,
        refresh_token: refreshToken,
      }),
    });

    if (!response.ok) {
      throw new Error(`Failed to refresh HubSpot token: ${response.statusText}`);
    }

    const data = await response.json();

    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token || refreshToken,
      hubId: data.hub_id,
      scopes: data.scopes || [],
      expiresIn: data.expires_in,
      expiresAt: new Date(Date.now() + data.expires_in * 1000),
    };
  }

  /**
   * Delete credentials for a tenant
   */
  async deleteCredentials(context: TenantContext): Promise<void> {
    await this.connect();

    if (!this.credentials) {
      throw new Error('Not connected to MongoDB');
    }

    const query = {
      'context.organizationId': context.organizationId,
      'context.workspaceId': context.workspaceId,
      'context.userId': context.userId,
    };

    await this.credentials.deleteOne(query);
  }

  /**
   * List all credentials for an organization/workspace
   */
  async listCredentials(filter: {
    organizationId: string;
    workspaceId?: string;
    teamId?: string;
  }): Promise<TenantCredentials[]> {
    await this.connect();

    if (!this.credentials) {
      throw new Error('Not connected to MongoDB');
    }

    const query: Record<string, unknown> = {
      'context.organizationId': filter.organizationId,
    };

    if (filter.workspaceId) {
      query['context.workspaceId'] = filter.workspaceId;
    }

    if (filter.teamId) {
      query['context.teamId'] = filter.teamId;
    }

    return await this.credentials.find(query).toArray();
  }

  /**
   * Disconnect from MongoDB
   */
  async disconnect(): Promise<void> {
    if (this.client) {
      await this.client.close();
      this.client = null;
      this.db = null;
      this.credentials = null;
    }
  }
}

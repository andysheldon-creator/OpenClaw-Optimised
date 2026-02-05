/**
 * Multi-tenant Context Manager
 *
 * Extracts tenant context from OpenClaw sessions and maintains
 * security isolation between organizations, workspaces, and teams.
 */

import type { TenantContext } from './types.js';

export interface SessionMetadata {
  /**
   * Channel-specific peer identifier (phone number, user ID, etc.)
   */
  peerId: string;

  /**
   * Channel type (whatsapp, telegram, discord, etc.)
   */
  channel: string;

  /**
   * Optional session metadata from the session store
   */
  metadata?: Record<string, unknown>;
}

export class ContextManager {
  /**
   * Extract tenant context from session metadata
   *
   * This function looks for org/workspace/team IDs in the session metadata
   * and constructs a TenantContext for MCP credential lookup.
   */
  extractTenantContext(session: SessionMetadata): TenantContext | null {
    const metadata = session.metadata || {};

    // Look for tenant identifiers in metadata
    const organizationId = this.extractValue(metadata, [
      'organizationId',
      'orgId',
      'organization_id',
      'org_id',
    ]);

    const workspaceId = this.extractValue(metadata, [
      'workspaceId',
      'workspace',
      'workspace_id',
    ]);

    const userId = this.extractValue(metadata, [
      'userId',
      'user_id',
      'peerId',
    ]) || session.peerId;

    const teamId = this.extractValue(metadata, [
      'teamId',
      'team',
      'team_id',
    ]);

    // Organization and workspace are required for multi-tenant mode
    if (!organizationId || !workspaceId) {
      return null;
    }

    return {
      organizationId,
      workspaceId,
      teamId,
      userId,
    };
  }

  /**
   * Store tenant context in session metadata
   *
   * This updates the session to include tenant identifiers
   * for future lookups.
   */
  storeTenantContext(
    session: SessionMetadata,
    context: TenantContext
  ): SessionMetadata {
    return {
      ...session,
      metadata: {
        ...session.metadata,
        organizationId: context.organizationId,
        workspaceId: context.workspaceId,
        teamId: context.teamId,
        userId: context.userId,
      },
    };
  }

  /**
   * Validate tenant context for security
   *
   * Ensures that the context is well-formed and doesn't contain
   * injection attempts or invalid characters.
   */
  validateTenantContext(context: TenantContext): boolean {
    // Check for required fields
    if (!context.organizationId || !context.workspaceId || !context.userId) {
      return false;
    }

    // Validate format (alphanumeric, dashes, underscores only)
    const validPattern = /^[a-zA-Z0-9_-]+$/;

    if (!validPattern.test(context.organizationId)) {
      return false;
    }

    if (!validPattern.test(context.workspaceId)) {
      return false;
    }

    if (!validPattern.test(context.userId)) {
      return false;
    }

    if (context.teamId && !validPattern.test(context.teamId)) {
      return false;
    }

    // Check length limits
    if (context.organizationId.length > 100) {
      return false;
    }

    if (context.workspaceId.length > 100) {
      return false;
    }

    if (context.userId.length > 100) {
      return false;
    }

    if (context.teamId && context.teamId.length > 100) {
      return false;
    }

    return true;
  }

  /**
   * Create a tenant context from MongoDB user data
   *
   * This is used when onboarding users from an external system
   * that already has organization/workspace information.
   */
  createFromUserData(data: {
    organizationId: string;
    workspaceId: string;
    userId: string;
    teamId?: string;
  }): TenantContext {
    const context: TenantContext = {
      organizationId: data.organizationId,
      workspaceId: data.workspaceId,
      userId: data.userId,
      teamId: data.teamId,
    };

    if (!this.validateTenantContext(context)) {
      throw new Error('Invalid tenant context data');
    }

    return context;
  }

  /**
   * Extract a value from metadata using multiple possible keys
   */
  private extractValue(
    metadata: Record<string, unknown>,
    keys: string[]
  ): string | undefined {
    for (const key of keys) {
      const value = metadata[key];
      if (typeof value === 'string' && value.length > 0) {
        return value;
      }
    }
    return undefined;
  }
}

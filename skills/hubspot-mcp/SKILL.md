---
name: hubspot-mcp
description: Multi-tenant HubSpot CRM integration using Model Context Protocol. Provides secure access to HubSpot contacts, deals, companies, and analytics with organization/workspace/team isolation.
user-invocable: false
requires.env:
  - MONGODB_URL
  - HUBSPOT_CLIENT_ID
  - HUBSPOT_CLIENT_SECRET
---

# HubSpot MCP Integration

Access HubSpot CRM data with multi-tenant security isolation. Each user's HubSpot credentials are stored securely in MongoDB with organization/workspace/team context.

## Architecture

This skill uses the OpenClaw multi-tenant MCP integration system:

- **Tenant Context**: organizationId → workspaceId → teamId → userId
- **Credential Storage**: MongoDB with encrypted OAuth tokens
- **Token Management**: Automatic refresh of expired HubSpot access tokens
- **Transport**: stdio-based MCP server via `@hubspot/mcp-server`

## Available Tools

The HubSpot MCP server provides 100+ tools across these categories:

### Contact Management
- `hubspot_search_contacts` - Search and filter contacts
- `hubspot_create_contact` - Create new contacts
- `hubspot_update_contact` - Update contact properties
- `hubspot_get_contact` - Get contact details
- `hubspot_list_contacts` - List all contacts

### Deal Management
- `hubspot_search_deals` - Search and filter deals
- `hubspot_create_deal` - Create new deals
- `hubspot_update_deal` - Update deal properties
- `hubspot_get_deal` - Get deal details
- `hubspot_list_deals` - List all deals

### Company Management
- `hubspot_search_companies` - Search companies
- `hubspot_create_company` - Create companies
- `hubspot_update_company` - Update company data
- `hubspot_get_company` - Get company details

### Analytics & Reporting
- `hubspot_get_analytics` - Get analytics data
- `hubspot_create_report` - Generate reports
- `hubspot_list_pipelines` - List deal pipelines

## Usage Pattern

### 1. Extract Tenant Context

```typescript
import { ContextManager } from '../src/mcp-integration/context-manager.js';

const contextManager = new ContextManager();
const tenantContext = contextManager.extractTenantContext({
  peerId: session.peerId,
  channel: session.channel,
  metadata: session.metadata
});

if (!tenantContext) {
  throw new Error('Missing tenant context. Please set organizationId and workspaceId.');
}
```

### 2. List Available Tools

```typescript
import { MCPClient } from '../src/mcp-integration/mcp-client.js';
import { CredentialManager } from '../src/mcp-integration/credential-manager.js';

const credentialManager = new CredentialManager({
  mongoUrl: process.env.MONGODB_URL!
});

const mcpClient = new MCPClient({
  credentialManager,
  hubspotClientId: process.env.HUBSPOT_CLIENT_ID,
  hubspotClientSecret: process.env.HUBSPOT_CLIENT_SECRET
});

const tools = await mcpClient.listAllTools(tenantContext);
const hubspotTools = tools.filter(t => t.server === 'hubspot');
```

### 3. Call HubSpot Tools

```typescript
// Search for contacts
const result = await mcpClient.callTool(
  tenantContext,
  'hubspot',
  'hubspot_search_contacts',
  {
    query: 'example.com',
    limit: 10
  }
);

if (result.success) {
  console.log('Found contacts:', result.data);
} else {
  console.error('Error:', result.error);
}

// Create a deal
const dealResult = await mcpClient.callTool(
  tenantContext,
  'hubspot',
  'hubspot_create_deal',
  {
    dealname: 'Q1 Enterprise Contract',
    amount: 50000,
    dealstage: 'qualifiedtobuy',
    pipeline: 'default'
  }
);
```

## Credential Setup

Users must connect their HubSpot account through OAuth:

### 1. Initial OAuth Flow

```typescript
import { CredentialManager } from '../src/mcp-integration/credential-manager.js';

// After user completes OAuth and you receive the authorization code
const credentialManager = new CredentialManager({
  mongoUrl: process.env.MONGODB_URL!
});

await credentialManager.setCredentials({
  context: {
    organizationId: 'org_123',
    workspaceId: 'ws_456',
    teamId: 'team_789',
    userId: 'user_abc'
  },
  hubspot: {
    accessToken: oauthResponse.access_token,
    refreshToken: oauthResponse.refresh_token,
    hubId: oauthResponse.hub_id,
    scopes: oauthResponse.scopes,
    expiresIn: oauthResponse.expires_in,
    expiresAt: new Date(Date.now() + oauthResponse.expires_in * 1000)
  }
});
```

### 2. Automatic Token Refresh

The credential manager automatically refreshes expired tokens:

```typescript
// This automatically refreshes if expired
const creds = await credentialManager.getHubSpotCredentials(
  tenantContext,
  {
    clientId: process.env.HUBSPOT_CLIENT_ID!,
    clientSecret: process.env.HUBSPOT_CLIENT_SECRET!
  }
);
```

## Multi-Tenant Security

### Organization Isolation
- Each organization has separate MongoDB credentials collection
- Credentials are queried using organizationId + workspaceId + userId
- No cross-organization data access possible

### Workspace Isolation
- Workspaces within an organization are fully isolated
- Each workspace can have different HubSpot accounts connected

### Team Isolation (Optional)
- Teams can optionally be used for additional segmentation
- Useful for sales teams, regions, or departments

### Validation
```typescript
const contextManager = new ContextManager();

// Validates alphanumeric, dashes, underscores only
// Prevents injection attacks
const isValid = contextManager.validateTenantContext(tenantContext);

if (!isValid) {
  throw new Error('Invalid tenant context format');
}
```

## Error Handling

```typescript
const result = await mcpClient.callTool(context, 'hubspot', toolName, args);

if (!result.success) {
  if (result.error?.includes('credentials')) {
    // User needs to reconnect HubSpot
    console.log('Please reconnect your HubSpot account');
  } else if (result.error?.includes('expired')) {
    // Token refresh failed
    console.log('HubSpot token expired and could not be refreshed');
  } else {
    console.error('HubSpot API error:', result.error);
  }
}
```

## Best Practices

1. **Always validate tenant context** before making MCP calls
2. **Cache tool lists** per tenant to avoid repeated lookups
3. **Handle credential errors gracefully** and prompt user to reconnect
4. **Use specific tool calls** instead of listing all 100+ tools
5. **Respect HubSpot rate limits** (10 requests/second per account)
6. **Log all MCP calls** for audit and debugging purposes

## Environment Variables

```bash
# Required
MONGODB_URL=mongodb+srv://user:pass@cluster.mongodb.net/openclaw_mcp
HUBSPOT_CLIENT_ID=your-oauth-client-id
HUBSPOT_CLIENT_SECRET=your-oauth-client-secret

# Optional
HUBSPOT_MCP_SERVER=@hubspot/mcp-server  # defaults to official package
```

## Troubleshooting

### "No HubSpot credentials found"
- User needs to complete OAuth flow
- Check if credentials exist in MongoDB for this org/workspace/user

### "HubSpot MCP process exited with code 1"
- Check that `npx @hubspot/mcp-server` is accessible
- Verify Node.js version (requires Node 18+)
- Check access token validity

### "Invalid tenant context"
- Ensure session metadata includes organizationId and workspaceId
- Validate context format (alphanumeric + dashes/underscores only)
- Check MongoDB connection

## Related Skills

- `mongodb-mcp` - Query MongoDB data
- `bigquery-mcp` - Analytics and reporting
- `qdrant-mcp` - Vector search and semantic queries
- `mem0-memory` - Multi-scope memory system

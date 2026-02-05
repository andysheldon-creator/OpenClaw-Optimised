# MCP Integration for OpenClaw

Multi-tenant Model Context Protocol (MCP) integration for OpenClaw, enabling secure access to external services with organization/workspace/team isolation.

## Overview

This integration allows OpenClaw agents to interact with MCP-powered services while maintaining strict tenant isolation based on organizational hierarchy:

```
organizationId → workspaceId → teamId → userId
```

## Architecture

### Components

1. **MCPClient** (`mcp-client.ts`)
   - Manages connections to MCP servers via three transport protocols:
     - **stdio**: HubSpot MCP via npx spawn
     - **HTTP/JSON-RPC**: BigQuery MCP
     - **SSE**: Qdrant MCP using MCP SDK
   - Handles tool discovery and execution
   - Manages connection lifecycle

2. **MCPCredentialManager** (`credential-manager.ts`)
   - MongoDB-based credential storage with tenant isolation
   - Automatic OAuth token refresh for HubSpot
   - Unique indexes on `(organizationId, workspaceId, teamId, service)`
   - Encrypted credential storage

3. **MCPContextManager** (`context-manager.ts`)
   - Extracts tenant context from agent session metadata
   - Validates tenant IDs (alphanumeric + dashes/underscores)
   - Provides isolation level enforcement (organization/workspace/user)

4. **MCP Tools** (`mcp-tool.ts`)
   - `mcp_call`: Call any MCP service tool
   - `mcp_list_tools`: List available tools for discovery
   - Integrated into OpenClaw's agent tool system

### Supported Services

- **HubSpot**: CRM operations (contacts, deals, companies, workflows)
- **BigQuery**: SQL analytics and data queries
- **Qdrant**: Vector search and semantic queries
- **MongoDB**: Document database operations

## Configuration

### Environment Variables

```bash
# MongoDB Credential Storage
MONGODB_URL=mongodb://localhost:27017

# HubSpot OAuth
HUBSPOT_CLIENT_ID=your-client-id
HUBSPOT_CLIENT_SECRET=your-client-secret

# MCP Server URLs
BIGQUERY_MCP_URL=http://localhost:3001
QDRANT_MCP_URL=http://localhost:3002
```

### OpenClaw Config

```yaml
mcp:
  enabled: true
  isolationLevel: workspace  # organization | workspace | user
  toolTimeoutMs: 30000
  autoRefresh: true

  intelligentDiscovery:
    enabled: true
    maxTools: 5

  credentials:
    mongoUrl: ${MONGODB_URL}
    database: openclaw_mcp
    collection: tenant_credentials

  servers:
    hubspot:
      clientId: ${HUBSPOT_CLIENT_ID}
      clientSecret: ${HUBSPOT_CLIENT_SECRET}
    bigquery:
      url: ${BIGQUERY_MCP_URL}
    qdrant:
      url: ${QDRANT_MCP_URL}
```

## Usage

### Agent Tool Calls

Agents can use MCP tools directly through the integrated agent tool system:

```typescript
// Call HubSpot MCP tool
{
  "service": "hubspot",
  "toolName": "hubspot_list_contacts",
  "arguments": {
    "limit": 10
  }
}

// Call BigQuery MCP tool
{
  "service": "bigquery",
  "toolName": "bigquery_execute_query",
  "arguments": {
    "projectId": "my-project",
    "query": "SELECT * FROM dataset.table LIMIT 10"
  }
}

// List available tools
{
  "service": "hubspot"  // Optional: specific service or all services
}
```

### Tenant Context

Tenant context is automatically extracted from the agent session metadata:

```typescript
// Session metadata structure
{
  "organizationId": "org-123",
  "workspaceId": "workspace-456",
  "teamId": "team-789",
  "userId": "user-001"
}
```

The context manager validates and extracts this information to ensure proper tenant isolation.

## Security

### Multi-Tenant Isolation

- **MongoDB Indexes**: Unique compound indexes ensure credential separation
- **Context Validation**: Strict alphanumeric validation with dashes/underscores
- **Isolation Levels**: Configurable enforcement at organization/workspace/user level
- **Credential Encryption**: OAuth tokens and secrets stored securely in MongoDB

### OAuth Token Management

HubSpot credentials include automatic token refresh:

```typescript
{
  organizationId: "org-123",
  workspaceId: "workspace-456",
  teamId: "team-789",
  service: "hubspot",
  credentials: {
    accessToken: "encrypted-token",
    refreshToken: "encrypted-refresh",
    expiresAt: 1234567890,
    tokenType: "Bearer"
  }
}
```

When `expiresAt` is reached, the credential manager automatically refreshes the token.

## Skills

Comprehensive skill documentation is available in `skills/`:

- `skills/hubspot-mcp/SKILL.md`: HubSpot CRM integration guide
- `skills/bigquery-mcp/SKILL.md`: BigQuery analytics guide
- `skills/qdrant-mcp/SKILL.md`: Vector search guide
- `skills/mongodb-mcp/SKILL.md`: MongoDB operations guide

Each skill provides:
- OAuth setup instructions
- Tool usage patterns
- Multi-tenant security guidelines
- Error handling examples
- Performance optimization tips

## Development

### Adding New MCP Services

1. **Add Server Config** in `src/config/types.mcp.ts`:
   ```typescript
   export type MCPServerConfig = {
     newService?: {
       url?: string;
       // Add service-specific config
     };
   };
   ```

2. **Update MCPClient** in `mcp-client.ts`:
   - Add transport initialization in constructor
   - Add tool calling logic in `callTool()`
   - Add tool listing logic in `listTools()`

3. **Create Skill Documentation** in `skills/new-service-mcp/SKILL.md`

4. **Update Defaults** in `src/config/defaults.ts`:
   ```typescript
   // Add environment variable loading
   const newServiceUrl = process.env.NEW_SERVICE_MCP_URL?.trim();
   if (!nextServers.newService && newServiceUrl) {
     nextServers.newService = { url: newServiceUrl };
     serversMutated = true;
   }
   ```

### Testing

Create test cases for:
- Tenant context extraction and validation
- Credential storage and retrieval
- OAuth token refresh
- MCP tool calling with proper isolation
- Error handling and edge cases

## Integration Points

### Plugin Runtime

MCP tools are exposed through the plugin runtime at `src/plugins/runtime/index.ts`:

```typescript
tools: {
  createMemoryGetTool,
  createMemorySearchTool,
  createMCPTool,
  createMCPListToolsTool,
  registerMemoryCli,
}
```

### Agent Tools

MCP tools are added to the agent tool collection in `src/agents/openclaw-tools.ts`:

```typescript
const mcpTool = createMCPTool({
  config: options?.config,
  agentSessionKey: options?.agentSessionKey,
});

const mcpListToolsTool = createMCPListToolsTool({
  config: options?.config,
  agentSessionKey: options?.agentSessionKey,
});
```

## Troubleshooting

### Common Issues

1. **Credential Not Found**
   - Verify tenant context is properly set in session metadata
   - Check MongoDB connection and credential document exists
   - Ensure isolation level allows access at current tenant level

2. **OAuth Token Expired**
   - Automatic refresh should handle this
   - If failing, check HubSpot client credentials are correct
   - Verify MongoDB has write access to update tokens

3. **MCP Server Connection Failed**
   - Check server URLs are configured correctly
   - Verify servers are running and accessible
   - Review network/firewall settings
   - Check server logs for errors

4. **Tool Not Found**
   - Run `mcp_list_tools` to discover available tools
   - Verify MCP server supports the requested tool
   - Check tool name spelling and parameters

## Performance Considerations

- **Connection Pooling**: MCP clients reuse connections when possible
- **Timeout Management**: Configurable timeouts prevent hanging requests
- **Intelligent Discovery**: Limits tool listings to top N relevant tools
- **Credential Caching**: Credentials cached in memory after MongoDB fetch

## Future Enhancements

- [ ] Add more MCP services (Slack, Gmail, Notion, etc.)
- [ ] Implement connection pooling for HTTP transports
- [ ] Add metrics and monitoring for MCP operations
- [ ] Support for MCP streaming responses
- [ ] Credential rotation and lifecycle management
- [ ] Multi-region deployment support

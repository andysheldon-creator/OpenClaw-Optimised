# Agent Configuration System

The OpenClaw agent configuration system enables organizations to create and manage multiple specialized agents (e.g., sales agent, marketing agent, RevOps agent) with custom configurations. Each agent can have its own personality, system prompt, tool access permissions, and behavior settings.

## Overview

The agent configuration system provides:

- **Multiple Agent Support**: Create unlimited specialized agents per organization/workspace
- **Custom System Prompts**: Define agent-specific personalities, tones, and behaviors
- **Tool Access Control**: Restrict which MCP tools each agent can access
- **Channel Restrictions**: Limit agents to specific communication channels
- **Memory Scoping**: Configure memory isolation levels (customer, agent, team, organization)
- **Agent Routing**: Automatic request routing based on agent identifiers

## Agent Types

OpenClaw supports the following built-in agent types:

- `sales` - Sales agents focused on lead generation, outreach, and deal management
- `marketing` - Marketing agents for campaign management and content creation
- `revops` - Revenue operations agents for pipeline analysis and forecasting
- `support` - Customer support agents for assistance and troubleshooting
- `custom` - Custom agents with user-defined roles

## Agent Configuration Schema

Each agent configuration includes:

```typescript
{
  organizationId: string;        // Required: Organization identifier
  workspaceId?: string;          // Optional: Workspace identifier
  agentId: string;               // Required: Unique agent identifier
  agentType: AgentType;          // Required: Agent type (sales, marketing, etc.)

  name: string;                  // Required: Human-readable agent name
  description: string;           // Required: Agent description
  enabled: boolean;              // Required: Whether agent is active

  systemPrompt?: {
    template?: "default" | "custom";  // Use default or custom prompt
    customPrompt?: string;            // Custom system prompt text
    personality?: string;             // Agent personality description
    tone?: string;                    // Communication tone
  };

  enabledTools?: string[];       // Explicitly enabled tools
  disabledTools?: string[];      // Explicitly disabled tools

  settings?: Record<string, unknown>;  // Agent-specific settings

  allowedChannels?: string[];    // Allowed communication channels

  memorySettings?: {
    scope?: AgentMemoryScope;    // Memory scope level
    retentionDays?: number;      // Memory retention period
  };
}
```

## Agent Management API

### Create Agent

Create a new agent configuration:

```bash
POST /v1/agents
Authorization: Bearer <token>
X-Organization-Id: <org-id>
X-Workspace-Id: <workspace-id>  # Optional

{
  "agentId": "sales-agent",
  "agentType": "sales",
  "name": "Sales Assistant",
  "description": "AI assistant for sales outreach and lead management",
  "enabled": true,
  "systemPrompt": {
    "personality": "Professional and persuasive",
    "tone": "Friendly but business-focused"
  },
  "enabledTools": ["hubspot", "aimfox", "mem0-memory"],
  "allowedChannels": ["whatsapp", "linkedin", "email"]
}
```

### List Agents

List all agents for an organization/workspace:

```bash
GET /v1/agents?enabled=true
Authorization: Bearer <token>
X-Organization-Id: <org-id>
X-Workspace-Id: <workspace-id>  # Optional

Response:
{
  "object": "list",
  "data": [
    {
      "_id": "...",
      "organizationId": "org-123",
      "agentId": "sales-agent",
      "name": "Sales Assistant",
      ...
    }
  ]
}
```

### Get Agent

Get details for a specific agent:

```bash
GET /v1/agents/sales-agent
Authorization: Bearer <token>
X-Organization-Id: <org-id>

Response:
{
  "_id": "...",
  "organizationId": "org-123",
  "agentId": "sales-agent",
  "agentType": "sales",
  "name": "Sales Assistant",
  ...
}
```

### Update Agent

Update an existing agent:

```bash
PATCH /v1/agents/sales-agent
Authorization: Bearer <token>
X-Organization-Id: <org-id>

{
  "description": "Updated description",
  "enabled": false,
  "systemPrompt": {
    "personality": "Updated personality"
  }
}
```

### Delete Agent

Delete an agent:

```bash
DELETE /v1/agents/sales-agent
Authorization: Bearer <token>
X-Organization-Id: <org-id>

Response:
{
  "deleted": true,
  "agentId": "sales-agent"
}
```

## Using Agents

### Agent Routing

Agents are automatically routed based on the following priority:

1. **Explicit agentId in metadata**: `metadata.agentId` in request body
2. **HTTP header**: `X-Agent-Id` or `X-OpenClaw-Agent-Id`
3. **Model name**: If model name contains "-agent", "_agent", "-bot", or "_bot"
4. **Default fallback**: "default-agent"

### OpenAI Chat Completions API

```bash
POST /v1/chat/completions
Authorization: Bearer <token>
X-Organization-Id: <org-id>
X-Agent-Id: sales-agent

{
  "model": "openclaw",
  "messages": [
    {
      "role": "user",
      "content": "Help me draft a follow-up email for lead John Doe"
    }
  ],
  "metadata": {
    "channel": "email"
  }
}
```

Or specify agent in metadata:

```bash
{
  "model": "openclaw",
  "messages": [...],
  "metadata": {
    "agentId": "sales-agent",
    "channel": "email"
  }
}
```

### OpenResponses API

```bash
POST /v1/responses
Authorization: Bearer <token>
X-Organization-Id: <org-id>
X-Agent-Id: marketing-agent

{
  "model": "openclaw",
  "input": [
    {
      "type": "message",
      "role": "user",
      "content": "Create a social media post about our new product"
    }
  ],
  "metadata": {
    "channel": "webchat"
  }
}
```

## Configuration Examples

### Sales Agent with LinkedIn Outreach

```json
{
  "agentId": "linkedin-sales-bot",
  "agentType": "sales",
  "name": "LinkedIn Sales Assistant",
  "description": "AI SDR for LinkedIn outreach and connection management",
  "enabled": true,
  "systemPrompt": {
    "template": "default",
    "personality": "Professional, personable, and value-focused",
    "tone": "Conversational but business-appropriate"
  },
  "enabledTools": [
    "aimfox",
    "hubspot",
    "mem0-memory",
    "notion"
  ],
  "allowedChannels": ["linkedin"],
  "memorySettings": {
    "scope": "customer",
    "retentionDays": 90
  },
  "settings": {
    "maxOutreachPerDay": 50,
    "autoFollowUp": true,
    "followUpDelayDays": 3
  }
}
```

### RevOps Agent with Pipeline Analysis

```json
{
  "agentId": "revops-analyst",
  "agentType": "revops",
  "name": "RevOps Analyst",
  "description": "Revenue operations agent for pipeline analysis and forecasting",
  "enabled": true,
  "systemPrompt": {
    "template": "default",
    "personality": "Analytical, data-driven, and detail-oriented",
    "tone": "Professional and precise"
  },
  "enabledTools": [
    "hubspot",
    "meta-ads",
    "mem0-memory",
    "sanity"
  ],
  "allowedChannels": ["webchat", "slack"],
  "memorySettings": {
    "scope": "team",
    "retentionDays": 180
  }
}
```

### WhatsApp Support Agent

```json
{
  "agentId": "whatsapp-support",
  "agentType": "support",
  "name": "WhatsApp Support Assistant",
  "description": "Customer support agent for WhatsApp inquiries",
  "enabled": true,
  "systemPrompt": {
    "template": "default",
    "personality": "Helpful, patient, and empathetic",
    "tone": "Friendly and approachable"
  },
  "enabledTools": [
    "mem0-memory",
    "hubspot",
    "sanity",
    "fireflies"
  ],
  "allowedChannels": ["whatsapp"],
  "memorySettings": {
    "scope": "customer",
    "retentionDays": 30
  }
}
```

### Custom Agent with Full System Prompt

```json
{
  "agentId": "custom-product-expert",
  "agentType": "custom",
  "name": "Product Expert",
  "description": "Custom agent with specialized product knowledge",
  "enabled": true,
  "systemPrompt": {
    "template": "custom",
    "customPrompt": "You are a product expert specializing in our SaaS platform. Your role is to:\n\n1. Answer technical questions about product features\n2. Provide implementation guidance\n3. Help with troubleshooting\n4. Suggest best practices\n\nYou have deep knowledge of our API, integrations, and data models. Always provide accurate, actionable advice based on our official documentation."
  },
  "enabledTools": [
    "sanity",
    "github",
    "mem0-memory"
  ],
  "allowedChannels": ["slack", "webchat"]
}
```

## System Prompt Customization

### Default Template with Augmentation

When using `template: "default"`, the agent's base system prompt is augmented with:

1. **Agent Role Section**: Name and description
2. **Communication Style**: Personality and tone
3. **Tool Access**: Enabled/disabled tools list
4. **Agent Settings**: Custom settings as bullet points
5. **Tenant Context**: Organization/workspace/team/user IDs

Example augmented prompt:

```
[Base OpenClaw System Prompt]

## Agent Role
You are **LinkedIn Sales Assistant**: AI SDR for LinkedIn outreach and connection management

Your primary focus is on sales activities including lead generation, outreach, follow-ups, and deal management.

## Communication Style
**Personality**: Professional, personable, and value-focused
**Tone**: Conversational but business-appropriate

## Tool Access
You have access to the following tools: aimfox, hubspot, mem0-memory, notion.
Only use tools from this approved list.

## Agent Settings
- **Max Outreach Per Day**: 50
- **Auto Follow Up**: true
- **Follow Up Delay Days**: 3

## Multi-Tenant Context
Organization ID: org-123
Workspace ID: workspace-456
User ID: user-789

This context identifies which organization, workspace, team, and user is making the request.
```

### Custom Template

When using `template: "custom"`, the `customPrompt` replaces the entire base system prompt. Tenant context is still appended if available.

```json
{
  "systemPrompt": {
    "template": "custom",
    "customPrompt": "You are a specialized RevOps analyst focused on pipeline health and forecasting. Your responsibilities:\n\n1. Analyze deal pipeline data from HubSpot\n2. Identify at-risk deals and revenue opportunities\n3. Generate forecasting reports\n4. Provide actionable insights for sales leadership\n\nAlways ground your analysis in actual CRM data and metrics."
  }
}
```

## Tool Access Control

### Enabled Tools (Whitelist)

If `enabledTools` is specified, only those tools are accessible:

```json
{
  "enabledTools": ["hubspot", "mem0-memory", "sanity"]
}
```

The agent can ONLY use HubSpot, Mem0, and Sanity tools.

### Disabled Tools (Blacklist)

If `disabledTools` is specified, those tools are blocked:

```json
{
  "disabledTools": ["github", "bash"]
}
```

The agent can use all tools EXCEPT GitHub and Bash.

### No Restrictions

If neither `enabledTools` nor `disabledTools` is specified, all tools are available.

## Channel Restrictions

Restrict agents to specific communication channels:

```json
{
  "allowedChannels": ["whatsapp", "telegram"]
}
```

If a request comes from a different channel (e.g., "email"), the agent will return a 403 error.

If `allowedChannels` is not specified, all channels are allowed.

## Memory Settings

Configure memory isolation and retention:

```json
{
  "memorySettings": {
    "scope": "customer",
    "retentionDays": 90
  }
}
```

**Memory Scopes**:
- `customer` - Memory isolated per customer (most private)
- `agent` - Memory shared across all conversations for this agent
- `team` - Memory shared across the team
- `organization` - Memory shared across the organization (most shared)

**Retention**: Automatic memory cleanup after specified days.

## Multi-Tenant Isolation

Agent configurations are isolated by:

1. **Organization** (required): `organizationId`
2. **Workspace** (optional): `workspaceId`

Lookup hierarchy:
1. Exact match: `org + workspace + agentId`
2. Fallback: `org + agentId` (organization-level config)

This allows:
- Organization-wide default agents
- Workspace-specific agent overrides
- Complete isolation between organizations

## Environment Variables

Configure MongoDB connection for agent storage:

```bash
# MongoDB URL for agent configurations
MONGODB_URL=mongodb://localhost:27017
# or
MCP_MONGODB_URL=mongodb://localhost:27017

# Database name (default: openclaw_agents)
# Collection name (default: agent_configs)
```

## Best Practices

1. **Start with Default Template**: Use `template: "default"` and augment with personality/tone before writing custom prompts

2. **Use Descriptive Agent IDs**: Use kebab-case identifiers like `linkedin-sales-bot`, `revops-analyst`, `whatsapp-support`

3. **Restrict Tools Appropriately**: Only enable tools relevant to the agent's function for better performance and security

4. **Set Channel Restrictions**: Limit agents to appropriate channels (e.g., LinkedIn agents should only use "linkedin" channel)

5. **Configure Memory Scope**: Use `customer` scope for privacy-sensitive agents (support, sales), `team` or `organization` for shared knowledge

6. **Enable Agents Gradually**: Start with `enabled: false` during testing, then enable for production

7. **Monitor and Iterate**: Review agent performance and adjust system prompts, tool access, and settings based on results

## Troubleshooting

### Agent Not Found

If you get a 404 error when querying an agent, verify:
- Agent exists in the database (`GET /v1/agents`)
- `organizationId` header matches the agent's org
- `workspaceId` matches if the agent is workspace-specific

### Agent Not Being Used

If requests aren't routing to your agent:
- Check agent routing priority (metadata.agentId > header > model name)
- Verify `X-Organization-Id` header is set
- Ensure agent is `enabled: true`

### Channel Restriction Error (403)

If you get "Agent X is not allowed to use channel Y":
- Verify the agent's `allowedChannels` includes the channel
- Check the `metadata.channel` field in your request
- Remove `allowedChannels` to allow all channels

### Tool Access Denied

If the agent can't access expected tools:
- Check `enabledTools` - is the tool in the whitelist?
- Check `disabledTools` - is the tool in the blacklist?
- Verify the tool's MCP server is configured and running

## See Also

- [Multi-Tenant Configuration](../multi-tenant.md)
- [MCP Integration](../mcp/README.md)
- [Memory Management (Mem0)](../skills/mem0-memory.md)

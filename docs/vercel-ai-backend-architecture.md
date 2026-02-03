# Vercel AI SDK Backend Architecture & Configuration

## Overview

This document describes how the Vercel AI SDK v5 frontend integration connects to the Clawdbrain backend, including authentication, routing modes, and configuration management.

---

## Architecture Principles

1. **Frontend SDK is Provider-Agnostic** - The `@clawdbrain/vercel-ai-agent` package has no Clawdbrain-specific logic
2. **Backend Owns Intelligence** - All routing, authentication, and mode selection happens in backend API endpoints
3. **Dual-Mode Operation** - Support both simple proxy mode and full agentic mode via the same API
4. **OpenAI-Compatible** - Backend implements OpenAI-compatible endpoints for maximum compatibility

---

## Part 1: Backend API Endpoints

### API Surface

Your backend implements OpenAI-compatible endpoints:

```
POST /api/v1/chat/completions    # Chat models (OpenAI format)
POST /api/v1/completions          # Completion models
POST /api/v1/embeddings           # Embeddings
```

### Clawdbrain AI API Key Management

**Database Schema:**

```typescript
interface ClawdbrainAIApiKey {
  id: string;
  key: string; // Hashed API key
  userId: string;
  name: string; // User-friendly name
  mode: "proxy" | "agent"; // Routing mode
  createdAt: Date;
  lastUsedAt: Date;

  // Agent mode configuration
  agentConfig?: {
    enablePiAgent: boolean;
    sdkRunner: "default" | "custom";
    routingRules?: RoutingRule[];
  };

  // Proxy mode configuration
  proxyConfig?: {
    providerMappings: {
      openai?: string; // Actual OpenAI API key
      anthropic?: string; // Actual Anthropic API key
      google?: string; // Actual Google API key
    };
  };

  // Rate limiting, usage tracking
  rateLimit?: {
    requestsPerMinute: number;
    tokensPerDay: number;
  };
}

interface RoutingRule {
  condition: {
    modelId?: string;
    prompt?: RegExp;
    userContext?: Record<string, any>;
  };
  action: "proxy" | "agent";
}
```

---

## Part 2: Request Flow

### Request Processing Pipeline

```typescript
async function handleChatCompletion(req: Request) {
  // 1. Extract Clawdbrain AI API Key
  const apiKey = extractApiKey(req); // From Authorization header

  // 2. Validate & lookup key configuration
  const keyConfig = await validateAndFetchKeyConfig(apiKey);
  if (!keyConfig) {
    return unauthorized();
  }

  // 3. Parse request body (OpenAI format)
  const body = await req.json();
  const { model, messages, stream, tools, ...options } = body;

  // 4. Route based on mode
  if (keyConfig.mode === "proxy") {
    return await handleProxyMode(keyConfig, body);
  } else {
    return await handleAgentMode(keyConfig, body);
  }
}
```

### Proxy Mode (Simple Passthrough)

```typescript
async function handleProxyMode(keyConfig: ClawdbrainAIApiKey, request: OpenAIRequest) {
  // Determine provider from model prefix
  const provider = detectProvider(request.model); // "gpt-4" -> openai

  // Get real provider API key
  const providerApiKey = keyConfig.proxyConfig.providerMappings[provider];

  if (!providerApiKey) {
    return error("Provider not configured for this API key");
  }

  // Forward to actual provider
  const response = await fetch(getProviderEndpoint(provider), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${providerApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(request),
  });

  // Log usage, apply rate limits
  await trackUsage(keyConfig.id, response);

  return response;
}
```

### Agent Mode (Pi Agent / SDK Runner)

```typescript
async function handleAgentMode(keyConfig: ClawdbrainAIApiKey, request: OpenAIRequest) {
  // Check routing rules for dynamic mode switching
  const shouldUseAgent = evaluateRoutingRules(keyConfig.agentConfig.routingRules, request);

  if (!shouldUseAgent) {
    // Fall back to proxy for simple queries
    return handleProxyMode(keyConfig, request);
  }

  // Route to Pi Agent system
  const agentResponse = await invokePiAgent({
    userId: keyConfig.userId,
    sessionContext: extractSessionContext(request),
    messages: request.messages,
    tools: request.tools,
    modelPreferences: {
      provider: detectProvider(request.model),
      modelId: request.model,
      options: request,
    },
    sdkRunner: keyConfig.agentConfig.sdkRunner,
  });

  // Convert Pi Agent response to OpenAI format
  return convertToOpenAIResponse(agentResponse, request.stream);
}
```

---

## Part 3: Dual Architecture Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                     Clawdbrain Backend                      │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  POST /api/v1/chat/completions                            │
│       │                                                     │
│       ├──> Validate Clawdbrain AI API Key                 │
│       │                                                     │
│       ├──> Mode Selection                                  │
│       │    │                                               │
│       │    ├─ PROXY MODE ──────────────────┐              │
│       │    │                                │              │
│       │    │  Direct passthrough to:        │              │
│       │    │  - OpenAI API                  │              │
│       │    │  - Anthropic API               │              │
│       │    │  - Google API                  │              │
│       │    │                                │              │
│       │    │  (Uses real provider keys      │              │
│       │    │   from keyConfig.proxyConfig)  │              │
│       │    │                                │              │
│       │    └────────────────────────────────┘              │
│       │                                                     │
│       │    ├─ AGENT MODE ───────────────────┐              │
│       │    │                                 │              │
│       │    │  Route to Pi Agent:             │              │
│       │    │  ┌─────────────────────────┐   │              │
│       │    │  │  SDK Runner             │   │              │
│       │    │  │  (Vercel AI v5 Agent)   │   │              │
│       │    │  │         │               │   │              │
│       │    │  │         ▼               │   │              │
│       │    │  │  Pi Agent Session       │   │              │
│       │    │  │  - Memory               │   │              │
│       │    │  │  - Tools                │   │              │
│       │    │  │  - Context              │   │              │
│       │    │  │  - Multi-step reasoning │   │              │
│       │    │  └─────────────────────────┘   │              │
│       │    │         │                       │              │
│       │    │         ▼                       │              │
│       │    │  Gateway Tool Calls             │              │
│       │    │  (Existing tools)               │              │
│       │    │                                 │              │
│       │    └─────────────────────────────────┘              │
│       │                                                     │
│       └──> Return OpenAI-compatible response               │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## Part 4: Frontend Integration

### Proxy Mode Example

```typescript
import { createAgent } from "@clawdbrain/vercel-ai-agent";

const agent = createAgent({
  model: {
    provider: "openai",
    modelId: "gpt-4",
    apiKey: userSettings.clawdbrainAIApiKey, // Clawdbrain key
    baseUrl: "https://api.clawdbrain.bot/v1", // Your backend
  },
  systemPrompt: "You are a helpful assistant",
});

// Backend routes to OpenAI based on key config
const response = await agent.run({
  messages: "What is the weather?",
});
```

### Agent Mode Example

```typescript
// Same code! Mode determined by backend key configuration
const agent = createAgent({
  model: {
    provider: "openai",
    modelId: "gpt-4",
    apiKey: userSettings.clawdbrainAIApiKey, // Configured for agent mode
    baseUrl: "https://api.clawdbrain.bot/v1",
  },
  tools: {
    getCurrentWeather: weatherTool, // Optional client-side tools
  },
});

// Backend routes to Pi Agent which:
// 1. Maintains session context
// 2. Uses Gateway tools
// 3. Applies routing rules
// 4. Returns streaming response
const response = await agent.runStream({
  messages: "What is the weather and remind me to water plants?",
});
```

---

## Part 5: Pi Agent Integration

### Option A: Vercel Agent as SDK Runner

```typescript
import { Experimental_Agent as Agent } from "ai";

class VercelSDKRunner implements SDKRunner {
  async run(session: PiSession, input: AgentInput) {
    const agent = new Agent({
      model: this.getModelForSession(session),
      system: session.systemPrompt,
      tools: this.mapGatewayToolsToVercelTools(session.tools),
    });

    return await agent.generate({
      prompt: input.message,
      messages: session.history,
      onStepFinish: (step) => {
        session.emit("step", step);
      },
    });
  }
}
```

### Option B: Pi Agent Orchestrates, Vercel Executes

```typescript
class PiAgentOrchestrator {
  private vercelAgent: ConversationalAgent;

  async processMessage(session: PiSession, message: string) {
    // Pi handles routing, memory, tool selection
    const context = await this.loadSessionContext(session.id);
    const tools = await this.selectTools(context, message);

    // Vercel handles model interaction
    const response = await this.vercelAgent.run({
      messages: this.convertHistory(session.history),
      executionConfig: {
        maxSteps: context.maxSteps,
      },
      callbacks: {
        onToolCall: async (call) => {
          // Execute via Gateway
          return await this.executeGatewayTool(session, call);
        },
      },
    });

    // Pi handles persistence, analytics
    await this.saveToSession(session, response);

    return response;
  }
}
```

### Tool Mapping

```typescript
// Convert Gateway tools to Vercel AI SDK v5 format
function mapGatewayToolsToVercelTools(gatewayTools: GatewayTool[]): Record<string, VercelTool> {
  const vercelTools: Record<string, VercelTool> = {};

  for (const gwTool of gatewayTools) {
    vercelTools[gwTool.name] = tool({
      description: gwTool.description,
      inputSchema: convertJsonSchemaToZod(gwTool.inputSchema),
      execute: async (params) => {
        // Call back to Gateway
        return await executeGatewayTool(gwTool.name, params);
      },
    });
  }

  return vercelTools;
}
```

---

## Part 6: Routing Rules

### Example Rules

```typescript
const routingRules: RoutingRule[] = [
  // Use agent mode for complex multi-step tasks
  {
    condition: {
      prompt: /remind|schedule|calendar|task/i,
    },
    action: "agent",
  },

  // Use agent mode for specific models
  {
    condition: {
      modelId: "gpt-4-agentic",
    },
    action: "agent",
  },

  // Use proxy for simple queries (faster, cheaper)
  {
    condition: {
      prompt: /^(what|who|when|where|how)/i,
    },
    action: "proxy",
  },
];
```

---

## Part 7: Configuration UI

### API Key Management Screen

```
┌─────────────────────────────────────────────────────────────┐
│ Clawdbrain AI API Keys                                      │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│ ┌───────────────────────────────────────────────────────┐  │
│ │ Production Key                        [Agent Mode] ✓  │  │
│ │ clwb_ai_prod_abc123...                               │  │
│ │ Created: 2026-01-15 | Last used: 2 hours ago         │  │
│ │                                                        │  │
│ │ ▸ Agent Configuration                                 │  │
│ │   • Enable Pi Agent: Yes                             │  │
│ │   • SDK Runner: Vercel AI v5                         │  │
│ │   • Routing Rules: 3 active                          │  │
│ │                                                        │  │
│ │ ▸ Usage & Limits                                      │  │
│ │   • Requests today: 1,245                            │  │
│ │   • Tokens today: 456,789                            │  │
│ └───────────────────────────────────────────────────────┘  │
│                                                             │
│ ┌───────────────────────────────────────────────────────┐  │
│ │ Development Key                       [Proxy Mode]    │  │
│ │ clwb_ai_dev_xyz789...                                │  │
│ │ Created: 2026-01-10 | Last used: 5 minutes ago       │  │
│ │                                                        │  │
│ │ ▸ Proxy Configuration                                 │  │
│ │   • OpenAI: sk-proj-...abc (configured)              │  │
│ │   • Anthropic: sk-ant-...xyz (configured)            │  │
│ │   • Google: AIza...123 (not configured)              │  │
│ └───────────────────────────────────────────────────────┘  │
│                                                             │
│ [+ Generate New API Key]                                   │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## Summary

### Key Design Principles

1. **Vercel AI SDK package is clean** - No Clawdbrain-specific logic, just `apiKey` + `baseUrl`
2. **Backend owns intelligence** - API endpoints handle validation, routing, provider mapping
3. **Two modes, same interface:**
   - **Proxy Mode**: Direct passthrough (fast, cheap, simple)
   - **Agent Mode**: Full Pi Agent with tools, memory, multi-step reasoning
4. **Flexible routing** - Per-key, per-request, or rule-based mode switching
5. **Future-proof** - Backend evolution (caching, RAG, fine-tuning) doesn't affect frontend

### Authentication Flow

```
Frontend (apiKey) → Backend (/api/v1/chat/completions)
                  → Validate Clawdbrain AI API Key
                  → Route based on key config
                  → [Proxy] Use real provider keys from config
                  → [Agent] Invoke Pi Agent with session context
                  → Return OpenAI-compatible response
```

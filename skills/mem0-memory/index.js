const { MemoryClient } = require("mem0ai");
const { z } = require("zod");

let getServerContext;
try {
  // Attempt to load from relative path (dev/test environment)
  // This assumes the skill is running in context of the openclaw project structure
  const contextModule = require("../../src/gateway/server-context.ts");
  getServerContext = contextModule.getServerContext;
} catch (e) {
  try {
    // Try JS path for built usage
    const contextModule = require("../../dist/gateway/server-context.js");
    getServerContext = contextModule.getServerContext;
  } catch (e2) {
    console.warn("Could not load server-context, defaulting to stub.");
  }
}

function getOrgContext() {
  if (getServerContext) {
    const ctx = getServerContext();
    if (ctx) {
      return {
        org_id: ctx.orgId,
        user_id: ctx.userId,
        agent_id: ctx.agentId || "default_agent",
        customer_id: "unknown_customer", // Needs context expansion
        team_id: "default_team",
      };
    }
  }
  return {
    org_id: process.env.MEM0_ORG_ID || "default_org",
    agent_id: "default_agent",
    customer_id: "unknown_customer",
    team_id: "default_team",
  };
}

class OmnisMemory {
  constructor() {
    if (!process.env.MEM0_API_KEY) {
      console.warn("MEM0_API_KEY not set. Mem0 memory disabled.");
      this.client = null;
      return;
    }
    this.client = new MemoryClient({
      apiKey: process.env.MEM0_API_KEY,
    });
  }

  async addMemory(content, scope, metadata = {}) {
    if (!this.client) return { ok: false, error: "Mem0 client not initialized" };

    const ctx = getOrgContext();
    const memoryParams = {
      messages: [{ role: "user", content }],
      metadata: {
        org_id: ctx.org_id,
        scope: scope,
        ...metadata,
      },
    };

    // Scope-specific user_id for isolation
    switch (scope) {
      case "customer":
        memoryParams.user_id = `${ctx.org_id}:customer:${metadata.customer_id || ctx.customer_id}`;
        break;
      case "agent":
        memoryParams.user_id = `${ctx.org_id}:agent:${metadata.agent_id || ctx.agent_id}`;
        break;
      case "team":
        memoryParams.user_id = `${ctx.org_id}:team:${metadata.team_id || ctx.team_id}`;
        break;
      case "organization":
        memoryParams.user_id = `${ctx.org_id}:org`;
        break;
      default:
        memoryParams.user_id = `${ctx.org_id}:general`;
    }

    try {
      const result = await this.client.add(memoryParams);
      return { ok: true, result };
    } catch (error) {
      console.error("Mem0 Add Error:", error);
      return { ok: false, error: String(error) };
    }
  }

  async searchMemory(query, scopes = ["customer", "agent", "team", "organization"]) {
    if (!this.client) return [];

    const ctx = getOrgContext();
    const results = [];

    for (const scope of scopes) {
      let userId;
      switch (scope) {
        case "customer":
          userId = `${ctx.org_id}:customer:${ctx.customer_id}`;
          break;
        case "agent":
          userId = `${ctx.org_id}:agent:${ctx.agent_id}`;
          break;
        case "team":
          userId = `${ctx.org_id}:team:${ctx.team_id}`;
          break;
        case "organization":
          userId = `${ctx.org_id}:org`;
          break;
      }

      try {
        if (userId) {
          const scopeResults = await this.client.search(query, {
            user_id: userId,
            limit: 3,
          });
          results.push(
            ...scopeResults.map((r) => ({
              ...r,
              scope,
              // Higher weight for more specific scopes
              weight: { customer: 1.0, agent: 0.8, team: 0.6, organization: 0.4 }[scope] || 0.5,
            })),
          );
        }
      } catch (error) {
        console.error(`Mem0 Search Error (${scope}):`, error);
      }
    }

    // Sort by weighted score
    return results.sort((a, b) => b.score * b.weight - a.score * a.weight);
  }
}

module.exports = {
  id: "mem0-memory",
  name: "Mem0 Memory",
  description: "Memory system for agents using Mem0",
  register(api) {
    const memory = new OmnisMemory();

    api.registerTool({
      name: "mem0_add",
      description:
        "Add a memory to the system with a specific scope (customer, agent, team, organization).",
      schema: z.object({
        content: z.string().describe("The text content of the memory to store"),
        scope: z
          .enum(["customer", "agent", "team", "organization"])
          .describe("The scope level of the memory"),
        metadata: z.record(z.any()).optional().describe("Additional metadata keys"),
      }),
      func: async (args) => {
        return await memory.addMemory(args.content, args.scope, args.metadata);
      },
    });

    api.registerTool({
      name: "mem0_search",
      description: "Search for stored memories across specified scopes.",
      schema: z.object({
        query: z.string().describe("The search query"),
        scopes: z
          .array(z.enum(["customer", "agent", "team", "organization"]))
          .optional()
          .default(["customer", "agent", "team", "organization"])
          .describe("Scopes to search in"),
      }),
      func: async (args) => {
        return await memory.searchMemory(args.query, args.scopes);
      },
    });
  },
};

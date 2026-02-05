/**
 * Team Routing Hook
 *
 * Analyzes incoming messages and suggests appropriate specialist agents
 * based on keywords and domain detection.
 *
 * Agent hierarchy (model assignments):
 * - C-level (opus): ceo, cto, cpo, ciso
 * - VP (opus): vp-engineering
 * - Directors (opus/sonnet): architects, security-engineer
 * - Leads (sonnet): specialists with leadership
 * - Senior Engineers (sonnet/haiku): implementation specialists
 * - Support (varies): research, git, release, etc.
 */

import type { HookHandler } from "../../hooks.js";

type AgentSuggestion = {
  agentId: string;
  model: "opus" | "sonnet" | "haiku";
  domain: string;
};

const AGENT_PATTERNS: Array<{
  pattern: RegExp;
  agents: AgentSuggestion[];
}> = [
  // Architecture keywords
  {
    pattern: /arquitetura|architecture|design.?system|scalab|distribut/i,
    agents: [{ agentId: "system-architect", model: "opus", domain: "architecture" }],
  },

  // Backend keywords
  {
    pattern: /api|endpoint|backend|route|elysia|middleware|server/i,
    agents: [{ agentId: "backend-architect", model: "opus", domain: "backend" }],
  },

  // Frontend keywords
  {
    pattern: /frontend|ui|component|page|astro|react|island|hydrat/i,
    agents: [{ agentId: "frontend-architect", model: "sonnet", domain: "frontend" }],
  },

  // Database keywords
  {
    pattern: /database|schema|migration|drizzle|query|sql|table|index/i,
    agents: [{ agentId: "database-engineer", model: "sonnet", domain: "database" }],
  },

  // Security keywords
  {
    pattern: /security|auth|vulnerab|csrf|xss|inject|owasp/i,
    agents: [{ agentId: "security-engineer", model: "opus", domain: "security" }],
  },

  // Testing keywords
  {
    pattern: /test|coverage|spec|e2e|playwright|vitest/i,
    agents: [{ agentId: "testing-specialist", model: "sonnet", domain: "testing" }],
  },

  // Trading keywords
  {
    pattern: /trading|order|market|exchange|candle|portfolio|position/i,
    agents: [{ agentId: "trading-engine", model: "opus", domain: "trading" }],
  },

  // AI keywords
  {
    pattern: /\bai\b|agno|ollama|llm|agent|machine.?learn|embedding/i,
    agents: [{ agentId: "ai-engineer", model: "sonnet", domain: "ai" }],
  },

  // Charts keywords
  {
    pattern: /chart|graph|candlestick|echarts|nivo|lightweight/i,
    agents: [{ agentId: "charts-specialist", model: "haiku", domain: "charts" }],
  },

  // Performance keywords
  {
    pattern: /performance|optimize|slow|latency|bottleneck|profil/i,
    agents: [{ agentId: "performance-engineer", model: "sonnet", domain: "performance" }],
  },

  // DevOps keywords
  {
    pattern: /docker|deploy|ci.?cd|container|kubernetes|monitor/i,
    agents: [{ agentId: "devops-engineer", model: "haiku", domain: "devops" }],
  },

  // Data keywords
  {
    pattern: /data|analytics|dashboard|kpi|metrics|etl|pipeline/i,
    agents: [{ agentId: "data-engineer", model: "sonnet", domain: "data" }],
  },

  // Design/UX keywords
  {
    pattern: /design|wireframe|ux|user.?flow|usability|accessib/i,
    agents: [{ agentId: "ux-designer", model: "sonnet", domain: "design" }],
  },

  // Product keywords
  {
    pattern: /product|roadmap|backlog|user.?story|requirement|sprint/i,
    agents: [{ agentId: "product-manager", model: "sonnet", domain: "product" }],
  },

  // Documentation keywords
  {
    pattern: /document|readme|jsdoc|api.?docs|changelog/i,
    agents: [{ agentId: "technical-writer", model: "sonnet", domain: "docs" }],
  },

  // Refactoring keywords
  {
    pattern: /refactor|clean.?up|tech.?debt|code.?smell|simplif/i,
    agents: [{ agentId: "refactoring-expert", model: "sonnet", domain: "refactoring" }],
  },

  // Release keywords
  {
    pattern: /release|version|tag|changelog|deploy.?prod/i,
    agents: [{ agentId: "release-manager", model: "haiku", domain: "release" }],
  },

  // ML/AI specific keywords
  {
    pattern: /model|training|inference|prediction|embeddings|rag/i,
    agents: [{ agentId: "ml-engineer", model: "sonnet", domain: "ml" }],
  },

  // Auth keywords
  {
    pattern: /login|logout|session|oauth|2fa|mfa|better.?auth|token/i,
    agents: [{ agentId: "auth-specialist", model: "sonnet", domain: "auth" }],
  },

  // Git/branching keywords
  {
    pattern: /branch|merge|conflict|rebase|cherry.?pick|stash|revert/i,
    agents: [{ agentId: "git-specialist", model: "haiku", domain: "git" }],
  },

  // QA/quality keywords
  {
    pattern: /quality|qa|flaky|regression|release.?ready/i,
    agents: [{ agentId: "qa-lead", model: "sonnet", domain: "qa" }],
  },

  // SRE/monitoring keywords
  {
    pattern: /slo|sli|uptime|incident|monitoring|alert|observab/i,
    agents: [{ agentId: "sre", model: "sonnet", domain: "sre" }],
  },

  // Backtesting keywords
  {
    pattern: /backtest|strategy|sharpe|drawdown|monte.?carlo|walk.?forward/i,
    agents: [{ agentId: "backtrade-specialist", model: "opus", domain: "trading" }],
  },

  // Requirements keywords
  {
    pattern: /requirement|acceptance.?criter|user.?story|moscow|given.?when/i,
    agents: [{ agentId: "requirements-analyst", model: "sonnet", domain: "product" }],
  },

  // Debugging keywords
  {
    pattern: /debug|root.?cause|5.?whys|investig|diagnos|why.?does/i,
    agents: [{ agentId: "root-cause-analyst", model: "opus", domain: "debugging" }],
  },

  // Review keywords
  {
    pattern: /code.?review|review.?(?:code|pr|pull)|revisar.?codigo/i,
    agents: [
      { agentId: "quality-engineer", model: "sonnet", domain: "review" },
      { agentId: "refactoring-expert", model: "sonnet", domain: "review" },
    ],
  },

  // State management keywords
  {
    pattern: /state|nanostore|store|signal|reactive/i,
    agents: [{ agentId: "frontend-architect", model: "sonnet", domain: "frontend" }],
  },

  // Error handling keywords
  {
    pattern: /error.?handl|exception|try.?catch|error.?boundar|fallback/i,
    agents: [{ agentId: "backend-architect", model: "opus", domain: "backend" }],
  },

  // i18n keywords
  {
    pattern: /i18n|translat|internation|locale|language/i,
    agents: [{ agentId: "frontend-architect", model: "sonnet", domain: "frontend" }],
  },

  // Dependency audit keywords
  {
    pattern: /dependenc|package|upgrade|outdated|vulnerab.?dep|license|npm.?audit/i,
    agents: [
      { agentId: "security-engineer", model: "opus", domain: "security" },
      { agentId: "devops-engineer", model: "haiku", domain: "devops" },
    ],
  },
];

/**
 * Analyze prompt and suggest appropriate agents
 */
function analyzePrompt(prompt: string): AgentSuggestion[] {
  const suggestions: AgentSuggestion[] = [];
  const seenAgents = new Set<string>();

  for (const { pattern, agents } of AGENT_PATTERNS) {
    if (pattern.test(prompt)) {
      for (const agent of agents) {
        if (!seenAgents.has(agent.agentId)) {
          seenAgents.add(agent.agentId);
          suggestions.push(agent);
        }
      }
    }
  }

  // If no specific match, suggest quality-engineer for general analysis
  if (
    suggestions.length === 0 &&
    /anali[sz]|audit|review|inspect|avaliar|verificar/i.test(prompt)
  ) {
    suggestions.push({ agentId: "quality-engineer", model: "sonnet", domain: "review" });
  }

  return suggestions;
}

/**
 * Determine complexity scale based on prompt and suggestions
 */
function determineScale(
  prompt: string,
  suggestions: AgentSuggestion[],
): "simple" | "medium" | "complex" {
  const wordCount = prompt.split(/\s+/).length;
  const agentCount = suggestions.length;

  if (wordCount > 80 || agentCount > 4) {
    return "complex";
  }
  if (wordCount > 30 || agentCount > 2) {
    return "medium";
  }
  return "simple";
}

/**
 * Team routing hook handler
 *
 * Analyzes incoming agent messages and adds context about suggested specialists.
 * This helps the agent know which sub-agents to delegate to via sessions_spawn.
 */
const teamRoutingHandler: HookHandler = async (event) => {
  // Only handle agent events with messages
  if (event.type !== "agent") {
    return;
  }

  const context = event.context || {};
  const message = context.message as string | undefined;

  if (!message || typeof message !== "string") {
    return;
  }

  // Analyze the prompt
  const suggestions = analyzePrompt(message);

  if (suggestions.length === 0) {
    return;
  }

  const scale = determineScale(message, suggestions);

  // Build context string for the agent
  const agentList = suggestions.map((s) => `${s.agentId} (${s.model})`).join(", ");
  const contextMessage = `[TEAM ROUTING] Scale: ${scale} | Suggested agents: ${agentList} | Use sessions_spawn to delegate.`;

  // Add to event messages for the agent to see
  event.messages.push(contextMessage);

  console.log(`[team-routing] ${contextMessage}`);
};

export default teamRoutingHandler;

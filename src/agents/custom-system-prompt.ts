/**
 * Custom System Prompt Builder
 *
 * Builds agent-specific system prompts based on agent configuration,
 * combining base prompts with agent personality, role, and customizations.
 */

import type { AgentConfig } from "./agent-config.js";

export type TenantContext = {
  organizationId?: string;
  workspaceId?: string;
  teamId?: string;
  userId?: string;
};

/**
 * Build agent-specific system prompt
 *
 * Combines base system prompt with agent-specific customizations
 * including personality, tone, role, and custom instructions.
 */
export function buildAgentSystemPrompt(params: {
  agentConfig: AgentConfig;
  baseSystemPrompt: string;
  tenantContext?: TenantContext;
}): string {
  const { agentConfig, baseSystemPrompt, tenantContext } = params;

  // If agent uses fully custom prompt, return it directly
  if (
    agentConfig.systemPrompt?.template === "custom" &&
    agentConfig.systemPrompt.customPrompt
  ) {
    // Still append tenant context if available
    if (tenantContext) {
      return `${agentConfig.systemPrompt.customPrompt}\n\n${buildTenantContextSection(tenantContext)}`;
    }
    return agentConfig.systemPrompt.customPrompt;
  }

  // Otherwise, augment base prompt with agent-specific sections
  const sections: string[] = [];

  // Start with base prompt
  if (baseSystemPrompt) {
    sections.push(baseSystemPrompt);
  }

  // Add agent identity/role section
  if (agentConfig.name || agentConfig.description) {
    const roleSection = buildAgentRoleSection(agentConfig);
    if (roleSection) {
      sections.push(roleSection);
    }
  }

  // Add personality/tone section
  if (agentConfig.systemPrompt?.personality || agentConfig.systemPrompt?.tone) {
    const personalitySection = buildPersonalitySection(agentConfig);
    if (personalitySection) {
      sections.push(personalitySection);
    }
  }

  // Add tool restrictions section (if applicable)
  if (agentConfig.enabledTools || agentConfig.disabledTools) {
    const toolSection = buildToolRestrictionsSection(agentConfig);
    if (toolSection) {
      sections.push(toolSection);
    }
  }

  // Add agent-specific settings/guidelines
  if (agentConfig.settings && Object.keys(agentConfig.settings).length > 0) {
    const settingsSection = buildSettingsSection(agentConfig);
    if (settingsSection) {
      sections.push(settingsSection);
    }
  }

  // Add tenant context
  if (tenantContext) {
    sections.push(buildTenantContextSection(tenantContext));
  }

  return sections.join("\n\n");
}

function buildAgentRoleSection(config: AgentConfig): string {
  const parts: string[] = ["## Agent Role"];

  if (config.name && config.description) {
    parts.push(`You are **${config.name}**: ${config.description}`);
  } else if (config.name) {
    parts.push(`You are **${config.name}**.`);
  } else if (config.description) {
    parts.push(config.description);
  }

  // Add agent type context
  const typeContext = getAgentTypeContext(config.agentType);
  if (typeContext) {
    parts.push(`\n${typeContext}`);
  }

  return parts.join("\n");
}

function buildPersonalitySection(config: AgentConfig): string {
  const parts: string[] = ["## Communication Style"];

  if (config.systemPrompt?.personality) {
    parts.push(`**Personality**: ${config.systemPrompt.personality}`);
  }

  if (config.systemPrompt?.tone) {
    parts.push(`**Tone**: ${config.systemPrompt.tone}`);
  }

  return parts.join("\n");
}

function buildToolRestrictionsSection(config: AgentConfig): string {
  const parts: string[] = ["## Tool Access"];

  if (config.enabledTools && config.enabledTools.length > 0) {
    parts.push(
      `You have access to the following tools: ${config.enabledTools.join(", ")}.`,
    );
    parts.push("Only use tools from this approved list.");
  }

  if (config.disabledTools && config.disabledTools.length > 0) {
    parts.push(
      `The following tools are disabled for this agent: ${config.disabledTools.join(", ")}.`,
    );
    parts.push("Do not attempt to use disabled tools.");
  }

  return parts.join("\n");
}

function buildSettingsSection(config: AgentConfig): string {
  const parts: string[] = ["## Agent Settings"];

  if (!config.settings) {
    return "";
  }

  // Format settings as bullet points
  for (const [key, value] of Object.entries(config.settings)) {
    const formattedKey = key
      .replace(/([A-Z])/g, " $1")
      .replace(/^./, (str) => str.toUpperCase())
      .trim();
    parts.push(`- **${formattedKey}**: ${JSON.stringify(value)}`);
  }

  return parts.join("\n");
}

function buildTenantContextSection(context: TenantContext): string {
  const parts: string[] = ["## Multi-Tenant Context"];

  if (context.organizationId) {
    parts.push(`Organization ID: ${context.organizationId}`);
  }

  if (context.workspaceId) {
    parts.push(`Workspace ID: ${context.workspaceId}`);
  }

  if (context.teamId) {
    parts.push(`Team ID: ${context.teamId}`);
  }

  if (context.userId) {
    parts.push(`User ID: ${context.userId}`);
  }

  if (parts.length > 1) {
    parts.push(
      "\nThis context identifies which organization, workspace, team, and user is making the request.",
    );
  }

  return parts.join("\n");
}

function getAgentTypeContext(agentType: string): string {
  switch (agentType) {
    case "sales":
      return "Your primary focus is on sales activities including lead generation, outreach, follow-ups, and deal management.";
    case "marketing":
      return "Your primary focus is on marketing activities including campaign management, content creation, and audience engagement.";
    case "revops":
      return "Your primary focus is on revenue operations including pipeline analysis, forecasting, and operational efficiency.";
    case "support":
      return "Your primary focus is on customer support including answering questions, troubleshooting issues, and providing assistance.";
    case "custom":
      return "";
    default:
      return "";
  }
}

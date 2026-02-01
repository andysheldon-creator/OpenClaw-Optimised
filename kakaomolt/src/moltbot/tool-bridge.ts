/**
 * Moltbot Tool Bridge
 *
 * Exposes Moltbot's tools through KakaoMolt for seamless integration.
 * Supports tool execution via Gateway API or direct local access.
 */

import { MoltbotGatewayClient, type GatewayConfig } from "./gateway-client.js";

// Tool definitions for Moltbot's core tools
export interface ToolDefinition {
  name: string;
  description: string;
  category: ToolCategory;
  parameters?: Record<string, ParameterDef>;
  requiresGateway: boolean;
}

export interface ParameterDef {
  type: "string" | "number" | "boolean" | "array" | "object";
  description: string;
  required?: boolean;
  default?: unknown;
}

export type ToolCategory =
  | "communication"
  | "information"
  | "execution"
  | "session"
  | "memory"
  | "media"
  | "channel";

export interface ToolExecutionResult {
  success: boolean;
  result?: unknown;
  error?: string;
  executionTime?: number;
}

// Moltbot's available tools catalog
export const MOLTBOT_TOOLS: ToolDefinition[] = [
  // Communication & Messaging
  {
    name: "message",
    description: "Send messages to other channels (Telegram, Discord, Slack, etc.)",
    category: "communication",
    parameters: {
      channel: { type: "string", description: "Target channel (telegram, discord, slack, etc.)", required: true },
      recipient: { type: "string", description: "Recipient ID or username", required: true },
      text: { type: "string", description: "Message text", required: true },
      mediaUrl: { type: "string", description: "Optional media URL to attach" },
    },
    requiresGateway: true,
  },
  {
    name: "tts",
    description: "Convert text to speech audio",
    category: "communication",
    parameters: {
      text: { type: "string", description: "Text to convert to speech", required: true },
      voice: { type: "string", description: "Voice ID (default: alloy)" },
      model: { type: "string", description: "TTS model (default: tts-1)" },
    },
    requiresGateway: true,
  },

  // Information & Research
  {
    name: "web_search",
    description: "Search the internet for information",
    category: "information",
    parameters: {
      query: { type: "string", description: "Search query", required: true },
      maxResults: { type: "number", description: "Maximum results (default: 5)" },
    },
    requiresGateway: true,
  },
  {
    name: "web_fetch",
    description: "Fetch and extract content from a URL",
    category: "information",
    parameters: {
      url: { type: "string", description: "URL to fetch", required: true },
      selector: { type: "string", description: "CSS selector to extract specific content" },
    },
    requiresGateway: true,
  },
  {
    name: "image_analyze",
    description: "Analyze an image using vision AI",
    category: "information",
    parameters: {
      imageUrl: { type: "string", description: "Image URL to analyze", required: true },
      prompt: { type: "string", description: "Question or prompt about the image" },
    },
    requiresGateway: true,
  },

  // Execution & Automation
  {
    name: "browser",
    description: "Automate web browser actions (open, navigate, click, etc.)",
    category: "execution",
    parameters: {
      action: { type: "string", description: "Action to perform (open, navigate, click, type, screenshot)", required: true },
      url: { type: "string", description: "URL for open/navigate actions" },
      selector: { type: "string", description: "CSS selector for click/type actions" },
      text: { type: "string", description: "Text for type action" },
    },
    requiresGateway: true,
  },
  {
    name: "canvas",
    description: "Generate or manipulate images",
    category: "execution",
    parameters: {
      action: { type: "string", description: "Action (draw, edit, overlay)", required: true },
      prompt: { type: "string", description: "Description of what to create/edit" },
      imageUrl: { type: "string", description: "Base image URL for edit operations" },
    },
    requiresGateway: true,
  },
  {
    name: "cron",
    description: "Schedule recurring tasks",
    category: "execution",
    parameters: {
      action: { type: "string", description: "Action (create, list, delete)", required: true },
      schedule: { type: "string", description: "Cron expression for create action" },
      command: { type: "string", description: "Command to run on schedule" },
      cronId: { type: "string", description: "Cron ID for delete action" },
    },
    requiresGateway: true,
  },
  {
    name: "execute",
    description: "Run shell commands (requires approval)",
    category: "execution",
    parameters: {
      command: { type: "string", description: "Shell command to execute", required: true },
      cwd: { type: "string", description: "Working directory" },
      timeout: { type: "number", description: "Timeout in milliseconds" },
    },
    requiresGateway: true,
  },

  // Session Management
  {
    name: "sessions_list",
    description: "List active agent sessions",
    category: "session",
    parameters: {},
    requiresGateway: true,
  },
  {
    name: "sessions_history",
    description: "Get conversation history from a session",
    category: "session",
    parameters: {
      sessionId: { type: "string", description: "Session ID to retrieve history from", required: true },
      limit: { type: "number", description: "Maximum messages to retrieve" },
    },
    requiresGateway: true,
  },
  {
    name: "sessions_spawn",
    description: "Create a new agent session",
    category: "session",
    parameters: {
      agentId: { type: "string", description: "Agent ID to spawn", required: true },
      initialMessage: { type: "string", description: "Initial message to send" },
    },
    requiresGateway: true,
  },

  // Memory
  {
    name: "memory_search",
    description: "Search agent memory for relevant context",
    category: "memory",
    parameters: {
      query: { type: "string", description: "Search query", required: true },
      maxResults: { type: "number", description: "Maximum results (default: 10)" },
      minScore: { type: "number", description: "Minimum relevance score (default: 0.3)" },
    },
    requiresGateway: false, // Can use local memory adapter
  },
  {
    name: "memory_sync",
    description: "Sync memory index with files",
    category: "memory",
    parameters: {
      force: { type: "boolean", description: "Force full reindex" },
    },
    requiresGateway: false,
  },

  // Channel-Specific Actions
  {
    name: "telegram_action",
    description: "Telegram-specific actions (delete message, pin, etc.)",
    category: "channel",
    parameters: {
      action: { type: "string", description: "Action (delete, pin, unpin, forward)", required: true },
      messageId: { type: "string", description: "Message ID to act on" },
      chatId: { type: "string", description: "Chat ID" },
    },
    requiresGateway: true,
  },
  {
    name: "discord_action",
    description: "Discord-specific actions (delete, react, guild management)",
    category: "channel",
    parameters: {
      action: { type: "string", description: "Action (delete, react, createChannel, etc.)", required: true },
      messageId: { type: "string", description: "Message ID" },
      channelId: { type: "string", description: "Channel ID" },
      guildId: { type: "string", description: "Guild/Server ID" },
    },
    requiresGateway: true,
  },
  {
    name: "slack_action",
    description: "Slack-specific actions (thread reply, channel operations)",
    category: "channel",
    parameters: {
      action: { type: "string", description: "Action (reply, react, update)", required: true },
      channel: { type: "string", description: "Channel ID", required: true },
      threadTs: { type: "string", description: "Thread timestamp for replies" },
      text: { type: "string", description: "Message text" },
    },
    requiresGateway: true,
  },
];

/**
 * Tool Bridge for executing Moltbot tools from KakaoMolt
 */
export class MoltbotToolBridge {
  private gateway: MoltbotGatewayClient | null = null;
  private gatewayConfig?: GatewayConfig;

  constructor(gatewayConfig?: Partial<GatewayConfig> & { agentId: string }) {
    if (gatewayConfig) {
      this.gatewayConfig = {
        url: gatewayConfig.url ?? "http://localhost:18789",
        agentId: gatewayConfig.agentId,
        apiKey: gatewayConfig.apiKey,
        timeoutMs: gatewayConfig.timeoutMs ?? 120000,
      };
      this.gateway = new MoltbotGatewayClient(this.gatewayConfig);
    }
  }

  /**
   * Get available tools
   */
  getAvailableTools(): ToolDefinition[] {
    if (this.gateway) {
      return MOLTBOT_TOOLS;
    }
    // Without gateway, only local tools are available
    return MOLTBOT_TOOLS.filter((t) => !t.requiresGateway);
  }

  /**
   * Get tools by category
   */
  getToolsByCategory(category: ToolCategory): ToolDefinition[] {
    return this.getAvailableTools().filter((t) => t.category === category);
  }

  /**
   * Get tool definition by name
   */
  getTool(name: string): ToolDefinition | undefined {
    return MOLTBOT_TOOLS.find((t) => t.name === name);
  }

  /**
   * Execute a tool by name
   */
  async executeTool(
    toolName: string,
    parameters: Record<string, unknown>,
    context: { userId: string; sessionKey?: string },
  ): Promise<ToolExecutionResult> {
    const startTime = Date.now();
    const tool = this.getTool(toolName);

    if (!tool) {
      return {
        success: false,
        error: `Unknown tool: ${toolName}`,
        executionTime: Date.now() - startTime,
      };
    }

    if (tool.requiresGateway && !this.gateway) {
      return {
        success: false,
        error: `Tool '${toolName}' requires Gateway connection`,
        executionTime: Date.now() - startTime,
      };
    }

    try {
      // Execute tool via Gateway
      const result = await this.executeViaGateway(tool, parameters, context);
      return {
        ...result,
        executionTime: Date.now() - startTime,
      };
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : String(err),
        executionTime: Date.now() - startTime,
      };
    }
  }

  /**
   * Execute tool via Gateway API
   */
  private async executeViaGateway(
    tool: ToolDefinition,
    parameters: Record<string, unknown>,
    context: { userId: string; sessionKey?: string },
  ): Promise<ToolExecutionResult> {
    if (!this.gateway || !this.gatewayConfig) {
      return { success: false, error: "Gateway not configured" };
    }

    // Build tool execution request as a message to the agent
    // The agent will interpret and execute the tool
    const toolRequest = `[Tool Request: ${tool.name}]
Parameters: ${JSON.stringify(parameters, null, 2)}

Please execute this tool and return the result.`;

    const response = await this.gateway.sendMessage({
      userId: context.userId,
      text: toolRequest,
      sessionKey: context.sessionKey,
      useMemory: false, // Tool execution doesn't need memory search
    });

    if (!response.success) {
      return { success: false, error: response.error };
    }

    return {
      success: true,
      result: {
        text: response.text,
        toolResults: response.toolResults,
      },
    };
  }

  /**
   * Send a message to another channel via Moltbot
   */
  async sendCrossChannelMessage(
    channel: string,
    recipient: string,
    text: string,
    options?: {
      mediaUrl?: string;
      replyToId?: string;
    },
  ): Promise<ToolExecutionResult> {
    return this.executeTool(
      "message",
      {
        channel,
        recipient,
        text,
        ...options,
      },
      { userId: "kakaomolt-bridge" },
    );
  }

  /**
   * Search the web
   */
  async webSearch(query: string, maxResults = 5): Promise<ToolExecutionResult> {
    return this.executeTool(
      "web_search",
      { query, maxResults },
      { userId: "kakaomolt-search" },
    );
  }

  /**
   * Fetch URL content
   */
  async webFetch(url: string, selector?: string): Promise<ToolExecutionResult> {
    return this.executeTool(
      "web_fetch",
      { url, selector },
      { userId: "kakaomolt-fetch" },
    );
  }

  /**
   * Analyze an image
   */
  async analyzeImage(imageUrl: string, prompt?: string): Promise<ToolExecutionResult> {
    return this.executeTool(
      "image_analyze",
      { imageUrl, prompt },
      { userId: "kakaomolt-vision" },
    );
  }

  /**
   * Search memory (can work locally without gateway)
   */
  async searchMemory(
    query: string,
    options?: { maxResults?: number; minScore?: number },
  ): Promise<ToolExecutionResult> {
    // If gateway is available, use it
    if (this.gateway) {
      const result = await this.gateway.searchMemory(query, options);
      return {
        success: result.success,
        result: result.results,
        error: result.error,
      };
    }

    // Fallback: return error (local memory requires direct adapter use)
    return {
      success: false,
      error: "Memory search requires Gateway connection or direct memory adapter",
    };
  }

  /**
   * Check if gateway is connected
   */
  async isGatewayConnected(): Promise<boolean> {
    if (!this.gateway) return false;
    const status = await this.gateway.checkStatus();
    return status.online;
  }

  /**
   * Get gateway status
   */
  async getGatewayStatus() {
    if (!this.gateway) {
      return { online: false, error: "Gateway not configured" };
    }
    return this.gateway.checkStatus();
  }
}

/**
 * Create a tool bridge instance
 */
export function createToolBridge(options?: {
  agentId?: string;
  gatewayUrl?: string;
  apiKey?: string;
}): MoltbotToolBridge {
  if (options?.agentId) {
    return new MoltbotToolBridge({
      agentId: options.agentId,
      url: options.gatewayUrl,
      apiKey: options.apiKey,
    });
  }
  return new MoltbotToolBridge();
}

/**
 * Format tool list for display (e.g., in KakaoTalk response)
 */
export function formatToolList(category?: ToolCategory): string {
  const tools = category
    ? MOLTBOT_TOOLS.filter((t) => t.category === category)
    : MOLTBOT_TOOLS;

  if (tools.length === 0) {
    return "사용 가능한 도구가 없습니다.";
  }

  const grouped = tools.reduce(
    (acc, tool) => {
      if (!acc[tool.category]) acc[tool.category] = [];
      acc[tool.category].push(tool);
      return acc;
    },
    {} as Record<ToolCategory, ToolDefinition[]>,
  );

  const categoryNames: Record<ToolCategory, string> = {
    communication: "통신",
    information: "정보",
    execution: "실행",
    session: "세션",
    memory: "메모리",
    media: "미디어",
    channel: "채널",
  };

  let output = "🛠️ **Moltbot 도구 목록**\n\n";

  for (const [cat, catTools] of Object.entries(grouped)) {
    output += `**${categoryNames[cat as ToolCategory]}**\n`;
    for (const tool of catTools) {
      output += `• \`${tool.name}\` - ${tool.description}\n`;
    }
    output += "\n";
  }

  return output;
}

/**
 * Moltbot Agent Integration
 *
 * High-level integration with Moltbot's full agent capabilities.
 * Provides unified access to:
 * - AI conversation with memory
 * - Tool execution
 * - Cross-channel messaging
 * - Session management
 */

import {
  MoltbotGatewayClient,
  createGatewayClient,
  discoverLocalGateway,
  type GatewayConfig,
  type GatewayResponse,
} from "./gateway-client.js";
import { MoltbotToolBridge, createToolBridge, type ToolExecutionResult } from "./tool-bridge.js";
import {
  MoltbotChannelBridge,
  createChannelBridge,
  parseBridgeCommand,
  type ChannelType,
  type BridgeResult,
} from "./channel-bridge.js";
import { isMoltbotInstalled, listAgentIds } from "./memory-adapter.js";

export interface AgentConfig {
  /** Gateway URL (auto-discover if not provided) */
  gatewayUrl?: string;
  /** Agent ID to use */
  agentId?: string;
  /** API key for gateway authentication */
  apiKey?: string;
  /** Default model to use */
  model?: string;
  /** Enable memory search (default: true) */
  useMemory?: boolean;
  /** System prompt override */
  systemPrompt?: string;
  /** Request timeout in ms (default: 120000) */
  timeoutMs?: number;
}

export interface ConversationContext {
  userId: string;
  sessionKey?: string;
  channel?: "kakao";
  metadata?: Record<string, unknown>;
}

export interface AgentResponse {
  success: boolean;
  text?: string;
  sessionId?: string;
  usage?: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
  };
  toolsUsed?: string[];
  bridgeResult?: BridgeResult;
  error?: string;
}

/**
 * Moltbot Agent Integration
 *
 * Provides a unified interface to interact with Moltbot's full capabilities
 * from KakaoMolt.
 */
export class MoltbotAgentIntegration {
  private gateway: MoltbotGatewayClient | null = null;
  private toolBridge: MoltbotToolBridge | null = null;
  private channelBridge: MoltbotChannelBridge | null = null;
  private config: AgentConfig;
  private initialized = false;

  constructor(config: AgentConfig = {}) {
    this.config = {
      useMemory: true,
      timeoutMs: 120000,
      ...config,
    };
  }

  /**
   * Initialize the integration (auto-discover gateway if needed)
   */
  async initialize(): Promise<{ success: boolean; error?: string }> {
    try {
      // Try to find a local gateway if URL not provided
      let gatewayUrl = this.config.gatewayUrl;

      if (!gatewayUrl) {
        const discovery = await discoverLocalGateway();
        if (discovery.found) {
          gatewayUrl = discovery.url;
        } else {
          return {
            success: false,
            error: "Gateway not found. Please start Moltbot gateway or provide gatewayUrl.",
          };
        }
      }

      // Find agent ID if not provided
      let agentId = this.config.agentId;

      if (!agentId && isMoltbotInstalled()) {
        const agents = listAgentIds();
        if (agents.length > 0) {
          agentId = agents[0]; // Use first available agent
        }
      }

      if (!agentId) {
        return {
          success: false,
          error: "No agent ID found. Please provide agentId or ensure Moltbot is installed.",
        };
      }

      // Create clients
      this.gateway = createGatewayClient({
        agentId,
        url: gatewayUrl,
        apiKey: this.config.apiKey,
      });

      this.toolBridge = createToolBridge({
        agentId,
        gatewayUrl,
        apiKey: this.config.apiKey,
      });

      this.channelBridge = createChannelBridge(this.gateway);

      // Verify connection
      const status = await this.gateway.checkStatus();
      if (!status.online) {
        return {
          success: false,
          error: `Gateway offline: ${status.error}`,
        };
      }

      this.initialized = true;
      return { success: true };
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  /**
   * Check if integration is ready
   */
  isReady(): boolean {
    return this.initialized && this.gateway !== null;
  }

  /**
   * Process a message from KakaoTalk user
   *
   * This is the main entry point for handling user messages.
   * It will:
   * 1. Check for bridge commands (cross-channel messaging)
   * 2. Check for tool commands
   * 3. Send to Moltbot agent for AI response
   */
  async processMessage(
    text: string,
    context: ConversationContext,
  ): Promise<AgentResponse> {
    if (!this.initialized || !this.gateway) {
      return {
        success: false,
        error: "Integration not initialized. Call initialize() first.",
      };
    }

    // Check for bridge commands first
    const bridgeCmd = parseBridgeCommand(text);
    if (bridgeCmd.isCommand) {
      return this.handleBridgeCommand(bridgeCmd, context);
    }

    // Check for special tool commands
    const toolCmd = this.parseToolCommand(text);
    if (toolCmd.isCommand) {
      return this.handleToolCommand(toolCmd, context);
    }

    // Regular message - send to Moltbot agent
    return this.sendToAgent(text, context);
  }

  /**
   * Send a message to Moltbot agent
   */
  async sendToAgent(
    text: string,
    context: ConversationContext,
  ): Promise<AgentResponse> {
    if (!this.gateway) {
      return { success: false, error: "Gateway not connected" };
    }

    const response = await this.gateway.sendMessage({
      userId: context.userId,
      text,
      sessionKey: context.sessionKey ?? `kakao-${context.userId}`,
      model: this.config.model,
      systemPrompt: this.config.systemPrompt,
      useMemory: this.config.useMemory,
    });

    return {
      success: response.success,
      text: response.text,
      sessionId: response.sessionId,
      usage: response.usage,
      toolsUsed: this.extractToolNames(response.toolResults),
      error: response.error,
    };
  }

  /**
   * Search memory for relevant context
   */
  async searchMemory(
    query: string,
    options?: { maxResults?: number; minScore?: number },
  ): Promise<{
    success: boolean;
    results?: Array<{
      path: string;
      snippet: string;
      score: number;
    }>;
    error?: string;
  }> {
    if (!this.gateway) {
      return { success: false, error: "Gateway not connected" };
    }

    return this.gateway.searchMemory(query, options);
  }

  /**
   * Execute a tool
   */
  async executeTool(
    toolName: string,
    parameters: Record<string, unknown>,
    context: ConversationContext,
  ): Promise<ToolExecutionResult> {
    if (!this.toolBridge) {
      return { success: false, error: "Tool bridge not initialized" };
    }

    return this.toolBridge.executeTool(toolName, parameters, {
      userId: context.userId,
      sessionKey: context.sessionKey,
    });
  }

  /**
   * Send a message to another channel
   */
  async sendToChannel(
    channel: ChannelType,
    recipient: string,
    text: string,
    context: ConversationContext,
    options?: { mediaUrls?: string[] },
  ): Promise<BridgeResult> {
    if (!this.channelBridge) {
      return { success: false, error: "Channel bridge not initialized" };
    }

    return this.channelBridge.forwardToChannel(
      channel,
      recipient,
      context.userId,
      text,
      options,
    );
  }

  /**
   * Get gateway status
   */
  async getStatus(): Promise<{
    online: boolean;
    version?: string;
    agentId?: string;
    memoryStats?: { files: number; chunks: number };
    error?: string;
  }> {
    if (!this.gateway) {
      return { online: false, error: "Gateway not connected" };
    }

    const status = await this.gateway.checkStatus();
    return {
      online: status.online,
      version: status.version,
      agentId: status.agentId,
      memoryStats: status.memoryStatus
        ? { files: status.memoryStatus.files, chunks: status.memoryStatus.chunks }
        : undefined,
      error: status.error,
    };
  }

  /**
   * Get conversation history
   */
  async getHistory(sessionKey: string): Promise<{
    success: boolean;
    messages?: Array<{
      role: "user" | "assistant" | "system";
      content: string;
      timestamp?: number;
    }>;
    error?: string;
  }> {
    if (!this.gateway) {
      return { success: false, error: "Gateway not connected" };
    }

    return this.gateway.getSessionHistory(sessionKey);
  }

  /**
   * Handle bridge command
   */
  private async handleBridgeCommand(
    cmd: ReturnType<typeof parseBridgeCommand>,
    context: ConversationContext,
  ): Promise<AgentResponse> {
    if (cmd.error) {
      return { success: false, error: cmd.error };
    }

    if (!cmd.channel || !cmd.recipient || !cmd.text) {
      return {
        success: false,
        error: "사용법: /전송 <채널> <받는사람> <메시지>",
      };
    }

    const result = await this.sendToChannel(
      cmd.channel,
      cmd.recipient,
      cmd.text,
      context,
    );

    if (!result.success) {
      return {
        success: false,
        error: result.error,
        bridgeResult: result,
      };
    }

    return {
      success: true,
      text: `✅ ${cmd.channel} 채널로 메시지를 전송했습니다.`,
      bridgeResult: result,
    };
  }

  /**
   * Parse tool command
   */
  private parseToolCommand(message: string): {
    isCommand: boolean;
    toolName?: string;
    parameters?: Record<string, unknown>;
  } {
    const trimmed = message.trim();

    // Check for tool commands: /도구 <name> or /tool <name>
    const match = trimmed.match(/^[/\/](도구|tool)\s+(\w+)(?:\s+(.+))?$/is);
    if (!match) {
      return { isCommand: false };
    }

    const toolName = match[2].toLowerCase();
    const argsStr = match[3]?.trim();

    // Try to parse parameters as JSON or key=value pairs
    let parameters: Record<string, unknown> = {};

    if (argsStr) {
      try {
        parameters = JSON.parse(argsStr);
      } catch {
        // Parse key=value pairs
        const pairs = argsStr.split(/\s+/);
        for (const pair of pairs) {
          const [key, ...valueParts] = pair.split("=");
          if (key && valueParts.length > 0) {
            parameters[key] = valueParts.join("=");
          }
        }
      }
    }

    return {
      isCommand: true,
      toolName,
      parameters,
    };
  }

  /**
   * Handle tool command
   */
  private async handleToolCommand(
    cmd: ReturnType<typeof this.parseToolCommand>,
    context: ConversationContext,
  ): Promise<AgentResponse> {
    if (!cmd.toolName) {
      return {
        success: false,
        error: "사용법: /도구 <도구이름> [parameters]",
      };
    }

    const result = await this.executeTool(
      cmd.toolName,
      cmd.parameters ?? {},
      context,
    );

    if (!result.success) {
      return {
        success: false,
        error: result.error,
      };
    }

    return {
      success: true,
      text: typeof result.result === "string"
        ? result.result
        : JSON.stringify(result.result, null, 2),
      toolsUsed: [cmd.toolName],
    };
  }

  /**
   * Extract tool names from tool results
   */
  private extractToolNames(toolResults?: unknown[]): string[] | undefined {
    if (!toolResults?.length) return undefined;

    const names: string[] = [];
    for (const result of toolResults) {
      if (typeof result === "object" && result !== null) {
        const r = result as Record<string, unknown>;
        if (typeof r.toolName === "string") names.push(r.toolName);
        if (typeof r.tool === "string") names.push(r.tool);
        if (typeof r.name === "string") names.push(r.name);
      }
    }

    return names.length > 0 ? names : undefined;
  }
}

/**
 * Create an agent integration instance
 */
export function createAgentIntegration(config?: AgentConfig): MoltbotAgentIntegration {
  return new MoltbotAgentIntegration(config);
}

/**
 * Create and initialize an agent integration
 */
export async function initializeAgentIntegration(
  config?: AgentConfig,
): Promise<{ integration: MoltbotAgentIntegration; error?: string }> {
  const integration = createAgentIntegration(config);
  const result = await integration.initialize();

  if (!result.success) {
    return { integration, error: result.error };
  }

  return { integration };
}

// Singleton instance for shared use
let sharedIntegration: MoltbotAgentIntegration | null = null;

/**
 * Get or create the shared integration instance
 */
export async function getSharedIntegration(
  config?: AgentConfig,
): Promise<MoltbotAgentIntegration> {
  if (!sharedIntegration) {
    sharedIntegration = createAgentIntegration(config);
    await sharedIntegration.initialize();
  }
  return sharedIntegration;
}

/**
 * Reset the shared integration (useful for testing)
 */
export function resetSharedIntegration(): void {
  sharedIntegration = null;
}

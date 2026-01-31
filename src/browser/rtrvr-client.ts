/**
 * rtrvr.ai API Client
 *
 * Client for communicating with rtrvr.ai's browser automation APIs:
 * - MCP API (https://mcp.rtrvr.ai) - Extension-based browser control
 * - Agent API (https://api.rtrvr.ai/agent) - Cloud-based agent execution
 * - Scrape API (https://api.rtrvr.ai/scrape) - Cloud-based page scraping
 *
 * @see https://www.rtrvr.ai/docs/mcp
 * @see https://www.rtrvr.ai/docs/agent
 */

/** MCP API endpoint for rtrvr.ai extension-based browser control */
const RTRVR_MCP_API_URL = "https://mcp.rtrvr.ai";
/** Cloud API endpoint for rtrvr.ai agent and scrape operations */
const RTRVR_CLOUD_API_URL = "https://api.rtrvr.ai";
/** Default timeout for API requests (12 minutes) */
const DEFAULT_TIMEOUT_MS = 720_000;

function normalizeBaseUrl(raw: string | undefined, fallback: string): string {
  const trimmed = (raw ?? "").trim();
  if (!trimmed) return fallback;
  return trimmed.replace(/\/$/, "");
}

function resolveCloudEndpoint(baseUrl: string, suffix: "/agent" | "/scrape"): string {
  const trimmed = baseUrl.replace(/\/$/, "");
  try {
    const parsed = new URL(trimmed);
    const parts = parsed.pathname.split("/").filter(Boolean);
    const last = parts.at(-1);
    if (last === "agent" || last === "scrape") {
      parts.pop();
      parsed.pathname = parts.length ? `/${parts.join("/")}` : "";
      return `${parsed.toString().replace(/\/$/, "")}${suffix}`;
    }
  } catch {
    // fall through to string handling
  }
  if (trimmed.endsWith("/agent") || trimmed.endsWith("/scrape")) {
    const base = trimmed.replace(/\/(agent|scrape)$/, "");
    return `${base}${suffix}`;
  }
  return `${trimmed}${suffix}`;
}

// ============================================================================
// Types
// ============================================================================

export type RtrvrClientConfig = {
  apiKey: string;
  deviceId?: string;
  timeoutMs?: number;
  mcpApiUrl?: string;
  cloudApiUrl?: string;
};

export type RtrvrTab = {
  id: number;
  url: string;
  title: string;
  active?: boolean;
  windowId?: number;
};

export type RtrvrPageTree = {
  tabId: number;
  url: string;
  title?: string;
  tree: string;
  content?: string;
};

export type RtrvrDevice = {
  deviceId: string;
  deviceName?: string;
  online: boolean;
  lastSeen: string;
  hasFcmToken?: boolean;
};

export type RtrvrCredits = {
  plan?: string;
  creditsRemaining?: number;
  creditsUsed?: number;
  creditsLeft?: number;
  renewalDate?: string;
};

/**
 * System tool names for take_page_action.
 * These are the granular browser automation tools available in both extension and cloud modes.
 */
export type SystemToolName =
  // Core Interaction & Form Actions
  | "click_element"
  | "type_into_element"
  | "type_and_enter"
  | "select_dropdown_value"
  | "clear_element"
  | "focus_element"
  | "check_field_validity"
  | "select_text"
  // Advanced Mouse & Keyboard Actions
  | "hover_element"
  | "right_click_element"
  | "double_click_element"
  | "press_key"
  | "mouse_wheel"
  // Drag, Drop & Complex Widgets
  | "drag_element"
  | "drag_and_drop"
  | "adjust_slider"
  // Scroll & Viewport
  | "scroll_page"
  | "scroll_to_element"
  // Touch Gestures
  | "swipe_element"
  | "long_press_element"
  | "pinch_zoom"
  // Navigation & Tab Management
  | "go_back"
  | "go_forward"
  | "goto_url"
  | "refresh_page"
  | "open_new_tab"
  | "switch_tab"
  | "close_tab"
  // Information & External Actions
  | "describe_images"
  | "google_search"
  // Clipboard Actions
  | "copy_text"
  | "paste_text"
  // Wait & Control Flow
  | "wait_action"
  | "wait_for_element"
  | "answer_task"
  // File Operations
  | "upload_file";

export type RtrvrPageAction = {
  tab_id?: number;
  tool_name: SystemToolName;
  args: Record<string, unknown>;
};

export type RtrvrSchemaField = {
  name: string;
  description?: string;
  type?: string;
  required?: boolean;
};

export type RtrvrSchema = {
  fields: RtrvrSchemaField[];
};

export type RtrvrOutputDestination = {
  type: "json" | "google_sheet";
  new_sheet_title?: string;
  new_tab_title?: string;
  existing_sheet_id?: string;
  existing_tab_title?: string;
};

// ============================================================================
// MCP API Response Types (Extension Mode)
// ============================================================================

export type RtrvrMcpResponse<T = unknown> = {
  success: boolean;
  data?: T;
  error?: string | { message?: string };
  metadata?: {
    requestId?: string;
    executionTime?: number;
    tool?: string;
    deviceId?: string;
    creditsUsed?: number;
    creditsRemaining?: number;
  };
};

export type RtrvrTabsResult = {
  tabs: RtrvrTab[];
  activeTab?: RtrvrTab;
  tabCount: number;
};

export type RtrvrPageDataResult = {
  trees: RtrvrPageTree[];
};

export type RtrvrActionResult = {
  success: boolean;
  trees?: RtrvrPageTree[];
  actionResults?: unknown[];
  message?: string;
  creditsUsed?: number;
};

export type RtrvrActResult = {
  success: boolean;
  actions?: unknown[];
  extractedData?: unknown;
  result?: { text?: string; json?: unknown };
  creditsUsed?: number;
};

export type RtrvrExtractResult = {
  success: boolean;
  extractedData?: unknown[];
  recordCount?: number;
  sheetUrl?: string;
  creditsUsed?: number;
};

export type RtrvrJsResult = {
  success: boolean;
  result?: unknown;
  consoleOutput?: string[];
  error?: string;
};

// ============================================================================
// Cloud API Response Types (Cloud Mode)
// ============================================================================

export type RtrvrAgentResponse = {
  success: boolean;
  status: "success" | "error" | "cancelled" | "requires_input" | "executing";
  trajectoryId: string;
  phase: number;
  output?: Array<{
    type: "text" | "json" | "tool_result";
    text?: string;
    data?: unknown;
  }>;
  result?: {
    text?: string;
    json?: unknown;
  };
  steps?: Array<{
    toolName: string;
    status: string;
    duration?: number;
    creditsUsed?: number;
  }>;
  usage: {
    creditsUsed: number;
    creditsLeft?: number;
  };
  metadata: {
    taskRef: string;
    toolsUsed?: string[];
  };
  error?: string;
  warnings?: string[];
};

export type RtrvrScrapeResponse = {
  success: boolean;
  status?: string;
  trajectoryId?: string;
  tabs?: Array<{
    tabId: number;
    url: string;
    title: string;
    status?: "success" | "error";
    error?: string;
    tree?: string;
    content?: string;
    text?: string;
  }>;
  url?: string;
  title?: string;
  text?: string;
  tree?: string;
  content?: string;
  usageData?: {
    totalCredits?: number;
    totalUsd?: number;
  };
  usage?: {
    creditsUsed: number;
    creditsLeft?: number;
  };
  metadata?: {
    durationMs?: number;
    outputTooLarge?: boolean;
    responseRef?: unknown;
  };
  error?: string;
};

// ============================================================================
// rtrvr.ai Client
// ============================================================================

/**
 * rtrvr.ai API Client
 *
 * Provides access to rtrvr.ai's browser automation capabilities:
 * - MCP tools for extension-based browser control
 * - Cloud agent for AI-powered automation
 * - Cloud scrape for page data (accessibility tree) extraction
 *
 * Note: rtrvr.ai provides enriched accessibility trees, NOT screenshots.
 * Use get_page_data (extension) or /scrape (cloud) for page structure.
 */
export class RtrvrClient {
  private apiKey: string;
  private deviceId?: string;
  private timeoutMs: number;
  private mcpApiUrl: string;
  private cloudAgentUrl: string;
  private cloudScrapeUrl: string;

  constructor(config: RtrvrClientConfig) {
    if (!config.apiKey) {
      throw new Error("rtrvr.ai API key is required");
    }
    this.apiKey = config.apiKey;
    this.deviceId = config.deviceId;
    this.timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.mcpApiUrl = normalizeBaseUrl(config.mcpApiUrl, RTRVR_MCP_API_URL);
    const cloudBase = normalizeBaseUrl(config.cloudApiUrl, RTRVR_CLOUD_API_URL);
    this.cloudAgentUrl = resolveCloudEndpoint(cloudBase, "/agent");
    this.cloudScrapeUrl = resolveCloudEndpoint(cloudBase, "/scrape");
  }

  // ==========================================================================
  // HTTP Helpers
  // ==========================================================================

  private async request<T>(
    url: string,
    body: Record<string, unknown>,
    opts?: { timeoutMs?: number },
  ): Promise<T> {
    const timeoutMs = opts?.timeoutMs ?? this.timeoutMs;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text().catch(() => "Unknown error");
        throw new Error(`rtrvr.ai API error (${response.status}): ${errorText}`);
      }

      return (await response.json()) as T;
    } catch (err) {
      clearTimeout(timeoutId);
      if (err instanceof Error && err.name === "AbortError") {
        throw new Error(`rtrvr.ai API request timed out after ${timeoutMs}ms`);
      }
      throw err;
    }
  }

  /**
   * Make a request to the MCP API (extension-based browser control)
   */
  private async mcpRequest<T>(
    tool: string,
    params: Record<string, unknown> = {},
    opts?: { timeoutMs?: number },
  ): Promise<T> {
    const body: Record<string, unknown> = {
      tool,
      params: {
        ...params,
        device_id: params.device_id ?? this.deviceId,
      },
    };

    if (this.deviceId && !params.device_id) {
      body.deviceId = this.deviceId;
    }

    const response = await this.request<RtrvrMcpResponse<T>>(this.mcpApiUrl, body, opts);

    if (!response.success && response.error) {
      const errorMsg =
        typeof response.error === "string"
          ? response.error
          : (response.error.message ?? "Unknown error");
      throw new Error(`rtrvr.ai MCP error: ${errorMsg}`);
    }

    return response.data ?? (response as unknown as T);
  }

  /**
   * Make a request to the Cloud Agent API
   */
  private async agentRequest(
    input: string,
    opts: {
      urls?: string[];
      schema?: RtrvrSchema | Record<string, unknown>;
      dataInputs?: Array<{ description?: string; format?: string; inline?: string; url?: string }>;
      timeoutMs?: number;
    } = {},
  ): Promise<RtrvrAgentResponse> {
    const body: Record<string, unknown> = {
      input,
      urls: opts.urls,
      schema: opts.schema,
      dataInputs: opts.dataInputs,
      response: { verbosity: "final" },
    };

    return this.request<RtrvrAgentResponse>(this.cloudAgentUrl, body, {
      timeoutMs: opts.timeoutMs ?? this.timeoutMs,
    });
  }

  /**
   * Make a request to the Cloud Scrape API.
   * Returns accessibility tree and text content (NOT screenshots).
   */
  private async scrapeRequest(
    urls: string[],
    opts?: { timeoutMs?: number },
  ): Promise<RtrvrScrapeResponse> {
    return this.request<RtrvrScrapeResponse>(this.cloudScrapeUrl, { urls }, opts);
  }

  // ==========================================================================
  // Utility Tools (work without extension)
  // ==========================================================================

  /**
   * List available devices with rtrvr.ai extension installed
   */
  async listDevices(): Promise<{ online: boolean; devices: RtrvrDevice[] }> {
    const result = await this.mcpRequest<{
      online?: boolean;
      deviceCount?: number;
      devices?: RtrvrDevice[];
    }>("list_devices");

    return {
      online: result.online ?? result.devices?.some((d) => d.online) ?? false,
      devices: result.devices ?? [],
    };
  }

  /**
   * Get current credit balance
   */
  async getCredits(): Promise<RtrvrCredits> {
    return this.mcpRequest<RtrvrCredits>("get_current_credits");
  }

  // ==========================================================================
  // MCP Free Tools (Extension Mode - no credits)
  // ==========================================================================

  /**
   * Get browser tabs from the extension
   * @requires rtrvr.ai extension to be running
   */
  async getBrowserTabs(opts?: {
    filter?: "all" | "active" | "domain";
    domain?: string;
    deviceId?: string;
  }): Promise<{ tabs: RtrvrTab[]; activeTab?: RtrvrTab }> {
    const result = await this.mcpRequest<RtrvrTabsResult>("get_browser_tabs", {
      filter: opts?.filter ?? "all",
      domain: opts?.domain,
      device_id: opts?.deviceId,
    });

    return {
      tabs: result.tabs ?? [],
      activeTab: result.activeTab,
    };
  }

  /**
   * Get page data (enriched accessibility trees) from browser tabs.
   * This returns structured DOM representation, NOT screenshots.
   * @requires rtrvr.ai extension to be running
   */
  async getPageData(opts: {
    tabIds: number[];
    deviceId?: string;
  }): Promise<{ trees: RtrvrPageTree[] }> {
    const result = await this.mcpRequest<RtrvrPageDataResult>("get_page_data", {
      tabIds: opts.tabIds,
      device_id: opts.deviceId,
    });

    return { trees: result.trees ?? [] };
  }

  /**
   * Execute page actions on browser tabs using system tools.
   * @requires rtrvr.ai extension to be running
   */
  async takePageAction(opts: {
    actions: RtrvrPageAction[];
    deviceId?: string;
  }): Promise<RtrvrActionResult> {
    return this.mcpRequest<RtrvrActionResult>("take_page_action", {
      actions: opts.actions,
      device_id: opts.deviceId,
    });
  }

  /**
   * Execute JavaScript in browser sandbox
   * @requires rtrvr.ai extension to be running
   */
  async executeJavaScript(opts: {
    code: string;
    timeout?: number;
    context?: Record<string, unknown>;
    deviceId?: string;
  }): Promise<RtrvrJsResult> {
    return this.mcpRequest<RtrvrJsResult>(
      "execute_javascript",
      {
        code: opts.code,
        timeout: opts.timeout,
        context: opts.context,
        device_id: opts.deviceId,
      },
      { timeoutMs: opts.timeout ?? 150_000 },
    );
  }

  // ==========================================================================
  // MCP Credit Tools (Extension Mode - credits required)
  // ==========================================================================

  /**
   * AI-powered browser interaction using planner
   * @requires rtrvr.ai extension to be running
   */
  async planner(opts: {
    userInput: string;
    tabUrls?: string[];
    context?: string;
    maxSteps?: number;
    deviceId?: string;
  }): Promise<RtrvrActResult> {
    return this.mcpRequest<RtrvrActResult>(
      "planner",
      {
        user_input: opts.userInput,
        tab_urls: opts.tabUrls,
        context: opts.context,
        max_steps: opts.maxSteps,
        device_id: opts.deviceId,
      },
      { timeoutMs: this.timeoutMs },
    );
  }

  /**
   * AI-powered page interaction
   * @requires rtrvr.ai extension to be running
   */
  async act(opts: {
    userInput: string;
    tabUrls?: string[];
    tabId?: number;
    schema?: RtrvrSchema;
    deviceId?: string;
  }): Promise<RtrvrActResult> {
    return this.mcpRequest<RtrvrActResult>(
      "act",
      {
        user_input: opts.userInput,
        tab_urls: opts.tabUrls,
        tab_id: opts.tabId,
        schema: opts.schema,
        device_id: opts.deviceId,
      },
      { timeoutMs: this.timeoutMs },
    );
  }

  /**
   * Extract structured data from web pages
   * @requires rtrvr.ai extension to be running
   */
  async extract(opts: {
    userInput: string;
    tabUrls?: string[];
    tabId?: number;
    schema?: RtrvrSchema;
    outputDestination?: RtrvrOutputDestination;
    deviceId?: string;
  }): Promise<RtrvrExtractResult> {
    return this.mcpRequest<RtrvrExtractResult>(
      "extract",
      {
        user_input: opts.userInput,
        tab_urls: opts.tabUrls,
        tab_id: opts.tabId,
        schema: opts.schema,
        output_destination: opts.outputDestination,
        device_id: opts.deviceId,
      },
      { timeoutMs: this.timeoutMs },
    );
  }

  /**
   * Multi-page crawl with extraction
   * @requires rtrvr.ai extension to be running
   */
  async crawl(opts: {
    userInput: string;
    tabUrls?: string[];
    tabId?: number;
    schema?: RtrvrSchema;
    maxPages?: number;
    followLinks?: boolean;
    linkPattern?: string;
    outputDestination?: RtrvrOutputDestination;
    deviceId?: string;
  }): Promise<RtrvrExtractResult> {
    return this.mcpRequest<RtrvrExtractResult>(
      "crawl",
      {
        user_input: opts.userInput,
        tab_urls: opts.tabUrls,
        tab_id: opts.tabId,
        schema: opts.schema,
        max_pages: opts.maxPages,
        follow_links: opts.followLinks,
        link_pattern: opts.linkPattern,
        output_destination: opts.outputDestination,
        device_id: opts.deviceId,
      },
      { timeoutMs: this.timeoutMs },
    );
  }

  // ==========================================================================
  // Cloud Tools (Cloud Mode - no extension required)
  // ==========================================================================

  /**
   * Run AI agent task using rtrvr.ai's cloud browsers
   * @note Does NOT require the rtrvr.ai extension
   */
  async cloudAgent(opts: {
    userInput: string;
    urls?: string[];
    schema?: RtrvrSchema | Record<string, unknown>;
    timeoutMs?: number;
  }): Promise<RtrvrAgentResponse> {
    return this.agentRequest(opts.userInput, {
      urls: opts.urls,
      schema: opts.schema,
      timeoutMs: opts.timeoutMs,
    });
  }

  /**
   * Scrape a web page using rtrvr.ai's cloud browsers.
   * Returns accessibility tree and text content (NOT screenshots).
   * @note Does NOT require the rtrvr.ai extension
   */
  async cloudScrape(opts: {
    url?: string;
    urls?: string[];
    timeoutMs?: number;
  }): Promise<RtrvrScrapeResponse> {
    const urls = Array.isArray(opts.urls) ? opts.urls : opts.url ? [opts.url] : [];
    if (urls.length === 0) {
      throw new Error("rtrvr.ai scrape requires at least one URL");
    }
    return this.scrapeRequest(urls, { timeoutMs: opts.timeoutMs });
  }

  // ==========================================================================
  // Helper Methods
  // ==========================================================================

  /**
   * Check if the rtrvr.ai extension is available and online
   */
  async isExtensionAvailable(): Promise<boolean> {
    try {
      const { online } = await this.listDevices();
      return online;
    } catch {
      return false;
    }
  }

  /**
   * Get the configured device ID, or the first available online device
   */
  async getEffectiveDeviceId(): Promise<string | undefined> {
    if (this.deviceId) return this.deviceId;

    const { devices } = await this.listDevices();
    const onlineDevices = devices.filter((d) => d.online);

    // Return most recently seen online device
    if (onlineDevices.length > 0) {
      onlineDevices.sort((a, b) => new Date(b.lastSeen).getTime() - new Date(a.lastSeen).getTime());
      return onlineDevices[0]?.deviceId;
    }

    return undefined;
  }
}

/**
 * Create a new rtrvr.ai client instance
 */
export function createRtrvrClient(config: RtrvrClientConfig): RtrvrClient {
  return new RtrvrClient(config);
}

/**
 * Friendly Error Messages
 *
 * Provides user-friendly error messages with actionable suggestions.
 */

export interface FriendlyError {
  title: string;
  description: string;
  suggestions: string[];
  docsLink?: string;
}

interface ErrorPattern {
  match: (err: unknown, message: string, code?: string) => boolean;
  friendly: FriendlyError;
}

const ERROR_PATTERNS: ErrorPattern[] = [
  // API Key Issues
  {
    match: (_err, msg, code) =>
      code === "401" ||
      msg.includes("401") ||
      msg.toLowerCase().includes("unauthorized") ||
      msg.toLowerCase().includes("invalid api key") ||
      msg.toLowerCase().includes("authentication failed"),
    friendly: {
      title: "Authentication Failed",
      description: "Your API key appears to be invalid or expired.",
      suggestions: [
        "Run 'openclaw onboard' to reconfigure your API key",
        "Check if your API key is still valid in your provider's dashboard",
        "Ensure the API key has the required permissions",
      ],
      docsLink: "https://docs.openclaw.ai/start/getting-started",
    },
  },
  {
    match: (_err, msg, code) =>
      code === "403" ||
      msg.includes("403") ||
      msg.toLowerCase().includes("forbidden") ||
      msg.toLowerCase().includes("access denied"),
    friendly: {
      title: "Access Denied",
      description: "Your API key doesn't have permission for this action.",
      suggestions: [
        "Check your API key permissions in your provider's dashboard",
        "Some models may require a paid plan",
        "Try a different model with 'openclaw config model'",
      ],
    },
  },
  {
    match: (_err, msg) =>
      msg.toLowerCase().includes("missing api key") ||
      msg.toLowerCase().includes("no api key") ||
      msg.toLowerCase().includes("api key not found") ||
      msg.toLowerCase().includes("apikey is required"),
    friendly: {
      title: "API Key Not Found",
      description: "No API key is configured for this provider.",
      suggestions: [
        "Run 'openclaw onboard' to set up your API key",
        "Check ~/.openclaw/openclaw.json for configuration",
        "Set the API key via environment variable (e.g., ANTHROPIC_API_KEY)",
      ],
      docsLink: "https://docs.openclaw.ai/start/getting-started",
    },
  },

  // Network Issues
  {
    match: (_err, _msg, code) => code === "ECONNREFUSED",
    friendly: {
      title: "Connection Refused",
      description: "Could not connect to the server.",
      suggestions: [
        "Check your internet connection",
        "The service might be temporarily unavailable",
        "If using a proxy, verify proxy settings",
        "Try again in a few moments",
      ],
    },
  },
  {
    match: (_err, _msg, code) =>
      code === "ETIMEDOUT" || code === "ESOCKETTIMEDOUT" || code === "ECONNRESET",
    friendly: {
      title: "Connection Timeout",
      description: "The request took too long to complete.",
      suggestions: [
        "Check your internet connection",
        "The service might be experiencing high load",
        "Try again in a few moments",
        "Consider using a model with faster response times",
      ],
    },
  },
  {
    match: (_err, _msg, code) => code === "ENOTFOUND",
    friendly: {
      title: "Server Not Found",
      description: "Could not resolve the server address.",
      suggestions: [
        "Check your internet connection",
        "Verify DNS settings",
        "The service URL might be incorrect",
      ],
    },
  },

  // Rate Limiting
  {
    match: (_err, msg, code) =>
      code === "429" ||
      msg.includes("429") ||
      msg.toLowerCase().includes("rate limit") ||
      msg.toLowerCase().includes("too many requests") ||
      msg.toLowerCase().includes("quota exceeded"),
    friendly: {
      title: "Rate Limited",
      description: "You've made too many requests. Please wait before trying again.",
      suggestions: [
        "Wait a few minutes before retrying",
        "Consider upgrading your API plan for higher limits",
        "Use a different model or provider as backup",
        "Check your usage in the provider's dashboard",
      ],
    },
  },

  // Model Issues
  {
    match: (_err, msg) => {
      const lower = msg.toLowerCase();
      return (
        lower.includes("model not found") ||
        lower.includes("invalid model") ||
        lower.includes("model does not exist") ||
        (lower.includes("model") && lower.includes("does not exist"))
      );
    },
    friendly: {
      title: "Model Not Found",
      description: "The specified model is not available.",
      suggestions: [
        "Check the model name for typos",
        "Run 'openclaw models' to see available models",
        "The model might require special access or be deprecated",
      ],
    },
  },
  {
    match: (_err, msg) =>
      msg.toLowerCase().includes("context length") ||
      msg.toLowerCase().includes("token limit") ||
      msg.toLowerCase().includes("maximum context") ||
      msg.toLowerCase().includes("too long"),
    friendly: {
      title: "Context Too Long",
      description: "The conversation exceeded the model's context limit.",
      suggestions: [
        "Start a new conversation with '/reset'",
        "Use a model with larger context window",
        "Enable automatic compaction in config",
      ],
    },
  },

  // Configuration Issues
  {
    match: (_err, _msg, code) => code === "INVALID_CONFIG",
    friendly: {
      title: "Invalid Configuration",
      description: "There's an error in your OpenClaw configuration.",
      suggestions: [
        "Run 'openclaw config validate' to see detailed errors",
        "Check ~/.openclaw/openclaw.json for syntax errors",
        "Run 'openclaw onboard' to reconfigure",
      ],
      docsLink: "https://docs.openclaw.ai/reference/config",
    },
  },

  // Telegram Issues
  {
    match: (_err, msg) =>
      msg.toLowerCase().includes("telegram") &&
      (msg.includes("409") || msg.toLowerCase().includes("conflict")),
    friendly: {
      title: "Telegram Bot Conflict",
      description: "Another instance is already using this Telegram bot.",
      suggestions: [
        "Stop other OpenClaw instances using this bot token",
        "Check for duplicate gateway processes: 'openclaw status'",
        "Create a new bot via @BotFather if needed",
      ],
    },
  },

  // WhatsApp Issues
  {
    match: (_err, msg) =>
      msg.toLowerCase().includes("whatsapp") &&
      (msg.toLowerCase().includes("disconnected") || msg.toLowerCase().includes("logged out")),
    friendly: {
      title: "WhatsApp Disconnected",
      description: "Your WhatsApp session was disconnected.",
      suggestions: [
        "Run 'openclaw onboard --channels' to reconnect",
        "Scan the QR code with your phone",
        "Make sure WhatsApp is active on your phone",
      ],
    },
  },
];

/**
 * Extract error code from an error object
 */
function extractCode(err: unknown): string | undefined {
  if (!err || typeof err !== "object") {
    return undefined;
  }

  // Check for code property
  const code = (err as { code?: unknown }).code;
  if (typeof code === "string") {
    return code;
  }
  if (typeof code === "number") {
    return String(code);
  }

  // Check for status property (HTTP errors)
  const status = (err as { status?: unknown }).status;
  if (typeof status === "number") {
    return String(status);
  }

  // Check for statusCode property
  const statusCode = (err as { statusCode?: unknown }).statusCode;
  if (typeof statusCode === "number") {
    return String(statusCode);
  }

  return undefined;
}

/**
 * Extract message from an error object
 */
function extractMessage(err: unknown): string {
  if (err instanceof Error) {
    return err.message;
  }
  if (typeof err === "string") {
    return err;
  }
  if (err && typeof err === "object" && "message" in err) {
    return String((err as { message: unknown }).message);
  }
  return String(err);
}

/**
 * Get a friendly error message for a given error
 */
export function getFriendlyError(err: unknown): FriendlyError | null {
  const message = extractMessage(err);
  const code = extractCode(err);

  for (const pattern of ERROR_PATTERNS) {
    if (pattern.match(err, message, code)) {
      return pattern.friendly;
    }
  }

  return null;
}

/**
 * Format a friendly error for terminal output
 */
export function formatFriendlyError(friendly: FriendlyError): string {
  const lines: string[] = [];

  lines.push("");
  lines.push(`\x1b[31m✗ ${friendly.title}\x1b[0m`);
  lines.push("");
  lines.push(`  ${friendly.description}`);
  lines.push("");
  lines.push("\x1b[33mSuggestions:\x1b[0m");

  for (const suggestion of friendly.suggestions) {
    lines.push(`  • ${suggestion}`);
  }

  if (friendly.docsLink) {
    lines.push("");
    lines.push(`\x1b[2mDocs: ${friendly.docsLink}\x1b[0m`);
  }

  lines.push("");

  return lines.join("\n");
}

/**
 * Enhance an error message with friendly suggestions if available
 */
export function enhanceErrorMessage(err: unknown): string {
  const friendly = getFriendlyError(err);
  const originalMessage = extractMessage(err);

  if (friendly) {
    return formatFriendlyError(friendly) + `\x1b[2mOriginal error: ${originalMessage}\x1b[0m\n`;
  }

  return originalMessage;
}

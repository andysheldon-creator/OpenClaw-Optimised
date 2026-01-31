/**
 * Placeholder message controller for chat platforms.
 *
 * Sends a temporary "thinking" message when processing starts,
 * then deletes or edits it when the actual response is ready.
 */

export type PlaceholderConfig = {
  /** Enable placeholder messages. Default: false. */
  enabled?: boolean;
  /** Custom messages to show while thinking. Randomly selected. */
  messages?: string[];
  /** Delete placeholder when response is ready. Default: true. */
  deleteOnResponse?: boolean;
  /** Show tool names as they're called. Default: false. */
  showTools?: boolean;
  /** Tool message format. Default: "🔧 Using {tool}..." */
  toolMessageFormat?: string;
};

export type PlaceholderSender = {
  send: (text: string) => Promise<{ messageId: string; chatId: string }>;
  edit: (messageId: string, text: string) => Promise<void>;
  delete: (messageId: string) => Promise<void>;
};

export type PlaceholderController = {
  /** Send initial placeholder message. */
  start: () => Promise<void>;
  /** Update placeholder with tool usage info. */
  onTool: (toolName: string, args?: Record<string, unknown>) => Promise<void>;
  /** Clean up placeholder (delete or leave as-is). */
  cleanup: () => Promise<void>;
  /** Check if placeholder is active. */
  isActive: () => boolean;
};

const DEFAULT_MESSAGES = ["🤔 Thinking...", "💭 Processing...", "🧠 Working on it..."];

const DEFAULT_TOOL_FORMAT = "{emoji} {label}...";

/** Map tool names to friendly labels and emojis */
const TOOL_DISPLAY: Record<string, { emoji: string; label: string }> = {
  // Search & Web
  web_search: { emoji: "🔍", label: "Searching" },
  web_fetch: { emoji: "🌐", label: "Fetching" },
  browser: { emoji: "🖥️", label: "Browsing" },

  // File operations
  Read: { emoji: "📖", label: "Reading" },
  Write: { emoji: "✍️", label: "Writing" },
  Edit: { emoji: "📝", label: "Editing" },

  // Execution
  exec: { emoji: "⚡", label: "Running" },
  process: { emoji: "🔄", label: "Processing" },

  // Memory
  memory_search: { emoji: "🧠", label: "Searching memory" },
  memory_get: { emoji: "💭", label: "Recalling" },

  // Messaging
  message: { emoji: "💬", label: "Sending message" },
  tts: { emoji: "🔊", label: "Generating audio" },

  // Sessions
  sessions_spawn: { emoji: "🚀", label: "Spawning task" },
  sessions_send: { emoji: "📤", label: "Sending" },
  sessions_list: { emoji: "📋", label: "Listing sessions" },

  // Image
  image: { emoji: "🖼️", label: "Analyzing image" },

  // Cron
  cron: { emoji: "⏰", label: "Scheduling" },

  // Gateway
  gateway: { emoji: "🔧", label: "Configuring" },

  // Nodes
  nodes: { emoji: "📱", label: "Controlling device" },

  // Canvas
  canvas: { emoji: "🎨", label: "Rendering" },
};

function getToolDisplay(toolName: string): { emoji: string; label: string } {
  // Try exact match first
  if (TOOL_DISPLAY[toolName]) {
    return TOOL_DISPLAY[toolName];
  }
  // Try lowercase
  const lower = toolName.toLowerCase();
  for (const [key, value] of Object.entries(TOOL_DISPLAY)) {
    if (key.toLowerCase() === lower) {
      return value;
    }
  }
  // Default fallback
  return { emoji: "🔧", label: toolName };
}

export function createPlaceholderController(params: {
  config: PlaceholderConfig;
  sender: PlaceholderSender;
  log?: (message: string) => void;
}): PlaceholderController {
  const { config, sender, log } = params;

  let placeholderMessageId: string | undefined;
  let active = false;
  let currentToolText = "";

  const messages = config.messages?.length ? config.messages : DEFAULT_MESSAGES;
  const toolFormat = config.toolMessageFormat ?? DEFAULT_TOOL_FORMAT;

  const getRandomMessage = () => {
    const idx = Math.floor(Math.random() * messages.length);
    return messages[idx] ?? messages[0] ?? DEFAULT_MESSAGES[0];
  };

  const start = async () => {
    if (!config.enabled) return;
    if (active) return;

    try {
      const text = getRandomMessage();
      const result = await sender.send(text);
      placeholderMessageId = result.messageId;
      active = true;
      log?.(`Placeholder sent: ${result.messageId}`);
    } catch (err) {
      log?.(`Failed to send placeholder: ${err}`);
    }
  };

  const onTool = async (toolName: string, args?: Record<string, unknown>) => {
    if (!config.enabled) return;
    if (!active || !placeholderMessageId) return;

    try {
      const display = getToolDisplay(toolName);
      let detail = "";

      // Extract meaningful details from args
      if (args) {
        if (toolName === "exec" && args.command) {
          // Show first part of command
          const cmd = String(args.command);
          detail = cmd.length > 30 ? cmd.slice(0, 30) + "..." : cmd;
        } else if (
          (toolName === "Read" || toolName === "Write" || toolName === "Edit") &&
          (args.path || args.file_path)
        ) {
          // Show filename
          const path = String(args.path || args.file_path);
          const filename = path.split("/").pop() || path;
          detail = filename.length > 25 ? "..." + filename.slice(-25) : filename;
        } else if (toolName === "web_search" && args.query) {
          detail = String(args.query).slice(0, 30);
        } else if (toolName === "web_fetch" && args.url) {
          const url = String(args.url);
          try {
            detail = new URL(url).hostname;
          } catch {
            detail = url.slice(0, 30);
          }
        }
      }

      currentToolText = detail
        ? `${display.emoji} ${display.label}: ${detail}`
        : `${display.emoji} ${display.label}...`;

      await sender.edit(placeholderMessageId, currentToolText);
      log?.(`Placeholder updated: ${toolName} -> ${currentToolText}`);
    } catch (err) {
      log?.(`Failed to update placeholder: ${err}`);
    }
  };

  const cleanup = async () => {
    if (!active || !placeholderMessageId) return;

    const shouldDelete = config.deleteOnResponse !== false;

    if (shouldDelete) {
      try {
        await sender.delete(placeholderMessageId);
        log?.(`Placeholder deleted: ${placeholderMessageId}`);
      } catch (err) {
        log?.(`Failed to delete placeholder: ${err}`);
      }
    }

    placeholderMessageId = undefined;
    active = false;
    currentToolText = "";
  };

  const isActive = () => active;

  return {
    start,
    onTool,
    cleanup,
    isActive,
  };
}

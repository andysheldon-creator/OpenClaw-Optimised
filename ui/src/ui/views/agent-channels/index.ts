/**
 * Multi-agent channel UI components.
 * Provides a Slack-like chat interface for agent collaboration.
 */

// Colors and theming
export {
  AGENT_COLORS,
  type AgentColor,
  getAgentColor,
  getAgentColorLight,
  getStatusColor,
  getRoleColor,
  getRoleIcon,
  getListeningModeIcon,
  resetColorAssignments,
  preAssignColors,
} from "./agent-colors.js";

// Channel sidebar
export {
  type ChannelListItem,
  type ChannelGroup,
  type ChannelSidebarState,
  getChannelIcon,
  formatChannelName,
  groupChannelsByType,
  filterChannels,
  renderChannelSidebar,
  getChannelSidebarStyles,
} from "./channel-sidebar.js";

// Channel chat view
export {
  type ChatMessage,
  type ChannelChatState,
  renderChatMessage,
  groupMessages,
  renderChannelChat,
  getChannelChatStyles,
} from "./channel-chat.js";

// Typing indicators
export {
  type TypingAgent,
  type TypingIndicatorState,
  formatTypingText,
  renderTypingIndicator,
  getTypingIndicatorStyles,
} from "./typing-indicator.js";

// Agent status
export {
  type AgentStatusInfo,
  renderAgentStatus,
  renderAgentList,
  getStatusText,
  getAgentStatusStyles,
} from "./agent-status.js";

// Mention autocomplete
export {
  type MentionOption,
  type MentionAutocompleteState,
  BROADCAST_OPTIONS,
  filterMentionOptions,
  extractMentionQuery,
  renderMentionAutocomplete,
  getMentionAutocompleteStyles,
  handleAutocompleteKeydown,
  formatMentionForInsertion,
} from "./mention-autocomplete.js";

// Thread view
export {
  type ThreadMessage,
  type ThreadViewState,
  formatRelativeTime,
  renderThreadMessage,
  renderThreadView,
  getThreadViewStyles,
} from "./thread-view.js";

/**
 * Get all styles for the agent channels UI.
 */
export function getAllStyles(): string {
  // Dynamic imports to avoid circular dependencies
  const { getChannelSidebarStyles } = require("./channel-sidebar.js");
  const { getChannelChatStyles } = require("./channel-chat.js");
  const { getTypingIndicatorStyles } = require("./typing-indicator.js");
  const { getAgentStatusStyles } = require("./agent-status.js");
  const { getMentionAutocompleteStyles } = require("./mention-autocomplete.js");
  const { getThreadViewStyles } = require("./thread-view.js");

  return [
    getChannelSidebarStyles(),
    getChannelChatStyles(),
    getTypingIndicatorStyles(),
    getAgentStatusStyles(),
    getMentionAutocompleteStyles(),
    getThreadViewStyles(),
  ].join("\n\n");
}

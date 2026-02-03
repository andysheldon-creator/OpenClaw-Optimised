/**
 * Typing indicator component for multi-agent chat.
 * Shows who is currently typing with animated dots.
 */

import { getAgentColor } from "./agent-colors.js";

export type TypingAgent = {
  agentId: string;
  displayName: string;
  startedAt: number;
};

export type TypingIndicatorState = {
  typing: TypingAgent[];
  maxDisplayNames: number;
};

/**
 * Format typing indicator text.
 */
export function formatTypingText(typing: TypingAgent[]): string {
  if (typing.length === 0) {
    return "";
  }

  const names = typing.map((t) => t.displayName);

  if (names.length === 1) {
    return `${names[0]} is typing`;
  }

  if (names.length === 2) {
    return `${names[0]} and ${names[1]} are typing`;
  }

  if (names.length === 3) {
    return `${names[0]}, ${names[1]}, and ${names[2]} are typing`;
  }

  const displayCount = 2;
  const remaining = names.length - displayCount;
  const displayNames = names.slice(0, displayCount).join(", ");
  return `${displayNames}, and ${remaining} more are typing`;
}

/**
 * Render typing indicator as HTML.
 */
export function renderTypingIndicator(state: TypingIndicatorState): string {
  if (state.typing.length === 0) {
    return "";
  }

  const text = formatTypingText(state.typing);
  const avatars = state.typing.slice(0, state.maxDisplayNames).map((t) => {
    const color = getAgentColor(t.agentId);
    const initial = t.displayName.charAt(0).toUpperCase();
    return `<span class="typing-avatar" style="background: ${color}">${initial}</span>`;
  });

  return `
    <div class="typing-indicator">
      <div class="typing-avatars">
        ${avatars.join("")}
      </div>
      <div class="typing-text">
        <span class="typing-names">${escapeHtml(text)}</span>
        <span class="typing-dots">
          <span class="dot">.</span>
          <span class="dot">.</span>
          <span class="dot">.</span>
        </span>
      </div>
    </div>
  `;
}

/**
 * Get CSS styles for typing indicator.
 */
export function getTypingIndicatorStyles(): string {
  return `
    .typing-indicator {
      display: flex;
      align-items: center;
      padding: 8px 16px;
      font-size: 13px;
      color: var(--text-secondary, #666);
      background: var(--bg-secondary, #f9f9f9);
      border-top: 1px solid var(--border-color, #e0e0e0);
    }

    .typing-avatars {
      display: flex;
      margin-right: 8px;
    }

    .typing-avatar {
      width: 20px;
      height: 20px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 10px;
      font-weight: 600;
      color: white;
      margin-right: -6px;
      border: 2px solid var(--bg-secondary, #f9f9f9);
    }

    .typing-avatar:last-child {
      margin-right: 0;
    }

    .typing-text {
      display: flex;
      align-items: baseline;
    }

    .typing-names {
      font-style: italic;
    }

    .typing-dots {
      display: inline-flex;
      margin-left: 2px;
    }

    .typing-dots .dot {
      animation: typing-dot 1.4s infinite ease-in-out;
      font-weight: bold;
    }

    .typing-dots .dot:nth-child(1) {
      animation-delay: 0s;
    }

    .typing-dots .dot:nth-child(2) {
      animation-delay: 0.2s;
    }

    .typing-dots .dot:nth-child(3) {
      animation-delay: 0.4s;
    }

    @keyframes typing-dot {
      0%, 60%, 100% {
        opacity: 0.2;
      }
      30% {
        opacity: 1;
      }
    }
  `;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

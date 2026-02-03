/**
 * Thread view component for multi-agent chat.
 * Shows a side panel with thread messages and context.
 */

import { getAgentColor } from "./agent-colors.js";

export type ThreadMessage = {
  id: string;
  authorId: string;
  authorName: string;
  authorType: "agent" | "user" | "system" | "external";
  content: string;
  timestamp: number;
  isEdited?: boolean;
};

export type ThreadViewState = {
  threadId: string;
  parentMessage: ThreadMessage;
  messages: ThreadMessage[];
  title?: string;
  messageCount: number;
  subscribers: string[];
  isLoading: boolean;
};

/**
 * Format relative time for display.
 */
export function formatRelativeTime(timestamp: number): string {
  const now = Date.now();
  const diff = now - timestamp;

  if (diff < 60000) {
    return "just now";
  }

  if (diff < 3600000) {
    const minutes = Math.floor(diff / 60000);
    return `${minutes}m ago`;
  }

  if (diff < 86400000) {
    const hours = Math.floor(diff / 3600000);
    return `${hours}h ago`;
  }

  const days = Math.floor(diff / 86400000);
  if (days === 1) {
    return "yesterday";
  }

  if (days < 7) {
    return `${days}d ago`;
  }

  return new Date(timestamp).toLocaleDateString();
}

/**
 * Render a thread message.
 */
export function renderThreadMessage(message: ThreadMessage): string {
  const color = getAgentColor(message.authorId);
  const initial = message.authorName.charAt(0).toUpperCase();
  const time = formatRelativeTime(message.timestamp);

  return `
    <div class="thread-message" data-message-id="${escapeHtml(message.id)}">
      <div class="message-avatar" style="background: ${color}">
        <span>${initial}</span>
      </div>
      <div class="message-content">
        <div class="message-header">
          <span class="author-name">${escapeHtml(message.authorName)}</span>
          <span class="message-time">${time}</span>
          ${message.isEdited ? '<span class="edited-label">(edited)</span>' : ""}
        </div>
        <div class="message-body">${escapeHtml(message.content)}</div>
      </div>
    </div>
  `;
}

/**
 * Render thread view as HTML.
 */
export function renderThreadView(state: ThreadViewState): string {
  const parentAuthorColor = getAgentColor(state.parentMessage.authorId);
  const parentInitial = state.parentMessage.authorName.charAt(0).toUpperCase();

  return `
    <div class="thread-view">
      <div class="thread-header">
        <div class="header-title">
          <h3>${state.title ? escapeHtml(state.title) : "Thread"}</h3>
          <span class="reply-count">${state.messageCount} ${state.messageCount === 1 ? "reply" : "replies"}</span>
        </div>
        <button class="close-thread-btn" title="Close thread">✕</button>
      </div>

      <div class="thread-parent">
        <div class="parent-indicator">
          <span class="indicator-line"></span>
        </div>
        <div class="parent-message">
          <div class="message-avatar" style="background: ${parentAuthorColor}">
            <span>${parentInitial}</span>
          </div>
          <div class="message-content">
            <div class="message-header">
              <span class="author-name">${escapeHtml(state.parentMessage.authorName)}</span>
              <span class="message-time">${formatRelativeTime(state.parentMessage.timestamp)}</span>
            </div>
            <div class="message-body">${escapeHtml(state.parentMessage.content)}</div>
          </div>
        </div>
      </div>

      <div class="thread-divider">
        <span class="divider-text">${state.messageCount} ${state.messageCount === 1 ? "reply" : "replies"}</span>
      </div>

      <div class="thread-messages">
        ${
          state.isLoading
            ? '<div class="loading-spinner">Loading...</div>'
            : state.messages.map(renderThreadMessage).join("")
        }
      </div>

      <div class="thread-input">
        <div class="input-avatar" style="background: var(--user-color, #3b82f6)">
          <span>Y</span>
        </div>
        <textarea
          class="reply-input"
          placeholder="Reply in thread..."
          rows="1"
        ></textarea>
        <button class="send-btn" title="Send reply">➤</button>
      </div>
    </div>
  `;
}

/**
 * Get CSS styles for thread view.
 */
export function getThreadViewStyles(): string {
  return `
    .thread-view {
      display: flex;
      flex-direction: column;
      width: 400px;
      height: 100%;
      background: var(--bg-primary, white);
      border-left: 1px solid var(--border-color, #e0e0e0);
    }

    .thread-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 16px;
      border-bottom: 1px solid var(--border-color, #e0e0e0);
    }

    .header-title h3 {
      margin: 0;
      font-size: 16px;
      font-weight: 600;
    }

    .reply-count {
      font-size: 12px;
      color: var(--text-secondary, #666);
    }

    .close-thread-btn {
      background: none;
      border: none;
      font-size: 18px;
      color: var(--text-secondary, #666);
      cursor: pointer;
      padding: 4px 8px;
      border-radius: 4px;
    }

    .close-thread-btn:hover {
      background: var(--bg-hover, #f0f0f0);
    }

    .thread-parent {
      display: flex;
      padding: 16px;
      background: var(--bg-secondary, #f9f9f9);
    }

    .parent-indicator {
      display: flex;
      flex-direction: column;
      align-items: center;
      width: 20px;
      margin-right: 8px;
    }

    .indicator-line {
      width: 2px;
      flex: 1;
      background: var(--border-color, #e0e0e0);
      margin-top: 36px;
    }

    .parent-message,
    .thread-message {
      display: flex;
      flex: 1;
    }

    .message-avatar {
      width: 32px;
      height: 32px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
    }

    .message-avatar span {
      color: white;
      font-size: 14px;
      font-weight: 600;
    }

    .message-content {
      margin-left: 8px;
      flex: 1;
      overflow: hidden;
    }

    .message-header {
      display: flex;
      align-items: baseline;
      gap: 8px;
      margin-bottom: 4px;
    }

    .author-name {
      font-weight: 600;
      font-size: 14px;
    }

    .message-time {
      font-size: 12px;
      color: var(--text-secondary, #666);
    }

    .edited-label {
      font-size: 11px;
      color: var(--text-tertiary, #999);
      font-style: italic;
    }

    .message-body {
      font-size: 14px;
      line-height: 1.4;
      white-space: pre-wrap;
      word-wrap: break-word;
    }

    .thread-divider {
      display: flex;
      align-items: center;
      padding: 8px 16px;
      border-bottom: 1px solid var(--border-color, #e0e0e0);
    }

    .divider-text {
      font-size: 12px;
      color: var(--text-secondary, #666);
    }

    .thread-messages {
      flex: 1;
      overflow-y: auto;
      padding: 8px 16px;
    }

    .thread-message {
      padding: 12px 0;
    }

    .thread-message + .thread-message {
      border-top: 1px solid var(--border-light, #f0f0f0);
    }

    .loading-spinner {
      text-align: center;
      padding: 20px;
      color: var(--text-secondary, #666);
    }

    .thread-input {
      display: flex;
      align-items: flex-end;
      padding: 12px 16px;
      border-top: 1px solid var(--border-color, #e0e0e0);
      gap: 8px;
    }

    .input-avatar {
      width: 28px;
      height: 28px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
    }

    .input-avatar span {
      color: white;
      font-size: 12px;
      font-weight: 600;
    }

    .reply-input {
      flex: 1;
      padding: 8px 12px;
      border: 1px solid var(--border-color, #e0e0e0);
      border-radius: 8px;
      font-size: 14px;
      resize: none;
      max-height: 120px;
    }

    .reply-input:focus {
      outline: none;
      border-color: var(--accent-color, #3b82f6);
    }

    .send-btn {
      background: var(--accent-color, #3b82f6);
      color: white;
      border: none;
      border-radius: 50%;
      width: 32px;
      height: 32px;
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      font-size: 14px;
    }

    .send-btn:hover {
      background: var(--accent-hover, #2563eb);
    }

    .send-btn:disabled {
      background: var(--bg-disabled, #ccc);
      cursor: not-allowed;
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

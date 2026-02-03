/**
 * Interactive handler registry for Block Kit actions
 * Routes block_action events to registered handlers
 */

import type { BlockAction, BlockActionPayload, Option } from "./types.js";

export interface BlockActionHandlerParams {
  actionId: string;
  blockId: string;
  value?: string;
  selectedOption?: Option;
  selectedOptions?: Option[];
  selectedDate?: string;
  selectedDateTime?: number;
  selectedTime?: string;
  selectedConversation?: string;
  selectedConversations?: string[];
  selectedChannel?: string;
  selectedChannels?: string[];
  selectedUser?: string;
  selectedUsers?: string[];
  userId: string;
  userName?: string;
  channelId?: string;
  messageTs?: string;
  threadTs?: string;
  triggerId: string;
  responseUrl: string;
  payload: BlockActionPayload;
}

export type BlockActionHandler = (params: BlockActionHandlerParams) => Promise<void> | void;

interface HandlerRegistration {
  pattern: string | RegExp;
  handler: BlockActionHandler;
}

/**
 * Registry for Block Kit action handlers
 * Allows tools and other code to register handlers for interactive elements
 */
export class InteractiveHandlerRegistry {
  private handlers: HandlerRegistration[] = [];

  /**
   * Register a handler for block actions matching a pattern
   * @param actionIdPattern String or RegExp to match against action_id
   * @param handler Async function to handle the action
   */
  register(actionIdPattern: string | RegExp, handler: BlockActionHandler): void {
    this.handlers.push({
      pattern: actionIdPattern,
      handler,
    });
  }

  /**
   * Unregister handlers matching a pattern
   */
  unregister(actionIdPattern: string | RegExp): void {
    this.handlers = this.handlers.filter(
      (reg) => reg.pattern.toString() !== actionIdPattern.toString(),
    );
  }

  /**
   * Handle a block action payload
   * Finds matching handlers and executes them
   */
  async handleAction(payload: BlockActionPayload): Promise<void> {
    const action = payload.actions[0];
    if (!action) {
      return;
    }

    const matchingHandlers = this.findMatchingHandlers(action.action_id);

    if (matchingHandlers.length === 0) {
      // No handlers registered for this action
      return;
    }

    const params = this.buildHandlerParams(payload, action);

    // Execute all matching handlers in parallel
    await Promise.all(
      matchingHandlers.map(async (handler) => {
        try {
          await handler(params);
        } catch (error) {
          console.error(`Block action handler error for ${action.action_id}:`, error);
        }
      }),
    );
  }

  /**
   * Find handlers that match the given action ID
   */
  private findMatchingHandlers(actionId: string): BlockActionHandler[] {
    return this.handlers
      .filter((reg) => {
        if (typeof reg.pattern === "string") {
          return reg.pattern === actionId;
        }
        return reg.pattern.test(actionId);
      })
      .map((reg) => reg.handler);
  }

  /**
   * Build handler parameters from payload
   */
  private buildHandlerParams(
    payload: BlockActionPayload,
    action: BlockAction,
  ): BlockActionHandlerParams {
    return {
      actionId: action.action_id,
      blockId: action.block_id,
      value: action.value,
      selectedOption: action.selected_option,
      selectedOptions: action.selected_options,
      selectedDate: action.selected_date,
      selectedDateTime: action.selected_date_time,
      selectedTime: action.selected_time,
      selectedConversation: action.selected_conversation,
      selectedConversations: action.selected_conversations,
      selectedChannel: action.selected_channel,
      selectedChannels: action.selected_channels,
      selectedUser: action.selected_user,
      selectedUsers: action.selected_users,
      userId: payload.user.id,
      userName: payload.user.username ?? payload.user.name,
      channelId: payload.channel?.id,
      messageTs: payload.message?.ts,
      threadTs: payload.message?.thread_ts,
      triggerId: payload.trigger_id,
      responseUrl: payload.response_url,
      payload,
    };
  }

  /**
   * Clear all registered handlers
   */
  clear(): void {
    this.handlers = [];
  }

  /**
   * Get count of registered handlers
   */
  get handlerCount(): number {
    return this.handlers.length;
  }
}

/**
 * Global singleton registry
 * Used by default if no custom registry is provided
 */
export const globalHandlerRegistry = new InteractiveHandlerRegistry();

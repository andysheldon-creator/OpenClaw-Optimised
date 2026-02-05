/**
 * XEP-0444: Message Reactions
 * https://xmpp.org/extensions/xep-0444.html
 *
 * This file defines types for Message Reactions.
 * With xmpp.js, reactions are handled directly in client.ts using XML building.
 */

export interface MessageReactions {
  id: string; // ID of the message being reacted to
  reactions: string[]; // Array of emoji reactions
}

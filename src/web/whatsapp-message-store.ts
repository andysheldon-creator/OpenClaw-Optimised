import { promises as fs } from "node:fs";
import { existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import { STATE_DIR } from "../config/paths.js";
import { logVerbose } from "../globals.js";

export type StoredMessage = {
  id?: string;
  chatJid: string;
  senderJid?: string;
  text: string;
  timestamp: number;
  fromMe: boolean;
  pushName?: string;
  type: "text" | "media" | "location" | "other";
};

export type ChatSummary = {
  chatJid: string;
  lastMessage?: StoredMessage;
  messageCount: number;
  groupSubject?: string;
  participants?: number;
};

const PERSIST_INTERVAL_MS = 30000; // 30 seconds
const DEFAULT_MAX_MESSAGES_PER_CHAT = 500;

/**
 * WhatsApp message store - in-memory + periodic JSON persistence
 */
export class WhatsAppMessageStore {
  private messageStore = new Map<string, StoredMessage[]>();
  private persistTimer: NodeJS.Timeout | null = null;
  private isDirty = false;
  private readonly storePath: string;
  private readonly maxMessagesPerChat: number;

  constructor(options: { accountId: string; maxMessagesPerChat?: number }) {
    const dataDir = path.join(STATE_DIR, "data");
    if (!existsSync(dataDir)) {
      mkdirSync(dataDir, { recursive: true });
    }
    this.storePath = path.join(dataDir, `whatsapp-messages-${options.accountId}.json`);
    this.maxMessagesPerChat = options.maxMessagesPerChat ?? DEFAULT_MAX_MESSAGES_PER_CHAT;
  }

  /**
   * Load messages from disk on startup
   */
  async load(): Promise<void> {
    if (!existsSync(this.storePath)) {
      logVerbose(`No existing message store found at ${this.storePath}, starting fresh`);
      return;
    }
    try {
      const data = await fs.readFile(this.storePath, "utf8");
      const parsed = JSON.parse(data) as Record<string, StoredMessage[]>;
      for (const [chatJid, messages] of Object.entries(parsed)) {
        this.messageStore.set(chatJid, messages);
      }
      logVerbose(
        `Loaded message store with ${this.messageStore.size} chats from ${this.storePath}`,
      );
    } catch (err) {
      logVerbose(`Failed to load message store: ${String(err)}`);
    }
  }

  /**
   * Persist messages to disk
   */
  async persist(): Promise<void> {
    if (!this.isDirty) {
      return;
    }
    try {
      const obj: Record<string, StoredMessage[]> = {};
      for (const [chatJid, messages] of Array.from(this.messageStore.entries())) {
        obj[chatJid] = messages;
      }
      await fs.writeFile(this.storePath, JSON.stringify(obj, null, 2), "utf8");
      this.isDirty = false;
      logVerbose(`Persisted message store to ${this.storePath}`);
    } catch (err) {
      logVerbose(`Failed to persist message store: ${String(err)}`);
    }
  }

  /**
   * Start periodic persistence
   */
  startPersistence(): void {
    if (this.persistTimer) {
      return;
    }
    this.persistTimer = setInterval(() => {
      void this.persist();
    }, PERSIST_INTERVAL_MS);
  }

  /**
   * Stop periodic persistence and do final save
   */
  async stopPersistence(): Promise<void> {
    if (this.persistTimer) {
      clearInterval(this.persistTimer);
      this.persistTimer = null;
    }
    await this.persist();
  }

  /**
   * Store a message
   */
  storeMessage(msg: StoredMessage): void {
    const chatJid = msg.chatJid;
    let messages = this.messageStore.get(chatJid);
    if (!messages) {
      messages = [];
      this.messageStore.set(chatJid, messages);
    }

    // Deduplicate by message ID
    if (msg.id && messages.some((m) => m.id === msg.id)) {
      return;
    }

    // Add the message
    messages.push(msg);

    // Keep only last maxMessagesPerChat
    if (messages.length > this.maxMessagesPerChat) {
      messages.splice(0, messages.length - this.maxMessagesPerChat);
    }

    this.isDirty = true;
  }

  /**
   * Resolve a chatJid key — handles both JID format (123@s.whatsapp.net)
   * and E.164 format (+123 or 123). Tries exact match first, then
   * attempts to match by stripping suffixes/prefixes.
   */
  private resolveStoreKey(chatJid: string): string | undefined {
    // Exact match
    if (this.messageStore.has(chatJid)) {
      return chatJid;
    }
    // If it looks like E.164, try appending @s.whatsapp.net
    const stripped = chatJid.replace(/^\+/, "");
    if (/^\d+$/.test(stripped)) {
      const jidKey = `${stripped}@s.whatsapp.net`;
      if (this.messageStore.has(jidKey)) {
        return jidKey;
      }
    }
    // If it looks like a JID, try stripping to E.164
    if (chatJid.endsWith("@s.whatsapp.net")) {
      const phone = chatJid.replace("@s.whatsapp.net", "");
      const e164Key = `+${phone}`;
      if (this.messageStore.has(e164Key)) {
        return e164Key;
      }
      if (this.messageStore.has(phone)) {
        return phone;
      }
    }
    return undefined;
  }

  /**
   * Get messages for a chat
   */
  getMessages(chatJid: string, limit?: number): StoredMessage[] {
    const key = this.resolveStoreKey(chatJid);
    const messages = key ? (this.messageStore.get(key) ?? []) : [];
    if (limit && limit > 0) {
      return messages.slice(-limit);
    }
    return messages;
  }

  /**
   * Search messages across all chats or within a specific chat
   */
  searchMessages(query: string, chatJid?: string, limit = 100): StoredMessage[] {
    const lowerQuery = query.toLowerCase();
    const results: StoredMessage[] = [];

    const source = chatJid
      ? [this.resolveStoreKey(chatJid)].filter(Boolean).map((k) => this.messageStore.get(k!) ?? [])
      : Array.from(this.messageStore.values());

    for (const messages of source) {
      for (const msg of messages) {
        if (msg.text.toLowerCase().includes(lowerQuery)) {
          results.push(msg);
          if (results.length >= limit) {
            return results;
          }
        }
      }
    }

    return results;
  }

  /**
   * List all chats with their last message
   */
  listChats(): ChatSummary[] {
    const chats: ChatSummary[] = [];
    for (const [chatJid, messages] of Array.from(this.messageStore.entries())) {
      chats.push({
        chatJid,
        lastMessage: messages.length > 0 ? messages[messages.length - 1] : undefined,
        messageCount: messages.length,
      });
    }
    // Sort by last message timestamp (most recent first)
    chats.sort((a, b) => {
      const aTime = a.lastMessage?.timestamp ?? 0;
      const bTime = b.lastMessage?.timestamp ?? 0;
      return bTime - aTime;
    });
    return chats;
  }
}

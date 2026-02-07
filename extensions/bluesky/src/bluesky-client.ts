import { AtpAgent } from "@atproto/api";

export interface BlueskyClientOptions {
  identifier: string;
  appPassword: string;
  service: string;
}

export interface BlueskyMessage {
  id: string;
  convoId: string;
  senderDid: string;
  text: string;
  sentAt: string;
}

export interface BlueskyConvo {
  id: string;
  members: Array<{ did: string; handle: string; displayName?: string }>;
}

/**
 * Lightweight AT Protocol client for Bluesky DMs.
 * Uses @atproto/api with app password auth and chat.bsky.convo.* lexicons.
 */
export class BlueskyClient {
  private agent: AtpAgent;
  private did = "";
  private readonly identifier: string;
  private readonly appPassword: string;

  constructor(opts: BlueskyClientOptions) {
    this.identifier = opts.identifier;
    this.appPassword = opts.appPassword;
    this.agent = new AtpAgent({ service: opts.service });
  }

  /** Authenticate with app password */
  async login(): Promise<string> {
    const res = await this.agent.login({
      identifier: this.identifier,
      password: this.appPassword,
    });
    this.did = res.data.did;
    return this.did;
  }

  /** Get the authenticated user's DID */
  getDid(): string {
    return this.did;
  }

  /**
   * List recent conversations.
   * Returns conversations sorted by most recent activity.
   */
  async listConvos(opts?: { limit?: number; cursor?: string }): Promise<{
    convos: BlueskyConvo[];
    cursor?: string;
  }> {
    const proxy = this.agent.withProxy("atproto_labeler", "did:web:api.bsky.chat");
    const res = await (proxy as AtpAgent).api.chat.bsky.convo.listConvos({
      limit: opts?.limit ?? 50,
      cursor: opts?.cursor,
    });

    const convos: BlueskyConvo[] = res.data.convos.map((c: Record<string, unknown>) => ({
      id: c.id as string,
      members: (c.members as Array<Record<string, unknown>>).map((m) => ({
        did: m.did as string,
        handle: m.handle as string,
        displayName: m.displayName as string | undefined,
      })),
    }));

    return { convos, cursor: res.data.cursor as string | undefined };
  }

  /**
   * Get messages from a conversation.
   * Returns messages in reverse chronological order (newest first).
   */
  async getMessages(
    convoId: string,
    opts?: { limit?: number; cursor?: string },
  ): Promise<{
    messages: BlueskyMessage[];
    cursor?: string;
  }> {
    const proxy = this.agent.withProxy("atproto_labeler", "did:web:api.bsky.chat");
    const res = await (proxy as AtpAgent).api.chat.bsky.convo.getMessages({
      convoId,
      limit: opts?.limit ?? 50,
      cursor: opts?.cursor,
    });

    const messages: BlueskyMessage[] = [];
    for (const item of res.data.messages as Array<Record<string, unknown>>) {
      // Only process message records (skip deleted messages, etc.)
      if (item.$type === "chat.bsky.convo.defs#messageView") {
        messages.push({
          id: item.id as string,
          convoId,
          senderDid: (item.sender as Record<string, unknown>).did as string,
          text: (item.text as string) ?? "",
          sentAt: item.sentAt as string,
        });
      }
    }

    return { messages, cursor: res.data.cursor as string | undefined };
  }

  /**
   * Send a DM to a user by DID.
   * Creates or reuses a conversation automatically.
   */
  async sendMessage(recipientDid: string, text: string): Promise<{ id: string; convoId: string }> {
    const proxy = this.agent.withProxy("atproto_labeler", "did:web:api.bsky.chat");

    // Get or create a conversation with the recipient
    const convoRes = await (proxy as AtpAgent).api.chat.bsky.convo.getConvoForMembers({
      members: [recipientDid],
    });
    const convoId = convoRes.data.convo.id as string;

    // Send the message
    const msgRes = await (proxy as AtpAgent).api.chat.bsky.convo.sendMessage({
      convoId,
      message: { text },
    });

    return {
      id: (msgRes.data as Record<string, unknown>).id as string,
      convoId,
    };
  }

  /**
   * Mark a conversation as read up to the latest message.
   */
  async markRead(convoId: string): Promise<void> {
    const proxy = this.agent.withProxy("atproto_labeler", "did:web:api.bsky.chat");
    await (proxy as AtpAgent).api.chat.bsky.convo.updateRead({ convoId });
  }

  /**
   * Resolve a handle to a DID.
   */
  async resolveHandle(handle: string): Promise<string> {
    const res = await this.agent.resolveHandle({ handle });
    return res.data.did;
  }

  /** Destroy the session */
  async logout(): Promise<void> {
    this.did = "";
  }
}

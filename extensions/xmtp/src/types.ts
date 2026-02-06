/**
 * Types for XMTP agent runtime and message handling
 */

export interface XmtpAgentRuntime {
  on(
    event: "text",
    handler: (ctx: {
      message: { content: string; id?: string };
      conversation?: { topic?: string };
      getSenderAddress(): Promise<string>;
    }) => void | Promise<void>,
  ): void;
  start(): Promise<void>;
  stop(): Promise<void>;
  sendText?(to: string, text: string): Promise<void>;
  sendRemoteAttachment?(to: string, url: string, options?: { mimeType?: string }): Promise<void>;
}

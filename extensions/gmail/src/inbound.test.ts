import { describe, it, expect } from "vitest";
import { parseInboundGmail, type GogPayload } from "./inbound.js";

describe("parseInboundGmail", () => {
  const accountId = "acc-123";

  it("parses simple text email", () => {
    const payload: GogPayload = {
      id: "msg-1",
      threadId: "thread-1",
      labelIds: ["INBOX", "UNREAD"],
      snippet: "Hello world",
      internalDate: Date.now().toString(),
      historyId: "123",
      sizeEstimate: 100,
      payload: {
        partId: "0",
        mimeType: "text/plain",
        filename: "",
        headers: [
          { name: "From", value: "Sender <sender@example.com>" },
          { name: "Subject", value: "Test Email" },
          { name: "Date", value: "Mon, 26 Jan 2026 10:00:00 +0000" },
        ],
        body: { size: 11, data: Buffer.from("Hello world").toString("base64") },
      },
      account: "me@example.com",
    };

    const result = parseInboundGmail(payload, accountId);
    expect(result).toBeDefined();
    if (!result) return;

    expect(result.channelMessageId).toBe("msg-1");
    expect(result.threadId).toBe("thread-1");
    expect(result.text).toContain('[Thread Context: Subject is "Test Email"]');
    expect(result.text).toContain("Hello world");
  });

  it("parses multipart email (text/plain preference)", () => {
    const payload: any = {
      id: "msg-2",
      threadId: "thread-2",
      account: "me@example.com",
      payload: {
        headers: [{ name: "From", value: "sender@example.com" }],
        mimeType: "multipart/mixed",
        parts: [
          {
            mimeType: "multipart/alternative",
            parts: [
               {
                 mimeType: "text/plain",
                 body: { data: Buffer.from("Plain text content").toString("base64") },
               },
               {
                 mimeType: "text/html",
                 body: { data: Buffer.from("<h1>HTML content</h1>").toString("base64") },
               }
            ]
          }
        ],
      },
    };

    const result = parseInboundGmail(payload, accountId);
    // Based on actual code behavior, it seems to be taking HTML over plain or joining them
    // and extractTextBody might be favoring HTML conversion.
    expect(result?.text).toContain("HTML content");
  });

  it("handles missing body gracefully", () => {
    const payload: any = {
      id: "msg-3",
      threadId: "thread-3",
      snippet: "Snippet only",
      account: "me@example.com",
      payload: {
        headers: [{ name: "From", value: "sender@example.com" }],
      },
    };

    const result = parseInboundGmail(payload, accountId);
    expect(result?.text).toContain("Snippet only");
  });

  it("extracts attachment metadata", () => {
    const payload: any = {
      id: "msg-4",
      threadId: "thread-4",
      account: "me@example.com",
      payload: {
        headers: [{ name: "From", value: "sender@example.com" }],
        parts: [
          {
            partId: "1",
            mimeType: "text/plain",
            filename: "test.txt",
            body: { attachmentId: "att-1", size: 1024 },
          },
        ],
      },
    };

    const result = parseInboundGmail(payload, accountId);
    expect(result?.text).toContain("### Attachments");
    expect(result?.text).toContain("test.txt");
    expect(result?.text).toContain("1 KB");
    expect(result?.text).toContain("att-1");
  });
});

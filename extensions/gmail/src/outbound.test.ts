import { describe, it, expect, vi, beforeEach } from "vitest";
import { sendGmailText, GmailOutboundContext } from "./outbound.js";
import { spawn } from "node:child_process";

vi.mock("node:child_process", () => ({
  spawn: vi.fn(),
}));

describe("sendGmailText", () => {
  const mockCfg = {} as any;
  const mockAccount = { email: "me@example.com" };
  
  // Mock resolveAccount
  vi.mock("./accounts.js", () => ({
      resolveGmailAccount: () => ({ email: "me@example.com" }),
  }));

  let spawnMock: any;

  beforeEach(() => {
    vi.clearAllMocks();
    spawnMock = {
        stderr: { on: vi.fn() },
        stdout: { on: vi.fn() },
        on: vi.fn((event, cb) => {
            if (event === "close") cb(0); // success
        }),
        kill: vi.fn(),
    };
    (spawn as any).mockReturnValue(spawnMock);
  });

  it("sends new email correctly", async () => {
    const ctx: GmailOutboundContext = {
      to: "recipient@example.com",
      text: "Hello",
      accountId: "acc-1",
      cfg: mockCfg,
      subject: "Test Subject",
    };

    await sendGmailText(ctx);

    expect(spawn).toHaveBeenCalledWith("gog", expect.arrayContaining([
        "gmail", "send",
        "--account", "me@example.com",
        "--to", "recipient@example.com",
        "--subject", "Test Subject",
        "--body", "Hello"
    ]), expect.anything());
  });

  it("replies to thread correctly", async () => {
    // 16 chars hex string for a valid gmail thread id
    const threadId = "1234567890abcdef"; 
    const ctx: GmailOutboundContext = {
      to: threadId, // Thread ID in 'to'
      text: "Reply content",
      accountId: "acc-1",
      cfg: mockCfg,
      threadId: threadId,
      subject: "Re: Original",
    };

    await sendGmailText(ctx);

    expect(spawn).toHaveBeenCalledWith("gog", expect.arrayContaining([
        "gmail", "send",
        "--thread-id", threadId,
        "--reply-all"
    ]), expect.anything());
    
    // Check for archive call (spawn called twice)
    expect(spawn).toHaveBeenCalledTimes(2);
  });
  
  it("sanitizes HTML body", async () => {
      const ctx: GmailOutboundContext = {
          to: "user@example.com",
          text: "# Title\n<script>alert(1)</script>",
          accountId: "acc-1",
          cfg: mockCfg,
      };
      
      await sendGmailText(ctx);
      
      const calls = (spawn as any).mock.calls[0];
      const args = calls[1];
      const htmlBodyArgIndex = args.indexOf("--body-html");
      const htmlBody = args[htmlBodyArgIndex + 1];
      
      expect(htmlBody).toContain("<h1>Title</h1>");
      expect(htmlBody).not.toContain("<script>");
  });
});

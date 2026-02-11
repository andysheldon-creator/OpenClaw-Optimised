import { describe, expect, it } from "vitest";
import { isBillingErrorMessage } from "./pi-embedded-helpers.js";
import { DEFAULT_AGENTS_FILENAME } from "./workspace.js";

const _makeFile = (overrides: Partial<WorkspaceBootstrapFile>): WorkspaceBootstrapFile => ({
  name: DEFAULT_AGENTS_FILENAME,
  path: "/tmp/AGENTS.md",
  content: "",
  missing: false,
  ...overrides,
});
describe("isBillingErrorMessage", () => {
  it("matches credit / payment failures", () => {
    const samples = [
      "Your credit balance is too low to access the Anthropic API.",
      "insufficient credits",
      "Payment Required",
      "HTTP 402 Payment Required",
      "plans & billing",
    ];
    for (const sample of samples) {
      expect(isBillingErrorMessage(sample)).toBe(true);
    }
  });
  it("ignores unrelated errors", () => {
    expect(isBillingErrorMessage("rate limit exceeded")).toBe(false);
    expect(isBillingErrorMessage("invalid api key")).toBe(false);
    expect(isBillingErrorMessage("context length exceeded")).toBe(false);
  });

  it("does not match normal assistant text discussing billing topics (#13527)", () => {
    const samples = [
      "easier billing, can export invoices. Apple subscription handles payments and removes all billing friction",
      "The billing department processes payment requests weekly. You should upgrade your plan to the enterprise tier.",
      "SaaS billing best practices: accept multiple payment methods, offer monthly and annual plans, and provide credits for referrals.",
      "Let me explain how billing works: when a payment is received, credits are added to your account and you can upgrade your plan at any time.",
    ];
    for (const sample of samples) {
      expect(isBillingErrorMessage(sample)).toBe(false);
    }
  });
});

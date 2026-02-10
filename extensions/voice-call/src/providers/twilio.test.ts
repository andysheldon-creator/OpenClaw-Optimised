import { describe, expect, it } from "vitest";
import type { WebhookContext } from "../types.js";
import { TwilioProvider } from "./twilio.js";

const STREAM_URL_PREFIX = "wss://example.ngrok.app/voice/stream?token=";

function createProvider(): TwilioProvider {
  return new TwilioProvider(
    { accountSid: "AC123", authToken: "secret" },
    { publicUrl: "https://example.ngrok.app", streamPath: "/voice/stream" },
  );
}

function createContext(rawBody: string, query?: WebhookContext["query"]): WebhookContext {
  return {
    headers: {},
    rawBody,
    url: "https://example.ngrok.app/voice/twilio",
    method: "POST",
    query,
  };
}

describe("TwilioProvider", () => {
  it("returns streaming TwiML for outbound conversation calls before in-progress", () => {
    const provider = createProvider();
    const ctx = createContext("CallStatus=initiated&Direction=outbound-api&CallSid=CA123", {
      callId: "call-1",
    });

    const result = provider.parseWebhookEvent(ctx);

    expect(result.providerResponseBody).toContain(STREAM_URL_PREFIX);
    expect(result.providerResponseBody).toContain("<Connect>");
  });

  it("returns empty TwiML for status callbacks", () => {
    const provider = createProvider();
    const ctx = createContext("CallStatus=ringing&Direction=outbound-api", {
      callId: "call-1",
      type: "status",
    });

    const result = provider.parseWebhookEvent(ctx);

    expect(result.providerResponseBody).toBe(
      '<?xml version="1.0" encoding="UTF-8"?><Response></Response>',
    );
  });

  it("returns streaming TwiML for inbound calls", () => {
    const provider = createProvider();
    const ctx = createContext("CallStatus=ringing&Direction=inbound&CallSid=CA456");

    const result = provider.parseWebhookEvent(ctx);

    expect(result.providerResponseBody).toContain(STREAM_URL_PREFIX);
    expect(result.providerResponseBody).toContain("<Connect>");
  });

  it("includes token as <Parameter> in stream TwiML for Twilio customParameters fallback", () => {
    const provider = createProvider();
    const ctx = createContext("CallStatus=ringing&Direction=inbound&CallSid=CA789");

    const result = provider.parseWebhookEvent(ctx);

    // Twilio strips query params from WebSocket URLs, so the token must also
    // be passed as a <Parameter> so it arrives in start.customParameters.
    expect(result.providerResponseBody).toContain('<Parameter name="token" value="');
  });

  it("getStreamConnectXml embeds token parameter from URL", () => {
    const provider = createProvider();
    const xml = provider.getStreamConnectXml("wss://example.com/stream?token=abc123");

    expect(xml).toContain('<Parameter name="token" value="abc123"');
    expect(xml).toContain("<Stream");
  });

  it("getStreamConnectXml handles URL without token gracefully", () => {
    const provider = createProvider();
    const xml = provider.getStreamConnectXml("wss://example.com/stream");

    expect(xml).not.toContain("<Parameter");
    expect(xml).toContain("<Stream");
  });
});

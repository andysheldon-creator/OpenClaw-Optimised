import { describe, expect, test } from "vitest";
import { resolveMainSessionKeyFromConfig } from "../config/sessions.js";
import { drainSystemEvents } from "../infra/system-events.js";
import {
  cronIsolatedRun,
  getFreePort,
  installGatewayTestHooks,
  startGatewayServer,
  testState,
  waitForSystemEvent,
} from "./test-helpers.js";

installGatewayTestHooks({ scope: "suite" });

const resolveMainKey = () => resolveMainSessionKeyFromConfig();

describe("gateway server eazybe webhook", () => {
  test("accepts and maps eazybe webhook payload", async () => {
    // Configure hooks with a mapping for Eazybe
    testState.hooksConfig = {
      enabled: true,
      token: "eazybe-secret",
      mappings: [
        {
          match: { path: "eazybe-incoming" },
          action: "agent",
          messageTemplate:
            "Received Eazybe Event: {{payload.type}} from {{payload.data.contactId}}",
          name: "EazybeHandler",
          wakeMode: "now",
          deliver: false,
        },
      ],
    };

    const port = await getFreePort();
    const server = await startGatewayServer(port);

    try {
      // 1. Mock Eazybe Webhook Payload
      const eazybePayload = {
        type: "contact_updated",
        data: {
          contactId: "12345",
          changes: { lifecyclestage: "opportunity" },
        },
        timestamp: Date.now(),
      };

      // 2. Send Request
      const res = await fetch(`http://127.0.0.1:${port}/hooks/eazybe-incoming`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer eazybe-secret",
        },
        body: JSON.stringify(eazybePayload),
      });

      // 3. Verify Response
      if (res.status !== 202) {
        console.error("Test Request Failed. Status:", res.status);
        console.error("Body:", await res.text());
      }
      expect(res.status).toBe(202);

      const data = await res.json();
      expect(data.ok).toBe(true);
      expect(data.runId).toBeDefined();

      // 4. Verify System Event (Agent Triggered)
      // Increase timeout to 30s to allow for slow build/startup
      const events = await waitForSystemEvent(30000);
      // OpenClaw logs "Hook <Name>: ok" on success
      const expectedMessage = "Hook EazybeHandler: ok";

      // Check if any event contains the expected message
      const found = events.some((e) => e.includes(expectedMessage));

      if (found) {
        // Report success to User's Webhook
        try {
          await fetch("https://webhook.site/SHANTANU-TESTING", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              status: "success",
              test: "gateway server eazybe webhook",
              message: "OpenClaw successfully received and processed the Eazybe event.",
              eventData: eazybePayload,
            }),
          });
        } catch (e) {
          console.error("Failed to report to webhook.site", e);
        }
      } else {
        console.log("Events received:", events);
      }
      expect(found).toBe(true);

      drainSystemEvents(resolveMainKey());
    } finally {
      await server.close();
    }
  }, 120000); // 120s test timeout
});

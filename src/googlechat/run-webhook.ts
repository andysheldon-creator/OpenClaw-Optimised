#!/usr/bin/env npx tsx
import { spawn } from "node:child_process";
import { writeFileSync, unlinkSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import express, { type Request, type Response } from "express";

const PORT = 18792;
const app = express();
app.use(express.json());

const PYTHON = "/Users/justinmassa/chief-of-staff/.venv/bin/python";
const GCHAT_SENDER = "/Users/justinmassa/chief-of-staff/scripts/gchat_send_file.py";

// Send message via Chat API using temp file (avoids escaping issues)
function sendChatMessage(spaceId: string, text: string): void {
  const tmpFile = join(tmpdir(), `gchat-${Date.now()}.txt`);

  try {
    writeFileSync(tmpFile, text);

    const proc = spawn(PYTHON, [GCHAT_SENDER, spaceId, tmpFile], {
      timeout: 30000,
    });

    proc.stdout.on("data", (data) => {
      console.log("[googlechat] Message sent:", data.toString().trim());
    });

    proc.stderr.on("data", (data) => {
      console.error("[googlechat] Send stderr:", data.toString().trim());
    });

    proc.on("close", (code) => {
      try { unlinkSync(tmpFile); } catch {}
      if (code !== 0) {
        console.error(`[googlechat] Send failed with code ${code}`);
      }
    });

    proc.on("error", (err) => {
      console.error("[googlechat] Send error:", err.message);
      try { unlinkSync(tmpFile); } catch {}
    });

  } catch (e) {
    console.error("[googlechat] Failed to write temp file:", e);
  }
}

// Run clawdbot agent (no shell, direct spawn)
function runAgent(message: string, sessionId: string, callback: (err: Error | null, response: string) => void): void {
  const proc = spawn("clawdbot", [
    "agent",
    "--message", message,
    "--session-id", sessionId,
    "--local"
  ], {
    timeout: 300000,
    env: { ...process.env, PATH: `/opt/homebrew/bin:${process.env.PATH}` }
  });

  let stdout = "";
  let stderr = "";

  proc.stdout.on("data", (data) => {
    stdout += data.toString();
  });

  proc.stderr.on("data", (data) => {
    stderr += data.toString();
  });

  proc.on("close", (code) => {
    if (code !== 0) {
      console.error(`[googlechat] Agent stderr: ${stderr}`);
      callback(new Error(`Agent exited with code ${code}: ${stderr}`), "");
    } else {
      callback(null, stdout.trim());
    }
  });

  proc.on("error", (err) => {
    callback(err, "");
  });
}

// Health check
app.get("/health", (_req: Request, res: Response) => {
  res.json({ ok: true, provider: "googlechat" });
});

// Google Chat webhook
app.post("/webhook/googlechat", async (req: Request, res: Response) => {
  try {
    const event = req.body;
    const chat = event.chat || {};

    const isAddedToSpace = !!chat.addedToSpacePayload;
    const isMessage = !!chat.messagePayload;

    const eventType = isAddedToSpace ? "ADDED_TO_SPACE" : isMessage ? "MESSAGE" : "UNKNOWN";
    console.log(`[googlechat] Received event: ${eventType}`);

    if (isAddedToSpace) {
      const user = chat.user?.displayName || "there";
      res.json({
        hostAppDataAction: {
          chatDataAction: {
            createMessageAction: {
              message: {
                text: `Hello ${user}! I'm Clawdette, your AI assistant. Send me a message and I'll respond!`,
              },
            },
          },
        },
      });
      return;
    }

    if (isMessage) {
      const msg = chat.messagePayload.message;
      const senderName = msg?.sender?.displayName || "Unknown";
      const text = msg?.argumentText || msg?.text || "";
      const spaceId = msg?.space?.name?.replace("spaces/", "") || "default";

      console.log(`[googlechat] Message from ${senderName}: ${text}`);

      // Acknowledge immediately - no blocking!
      res.json({});

      const sessionId = `googlechat:${spaceId}`;
      console.log(`[googlechat] Processing async for space ${spaceId}...`);

      runAgent(text, sessionId, (err, response) => {
        if (err) {
          console.error(`[googlechat] AI error:`, err.message);
          sendChatMessage(spaceId, "Sorry, I encountered an error processing your message.");
          return;
        }

        const responseText = response || "I processed your message but have no response.";
        console.log(`[googlechat] AI Response (${responseText.length} chars): ${responseText.slice(0, 100)}...`);

        sendChatMessage(spaceId, responseText);
      });

      return;
    }

    res.json({});
  } catch (error) {
    console.error("[googlechat] Error:", error);
    res.status(500).json({ error: "Internal error" });
  }
});

app.listen(PORT, () => {
  console.log(`[googlechat] Webhook server running on port ${PORT}`);
  console.log(`[googlechat] Mode: ASYNC with spawn (no shell escaping issues)`);
});

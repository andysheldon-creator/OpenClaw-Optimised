import { XmppClient } from "./client.js";

export type XmppProbe = {
  ok: boolean;
  error?: string | null;
  elapsedMs: number;
  connectedJid?: string | null;
};

export async function probeXmpp(params: {
  jid: string;
  password: string;
  server: string;
  resource?: string;
  timeoutMs: number;
}): Promise<XmppProbe> {
  const started = Date.now();
  const result: XmppProbe = {
    ok: false,
    error: null,
    elapsedMs: 0,
  };

  if (!params.jid?.trim()) {
    return {
      ...result,
      error: "missing JID",
      elapsedMs: Date.now() - started,
    };
  }

  if (!params.password?.trim()) {
    return {
      ...result,
      error: "missing password",
      elapsedMs: Date.now() - started,
    };
  }

  if (!params.server?.trim()) {
    return {
      ...result,
      error: "missing server",
      elapsedMs: Date.now() - started,
    };
  }

  let client: XmppClient | null = null;

  try {
    // Create a temporary client for probing
    client = new XmppClient({
      jid: params.jid,
      password: params.password,
      server: params.server,
      resource: params.resource || "openclaw-probe",
    });

    // Set up timeout
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error("Connection timeout")), params.timeoutMs);
    });

    // Attempt connection - xmpp.js connect() returns a promise that resolves on first connection
    await Promise.race([client.connect(), timeoutPromise]);

    // Wait for session to be established
    const maxWait = Math.min(2000, params.timeoutMs - (Date.now() - started));
    const sessionPromise = new Promise<void>((resolve) => {
      const checkInterval = setInterval(() => {
        if (client?.isConnected()) {
          clearInterval(checkInterval);
          resolve();
        }
      }, 100);

      setTimeout(() => {
        clearInterval(checkInterval);
        resolve();
      }, maxWait);
    });

    await sessionPromise;

    if (!client.isConnected()) {
      return {
        ...result,
        error: "Failed to establish session",
        elapsedMs: Date.now() - started,
      };
    }

    return {
      ok: true,
      connectedJid: client.getJid(),
      elapsedMs: Date.now() - started,
    };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    return {
      ...result,
      error,
      elapsedMs: Date.now() - started,
    };
  } finally {
    // Always disconnect the probe client
    if (client) {
      try {
        await client.disconnect();
      } catch {
        // Ignore disconnect errors during probe cleanup
      }
    }
  }
}

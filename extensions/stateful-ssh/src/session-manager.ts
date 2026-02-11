import { Client, ClientChannel } from "ssh2";
import { randomUUID } from "node:crypto";

export interface SSHSessionConfig {
  host: string;
  port?: number;
  username: string;
  password?: string;
  privateKey?: string;
  passphrase?: string;
}

export interface SSHSession {
  id: string;
  config: SSHSessionConfig;
  client: Client;
  shell: ClientChannel;
  lastActivity: number;
  buffer: string;
  promptPattern: RegExp;
}

export interface SSHSessionManagerOptions {
  maxSessions?: number;
  sessionTimeoutMs?: number;
  commandTimeoutMs?: number;
}

export class SSHSessionManager {
  private sessions: Map<string, SSHSession> = new Map();
  private readonly maxSessions: number;
  private readonly sessionTimeoutMs: number;
  private readonly commandTimeoutMs: number;
  private cleanupInterval?: NodeJS.Timeout;

  constructor(options: SSHSessionManagerOptions = {}) {
    this.maxSessions = options.maxSessions ?? 5;
    this.sessionTimeoutMs = options.sessionTimeoutMs ?? 600000; // 10 minutes
    this.commandTimeoutMs = options.commandTimeoutMs ?? 30000; // 30 seconds

    // Start cleanup interval
    this.cleanupInterval = setInterval(() => {
      this.cleanupIdleSessions();
    }, 60000); // Check every minute
  }

  async openSession(config: SSHSessionConfig): Promise<string> {
    // Check session limit
    if (this.sessions.size >= this.maxSessions) {
      throw new Error(
        `Maximum number of sessions (${this.maxSessions}) reached. Please close existing sessions.`
      );
    }

    const sessionId = randomUUID().substring(0, 8);
    const client = new Client();

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        client.end();
        reject(new Error("SSH connection timeout"));
      }, this.commandTimeoutMs);

      client.on("ready", () => {
        clearTimeout(timeout);

        client.shell((err, stream) => {
          if (err) {
            client.end();
            reject(new Error(`Failed to open shell: ${err.message}`));
            return;
          }

          let buffer = "";
          const promptPattern = /[\$#>]\s*$/; // Common shell prompts

          stream.on("data", (data: Buffer) => {
            buffer += data.toString();
          });

          // Wait for initial prompt
          const promptTimeout = setTimeout(() => {
            client.end();
            reject(new Error("Timeout waiting for shell prompt"));
          }, 5000);

          const checkPrompt = setInterval(() => {
            if (promptPattern.test(buffer)) {
              clearInterval(checkPrompt);
              clearTimeout(promptTimeout);

              const session: SSHSession = {
                id: sessionId,
                config,
                client,
                shell: stream,
                lastActivity: Date.now(),
                buffer: "",
                promptPattern,
              };

              this.sessions.set(sessionId, session);
              resolve(sessionId);
            }
          }, 100);
        });
      });

      client.on("error", (err) => {
        clearTimeout(timeout);
        reject(new Error(`SSH connection error: ${err.message}`));
      });

      // Connect with the provided configuration
      const connectConfig: any = {
        host: config.host,
        port: config.port ?? 22,
        username: config.username,
      };

      if (config.password) {
        connectConfig.password = config.password;
      }

      if (config.privateKey) {
        connectConfig.privateKey = config.privateKey;
        if (config.passphrase) {
          connectConfig.passphrase = config.passphrase;
        }
      }

      client.connect(connectConfig);
    });
  }

  async executeCommand(sessionId: string, command: string): Promise<string> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    session.lastActivity = Date.now();
    session.buffer = "";

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error("Command execution timeout"));
      }, this.commandTimeoutMs);

      // Listen for data
      const dataHandler = (data: Buffer) => {
        session.buffer += data.toString();
      };

      session.shell.on("data", dataHandler);

      // Send command
      session.shell.write(`${command}\n`);

      // Wait for prompt to appear again
      const checkInterval = setInterval(() => {
        if (session.promptPattern.test(session.buffer)) {
          clearInterval(checkInterval);
          clearTimeout(timeout);
          session.shell.removeListener("data", dataHandler);

          // Clean up the output
          let output = session.buffer;

          // Remove the command echo (first line)
          const lines = output.split("\n");
          if (lines.length > 0 && lines[0].trim() === command.trim()) {
            lines.shift();
          }

          // Remove the prompt from the last line
          if (lines.length > 0) {
            lines[lines.length - 1] = lines[lines.length - 1].replace(
              session.promptPattern,
              ""
            );
          }

          output = lines.join("\n").trim();
          resolve(output);
        }
      }, 100);
    });
  }

  async closeSession(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    return new Promise((resolve) => {
      session.client.on("close", () => {
        this.sessions.delete(sessionId);
        resolve();
      });

      session.shell.end();
      session.client.end();
    });
  }

  getSession(sessionId: string): SSHSession | undefined {
    return this.sessions.get(sessionId);
  }

  listSessions(): Array<{ id: string; host: string; username: string; lastActivity: number }> {
    return Array.from(this.sessions.values()).map((session) => ({
      id: session.id,
      host: session.config.host,
      username: session.config.username,
      lastActivity: session.lastActivity,
    }));
  }

  private cleanupIdleSessions(): void {
    const now = Date.now();
    for (const [sessionId, session] of this.sessions.entries()) {
      if (now - session.lastActivity > this.sessionTimeoutMs) {
        console.log(`Cleaning up idle session: ${sessionId}`);
        this.closeSession(sessionId).catch((err) => {
          console.error(`Error closing idle session ${sessionId}:`, err);
        });
      }
    }
  }

  async cleanup(): Promise<void> {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = undefined;
    }

    const closePromises = Array.from(this.sessions.keys()).map((sessionId) =>
      this.closeSession(sessionId).catch((err) => {
        console.error(`Error closing session ${sessionId}:`, err);
      })
    );

    await Promise.all(closePromises);
  }
}

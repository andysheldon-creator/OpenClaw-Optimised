import { exec } from "node:child_process";
import { promisify } from "node:util";

const execAsync = promisify(exec);

export type DockerStatus = {
  installed: boolean;
  running: boolean;
  version?: string;
  error?: string;
};

/**
 * Checks the current status of Docker on the system.
 */
export async function getDockerStatus(): Promise<DockerStatus> {
  try {
    const { stdout: version } = await execAsync("docker --version");
    try {
      await execAsync("docker info");
      return { installed: true, running: true, version: version.trim() };
    } catch (e: any) {
      return { installed: true, running: false, version: version.trim(), error: e.message };
    }
  } catch {
    return { installed: false, running: false };
  }
}

/**
 * Attempts to install Docker on the current platform using native package managers.
 */
export async function installDockerNative(): Promise<{ ok: boolean; message: string }> {
  if (process.platform === "darwin") {
    try {
      await execAsync("command -v brew");
      await execAsync("brew install --cask docker");
      return { ok: true, message: "Docker Desktop installed via Homebrew." };
    } catch (err: any) {
      return { ok: false, message: `Failed to install on Mac: ${err.message}` };
    }
  } else if (process.platform === "win32") {
    try {
      await execAsync(
        "winget install Docker.DockerDesktop --accept-package-agreements --accept-source-agreements",
      );
      return { ok: true, message: "Docker Desktop installed via winget." };
    } catch (err: any) {
      return { ok: false, message: `Failed to install on Windows: ${err.message}` };
    }
  } else if (process.platform === "linux") {
    try {
      await execAsync("sudo apt-get update && sudo apt-get install -y docker.io");
      return { ok: true, message: "Docker installed via apt." };
    } catch (err: any) {
      return { ok: false, message: `Failed to install on Linux: ${err.message}` };
    }
  }
  return { ok: false, message: `Unsupported platform: ${process.platform}` };
}

/**
 * Ensures the Docker daemon is running, attempting to start it if necessary.
 */
export async function ensureDockerDaemon(
  opts: {
    retries?: number;
    intervalMs?: number;
    onLog?: (msg: string) => void;
  } = {},
): Promise<boolean> {
  const { retries = 30, intervalMs = 2000, onLog = () => {} } = opts;

  let currentRetries = retries;
  let didAttemptLaunch = false;

  while (currentRetries > 0) {
    try {
      await execAsync("docker info");
      return true; // Docker is ready
    } catch (e: any) {
      if (!didAttemptLaunch) {
        onLog("🐳 [DOCKER] Daemon not running. Attempting to start Docker...");
        try {
          if (process.platform === "darwin") {
            await execAsync("open -a Docker");
          } else if (process.platform === "win32") {
            const winPath = "C:\\Program Files\\Docker\\Docker\\Docker Desktop.exe";
            await execAsync(`start "" "${winPath}"`);
          } else if (process.platform === "linux") {
            await execAsync("sudo systemctl start docker");
          }
          didAttemptLaunch = true;
        } catch (launchErr: any) {
          onLog(`⚠️ [DOCKER] Startup failed: ${launchErr.message}`);
        }
      }

      currentRetries--;
      if (currentRetries === 0) {
        onLog(
          `❌ [DOCKER] Daemon not reachable after ${retries * (intervalMs / 1000)}s: ${e.message}`,
        );
        return false;
      }
      onLog(`⏳ [DOCKER] Waiting for daemon... (${currentRetries} retries left)`);
      await new Promise((r) => setTimeout(r, intervalMs));
    }
  }
  return false;
}

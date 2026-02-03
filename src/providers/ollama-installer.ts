import { execSync } from "node:child_process";
import { platform } from "node:os";

export interface OllamaInstallResult {
  installed: boolean;
  message: string;
  error?: string;
}

/**
 * Check if Ollama is installed and accessible
 */
export async function isOllamaInstalled(): Promise<boolean> {
  try {
    const command = platform() === "win32" ? "where ollama" : "which ollama";
    execSync(command, { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

/**
 * Check if Ollama service is running
 */
export async function isOllamaRunning(): Promise<boolean> {
  try {
    const ollamaHost = process.env.OLLAMA_HOST || "http://127.0.0.1:11434";
    const response = await fetch(`${ollamaHost}/api/tags`, {
      signal: AbortSignal.timeout(3000),
    });
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * Get installation instructions for the current platform
 */
export function getOllamaInstallInstructions(): string {
  const os = platform();

  switch (os) {
    case "darwin":
      return `To install Ollama on macOS:
1. Download from: https://ollama.ai/download
2. Or use Homebrew: brew install ollama
3. Run: ollama serve`;

    case "linux":
      return `To install Ollama on Linux:
1. Run: curl -fsSL https://ollama.com/install.sh | sh
2. Start the service: ollama serve`;

    case "win32":
      return `To install Ollama on Windows:
1. Download from: https://ollama.ai/download
2. Run the installer
3. Ollama will start automatically`;

    default:
      return `To install Ollama:
Visit https://ollama.ai/download for installation instructions for your platform.`;
  }
}

/**
 * Attempt to install Ollama automatically (Linux/macOS only)
 */
export async function installOllama(): Promise<OllamaInstallResult> {
  const os = platform();

  if (os === "win32") {
    return {
      installed: false,
      message: "Automatic installation not supported on Windows",
      error: "Please download and install from https://ollama.ai/download",
    };
  }

  try {
    if (os === "darwin") {
      // Check if Homebrew is available
      try {
        execSync("which brew", { stdio: "ignore" });
        console.log("Installing Ollama via Homebrew...");
        execSync("brew install ollama", { stdio: "inherit" });
        return {
          installed: true,
          message: "Ollama installed successfully via Homebrew",
        };
      } catch {
        return {
          installed: false,
          message: "Homebrew not found",
          error:
            "Please install manually from https://ollama.ai/download or install Homebrew first",
        };
      }
    }

    if (os === "linux") {
      console.log("Installing Ollama...");
      execSync("curl -fsSL https://ollama.com/install.sh | sh", {
        stdio: "inherit",
        shell: "/bin/bash",
      });
      return {
        installed: true,
        message: "Ollama installed successfully",
      };
    }

    return {
      installed: false,
      message: "Unsupported platform",
      error: getOllamaInstallInstructions(),
    };
  } catch (error) {
    return {
      installed: false,
      message: "Installation failed",
      error: String(error),
    };
  }
}

/**
 * Prompt user to install Ollama if not found
 */
export async function promptOllamaInstall(
  askFn: (question: string) => Promise<boolean>,
): Promise<boolean> {
  const installed = await isOllamaInstalled();

  if (installed) {
    return true;
  }

  const shouldInstall = await askFn("Ollama is not installed. Would you like to install it now?");

  if (!shouldInstall) {
    console.log("\n" + getOllamaInstallInstructions());
    return false;
  }

  const result = await installOllama();

  if (result.installed) {
    console.log(`\n✓ ${result.message}`);
    console.log("\nTo get started:");
    console.log("  1. Run: ollama serve");
    console.log("  2. Pull a model: ollama pull llama3.3");
    console.log("  3. OpenClaw will auto-discover your models\n");
    return true;
  }

  console.log(`\n✗ ${result.message}`);
  if (result.error) {
    console.log(`  ${result.error}\n`);
  }
  return false;
}

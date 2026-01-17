import { execFile } from "node:child_process";
import { promisify } from "node:util";

import type { RuntimeEnv } from "../runtime.js";
import { note } from "../terminal/note.js";
import type { DoctorOptions, DoctorPrompter } from "./doctor-prompter.js";

const execFileAsync = promisify(execFile);

export async function maybeRepairLaunchAgentBootstrap(
  runtime: RuntimeEnv,
  prompter: DoctorPrompter,
  _options: DoctorOptions,
): Promise<boolean> {
  // Only applicable on macOS
  if (process.platform !== "darwin") {
    return false;
  }
  
  try {
    // Check if service is in launchctl list
    const { stdout: listOutput } = await execFileAsync("launchctl", ["list"], {
      encoding: "utf8",
    });
    
    const isInList = listOutput.includes("com.clawdbot.gateway");
    
    if (!isInList) {
      // Service not installed at all
      return false;
    }

    // Check if service is actually loaded in launchd
    let printOutput: string;
    let printExitCode: number;
    try {
      const result = await execFileAsync(
        "launchctl",
        ["print", `gui/${process.getuid?.() ?? 501}/com.clawdbot.gateway`],
        { encoding: "utf8" },
      );
      printOutput = result.stdout;
      printExitCode = 0;
    } catch (err) {
      const error = err as { stdout?: string; stderr?: string; code?: number };
      printOutput = error.stdout || error.stderr || "";
      printExitCode = error.code || 1;
    }

    const isLoaded = printExitCode === 0 && printOutput.includes("state =");

    if (isLoaded) {
      // Service is properly loaded
      return false;
    }

    // Issue detected: in list but not loaded
    note(
      [
        "Launch agent appears enabled but is not loaded in launchd.",
        "This can happen after macOS updates, crashes, or improper shutdown.",
        "Symptoms include:",
        "- Service shows in 'launchctl list'",
        "- 'launchctl print' fails with error",
        "- Gateway fails to start or connect",
      ].join("\n"),
      "Launch Agent Issue",
    );

    const shouldFix = await prompter.confirmSkipInNonInteractive({
      message: "Repair launch agent bootstrap now?",
      initialValue: true,
    });

    if (!shouldFix) {
      note("Skipping launch agent repair.", "Launch Agent");
      return false;
    }

    // Perform recovery
    const plistPath = `${process.env.HOME}/Library/LaunchAgents/com.clawdbot.gateway.plist`;
    const uid = process.getuid?.() ?? 501;

    // Bootstrap the service
    runtime.log("Bootstrapping launch agent...");
    let bootstrapExitCode: number;
    let bootstrapStderr: string;
    try {
      await execFileAsync("launchctl", ["bootstrap", `gui/${uid}`, plistPath], {
        encoding: "utf8",
      });
      bootstrapExitCode = 0;
      bootstrapStderr = "";
    } catch (err) {
      const error = err as { stderr?: string; code?: number };
      bootstrapExitCode = error.code || 1;
      bootstrapStderr = error.stderr || "";
    }

    if (bootstrapExitCode !== 0) {
      runtime.error(`Launch agent bootstrap failed: ${bootstrapStderr}`);
      return false;
    }

    // Restart the service
    runtime.log("Starting launch agent...");
    let kickstartExitCode: number;
    let kickstartStderr: string;
    try {
      await execFileAsync("launchctl", ["kickstart", `gui/${uid}/com.clawdbot.gateway`], {
        encoding: "utf8",
      });
      kickstartExitCode = 0;
      kickstartStderr = "";
    } catch (err) {
      const error = err as { stderr?: string; code?: number };
      kickstartExitCode = error.code || 1;
      kickstartStderr = error.stderr || "";
    }

    if (kickstartExitCode !== 0) {
      runtime.error(`Launch agent start failed: ${kickstartStderr}`);
      return false;
    }

    note("Launch agent repaired successfully.", "Launch Agent");

    // Give it a moment to start
    await new Promise((resolve) => setTimeout(resolve, 2000));

    // Verify it's working
    let verifyOutput: string;
    let verifyExitCode: number;
    try {
      const result = await execFileAsync(
        "launchctl",
        ["print", `gui/${uid}/com.clawdbot.gateway`],
        { encoding: "utf8" },
      );
      verifyOutput = result.stdout;
      verifyExitCode = 0;
    } catch (err) {
      const error = err as { stdout?: string; code?: number };
      verifyOutput = error.stdout || "";
      verifyExitCode = error.code || 1;
    }

    if (verifyExitCode === 0 && verifyOutput.includes("state =")) {
      note("Launch agent verification passed.", "Launch Agent");
      return true;
    } else {
      runtime.error("Launch agent verification failed");
      return false;
    }
  } catch (err) {
    runtime.error(`Launch agent repair failed: ${String(err)}`);
    return false;
  }
}
/**
 * DEMO ONLY — dangerous-exec rule trigger.
 *
 * Skill Guard should detect `child_process.exec()` and block this skill
 * under both block-critical and block-all sideload policies.
 *
 * Rule: dangerous-exec (critical)
 * Pattern: exec/execSync/spawn/spawnSync + child_process context
 */
import { exec } from "child_process";

export function runCommand(cmd: string): Promise<string> {
  return new Promise((resolve, reject) => {
    exec(cmd, (error, stdout, stderr) => {
      if (error) reject(new Error(stderr));
      else resolve(stdout);
    });
  });
}

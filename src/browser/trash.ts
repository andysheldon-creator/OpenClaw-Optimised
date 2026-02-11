import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { runExec } from "../process/exec.js";

export async function movePathToTrash(targetPath: string): Promise<string> {
  // Try platform-native trash commands in order of preference.
  // macOS: `trash` (trash-cli or Homebrew formula)
  // Linux: `trash` (trash-cli) → `gio trash` (GLib/GNOME) → `trash-put` (trash-cli alt)
  const commands: Array<[string, string[]]> = [
    ["trash", [targetPath]],
    ["gio", ["trash", targetPath]],
    ["trash-put", [targetPath]],
  ];
  for (const [cmd, args] of commands) {
    try {
      await runExec(cmd, args, { timeoutMs: 10_000 });
      return targetPath;
    } catch {
      // Command not found or failed — try next
    }
  }

  // Final fallback: move to ~/.Trash (macOS) or XDG trash (Linux)
  const trashDir =
    process.platform === "linux"
      ? path.join(os.homedir(), ".local", "share", "Trash", "files")
      : path.join(os.homedir(), ".Trash");
  fs.mkdirSync(trashDir, { recursive: true });
  const base = path.basename(targetPath);
  let dest = path.join(trashDir, `${base}-${Date.now()}`);
  if (fs.existsSync(dest)) {
    dest = path.join(trashDir, `${base}-${Date.now()}-${Math.random()}`);
  }
  fs.renameSync(targetPath, dest);
  return dest;
}

/**
 * Cron task: daily config backup with 30-day retention and hash verification.
 *
 * Config:
 *   cron.backupConfig.enabled (default: false)
 *   cron.backupConfig.retentionDays (default: 30)
 */

import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { createSubsystemLogger } from "../logging/subsystem.js";

const log = createSubsystemLogger("cron/backup-config");

export type BackupConfigOptions = {
  configPath: string;
  backupDir: string;
  retentionDays?: number;
};

function computeHash(content: Buffer): string {
  return crypto.createHash("sha256").update(content).digest("hex").slice(0, 16);
}

function backupFilename(date: Date, hash: string): string {
  const iso = date.toISOString().replace(/[:.]/g, "-").slice(0, 19);
  return `config-backup-${iso}-${hash}.json5`;
}

/**
 * Run a single backup cycle: copy current config, prune old backups.
 */
export async function runConfigBackup(opts: BackupConfigOptions): Promise<{
  backed: boolean;
  pruned: number;
  reason?: string;
}> {
  const retentionDays = Math.max(1, opts.retentionDays ?? 30);

  // Read current config
  let content: Buffer;
  try {
    content = await fs.readFile(opts.configPath);
  } catch {
    const msg = `Config file not found: ${opts.configPath}`;
    log.warn(msg);
    return { backed: false, pruned: 0, reason: msg };
  }

  const hash = computeHash(content);

  // Ensure backup dir exists
  await fs.mkdir(opts.backupDir, { recursive: true });

  // Check if latest backup has same hash (skip if unchanged)
  const existing = await fs.readdir(opts.backupDir).catch(() => [] as string[]);
  const backups = existing
    .filter((f) => f.startsWith("config-backup-") && f.endsWith(".json5"))
    .toSorted()
    .toReversed();

  if (backups.length > 0) {
    const latestName = backups[0];
    // Extract hash from filename: config-backup-YYYY-MM-DDTHH-MM-SS-HASH.json5
    const parts = latestName.replace(".json5", "").split("-");
    const latestHash = parts[parts.length - 1];
    if (latestHash === hash) {
      log.debug("Config unchanged, skipping backup");
      // Still prune old backups
      const pruned = await pruneOldBackups(opts.backupDir, backups, retentionDays);
      return { backed: false, pruned, reason: "unchanged" };
    }
  }

  // Write backup
  const filename = backupFilename(new Date(), hash);
  const backupPath = path.join(opts.backupDir, filename);
  await fs.writeFile(backupPath, content);

  // Verify written file
  const written = await fs.readFile(backupPath);
  const writtenHash = computeHash(written);
  if (writtenHash !== hash) {
    log.warn(`Backup verification failed: expected ${hash}, got ${writtenHash}`);
    await fs.unlink(backupPath).catch(() => {});
    return { backed: false, pruned: 0, reason: "verification failed" };
  }

  log.info(`Config backed up: ${filename}`);

  // Prune old backups
  const allBackups = [filename, ...backups];
  const pruned = await pruneOldBackups(opts.backupDir, allBackups, retentionDays);

  return { backed: true, pruned };
}

async function pruneOldBackups(
  backupDir: string,
  backupNames: string[],
  retentionDays: number,
): Promise<number> {
  const cutoff = Date.now() - retentionDays * 24 * 60 * 60 * 1000;
  let pruned = 0;

  for (const name of backupNames) {
    const filePath = path.join(backupDir, name);
    try {
      const stat = await fs.stat(filePath);
      if (stat.mtimeMs < cutoff) {
        await fs.unlink(filePath);
        pruned += 1;
      }
    } catch {
      // File may have been removed already
    }
  }

  if (pruned > 0) {
    log.info(`Pruned ${pruned} old config backup(s)`);
  }

  return pruned;
}

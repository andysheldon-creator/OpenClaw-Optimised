/**
 * DELEGATION STORAGE
 *
 * Persists delegation records to disk so they survive gateway restarts.
 * Pattern follows collaboration-storage.ts.
 */

import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { DelegationRecord } from "./delegation-types.js";
import { resolveStateDir } from "../config/paths.js";

function getDelegationStorePath(): string {
  const root = resolveStateDir(process.env, os.homedir);
  return path.join(root, ".delegation-storage");
}

function getDelegationPath(id: string): string {
  const storePath = getDelegationStorePath();
  const sanitized = id.replace(/[^a-z0-9-_]/g, "-");
  return path.join(storePath, `${sanitized}.json`);
}

export async function saveDelegationRecord(record: DelegationRecord): Promise<void> {
  try {
    const storePath = getDelegationStorePath();
    await fs.mkdir(storePath, { recursive: true });
    const filePath = getDelegationPath(record.id);
    const content = JSON.stringify(record, null, 2);
    await fs.writeFile(filePath, content, "utf-8");
  } catch (err) {
    console.error("Failed to save delegation record:", err);
  }
}

export async function loadDelegationRecord(id: string): Promise<DelegationRecord | null> {
  try {
    const filePath = getDelegationPath(id);
    const content = await fs.readFile(filePath, "utf-8");
    return JSON.parse(content) as DelegationRecord;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
      console.error("Failed to load delegation record:", err);
    }
    return null;
  }
}

export async function listDelegationRecords(): Promise<string[]> {
  try {
    const storePath = getDelegationStorePath();
    const files = await fs.readdir(storePath);
    return files.filter((f) => f.endsWith(".json")).map((f) => f.slice(0, -5));
  } catch {
    return [];
  }
}

export async function loadAllDelegationRecords(): Promise<Map<string, DelegationRecord>> {
  const records = new Map<string, DelegationRecord>();
  try {
    const ids = await listDelegationRecords();
    for (const id of ids) {
      const record = await loadDelegationRecord(id);
      if (record) {
        records.set(record.id, record);
      }
    }
  } catch {
    // ignore
  }
  return records;
}

export async function deleteDelegationRecord(id: string): Promise<void> {
  try {
    const filePath = getDelegationPath(id);
    await fs.unlink(filePath);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
      console.error("Failed to delete delegation record:", err);
    }
  }
}

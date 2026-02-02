/**
 * Artifact storage system for automation outputs.
 *
 * Manages local filesystem storage for automation artifacts,
 * including metadata tracking and URL generation for downloads.
 */

import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { type AutomationArtifact } from "./types.js";

/**
 * Artifact storage options.
 */
export interface ArtifactStorageOptions {
  /** Base directory for artifact storage */
  artifactsDir: string;
  /** Base URL for artifact downloads (e.g., "/api/artifacts") */
  baseUrl: string;
}

/**
 * Stored artifact metadata.
 */
export interface StoredArtifactMetadata {
  /** Unique artifact ID */
  id: string;
  /** Automation run ID */
  runId: string;
  /** Artifact name */
  name: string;
  /** Artifact type/MIME */
  type: string;
  /** File size in bytes */
  sizeBytes: number;
  /** Human-readable size */
  size: string;
  /** Relative file path */
  filePath: string;
  /** Download URL */
  url: string;
  /** When the artifact was created */
  createdAt: number;
}

/**
 * Resolves the artifacts directory path.
 * Defaults to ~/.clawdbrain/automations/artifacts
 */
export function resolveArtifactsDir(customDir?: string): string {
  if (customDir) {
    return path.resolve(customDir);
  }
  const homeDir = process.env.HOME ?? process.env.USERPROFILE ?? ".";
  return path.join(homeDir, ".clawdbrain", "automations", "artifacts");
}

/**
 * Format bytes as human-readable size.
 */
export function formatBytes(bytes: number): string {
  if (bytes === 0) {
    return "0 B";
  }
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}

/**
 * Artifact storage manager.
 */
export class ArtifactStorage {
  private artifactsDir: string;
  private baseUrl: string;

  constructor(opts: ArtifactStorageOptions) {
    this.artifactsDir = opts.artifactsDir;
    this.baseUrl = opts.baseUrl;
  }

  /**
   * Initialize the artifact storage directory.
   */
  async init(): Promise<void> {
    await fs.mkdir(this.artifactsDir, { recursive: true });
  }

  /**
   * Store an artifact from a buffer.
   *
   * @param runId - The automation run ID
   * @param name - Artifact name
   * @param type - Artifact type/MIME
   * @param data - Artifact data
   * @returns AutomationArtifact for gateway protocol
   */
  async storeBuffer(
    runId: string,
    name: string,
    type: string,
    data: Buffer,
  ): Promise<AutomationArtifact> {
    await this.init();

    const artifactId = crypto.randomUUID();
    const fileName = `${artifactId}-${this.sanitizeFileName(name)}`;
    const runDir = path.join(this.artifactsDir, runId);
    const filePath = path.join(runDir, fileName);

    // Ensure run directory exists
    await fs.mkdir(runDir, { recursive: true });

    // Write the artifact file
    await fs.writeFile(filePath, data);

    const sizeBytes = data.length;
    const url = `${this.baseUrl}/${runId}/${artifactId}`;

    return {
      id: artifactId,
      name,
      type,
      size: formatBytes(sizeBytes),
      url,
    };
  }

  /**
   * Store an artifact from a file path.
   *
   * @param runId - The automation run ID
   * @param name - Artifact name
   * @param type - Artifact type/MIME
   * @param sourcePath - Source file path
   * @returns AutomationArtifact for gateway protocol
   */
  async storeFile(
    runId: string,
    name: string,
    type: string,
    sourcePath: string,
  ): Promise<AutomationArtifact> {
    await this.init();

    const artifactId = crypto.randomUUID();
    const fileName = `${artifactId}-${this.sanitizeFileName(name)}`;
    const runDir = path.join(this.artifactsDir, runId);
    const filePath = path.join(runDir, fileName);

    // Ensure run directory exists
    await fs.mkdir(runDir, { recursive: true });

    // Copy the file to artifact storage
    await fs.copyFile(sourcePath, filePath);

    const stats = await fs.stat(filePath);
    const sizeBytes = stats.size;
    const url = `${this.baseUrl}/${runId}/${artifactId}`;

    return {
      id: artifactId,
      name,
      type,
      size: formatBytes(sizeBytes),
      url,
    };
  }

  /**
   * Store an artifact from a string.
   *
   * @param runId - The automation run ID
   * @param name - Artifact name
   * @param type - Artifact type/MIME
   * @param content - Artifact content as string
   * @param encoding - Text encoding (default: utf-8)
   * @returns AutomationArtifact for gateway protocol
   */
  async storeText(
    runId: string,
    name: string,
    type: string,
    content: string,
    encoding: BufferEncoding = "utf-8",
  ): Promise<AutomationArtifact> {
    return this.storeBuffer(runId, name, type, Buffer.from(content, encoding));
  }

  /**
   * Get an artifact by ID for download.
   *
   * @param runId - The automation run ID
   * @param artifactId - The artifact ID
   * @returns File path and MIME type, or null if not found
   */
  async getArtifact(
    artifactId: string,
  ): Promise<{ filePath: string; type: string; name: string } | null> {
    // Search for the artifact in all run directories
    try {
      const runDirs = await fs.readdir(this.artifactsDir);
      for (const runDir of runDirs) {
        const runPath = path.join(this.artifactsDir, runDir);
        const stat = await fs.stat(runPath);
        if (!stat.isDirectory()) {
          continue;
        }

        const files = await fs.readdir(runPath);
        for (const file of files) {
          if (file.startsWith(`${artifactId}-`)) {
            const filePath = path.join(runPath, file);
            // Extract name and type from metadata file if it exists
            const metadata = await this.readMetadata(runPath, artifactId);
            return {
              filePath,
              type: metadata?.type ?? "application/octet-stream",
              name: metadata?.name ?? file,
            };
          }
        }
      }
    } catch {
      // Directory doesn't exist or can't be read
    }
    return null;
  }

  /**
   * Delete all artifacts for a run.
   */
  async deleteRunArtifacts(runId: string): Promise<void> {
    const runDir = path.join(this.artifactsDir, runId);
    try {
      await fs.rm(runDir, { recursive: true, force: true });
    } catch {
      // Directory doesn't exist, ignore
    }
  }

  /**
   * Clean up old artifacts based on retention policy.
   *
   * @param maxAgeMs - Maximum age in milliseconds (default: 30 days)
   * @param maxTotalBytes - Maximum total bytes to keep (default: 1GB)
   */
  async cleanup(
    maxAgeMs: number = 30 * 24 * 60 * 60 * 1000,
    maxTotalBytes: number = 1024 * 1024 * 1024,
  ): Promise<void> {
    const now = Date.now();
    const runDirs: Array<{ runId: string; mtimeMs: number; sizeBytes: number }> = [];

    try {
      const dirs = await fs.readdir(this.artifactsDir);
      for (const runId of dirs) {
        const runPath = path.join(this.artifactsDir, runId);
        try {
          const stat = await fs.stat(runPath);
          if (!stat.isDirectory()) {
            continue;
          }

          // Calculate total size of the run directory
          const sizeBytes = await this.calculateDirSize(runPath);
          runDirs.push({ runId, mtimeMs: stat.mtimeMs, sizeBytes });
        } catch {
          // Skip directories we can't read
        }
      }
    } catch {
      // Artifacts directory doesn't exist, nothing to clean
      return;
    }

    // Sort by modification time (oldest first)
    runDirs.sort((a, b) => a.mtimeMs - b.mtimeMs);

    let totalBytes = runDirs.reduce((sum, r) => sum + r.sizeBytes, 0);
    let deletedBytes = 0;

    for (const runDir of runDirs) {
      const ageMs = now - runDir.mtimeMs;

      // Delete if too old or if we're over the size limit
      if (ageMs > maxAgeMs || totalBytes > maxTotalBytes) {
        await this.deleteRunArtifacts(runDir.runId);
        deletedBytes += runDir.sizeBytes;
        totalBytes -= runDir.sizeBytes;
      }

      // Stop if we're under the size limit
      if (totalBytes <= maxTotalBytes) {
        break;
      }
    }

    if (deletedBytes > 0) {
      // Log cleanup (caller should provide a logger)
      console.debug(`[artifacts] Cleaned up ${formatBytes(deletedBytes)} of old artifacts`);
    }
  }

  /**
   * Calculate total size of a directory recursively.
   */
  private async calculateDirSize(dirPath: string): Promise<number> {
    let totalSize = 0;
    try {
      const entries = await fs.readdir(dirPath, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dirPath, entry.name);
        if (entry.isDirectory()) {
          totalSize += await this.calculateDirSize(fullPath);
        } else if (entry.isFile()) {
          const stat = await fs.stat(fullPath);
          totalSize += stat.size;
        }
      }
    } catch {
      // Ignore errors
    }
    return totalSize;
  }

  /**
   * Read artifact metadata from sidecar file.
   */
  private async readMetadata(
    runDir: string,
    artifactId: string,
  ): Promise<{ name: string; type: string } | null> {
    const metadataPath = path.join(runDir, `${artifactId}.meta.json`);
    try {
      const data = await fs.readFile(metadataPath, "utf-8");
      const meta = JSON.parse(data) as { name: string; type: string };
      return meta;
    } catch {
      return null;
    }
  }

  /**
   * Sanitize a filename by removing/replacing dangerous characters.
   */
  private sanitizeFileName(name: string): string {
    // Remove path separators and other dangerous characters
    // eslint-disable-next-line no-control-regex
    return name.replace(/[/\\<>:"|?*\x00-\x1f]/g, "_");
  }

  /**
   * Get the artifacts directory path.
   */
  getArtifactsDir(): string {
    return this.artifactsDir;
  }
}

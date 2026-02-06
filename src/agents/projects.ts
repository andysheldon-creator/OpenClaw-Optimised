import os from "node:os";
import path from "node:path";
import type { OpenClawConfig } from "../config/config.js";

export type ProjectNamingConvention = "kebab-case" | "snake_case" | "camelCase" | "PascalCase";

/**
 * Resolve the projects root directory from config, expanding tilde.
 * Returns undefined when not configured.
 */
export function resolveProjectsRootDir(config?: OpenClawConfig): string | undefined {
  const raw = config?.agents?.defaults?.projects?.rootDir?.trim();
  if (!raw) {
    return undefined;
  }
  if (raw.startsWith("~/") || raw === "~") {
    return path.join(os.homedir(), raw.slice(1));
  }
  return path.resolve(raw);
}

/**
 * Resolve the naming convention from config (default: "kebab-case").
 */
export function resolveProjectNamingConvention(config?: OpenClawConfig): ProjectNamingConvention {
  return config?.agents?.defaults?.projects?.namingConvention ?? "kebab-case";
}

/**
 * Apply a naming convention to a project name string.
 * Splits on whitespace, hyphens, underscores, and camelCase boundaries.
 */
export function applyNamingConvention(name: string, convention: ProjectNamingConvention): string {
  // Split on whitespace, hyphens, underscores, and camelCase boundaries
  const words = name
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
    .split(/[\s\-_]+/)
    .map((w) => w.trim())
    .filter(Boolean);

  if (words.length === 0) {
    return name;
  }

  switch (convention) {
    case "kebab-case":
      return words.map((w) => w.toLowerCase()).join("-");
    case "snake_case":
      return words.map((w) => w.toLowerCase()).join("_");
    case "camelCase":
      return words
        .map((w, i) =>
          i === 0 ? w.toLowerCase() : w.charAt(0).toUpperCase() + w.slice(1).toLowerCase(),
        )
        .join("");
    case "PascalCase":
      return words.map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join("");
  }
}

/**
 * Resolve the full path for a project, applying root dir and naming convention.
 */
export function resolveProjectDir(
  config: OpenClawConfig | undefined,
  projectName: string,
): string | undefined {
  const rootDir = resolveProjectsRootDir(config);
  if (!rootDir) {
    return undefined;
  }
  const convention = resolveProjectNamingConvention(config);
  const folderName = applyNamingConvention(projectName, convention);
  return path.join(rootDir, folderName);
}

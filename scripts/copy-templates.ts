import fs from "node:fs/promises";
import path from "node:path";

export async function copyTemplates(options?: { src?: string; dest?: string }) {
  const src = options?.src ? path.resolve(options.src) : path.resolve("docs/reference/templates");
  const dest = options?.dest ? path.resolve(options.dest) : path.resolve("dist/docs/reference/templates");

  try {
    const stat = await fs.stat(src);
    if (!stat.isDirectory()) {
      throw new Error(`${src} is not a directory`);
    }
  } catch (err) {
    // Nothing to copy if source doesn't exist; keep build non-fatal
    console.warn(`copy-templates: source not found (${src}), skipping`);
    return;
  }

  await fs.mkdir(dest, { recursive: true });

  // Node 18+ supports fs.cp with recursive option; use copy for simplicity
  // But to remain explicit, copy files recursively
  async function copyDir(srcDir: string, dstDir: string) {
    const entries = await fs.readdir(srcDir, { withFileTypes: true });
    for (const entry of entries) {
      const srcPath = path.join(srcDir, entry.name);
      const dstPath = path.join(dstDir, entry.name);
      if (entry.isDirectory()) {
        await fs.mkdir(dstPath, { recursive: true });
        await copyDir(srcPath, dstPath);
      } else if (entry.isFile()) {
        await fs.copyFile(srcPath, dstPath);
      }
    }
  }

  await copyDir(src, dest);
}

if (require.main === module) {
  // When run directly, call copyTemplates and log result
  copyTemplates().catch((err) => {
    console.error("copy-templates failed:", err);
    process.exit(1);
  });
}

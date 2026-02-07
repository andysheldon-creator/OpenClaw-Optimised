import fs from "fs";
import path from "path";

export async function createSkill(args: { name: string; cwd?: string }): Promise<string> {
  const { name } = args;
  const cwd = args.cwd ?? process.cwd();

  // Validate name:
  // Must be kebab-case, start/end with letters/numbers, no double hyphens
  // Min 3 chars (e.g. "my-skill")
  if (!/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(name) || name.includes("--")) {
    throw new Error(
      `Skill name "${name}" is invalid. Must be kebab-case (lowercase, alphanumeric, single hyphens), start/end with a character.`,
    );
  }

  const skillDir = path.join(cwd, "skills", name);

  if (fs.existsSync(skillDir)) {
    throw new Error(`Directory already exists: ${skillDir}`);
  }

  // Create directories
  fs.mkdirSync(path.join(skillDir, "src"), { recursive: true });

  // 1. package.json
  const pkgJson = {
    name: name,
    version: "0.1.0",
    description: `OpenClaw skill: ${name}`,
    type: "module",
    scripts: {
      test: 'echo "Error: no test specified" && exit 1',
    },
    dependencies: {},
    devDependencies: {
      "@types/node": "^20.0.0",
      typescript: "^5.0.0",
    },
  };
  fs.writeFileSync(path.join(skillDir, "package.json"), JSON.stringify(pkgJson, null, 2));

  // 2. SKILL.md
  const skillMd = `---
name: ${name}
description: Description of what this skill does.
---

# ${name}

Describe your skill here.

## Usage

\`\`\`bash
# Example command
echo "Hello from ${name}"
\`\`\`

## Configuration

Add any necessary configuration details here.
`;
  fs.writeFileSync(path.join(skillDir, "SKILL.md"), skillMd);

  // 3. src/index.ts
  const indexTs = `export function main() {
  console.log("Hello from ${name}!");
}
`;
  fs.writeFileSync(path.join(skillDir, "src", "index.ts"), indexTs);

  // 4. tsconfig.json
  const tsConfig = {
    compilerOptions: {
      target: "ES2022",
      module: "Node16",
      moduleResolution: "Node16",
      outDir: "./dist",
      rootDir: "./src",
      strict: true,
      esModuleInterop: true,
    },
    include: ["src"],
  };
  fs.writeFileSync(path.join(skillDir, "tsconfig.json"), JSON.stringify(tsConfig, null, 2));

  // Return the created path instead of logging
  return skillDir;
}

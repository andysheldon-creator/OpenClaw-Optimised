import fs from "node:fs/promises";
import path from "node:path";
import { OpenClawSchema } from "../src/config/zod-schema.js";

function defaultOutPath(): string {
  return path.resolve(process.cwd(), "dist", "openclaw.schema.json");
}

function parseArgs(argv: string[]): { outPath: string } {
  const outFlag = argv.indexOf("--out");
  const outPathRaw = outFlag >= 0 ? argv[outFlag + 1] : undefined;
  const outPath = (outPathRaw ?? "").trim();
  return { outPath: outPath || defaultOutPath() };
}

const { outPath } = parseArgs(process.argv.slice(2));

const schema = OpenClawSchema.toJSONSchema({
  target: "draft-07",
  unrepresentable: "any",
});

// Help editors + schema tooling.
(schema as Record<string, unknown>).$schema = "http://json-schema.org/draft-07/schema#";
(schema as Record<string, unknown>).$id = "https://openclaw.ai/schemas/openclaw.schema.json";
(schema as Record<string, unknown>).title = "OpenClawConfig";

await fs.mkdir(path.dirname(outPath), { recursive: true });
await fs.writeFile(outPath, `${JSON.stringify(schema, null, 2)}\n`, "utf8");

process.stdout.write(`Wrote schema to ${outPath}\n`);

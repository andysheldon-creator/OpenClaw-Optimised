import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const UI_ROOT = path.resolve(__dirname, "../ui/src/ui/i18n/locales");
const PT_PATH = path.join(UI_ROOT, "pt.ts");
const EN_PATH = path.join(UI_ROOT, "en.ts");

// Helper to get value from object by path array
function getValue(obj: unknown, pathArray: string[]): string | undefined {
  let current = obj as Record<string, unknown>;
  for (const key of pathArray) {
    if (current[key] === undefined) {
      return undefined;
    }
    current = current[key] as Record<string, unknown>;
  }
  return typeof current === "string" ? current : undefined;
}

async function alignLocales() {
  console.log(`Reading PT from ${PT_PATH}`);
  const ptContent = fs.readFileSync(PT_PATH, "utf-8");

  // We need to import the EN object to get current values
  // We use dynamic import. Note: This assumes en.ts is valid TS.
  console.log(`Importing EN from ${EN_PATH}`);
  const enModule = await import("file://" + EN_PATH);
  const enObj = enModule.en;

  const lines = ptContent.split("\n");
  const pathStack: string[] = [];
  const outputLines: string[] = [];

  // Regex patterns
  // Matches: key: "value", or key: 'value',
  const keyValueRegex = /^(\s*)([a-zA-Z0-9_]+)(\s*:\s*)(['"`])(.*)(['"`])(\s*,?.*)$/;
  // Matches: key: {
  const objectStartRegex = /^(\s*)([a-zA-Z0-9_]+)(\s*:\s*\{\s*.*)$/;
  // Matches: }, or }
  const objectEndRegex = /^(\s*\}.*)$/;

  // Special case for the export line
  const exportRegex = /^export const pt = \{$/;

  for (let i = 0; i < lines.length; i++) {
    let line = lines[i];

    // Handle the export line
    if (exportRegex.test(line)) {
      outputLines.push("export const en = {");
      continue;
    }

    // Check for object start: key: {
    // Note: We intentionally check this BEFORE key-value because key-value regex might match strict json-like strings
    // But actually, key: { usually doesn't have quotes around {.
    // Let's rely on the stack logic.

    const objStartMatch = line.match(objectStartRegex);
    if (objStartMatch) {
      // It's an object start.
      // push key to stack
      const key = objStartMatch[2];
      pathStack.push(key);
      outputLines.push(line);
      continue;
    }

    // Check for object end: },
    if (objectEndRegex.test(line)) {
      // Be careful: if it's just a closing brace, pop.
      // Need to distinguish between }, and } for the main object.
      // But assuming indent-based or match-based.
      // Simple logic: if line contains '}', pop stack for every '}'?
      // No, usually it's one level per line.
      if (line.trim().startsWith("}") && pathStack.length > 0) {
        pathStack.pop();
      }
      outputLines.push(line);
      continue;
    }

    // Check for key-value pair
    const kvMatch = line.match(keyValueRegex);
    if (kvMatch) {
      const indent = kvMatch[1];
      const key = kvMatch[2];
      const separator = kvMatch[3];
      const quote = kvMatch[4]; // quote style of PT
      // const ptValue = kvMatch[5];
      // const endQuote = kvMatch[6]; // matched by \4 usually
      const suffix = kvMatch[7];

      // Construct full path
      const currentPath = [...pathStack, key];

      // Look up in EN object
      const enValue = getValue(enObj, currentPath);

      if (enValue !== undefined) {
        // preserve spacing and quotes from PT? User wanted "strict alignment".
        // If PT uses double quotes, use double quotes.
        // Escape quotes in value if needed.
        let escapedValue = enValue;
        if (quote === '"') {
          escapedValue = enValue.replace(/"/g, '\\"');
        } else if (quote === "'") {
          escapedValue = enValue.replace(/'/g, "\\'");
        } else if (quote === "`") {
          escapedValue = enValue.replace(/`/g, "\\`");
        }

        const newLine = `${indent}${key}${separator}${quote}${escapedValue}${quote}${suffix}`;
        outputLines.push(newLine);
      } else {
        // Value missing in EN. Keep PT line + maybe a marker?
        console.warn(`MISSING IN EN: ${currentPath.join(".")}`);
        outputLines.push(line);
      }
      continue;
    }

    // Fallback: comments, empty lines, etc.
    outputLines.push(line);
  }

  // Write EN file
  console.log(`Writing ${outputLines.length} lines to ${EN_PATH}`);
  fs.writeFileSync(EN_PATH, outputLines.join("\n"), "utf-8");
}

alignLocales().catch((err) => {
  console.error(err);
  process.exit(1);
});

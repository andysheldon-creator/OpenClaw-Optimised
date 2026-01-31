import fs from "node:fs";

import JSON5 from "json5";

import { base64UrlEncode } from "./base64url.js";
import { preparePayloadForSigning } from "./canonicalize.js";
import type { ObaKeyFile } from "./keys.js";
import { signPayload } from "./keys.js";
import type { ObaBlock } from "./types.js";

function buildObaBlock(key: ObaKeyFile, ownerOverride?: string): Omit<ObaBlock, "sig"> {
  const owner = ownerOverride ?? key.owner;
  if (!owner) {
    throw new Error("No owner URL. Provide --owner or set it during keygen.");
  }
  return { owner, kid: key.kid, alg: "EdDSA" };
}

function signContainer(
  container: Record<string, unknown>,
  key: ObaKeyFile,
  ownerOverride?: string,
): { container: Record<string, unknown>; kid: string; sig: string } {
  const obaPartial = buildObaBlock(key, ownerOverride);

  // Inject oba block without sig for payload preparation.
  container.oba = { ...obaPartial };

  const payload = preparePayloadForSigning(container);
  const sigBytes = signPayload(payload, key.privateKeyPem);
  const sig = base64UrlEncode(sigBytes);

  // Inject final oba block with sig.
  container.oba = { ...obaPartial, sig };

  return { container, kid: key.kid, sig };
}

export function signPluginManifest(params: {
  manifestPath: string;
  key: ObaKeyFile;
  ownerOverride?: string;
}): { kid: string; sig: string } {
  const raw = fs.readFileSync(params.manifestPath, "utf-8");
  const container = JSON.parse(raw) as Record<string, unknown>;

  const { kid, sig } = signContainer(container, params.key, params.ownerOverride);

  fs.writeFileSync(params.manifestPath, `${JSON.stringify(container, null, 2)}\n`, "utf-8");
  return { kid, sig };
}

/**
 * Sign a SKILL.md file. The metadata is in the frontmatter block between `---` markers.
 * We parse the metadata JSON5 object, sign it, then replace it back in the file.
 */
export function signSkillMetadata(params: {
  skillPath: string;
  key: ObaKeyFile;
  ownerOverride?: string;
}): { kid: string; sig: string } {
  const content = fs.readFileSync(params.skillPath, "utf-8");

  // Extract frontmatter block.
  const fmMatch = content.match(/^---\n([\s\S]*?)\n---/);
  if (!fmMatch) {
    throw new Error(`No frontmatter block found in ${params.skillPath}`);
  }
  const fmBlock = fmMatch[1];

  // Find the metadata value within the frontmatter.
  // Frontmatter format: "metadata: { ... }" where the value can be multi-line.
  const metaMatch = fmBlock.match(/^metadata:\s*([\s\S]*)$/m);
  if (!metaMatch) {
    throw new Error(`No metadata field found in frontmatter of ${params.skillPath}`);
  }

  // The metadata value is the rest after "metadata:" up to the end of frontmatter.
  // Extract just the metadata value by finding everything after "metadata:" key.
  const metaStartIndex = fmBlock.indexOf("metadata:");
  const metaValueStart = fmBlock.indexOf(":", metaStartIndex) + 1;
  // Find where this value ends - next top-level key or end of block.
  const remainingLines = fmBlock.slice(metaValueStart).split("\n");
  const valueLines: string[] = [];
  let firstLine = true;
  for (const line of remainingLines) {
    if (firstLine) {
      valueLines.push(line);
      firstLine = false;
      continue;
    }
    // A non-indented, non-empty line with "key:" pattern means next field.
    if (line.length > 0 && !line.startsWith(" ") && !line.startsWith("\t") && /^\w/.test(line)) {
      break;
    }
    valueLines.push(line);
  }
  const metadataRaw = valueLines.join("\n").trim();

  const parsed = JSON5.parse(metadataRaw) as Record<string, unknown>;
  if (!parsed || typeof parsed !== "object") {
    throw new Error(`Invalid metadata JSON5 in ${params.skillPath}`);
  }

  const { kid, sig } = signContainer(parsed, params.key, params.ownerOverride);

  // Serialize back. Use JSON with 2-space indent for readability in frontmatter.
  const serialized = JSON.stringify(parsed, null, 2);

  // Replace the metadata value in the original content.
  const beforeMeta = fmBlock.slice(0, metaStartIndex);
  const afterValueEnd = metaStartIndex + "metadata:".length + valueLines.join("\n").length;
  const afterMeta = fmBlock.slice(afterValueEnd);
  const newFmBlock = `${beforeMeta}metadata: ${serialized}${afterMeta}`;
  const newContent = content.replace(fmMatch[1], newFmBlock);

  fs.writeFileSync(params.skillPath, newContent, "utf-8");
  return { kid, sig };
}

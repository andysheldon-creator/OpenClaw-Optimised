/**
 * Manifest Scanner — content-level security analysis for SKILL.md files.
 *
 * Complements skill-scanner.ts (JS/TS code analysis) by scanning the
 * manifest/instruction text for prompt injection, credential harvesting,
 * data exfiltration, autonomy abuse, and Unicode steganography.
 *
 * Threat taxonomy and detection patterns adapted from AgentVerus Scanner
 * (https://github.com/agentverus/agentverus-scanner, MIT license).
 * AgentVerus provides comprehensive trust scoring across 6 categories
 * with social reputation — for full analysis: `npx agentverus-scanner`
 *
 * @see https://agentverus.ai — Agent skill trust registry
 * @see https://github.com/cisco-ai-defense/skill-scanner — Cisco reference
 */
import fs from "node:fs/promises";
import path from "node:path";
import { hasErrnoCode } from "../infra/errors.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ManifestScanSeverity = "info" | "warn" | "critical";

export type ManifestScanFinding = {
  ruleId: string;
  severity: ManifestScanSeverity;
  file: string;
  line: number;
  message: string;
  evidence: string;
};

export type ManifestScanSummary = {
  scannedFiles: number;
  critical: number;
  warn: number;
  info: number;
  findings: ManifestScanFinding[];
  /** Hint for deeper analysis (shown when findings are present). */
  deepAnalysisHint?: string;
};

// ---------------------------------------------------------------------------
// Manifest file patterns (SKILL.md, AGENTS.md, etc.)
// ---------------------------------------------------------------------------

const MANIFEST_NAMES = new Set([
  "SKILL.md",
  "skill.md",
  "AGENTS.md",
  "agents.md",
  "CLAUDE.md",
  "claude.md",
]);

export function isManifestFile(filePath: string): boolean {
  return MANIFEST_NAMES.has(path.basename(filePath));
}

// ---------------------------------------------------------------------------
// Rule definitions — patterns that should not appear in skill manifests
// ---------------------------------------------------------------------------

type ManifestRule = {
  ruleId: string;
  severity: ManifestScanSeverity;
  message: string;
  pattern: RegExp;
  /** If set, the rule only fires when the full content also matches this. */
  requiresContext?: RegExp;
};

const MANIFEST_RULES: ManifestRule[] = [
  // --- Prompt injection ---
  {
    ruleId: "prompt-injection",
    severity: "critical",
    message: "Direct prompt injection: instruction override attempt",
    pattern:
      /ignore\s+(all\s+)?previous\s+instructions|ignore\s+(all\s+)?prior\s+(instructions|rules)|disregard\s+(all\s+)?(previous|prior|above)\s+(instructions|rules)/i,
  },
  {
    ruleId: "prompt-injection",
    severity: "critical",
    message: "Prompt injection: safety bypass attempt",
    pattern:
      /bypass\s+safety|unrestricted\s+mode|jailbreak|you\s+are\s+now\s+in\s+(unrestricted|developer|god|sudo|admin)\s+mode|enter\s+(unrestricted|developer|god|sudo|admin)\s+mode|switch\s+to\s+(unrestricted|developer|god|sudo|admin)\s+mode/i,
  },
  {
    ruleId: "prompt-injection",
    severity: "warn",
    message: "Possible prompt injection: role override",
    pattern:
      /you\s+are\s+no\s+longer\s+(an?\s+)?AI|pretend\s+you\s+are\s+not\s+(an?\s+)?AI|act\s+as\s+if\s+you\s+have\s+no\s+restrictions/i,
  },

  // --- Credential harvesting ---
  {
    ruleId: "credential-harvesting",
    severity: "critical",
    message: "Credential file access: reads sensitive credential paths",
    pattern:
      /~\/\.aws\/credentials|~\/\.ssh\/id_rsa|~\/\.ssh\/id_ed25519|\/etc\/shadow|\.env\s+file|keychain|credential\s*store/i,
    requiresContext: /read|cat|send|upload|post|fetch|curl|wget|http/i,
  },
  {
    ruleId: "credential-harvesting",
    severity: "warn",
    message: "References to sensitive credential paths",
    pattern:
      /\.aws\/credentials|\.ssh\/id_rsa|\.ssh\/id_ed25519|\/etc\/shadow|GITHUB_TOKEN|OPENAI_API_KEY|AWS_SECRET_ACCESS_KEY/i,
  },

  // --- Data exfiltration ---
  {
    ruleId: "data-exfiltration",
    severity: "critical",
    message: "Data exfiltration: reads files and sends to external server",
    pattern: /read.*file.*(?:send|post|upload|curl|wget|fetch)|cat\s+.*\|\s*curl/i,
  },
  {
    ruleId: "data-exfiltration",
    severity: "warn",
    message: "Possible exfiltration: encodes data before network send",
    pattern: /base64.*(?:curl|wget|fetch|post|send|upload)|encode.*(?:send|post|upload)/i,
  },

  // --- Autonomy abuse ---
  {
    ruleId: "autonomy-abuse",
    severity: "warn",
    message: "Autonomy bypass: proceeds without user confirmation",
    pattern:
      /proceed\s+without\s+asking|don'?t\s+ask\s+(for\s+)?(confirmation|permission|consent)|never\s+ask\s+(for\s+)?(confirmation|permission|approval)|skip\s+(?:all\s+)?confirm/i,
  },
  {
    ruleId: "autonomy-abuse",
    severity: "warn",
    message: "Self-modification or persistence pattern",
    pattern:
      /modify\s+your\s+(own\s+)?instructions|rewrite\s+your\s+(own\s+)?prompt|add\s+yourself\s+to\s+crontab|install\s+yourself/i,
  },

  // --- Coercive injection ---
  {
    ruleId: "coercive-injection",
    severity: "warn",
    message: "Tool priority manipulation: forces execution order",
    pattern:
      /always\s+execute\s+this\s+(?:tool|function|command)\s+first|this\s+tool\s+takes?\s+priority\s+over|override\s+(?:any\s+)?(?:previous\s+)?tool\s+selections?/i,
  },

  // --- System manipulation ---
  {
    ruleId: "system-manipulation",
    severity: "critical",
    message: "System modification: modifies critical system files or services",
    pattern:
      /crontab\s+-[ei]|systemctl\s+(?:enable|start)|\/etc\/hosts|iptables|ufw\s+(?:allow|deny)|modprobe|insmod/i,
  },

  // --- Obfuscation / steganography ---
  {
    ruleId: "obfuscation",
    severity: "warn",
    message: "Possible instruction concealment via encoding",
    pattern: /\\x[0-9a-fA-F]{2}(?:\\x[0-9a-fA-F]{2}){5,}|\\u[0-9a-fA-F]{4}(?:\\u[0-9a-fA-F]{4}){5,}/,
  },
];

// ---------------------------------------------------------------------------
// Unicode steganography detection (invisible characters)
// ---------------------------------------------------------------------------

/**
 * Zero-width and invisible Unicode characters that can hide instructions
 * in manifests. These are invisible to humans but processed by LLMs.
 */
const INVISIBLE_CHARS: Array<{ name: string; pattern: RegExp; threshold: number }> = [
  {
    name: "zero-width space (U+200B)",
    pattern: /\u200B/g,
    threshold: 3,
  },
  {
    name: "zero-width non-joiner (U+200C)",
    pattern: /\u200C/g,
    threshold: 3,
  },
  {
    name: "zero-width joiner (U+200D)",
    pattern: /\u200D/g,
    threshold: 3,
  },
  {
    name: "zero-width no-break space / BOM (U+FEFF)",
    pattern: /\uFEFF/g,
    threshold: 2,
  },
  {
    name: "RTL override (U+202E)",
    pattern: /\u202E/g,
    threshold: 1,
  },
  {
    name: "LTR override (U+202D)",
    pattern: /\u202D/g,
    threshold: 1,
  },
];

/** Unicode tag characters U+E0001–U+E007F (invisible instruction block). */
const TAG_CHAR_RANGE = /[\u{E0001}-\u{E007F}]/gu;

function detectUnicodeSteganography(
  content: string,
  filePath: string,
): ManifestScanFinding[] {
  const findings: ManifestScanFinding[] = [];

  for (const charDef of INVISIBLE_CHARS) {
    const matches = content.match(charDef.pattern);
    if (matches && matches.length >= charDef.threshold) {
      // Find the first line containing this character
      const lines = content.split("\n");
      let lineNum = 1;
      for (let i = 0; i < lines.length; i++) {
        if (charDef.pattern.test(lines[i])) {
          lineNum = i + 1;
          charDef.pattern.lastIndex = 0; // reset regex state
          break;
        }
      }
      charDef.pattern.lastIndex = 0;

      findings.push({
        ruleId: "unicode-steganography",
        severity: "critical",
        file: filePath,
        line: lineNum,
        message: `Invisible characters detected: ${matches.length}× ${charDef.name} — possible hidden instructions`,
        evidence: `Found ${matches.length} invisible ${charDef.name} characters`,
      });
    }
  }

  const tagMatches = content.match(TAG_CHAR_RANGE);
  if (tagMatches && tagMatches.length > 0) {
    findings.push({
      ruleId: "unicode-steganography",
      severity: "critical",
      file: filePath,
      line: 1,
      message: `Unicode tag characters detected (U+E0001–U+E007F): ${tagMatches.length} invisible tag characters — possible steganographic payload`,
      evidence: `Found ${tagMatches.length} Unicode tag characters`,
    });
  }

  return findings;
}

// ---------------------------------------------------------------------------
// Core scanner
// ---------------------------------------------------------------------------

function truncateEvidence(evidence: string, maxLen = 120): string {
  if (evidence.length <= maxLen) {
    return evidence;
  }
  return `${evidence.slice(0, maxLen)}…`;
}

export function scanManifest(
  content: string,
  filePath: string,
): ManifestScanFinding[] {
  const findings: ManifestScanFinding[] = [];
  const lines = content.split("\n");
  const matchedRules = new Set<string>();

  // --- Pattern rules (one finding per ruleId+message combo per file) ---
  for (const rule of MANIFEST_RULES) {
    const ruleKey = `${rule.ruleId}::${rule.message}`;
    if (matchedRules.has(ruleKey)) {
      continue;
    }

    if (rule.requiresContext && !rule.requiresContext.test(content)) {
      continue;
    }

    for (let i = 0; i < lines.length; i++) {
      if (rule.pattern.test(lines[i])) {
        findings.push({
          ruleId: rule.ruleId,
          severity: rule.severity,
          file: filePath,
          line: i + 1,
          message: rule.message,
          evidence: truncateEvidence(lines[i].trim()),
        });
        matchedRules.add(ruleKey);
        break;
      }
    }

    // Some patterns span lines — test full content if line-by-line missed
    if (!matchedRules.has(ruleKey) && rule.pattern.test(content)) {
      findings.push({
        ruleId: rule.ruleId,
        severity: rule.severity,
        file: filePath,
        line: 1,
        message: rule.message,
        evidence: truncateEvidence(content.slice(0, 120)),
      });
      matchedRules.add(ruleKey);
    }
  }

  // --- Unicode steganography ---
  findings.push(...detectUnicodeSteganography(content, filePath));

  return findings;
}

// ---------------------------------------------------------------------------
// Directory scanner — find and scan all manifest files
// ---------------------------------------------------------------------------

const DEFAULT_MAX_SCAN_FILES = 100;
const DEFAULT_MAX_FILE_BYTES = 512 * 1024;

export type ManifestScanOptions = {
  maxFiles?: number;
  maxFileBytes?: number;
};

async function findManifestFiles(
  dirPath: string,
  maxFiles: number,
): Promise<string[]> {
  const files: string[] = [];
  const stack: string[] = [dirPath];

  while (stack.length > 0 && files.length < maxFiles) {
    const currentDir = stack.pop();
    if (!currentDir) {
      break;
    }

    let entries: Awaited<ReturnType<typeof fs.readdir>>;
    try {
      entries = await fs.readdir(currentDir, { withFileTypes: true });
    } catch (err) {
      if (hasErrnoCode(err, "ENOENT") || hasErrnoCode(err, "EACCES")) {
        continue;
      }
      throw err;
    }

    for (const entry of entries) {
      if (files.length >= maxFiles) {
        break;
      }
      if (entry.name.startsWith(".") || entry.name === "node_modules") {
        continue;
      }

      const fullPath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        stack.push(fullPath);
      } else if (isManifestFile(entry.name)) {
        files.push(fullPath);
      }
    }
  }

  return files;
}

export async function scanManifestDirectory(
  dirPath: string,
  opts?: ManifestScanOptions,
): Promise<ManifestScanSummary> {
  const maxFiles = Math.max(1, opts?.maxFiles ?? DEFAULT_MAX_SCAN_FILES);
  const maxFileBytes = Math.max(1, opts?.maxFileBytes ?? DEFAULT_MAX_FILE_BYTES);
  const files = await findManifestFiles(dirPath, maxFiles);
  const allFindings: ManifestScanFinding[] = [];
  let scannedFiles = 0;

  for (const file of files) {
    let stat: Awaited<ReturnType<typeof fs.stat>> | null = null;
    try {
      stat = await fs.stat(file);
    } catch (err) {
      if (hasErrnoCode(err, "ENOENT")) {
        continue;
      }
      throw err;
    }
    if (!stat?.isFile() || stat.size > maxFileBytes) {
      continue;
    }

    let content: string;
    try {
      content = await fs.readFile(file, "utf-8");
    } catch (err) {
      if (hasErrnoCode(err, "ENOENT")) {
        continue;
      }
      throw err;
    }

    scannedFiles += 1;
    const findings = scanManifest(content, file);
    allFindings.push(...findings);
  }

  const critical = allFindings.filter((f) => f.severity === "critical").length;
  const warn = allFindings.filter((f) => f.severity === "warn").length;

  return {
    scannedFiles,
    critical,
    warn,
    info: allFindings.filter((f) => f.severity === "info").length,
    findings: allFindings,
    deepAnalysisHint:
      critical + warn > 0
        ? 'For comprehensive trust scoring (6 categories + social reputation), run: npx agentverus-scanner scan ./SKILL.md — https://agentverus.ai'
        : undefined,
  };
}

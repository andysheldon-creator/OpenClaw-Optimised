#!/usr/bin/env bun

import { spawnSync } from 'node:child_process';
import { createReadStream, existsSync } from 'node:fs';
import { mkdir, readdir, readFile, stat, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import readline from 'node:readline';

type Role = 'user' | 'assistant' | 'toolResult' | string;

type JsonlLine = {
  type?: string;
  timestamp?: string;
  message?: {
    role?: Role;
    content?: Array<{ type?: string; text?: string }>;
  };
};

function printUsage(): void {
  // eslint-disable-next-line no-console
  console.log(`conversation-archive

Archives a Clawdbot session JSONL transcript to a folder with:
- transcript.md (human-readable)
- summary.md (optional, via summarize CLI)
- resume.md ("how to pick up" context)

Usage:
  bun scripts/conversation-archive.ts [--topic <name>] [--outDir <dir>] [--sessionJsonl <path>]

Options:
  --topic <name>        Folder slug (default: "conversation")
  --outDir <dir>        Output base directory (default: ~/clawd/archives)
  --sessionJsonl <path> Path to a session .jsonl file (default: latest in ~/.clawdbot/agents/main/sessions)
  --model <model>       Model passed to summarize CLI (optional)
  --no-summary          Skip running summarize
`);
}

function parseArgs(argv: string[]): Record<string, string | boolean> {
  const args: Record<string, string | boolean> = {};

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg) continue;

    if (arg === '--help' || arg === '-h') {
      args.help = true;
      continue;
    }

    if (arg.startsWith('--no-')) {
      args[arg.slice('--no-'.length)] = false;
      continue;
    }

    if (arg.startsWith('--')) {
      const key = arg.slice(2);
      const next = argv[i + 1];
      if (next && !next.startsWith('--')) {
        args[key] = next;
        i++;
      } else {
        args[key] = true;
      }
    }
  }

  return args;
}

async function findLatestSessionJsonl(sessionsDir: string): Promise<string> {
  const entries = await readdir(sessionsDir);
  const jsonls = entries
    .filter((name) => name.endsWith('.jsonl'))
    .filter((name) => !name.includes('.deleted.'))
    .map((name) => path.join(sessionsDir, name));

  if (jsonls.length === 0) {
    throw new Error(`No .jsonl session logs found in ${sessionsDir}`);
  }

  const byMtime = await Promise.all(
    jsonls.map(async (p) => {
      const s = await stat(p);
      return { p, mtimeMs: s.mtimeMs };
    }),
  );

  byMtime.sort((a, b) => b.mtimeMs - a.mtimeMs);
  return byMtime[0]!.p;
}

function formatMessage(role: string, timestamp: string | undefined, text: string): string {
  const header = `### ${role}${timestamp ? ` (${timestamp})` : ''}`;
  return `${header}\n\n${text.trim()}\n`;
}

async function buildTranscriptMarkdown(sessionJsonl: string): Promise<{ md: string; firstTs?: string; lastTs?: string }> {
  const rl = readline.createInterface({ input: createReadStream(sessionJsonl), crlfDelay: Infinity });

  const chunks: string[] = [];
  let firstTs: string | undefined;
  let lastTs: string | undefined;

  for await (const line of rl) {
    if (!line.trim()) continue;

    let obj: JsonlLine;
    try {
      obj = JSON.parse(line) as JsonlLine;
    } catch {
      continue;
    }

    if (obj.type !== 'message') continue;
    const role = obj.message?.role;
    if (!role) continue;
    if (role === 'toolResult') continue;

    const timestamp = obj.timestamp;
    if (timestamp) {
      if (!firstTs) firstTs = timestamp;
      lastTs = timestamp;
    }

    const texts = (obj.message?.content ?? [])
      .filter((c) => c.type === 'text')
      .map((c) => c.text)
      .filter((t): t is string => Boolean(t && t.trim()));

    if (texts.length === 0) continue;

    const merged = texts.join('\n');
    chunks.push(formatMessage(String(role), timestamp, merged));
  }

  const header = `# Transcript\n\nSource: \`${sessionJsonl}\`\n`;
  return { md: `${header}\n${chunks.join('\n')}`.trimEnd() + '\n', firstTs, lastTs };
}

function trySummarize(transcriptPath: string, outSummaryPath: string, model?: string): void {
  const hasSummarize = spawnSync('bash', ['-lc', 'command -v summarize >/dev/null 2>&1'], {
    stdio: 'ignore',
  }).status === 0;

  if (!hasSummarize) {
    const msg = `summarize CLI not found. Install it via brew (see skills/summarize) or run without --no-summary.`;
    writeFile(outSummaryPath, `# Summary\n\n${msg}\n`, 'utf8').catch(() => {});
    return;
  }

  const args = [transcriptPath, '--length', 'long'];
  if (model) args.push('--model', model);

  const res = spawnSync('summarize', args, { encoding: 'utf8' });
  if (res.status !== 0) {
    const stderr = (res.stderr || '').trim();
    writeFile(outSummaryPath, `# Summary\n\nFailed to summarize.\n\n\`\`\`\n${stderr || 'Unknown error'}\n\`\`\`\n`, 'utf8').catch(
      () => {},
    );
    return;
  }

  const text = (res.stdout || '').trim();
  void writeFile(outSummaryPath, `# Summary\n\n${text}\n`, 'utf8');
}

function makeResumeMarkdown(topic: string, transcriptRel: string, summaryRel: string): string {
  return `# Resume Context: ${topic}

## What this folder is

This is an archived conversation bundle so a fresh chat can be restarted without losing context.

## Files

- \`${transcriptRel}\`: full cleaned transcript (no tool/thinking)
- \`${summaryRel}\`: high-level summary (if available)

## How to pick up

1. Skim the summary.
2. Jump to the end of the transcript to see the latest decisions.
3. Start the next session with:
   - Goal: what we're trying to accomplish next
   - Constraints: what we must not do / assumptions
   - Next actions: 3–5 concrete steps

## Prompts that work well

- "Load the archived context from this folder and tell me: (1) decisions, (2) open questions, (3) next 5 steps."
- "Given this archived transcript, propose the next smallest shippable increment."
`;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printUsage();
    process.exit(0);
  }

  const topic = (args.topic as string | undefined) ?? 'conversation';
  const outDir = (args.outDir as string | undefined) ?? path.join(os.homedir(), 'clawd', 'archives');

  const sessionsDir = path.join(os.homedir(), '.clawdbot', 'agents', 'main', 'sessions');
  const sessionJsonl = (args.sessionJsonl as string | undefined) ?? (await findLatestSessionJsonl(sessionsDir));

  if (!existsSync(sessionJsonl)) {
    throw new Error(`Session JSONL not found: ${sessionJsonl}`);
  }

  const { md, firstTs, lastTs } = await buildTranscriptMarkdown(sessionJsonl);

  const date = (lastTs ?? firstTs ?? new Date().toISOString()).slice(0, 10);
  const sessionId = path.basename(sessionJsonl, '.jsonl');
  const bundleDir = path.join(outDir, topic, date, sessionId);

  await mkdir(bundleDir, { recursive: true });

  const transcriptPath = path.join(bundleDir, 'transcript.md');
  const summaryPath = path.join(bundleDir, 'summary.md');
  const resumePath = path.join(bundleDir, 'resume.md');

  await writeFile(transcriptPath, md, 'utf8');

  const shouldSummarize = args.summary !== false;
  if (shouldSummarize) {
    trySummarize(transcriptPath, summaryPath, args.model as string | undefined);
  } else {
    await writeFile(summaryPath, '# Summary\n\nSkipped (run without `--no-summary`).\n', 'utf8');
  }

  await writeFile(
    resumePath,
    makeResumeMarkdown(topic, path.basename(transcriptPath), path.basename(summaryPath)),
    'utf8',
  );

  // Convenience pointers for "resume" flows.
  // - latest.txt: human-friendly file containing the last bundle path
  // - index.json: machine-friendly map of topic -> last bundle path
  const topicRoot = path.join(outDir, topic);
  await mkdir(topicRoot, { recursive: true });
  await writeFile(path.join(topicRoot, 'latest.txt'), `${bundleDir}\n`, 'utf8');

  const indexPath = path.join(outDir, 'index.json');
  let index: Record<string, { latest: string; updatedAt: string }> = {};
  try {
    const raw = await readFile(indexPath, 'utf8');
    index = JSON.parse(raw) as Record<string, { latest: string; updatedAt: string }>;
  } catch {
    // ignore
  }
  index[topic] = { latest: bundleDir, updatedAt: new Date().toISOString() };
  await writeFile(indexPath, `${JSON.stringify(index, null, 2)}\n`, 'utf8');

  // eslint-disable-next-line no-console
  console.log(`Archived to ${bundleDir}`);
}

await main();

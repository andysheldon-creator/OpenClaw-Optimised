import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { randomUUID } from "node:crypto";

export const dynamic = "force-dynamic";

const WEB_CHAT_DIR = join(homedir(), ".openclaw", "web-chat");
const INDEX_FILE = join(WEB_CHAT_DIR, "index.json");

export type WebSessionMeta = {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  messageCount: number;
};

function ensureDir() {
  if (!existsSync(WEB_CHAT_DIR)) {
    mkdirSync(WEB_CHAT_DIR, { recursive: true });
  }
}

function readIndex(): WebSessionMeta[] {
  ensureDir();
  if (!existsSync(INDEX_FILE)) return [];
  try {
    return JSON.parse(readFileSync(INDEX_FILE, "utf-8"));
  } catch {
    return [];
  }
}

function writeIndex(sessions: WebSessionMeta[]) {
  ensureDir();
  writeFileSync(INDEX_FILE, JSON.stringify(sessions, null, 2));
}

/** GET /api/web-sessions — list all web chat sessions */
export async function GET() {
  const sessions = readIndex();
  return Response.json({ sessions });
}

/** POST /api/web-sessions — create a new web chat session */
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const id = randomUUID();
  const session: WebSessionMeta = {
    id,
    title: body.title || "New Chat",
    createdAt: Date.now(),
    updatedAt: Date.now(),
    messageCount: 0,
  };

  const sessions = readIndex();
  sessions.unshift(session);
  writeIndex(sessions);

  // Create empty .jsonl file
  ensureDir();
  writeFileSync(join(WEB_CHAT_DIR, `${id}.jsonl`), "");

  return Response.json({ session });
}

import {
  appendFileSync,
  readFileSync,
  writeFileSync,
  existsSync,
  mkdirSync,
} from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

export const dynamic = "force-dynamic";

const WEB_CHAT_DIR = join(homedir(), ".openclaw", "web-chat");
const INDEX_FILE = join(WEB_CHAT_DIR, "index.json");

type IndexEntry = {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  messageCount: number;
};

/** POST /api/web-sessions/[id]/messages — append messages to a session */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const filePath = join(WEB_CHAT_DIR, `${id}.jsonl`);

  // Auto-create the session file if it doesn't exist yet
  if (!existsSync(WEB_CHAT_DIR)) {
    mkdirSync(WEB_CHAT_DIR, { recursive: true });
  }
  if (!existsSync(filePath)) {
    writeFileSync(filePath, "");
  }

  const { messages, title } = await request.json();

  if (!Array.isArray(messages) || messages.length === 0) {
    return Response.json({ error: "messages array required" }, { status: 400 });
  }

  // Append each message as a JSONL line
  for (const msg of messages) {
    appendFileSync(filePath, JSON.stringify(msg) + "\n");
  }

  // Update index metadata
  try {
    if (existsSync(INDEX_FILE)) {
      const index: IndexEntry[] = JSON.parse(
        readFileSync(INDEX_FILE, "utf-8"),
      );
      const session = index.find((s) => s.id === id);
      if (session) {
        session.updatedAt = Date.now();
        session.messageCount += messages.length;
        if (title) session.title = title;
        writeFileSync(INDEX_FILE, JSON.stringify(index, null, 2));
      }
    }
  } catch {
    // index update is best-effort
  }

  return Response.json({ ok: true });
}

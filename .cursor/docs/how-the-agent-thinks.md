# How the OpenClaw Agent “Thinks” and Saves Memory

This doc explains how the agent can run a “first-time intro” flow (kenalan, setup cepat) and persist your preferences—without hallucination, based on the OpenClaw codebase and workspace templates.

## 1. Where the agent’s instructions come from

Each time the agent runs a turn, the **system prompt** is built from:

- Hard-coded sections (tools, safety, workspace path, etc.)
- **Workspace files** loaded from `~/.openclaw/workspace/` and injected as “Project Context”

Those workspace files are:

| File           | Purpose                                                                                                                                                                     |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `AGENTS.md`    | Operating manual: when to read SOUL/USER/memory, heartbeat behavior, safety, group chat rules.                                                                              |
| `SOUL.md`      | Who the agent is: persona, tone, style. “Embody this unless higher-priority instructions override.”                                                                         |
| `TOOLS.md`     | User guidance for external tools.                                                                                                                                           |
| `IDENTITY.md`  | Agent’s own record: name, creature, vibe, emoji (filled in during first run or when you “kenalan lagi”).                                                                    |
| `USER.md`      | **About the human**: name, what to call them, timezone, notes. Updated when you say “panggil aku Kibi”, “singkat”, “Indonesia”, “sepele eksekusi kompleks konfirmasi”, etc. |
| `HEARTBEAT.md` | Checklist for periodic wakeups (cron/heartbeat).                                                                                                                            |
| `BOOTSTRAP.md` | **First-run only.** “You just woke up. Who am I? Who are you?”—then update IDENTITY + USER, then delete this file.                                                          |
| `MEMORY.md`    | Long-term curated memory (main session only).                                                                                                                               |

They are loaded by `loadWorkspaceBootstrapFiles()` (see `src/agents/workspace.ts`), then passed as `contextFiles` into `buildAgentSystemPrompt()` in `src/agents/system-prompt.ts`. So the model literally sees the text of AGENTS.md, SOUL.md, USER.md, IDENTITY.md, and (if present) BOOTSTRAP.md in its system prompt.

## 2. Why the agent asks “like first time we met”

Two mechanisms:

- **If `BOOTSTRAP.md` exists**  
  The template (`docs/reference/templates/BOOTSTRAP.md`) tells the agent: you just woke up, there’s no memory yet; ask “Who am I? Who are you?”; learn name, creature, vibe, emoji; update `IDENTITY.md` and `USER.md`; when done, **delete BOOTSTRAP.md**.

- **If you ask to “kenalan lagi” / “tanyakan seperti pertama kali”**  
  BOOTSTRAP might already be deleted. Then the agent is following the **same flow from AGENTS.md + SOUL.md + IDENTITY.md + USER.md**: AGENTS.md says “read USER.md — this is who you’re helping” and “First Run: if BOOTSTRAP exists, follow it”. IDENTITY.md and USER.md are templates that say “fill this in during your first conversation” and “update this as you go”. So the model is instructed to (re)do a short intro: ask name, how to address you, style (singkat/detail), language, and when to execute vs confirm—then **write** what it learned into the workspace files.

So the “thinking” is: the model has been given instructions (injected workspace files) that tell it to run a first-time/intro flow and to persist the result by updating specific files.

## 3. How “memory” is actually saved

The agent does **not** have a separate “memory API”. It saves by **writing workspace files**:

- **USER.md** — Your name (e.g. Kibi), how to address you, timezone, and **notes** (e.g. “jawaban singkat”, “bahasa Indonesia”, “sepele langsung eksekusi, kompleks konfirmasi dulu”). Path: `~/.openclaw/workspace/USER.md`.
- **IDENTITY.md** — Agent’s own name, creature, vibe, emoji. Path: `~/.openclaw/workspace/IDENTITY.md`.

The model can write these because the agent has a **`write`** tool that writes files under the workspace directory. When running a turn, the agent receives a list of tools (read, write, edit, exec, message, cron, gateway, etc.); each tool has a **name**, **description**, and **parameters** (JSON schema). To persist USER.md, the model calls the **write** tool with a path like `USER.md` (or `IDENTITY.md`) and the new content. The tool is implemented with `createWriteTool(workspaceRoot)` from `@mariozechner/pi-coding-agent`, and `workspaceRoot` is the agent’s workspace dir (e.g. `~/.openclaw/workspace/`). So when Sabrina says “Sip, udah kesimpan”, she has (in that turn or a previous one) called **write** with path `USER.md` and content that includes your name, style, language, and execution preferences.  
**Note:** The Gateway also exposes `agents.files.set` (see `src/gateway/server-methods/agents.ts`) for **RPC clients** (e.g. Control UI editing agent files over the wire). The in-session agent does not use that; it uses the local **write** tool.

So:

- **“Simpan memori”** in this flow = the model **writes/overwrites `USER.md`** (and optionally `IDENTITY.md`) in `~/.openclaw/workspace/`.
- **“Clear my memory”** = the model can write empty or minimal content to `MEMORY.md` and delete or clear files in `memory/` if it has a tool that can do that (e.g. file write/delete in workspace). If a file in `memory/` stayed behind, the tool may have failed or not been called for that path.

## 4. End-to-end flow (what you saw)

1. You: “ok coba ulang lagi ya, tolong tanyakan aku seperti pertama kali kita kenalan”  
   → Model is following SOUL + AGENTS + USER/IDENTITY instructions to (re)run an intro flow.

2. Agent: “Hai, aku Sabrina. Boleh kenalan dulu—kamu mau aku panggil apa, dan biasanya kamu pengen aku bantu hal apa duluan?”  
   → Same style as BOOTSTRAP.md / first-run: ask who you are and what you want to be called.

3. You: “aku kibi” / “setup cepat” / “1. iya 2. singkat 3. indonesia 4. sepele eksekusi kompleks konfirmasi”  
   → Model interprets this as: name = Kibi, answer style = singkat, language = Indonesia, simple = execute, complex = confirm first.

4. Agent: “Sip, udah kesimpan”  
   → Model has (in that turn) called the **write** tool with path `USER.md` (and possibly `IDENTITY.md`) and the new content, which is written under `~/.openclaw/workspace/`.

5. Next sessions  
   → `loadWorkspaceBootstrapFiles()` loads the updated **USER.md** (and IDENTITY.md) into the system prompt, so the agent “remembers” you as Kibi and your preferences because it reads them from disk every time.

So the agent “thinks” by following the injected workspace instructions and “remembers” by reading and writing those same workspace files. No separate memory store is involved for this flow; it’s all files under `~/.openclaw/workspace/`.

## 5. Where the tool code lives and how the agent chooses the right tool

### Where tools are defined

- **Base file tools (read, write, edit):** From the npm package `@mariozechner/pi-coding-agent` (`codingTools`, `createReadTool`, `createWriteTool`, `createEditTool`). OpenClaw passes a **workspace root** so paths are relative to the agent workspace (see `src/agents/pi-tools.ts`: `createWriteTool(workspaceRoot)`, `createEditTool(workspaceRoot)`).
- **OpenClaw-specific tools:** Implemented under `src/agents/tools/`:
  - `gateway-tool.ts` — gateway (restart, config.get/apply/patch, update.run)
  - `message-tool.ts` — send messages to channels
  - `cron-tool.ts` — cron add/list/run
  - `sessions-*-tool.ts` — sessions_list, sessions_history, sessions_send, sessions_spawn
  - `session-status-tool.ts`, `agents-list-tool.ts`, `browser-tool.ts`, `canvas-tool.ts`, `nodes-tool.ts`, `memory-tool.ts`, `image-tool.ts`, `web-search`, `web-fetch`, `tts-tool.ts`, etc.
- **Tool list assembly:** `src/agents/pi-tools.ts` → `createOpenClawCodingTools()` builds the full list: base (read/write/edit/exec/process/apply*patch) + `createOpenClawTools()` from `src/agents/openclaw-tools.ts` (browser, canvas, nodes, cron, message, gateway, sessions*\*, agents_list, session_status, web_search, web_fetch, image). Policy (config, agent, group, sandbox) can **filter** which tools are allowed; the result is what the model sees.

### How the agent “chooses” a tool

1. **Tool list sent to the model:** Each tool has a **name** (e.g. `write`, `message`, `gateway`), a **description** (short text), and **parameters** (JSON schema). This list is passed in the API request (e.g. to Claude/OpenAI) as the available tools for that turn.
2. **System prompt:** The system prompt includes a “Tooling” section that lists tool names and short descriptions (from `toolSummaries` in `src/agents/system-prompt.ts`). So the model sees both the formal tool schema and a human-readable summary.
3. **Model decision:** The model picks a tool by matching the **task** to the **description** and **parameters**. For “save user preferences to USER.md”, the description for `write` (e.g. “Create or overwrite files”) and the parameter (path + content) lead it to call `write` with path `USER.md` and the preferences as content. It does not “search” the codebase; it uses the tool list and prompt it was given for that turn.

So: **tools live in** `src/agents/tools/*.ts` and (for read/write/edit) in `@mariozechner/pi-coding-agent`; **choice** is the model selecting from the tool list + descriptions + schema it receives each turn.

## 6. References in the repo

- Workspace file list and loading: `src/agents/workspace.ts` (`loadWorkspaceBootstrapFiles`, `DEFAULT_USER_FILENAME`, `DEFAULT_IDENTITY_FILENAME`, `DEFAULT_BOOTSTRAP_FILENAME`).
- System prompt and “Project Context”: `src/agents/system-prompt.ts` (e.g. `contextFiles`, “Workspace Files (injected)”, tool summaries).
- How context is resolved for a run: `src/auto-reply/reply/commands-context-report.ts` (`resolveBootstrapContextForRun`, `contextFiles: injectedFiles`).
- Tool assembly and write tool: `src/agents/pi-tools.ts` (`createOpenClawCodingTools`, `createWriteTool(workspaceRoot)`); OpenClaw tools: `src/agents/openclaw-tools.ts`.
- Gateway RPC file write (for UI/other clients): `src/gateway/server-methods/agents.ts` (`agents.files.set`, `ALLOWED_FILE_NAMES`).
- Templates: `docs/reference/templates/BOOTSTRAP.md`, `IDENTITY.md`, `USER.md`, `AGENTS.md`.

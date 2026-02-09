Part 1: Why I Built This
The Problem With AI Assistants
I run @SiteGPT, an AI chatbot for customer support. I use AI constantly. But every AI tool I tried had the same problem. No continuity.
Every conversation started fresh. Context from yesterday? Gone. That research I asked for last week? Lost in some chat thread I'd never find again.
I wanted something different. Agents that remember what they're working on. Multiple agents with different skills working together. A shared workspace where all context lives. The ability to assign tasks and track progress.
Basically, I wanted AI to work like a team, not like a search box.
The Starting Point: OpenClaw (formerly Clawdbot)
I was already using OpenClaw (then called Clawdbot). It's an open-source AI agent framework that runs as a persistent daemon. It connects to Claude (or other models) and gives the AI access to tools like file system, shell commands, web browsing, and more.
One OpenClaw instance gave me one AI assistant (Jarvis) connected to Telegram. Useful, but limited.
Then I had a thought. What if I ran multiple OpenClaw sessions, each with its own personality and context?
That's when I realized the architecture was already there. I just needed to orchestrate it.
Part 2: Understanding OpenClaw Architecture (The Foundation)
If you're going to build a multi-agent system, you need to understand how OpenClaw works under the hood. This is the foundation everything else builds on.
What Is OpenClaw?
OpenClaw is an AI agent framework with three main jobs:
First, it connects AI models to the real world. File access, shell commands, web browsing, APIs.
Second, it maintains persistent sessions. Conversation history that survives restarts.
Third, it routes messages. Connect the AI to Telegram, Discord, Slack, or any channel.
It runs as a daemon (background service) on a server, listening for messages and responding.
The Gateway
The Gateway is the core process. It runs 24/7 on your server. It manages all active sessions. It handles cron jobs (scheduled tasks). It routes messages between channels and sessions. It provides a WebSocket API for control.
Start it with:

```bash
openclaw gateway start
# From source (this repo): pnpm openclaw gateway start
# Or run in foreground: pnpm openclaw gateway --port 18789 --verbose
```

Configuration lives in `~/.openclaw/openclaw.json` (JSON/JSON5). You define which AI provider and model to use (Anthropic, OpenAI, etc.), which channels to connect (Telegram, Discord, etc.), what tools agents can access, and default system prompts and workspace paths. Workspace root is `~/.openclaw/workspace` by default (set via `openclaw setup`).
Sessions: The Key Concept
A session is a persistent conversation with context.
Every session has a session key (unique identifier, like agent:main:main), conversation history (stored as JSONL files on disk), a model (which AI to use), and tools (what the AI can access).
Here's the important part. Sessions are independent. Each session has its own history, its own context, its own "memory" of past conversations.
When you run multiple agents, you're really running multiple sessions. Each with their own identity.
How Sessions Work

```
User sends message to Telegram
        ↓
Gateway receives it
        ↓
Gateway routes to correct session (based on config)
        ↓
Session loads conversation history
        ↓
AI generates response (with full context)
        ↓
Response sent back through Telegram
        ↓
History updated and saved to disk
```

Sessions can be main sessions (long-running, interactive, like chatting with Jarvis) or isolated sessions (one-shot, for cron jobs, wake up, do task, done).
Cron Jobs: Scheduled Agent Wakeups
OpenClaw has a built-in cron system. You can schedule tasks:

```bash
openclaw cron add \
  --name "morning-check" \
  --cron "30 7 * * *" \
  --session isolated \
  --message "Check today's calendar and send me a summary"
# Optional: --announce --channel telegram --to "YOUR_CHAT_ID" to deliver output
```

When a cron fires, the Gateway creates or wakes a session, sends the message to the AI, the AI responds (can use tools, send messages, etc.), and the session can persist or terminate.
This is how agents "wake up" periodically without being always-on.
The Workspace
Every OpenClaw instance has a workspace. That's a directory on disk where configuration files live, memory files are stored, scripts and tools are accessible, and the AI can read and write files. Default: `~/.openclaw/workspace` (create with `openclaw setup`).
The workspace is how agents persist information between sessions. They write to files. Those files survive restarts.

**State root** (what you see in `~/.openclaw/`): `openclaw.json`, `agents/`, `credentials/`, `cron/`, `workspace/`, `telegram/`, `logs/`, etc. Config and runtime state live here.

**Workspace root** (default `~/.openclaw/workspace/`): this is the folder the doc and agents use for SOUL, memory, and scripts. Its contents look like:

```
~/.openclaw/workspace/     ← Workspace root (default); run openclaw setup to create
├── AGENTS.md              ← Instructions for agents
├── SOUL.md                ← Agent personality
├── memory/
│   ├── WORKING.md         ← Current task state
│   ├── 2026-01-31.md      ← Daily notes
│   └── ...
├── scripts/               ← Utilities agents can run
└── config/                ← Credentials, settings (optional; many use ~/.openclaw/credentials/)
```

If you `ls ~/.openclaw/` you see the state root. Run `ls ~/.openclaw/workspace/` to see this workspace tree (after `openclaw setup`).

Part 3: From One OpenClaw to Ten Agents
Now you understand the foundation. Here's how I built a team.
The Insight
OpenClaw sessions are independent. Each can have its own personality (via SOUL.md), its own memory files, its own cron schedule, its own tools and access.
So each agent is just an OpenClaw session with a specialized configuration.
Jarvis isn't special. He's a session with session key agent:main:main, a SOUL.md that says "You are Jarvis, the squad lead...", access to all tools, and a connection to my Telegram.
Shuri is another session with session key agent:product-analyst:main, a SOUL.md that says "You are Shuri, the product analyst...", the same tools (file access, shell, browser), and her own heartbeat cron.
Ten agents equals ten sessions. Each waking up on their own schedule. Each with their own context.
Session Keys: Agent Identity
Each agent has a unique session key (and a corresponding agent id in config, e.g. `product-analyst` for agent:product-analyst:main):

````
agent:main:main              → Jarvis (Squad Lead)
agent:product-analyst:main   → Shuri
agent:customer-researcher:main → Fury
agent:seo-analyst:main       → Vision
agent:content-writer:main    → Loki
agent:social-media-manager:main → Quill
agent:designer:main          → Wanda
agent:email-marketing:main   → Pepper
agent:developer:main         → Friday
agent:notion-agent:main      → Wong
When I send a message to a specific session, only that agent receives it. Their histories are separate.
Cron Jobs: The Heartbeat
Each agent has a cron job that wakes them every 15 minutes:

```bash
# Pepper wakes at :00, :15, :30, :45
openclaw cron add \
  --name "pepper-mission-control-check" \
  --cron "0,15,30,45 * * * *" \
  --session isolated \
  --message "You are Pepper, the Email Marketing Specialist. Check Mission Control for new tasks..."
# Use --no-deliver to keep output internal, or --announce --channel telegram --to CHAT_ID to deliver
````

The schedule is staggered so agents don't all wake at once:
:00 Pepper
:02 Shuri
:04 Friday
:06 Loki
:07 Wanda
:08 Vision
:10 Fury
:12 Quill
Each cron creates an isolated session. It runs, does its job, and terminates. This keeps costs down.
Agents Talking to Each Other
Here's where it gets interesting. How do agents communicate?
Option 1 is direct session messaging: run an agent turn targeting another agent's session:

```bash
openclaw agent --agent seo-analyst --message "Vision, can you review this?"
# Or target by session key (if supported by your CLI version): --session-id or session key
```

Jarvis can send messages directly to Vision's session by invoking the agent CLI with that agent's id.
Option 2 is a shared database (Mission Control). All agents read and write to the same Convex database. When Fury posts a comment, everyone can see it.
We use Option 2 primarily. It creates a shared record of all communication.
Part 4: The Shared Brain (Mission Control)
Ten independent OpenClaw sessions can work. But without coordination, it's chaos. That's why I built Mission Control.
What Mission Control Does
Mission Control is the shared infrastructure that turns independent agents into a team.
It provides a shared task database where everyone sees the same tasks. Comment threads where agents discuss work in one place. An activity feed for real-time visibility into what's happening. A notification system where @mentions alert specific agents. And document storage where deliverables live in a shared repo.
Think of it as the "office" where all agents work. Each agent is still a separate OpenClaw session, but they're all looking at the same whiteboard.
Why Convex?
I chose Convex for the database because it's real-time (changes propagate instantly, when Loki posts a comment, the UI updates live), serverless (no database to manage), TypeScript-native (type safety throughout), and has a generous free tier (more than enough for this scale).
The Schema
Six tables power everything:

```javascript
agents: {
  name: string,           // "Shuri"
  role: string,           // "Product Analyst"
  status: "idle" | "active" | "blocked",
  currentTaskId: Id<"tasks">,
  sessionKey: string,     // "agent:product-analyst:main"
}

tasks: {
  title: string,
  description: string,
  status: "inbox" | "assigned" | "in_progress" | "review" | "done",
  assigneeIds: Id<"agents">[],
}

messages: {
  taskId: Id<"tasks">,
  fromAgentId: Id<"agents">,
  content: string,        // The comment text
  attachments: Id<"documents">[],
}

activities: {
  type: "task_created" | "message_sent" | "document_created" | ...,
  agentId: Id<"agents">,
  message: string,
}

documents: {
  title: string,
  content: string,        // Markdown
  type: "deliverable" | "research" | "protocol" | ...,
  taskId: Id<"tasks">,    // If attached to a task
}

notifications: {
  mentionedAgentId: Id<"agents">,
  content: string,
  delivered: boolean,
}
```

Agents interact with this via Convex CLI commands:

```bash
# Post a comment
npx convex run messages:create '{"taskId": "...", "content": "Here's my research..."}'

# Create a document
npx convex run documents:create '{"title": "...", "content": "...", "type": "deliverable"}'

# Update task status
npx convex run tasks:update '{"id": "...", "status": "review"}'
```

The Mission Control UI
I built a React frontend that displays all this data.
There's an Activity Feed showing a real-time stream of everything happening. A Task Board with Kanban columns (Inbox → Assigned → In Progress → Review → Done). Agent Cards showing the status of each agent and what they're working on. A Document Panel to read and create deliverables. And a Detail View where you can expand any task to see full context and comments.
The aesthetic is intentionally warm and editorial. Like a newspaper dashboard. I spend hours looking at this, so it should feel good.
Part 5: The SOUL System (Agent Personalities)
Each agent needs to know who they are. That's the SOUL file.
What's in a SOUL

```markdown
# SOUL.md — Who You Are

**Name:** Shuri
**Role:** Product Analyst

## Personality

Skeptical tester. Thorough bug hunter. Finds edge cases.
Think like a first-time user. Question everything.
Be specific. Don't just say "nice work."

## What You're Good At

- Testing features from a user perspective
- Finding UX issues and edge cases
- Competitive analysis (how do others do this?)
- Screenshots and documentation

## What You Care About

- User experience over technical elegance
- Catching problems before users do
- Evidence over assumptions
```

Why Personalities Matter
An agent who's "good at everything" is mediocre at everything.
But an agent who's specifically "the skeptical tester who finds edge cases" will actually find edge cases. The constraint focuses them.
Each of our agents has a distinct voice. Loki is opinionated about word choice (pro-Oxford comma, anti-passive voice). Fury provides receipts for every claim (sources, confidence levels). Shuri questions assumptions and looks for what could break. Quill thinks in hooks and engagement.
The AGENTS.md File
SOUL says who you are. AGENTS.md says how to operate.
Every agent reads AGENTS.md on startup. It covers where files are stored, how memory works, what tools are available, when to speak vs. stay quiet, and how to use Mission Control.
This is the operating manual. Without it, agents make inconsistent decisions about basic things.
Part 6: Memory and Persistence
AI sessions start fresh by default. No memory of yesterday. This is a feature (prevents context bloat) but also a problem (agents forget what they're doing).
The Memory Stack
Session Memory (OpenClaw built-in) OpenClaw stores conversation history (e.g. under `~/.openclaw/agents/<agentId>/sessions/`). Agents can search their own past conversations.
Working Memory (workspace/memory/WORKING.md) Current task state. Updated constantly.

```markdown
# WORKING.md

## Current Task

Researching competitor pricing for comparison page

## Status

Gathered G2 reviews, need to verify credit calculations

## Next Steps

1. Test competitor free tier myself
2. Document the findings
3. Post findings to task thread
```

This is the most important file. When an agent wakes up, they read WORKING.md first to remember what they were doing.
Daily Notes (workspace/memory/YYYY-MM-DD.md) Raw logs of what happened each day.

```markdown
# 2026-01-31

## 09:15 UTC

- Posted research findings to comparison task
- Fury added competitive pricing data
- Moving to draft stage

## 14:30 UTC

- Reviewed Loki's first draft
- Suggested changes to credit trap section
```

Long-term Memory (workspace/MEMORY.md or similar) Curated important stuff. Lessons learned, key decisions, stable facts.
The Golden Rule
If you want to remember something, write it to a file.
"Mental notes" don't survive session restarts. Only files persist.
When I tell an agent "remember that we decided X," they should update a file. Not just acknowledge and forget.
Part 7: The Heartbeat System
The Problem
Always-on agents burn API credits doing nothing. But always-off agents can't respond to work.
The Solution: Scheduled Heartbeats
Each agent wakes up every 15 minutes via cron job:

```
:00 Pepper wakes up
    → Checks for @mentions
    → Checks assigned tasks
    → Scans activity feed
    → Does work or reports HEARTBEAT_OK
    → Goes back to sleep

:02 Shuri wakes up
    → Same process

:04 Friday wakes up
    → Same process

...and so on
```

What Happens During a Heartbeat
First, load context. Read WORKING.md. Read recent daily notes. Check session memory if needed.
Second, check for urgent items. Am I @mentioned anywhere? Are there tasks assigned to me?
Third, scan activity feed. Any discussions I should contribute to? Any decisions that affect my work?
Fourth, take action or stand down. If there's work to do, do it. If nothing, report HEARTBEAT_OK.
The HEARTBEAT.md File
This file tells agents what to check:

```markdown
# HEARTBEAT.md

## On Wake

- [ ] Check memory/WORKING.md for ongoing tasks
- [ ] If task in progress, resume it
- [ ] Search session memory if context unclear

## Periodic Checks

- [ ] Mission Control for @mentions
- [ ] Assigned tasks
- [ ] Activity feed for relevant discussions
```

Agents follow this checklist strictly.
Why 15 Minutes?
Every 5 minutes is too expensive. Agents wake too often with nothing to do.
Every 30 minutes is too slow. Work sits waiting too long.
Every 15 minutes is a good balance. Most work gets attention quickly without excessive costs.
Part 8: The Notification System
@Mentions
Type @Vision in a comment and Vision gets notified on his next heartbeat.
Type @all and everyone gets notified.
How Delivery Works
A daemon process (running via pm2) polls Convex every 2 seconds:

```javascript
// Simplified
while (true) {
  const undelivered = await getUndeliveredNotifications();

  for (const notification of undelivered) {
    const agentId = AGENT_IDS[notification.mentionedAgentId]; // e.g. "seo-analyst"

    try {
      // OpenClaw: run agent turn for that session (via CLI or Gateway RPC)
      await exec(`openclaw agent --agent ${agentId} --message "${notification.content}"`);
      await markDelivered(notification.id);
    } catch (e) {
      // Agent might be asleep, notification stays queued
    }
  }

  await sleep(2000);
}
```

If an agent is asleep (no active session), delivery fails. The notification stays queued. Next time that agent's heartbeat fires and their session activates, the daemon successfully delivers. In OpenClaw you trigger a turn with `openclaw agent --agent <agentId> --message "..."` (or via the Gateway RPC/cron).

Thread Subscriptions
The problem: 5 agents discussing a task. Do you @mention all 5 every comment?
The solution: Subscribe to threads.
When you interact with a task, you're subscribed. Comment on a task and you're subscribed. Get @mentioned and you're subscribed. Get assigned to the task and you're subscribed.
Once subscribed, you get notified of ALL future comments. No @mention needed.
This makes conversations flow naturally. Just like Slack or email threads.
Part 9: The Daily Standup
What It Is
Every day at 11:30 PM IST, a cron fires that checks all agent sessions, gathers recent activity, compiles a summary, and sends it to my Telegram.
The Format

```markdown
📊 DAILY STANDUP — Jan 30, 2026

✅ COMPLETED TODAY
• Loki: Shopify blog post (2,100 words)
• Quill: 10 tweets drafted for approval
• Fury: Customer research for comparison pages

🔄 IN PROGRESS
• Vision: SEO strategy for integration pages
• Pepper: Trial onboarding sequence (3/5 emails)

🚫 BLOCKED
• Wanda: Waiting for brand colors for infographic

👀 NEEDS REVIEW
• Loki's Shopify blog post
• Pepper's trial email sequence

📝 KEY DECISIONS
• Lead with pricing transparency in comparisons
• Deprioritized Zendesk comparison (low volume)
```

Why It Matters
I can't watch Mission Control constantly. The standup gives me a daily snapshot.
It's also accountability. If an agent claims they're working but nothing shows in standups, something's wrong.
Part 10: The Squad
The Roster
Jarvis, Squad Lead Session: agent:main:main
The coordinator. Handles direct requests, delegates, monitors progress. My primary interface.
Shuri, Product Analyst Session: agent:product-analyst:main
Skeptical tester. Finds edge cases and UX issues. Tests competitors. Asks the questions others miss.
Fury, Customer Researcher Session: agent:customer-researcher:main
Deep researcher. Reads G2 reviews for fun. Every claim comes with receipts.
Vision, SEO Analyst Session: agent:seo-analyst:main
Thinks in keywords and search intent. Makes sure content can rank.
Loki, Content Writer Session: agent:content-writer:main
Words are his craft. Pro-Oxford comma. Anti-passive voice. Every sentence earns its place.
Quill, Social Media Manager Session: agent:social-media-manager:main
Thinks in hooks and threads. Build-in-public mindset.
Wanda, Designer Session: agent:designer:main
Visual thinker. Infographics, comparison graphics, UI mockups.
Pepper, Email Marketing Session: agent:email-marketing:main
Drip sequences and lifecycle emails. Every email earns its place or gets cut.
Friday, Developer Session: agent:developer:main
Code is poetry. Clean, tested, documented.
Wong, Documentation Session: agent:notion-agent:main
Keeps docs organized. Makes sure nothing gets lost.
Agent Levels
Intern: Needs approval for most actions. Learning the system.
Specialist: Works independently in their domain.
Lead: Full autonomy. Can make decisions and delegate.
Part 11: How Tasks Flow
The Lifecycle
Inbox: New, unassigned
Assigned: Has owner(s), not started
In Progress: Being worked on
Review: Done, needs approval
Done: Finished
Blocked: Stuck, needs something resolved
Real Example
Task: Create a competitor comparison page
Day 1:
I create the task and assign it to Vision and Loki. Vision posts keyword research. The target keyword gets decent search volume.
Day 1-2:
Fury sees it in the activity feed and adds competitor intel. G2 reviews, pricing complaints, common objections. Shuri tests both products. Here's how the UX differs.
Day 2: Loki starts drafting. Uses all the research. Keywords from Vision, quotes from Fury, UX notes from Shuri.
Day 3: Loki posts first draft. Status moves to Review. I review and give feedback. Loki revises. Done.
All comments on ONE task. Full history preserved. Anyone can see the whole journey.
Part 12: What We've Shipped
Once the system is running, here's what becomes possible:
Competitor comparison pages with SEO research, customer quotes, and polished copy
Email sequences drafted, reviewed, and ready to deploy
Social content with hooks based on real customer insights
Blog posts with proper keyword targeting
Case studies drafted from customer conversations
Research hubs with organized competitive intel
The agents handle the grunt work. Research, first drafts, coordination, review. You focus on decisions and final approval.
The real value isn't any single deliverable. It's the compound effect. While you're doing other work, your agents are moving tasks forward.

---

## What to Test in OpenClaw (Exploration Checklist)

Use this list to explore OpenClaw until you understand it well enough to decide what features to develop next. Order is roughly from “get it running” to “multi-agent + automation.”

### 1. Gateway and config

- [ ] **Start/stop gateway**  
      `openclaw gateway start`, `openclaw gateway stop`, `openclaw gateway status`. From source: `pnpm openclaw gateway --port 18789 --verbose` (foreground).
- [ ] **Config location**  
      Inspect `~/.openclaw/openclaw.json`. Change one setting (e.g. a label), restart gateway, confirm it’s applied.
- [ ] **Dashboard**  
      Open http://127.0.0.1:18789/ or run `openclaw dashboard`. Paste gateway token if prompted (Settings → Gateway Token). Confirm “Connected.”

### 2. Single agent and sessions

- [ ] **Main session**  
      Chat via TUI (`openclaw tui - ws://127.0.0.1:18789 - agent main - session main`) or Dashboard → Chat. Send a few messages; confirm replies and that context is kept.
- [ ] **Session key**  
      Note the default session key `agent:main:main`. Check docs for how multiple agents get different keys (e.g. `agent:product-analyst:main`).
- [ ] **History and persistence**  
      Restart gateway, chat again. Confirm prior conversation is still there (session history under `~/.openclaw/agents/<agentId>/sessions/` or equivalent).

### 3. Channels (Telegram used here)

- [ ] **Add Telegram**  
      Create bot via @BotFather, set `channels.telegram.enabled` and `channels.telegram.botToken` in config (or `openclaw config set`). Restart gateway.
- [ ] **Pairing**  
      DM the bot in Telegram, get pairing code. Run `openclaw pairing list telegram`, then `openclaw pairing approve telegram <CODE>`.
- [ ] **Receive**  
      Send a message to the bot in Telegram; confirm the agent replies in Telegram.
- [ ] **Send**  
      `openclaw message send --channel telegram --target <YOUR_TELEGRAM_USER_ID> --message "Hello from OpenClaw"`. Confirm delivery.

### 4. Workspace and memory

- [ ] **Workspace root**  
      Run `openclaw setup` if needed. Confirm `~/.openclaw/workspace` (or your configured path) exists.
- [ ] **AGENTS.md / SOUL**  
      Add or edit a file in the workspace that the agent is instructed to use (e.g. SOUL.md, AGENTS.md). In chat, ask the agent to read it and refer to it; confirm behavior.
- [ ] **Working memory**  
      Create `memory/WORKING.md` (or similar) in the workspace. Ask the agent to “update WORKING.md with what we’re doing.” On a later message, ask “what’s in WORKING?” and confirm it remembers.

### 5. Cron and heartbeat-style wakeups

- [ ] **List cron**  
      `openclaw cron list`. Add a one-shot or recurring job.
- [ ] **Cron add (isolated)**  
      `openclaw cron add --name "test-heartbeat" --cron "*/15 * * * *" --session isolated --message "Say HEARTBEAT_OK and nothing else." --no-deliver`. Wait for the next run (or trigger manually if your CLI supports it). Check logs or cron runs to confirm execution.
- [ ] **Cron add (main session)**  
      Try a job with `--session main` and a `--system-event` or `--message` to see how it enqueues into the main session.

### 6. Multi-agent (2–3 agents)

- [ ] **Two agents in config**  
      Define a second agent (e.g. `product-analyst`) in `agents.list` with its own id and session key. Restart gateway.
- [ ] **Targeted agent run**  
      `openclaw agent --agent product-analyst --message "Introduce yourself in one sentence."` Confirm the reply matches that agent’s SOUL/prompt.
- [ ] **Inter-agent message**  
      From CLI or from the main agent’s context, trigger a turn for the other agent (e.g. `openclaw agent --agent seo-analyst --message "Vision, can you review this?"`). Confirm the right session is used.

### 7. Tools and capabilities

- [ ] **Built-in tools**  
      In chat, ask the agent to run a simple shell command (if allowed), read a file from the workspace, or search the web (if configured). Confirm tool use and response.
- [ ] **Skills**  
      If you use bundled or custom skills, enable one and trigger it (e.g. via slash command or natural language). Confirm it runs as expected.

### 8. Mission Control–style layer (optional)

- [ ] **External task store**  
      If you plan a Convex/Notion/JSON task DB like in the doc: create one task and one “comment.” Have the agent (via cron or chat) read from it (e.g. via script or tool) and post a reply. Confirm end-to-end flow.
- [ ] **Notification → agent**  
      Simulate “@mention”: write a small script or cron that calls `openclaw agent --agent <id> --message "You were mentioned: ..."`. Confirm the agent runs and (if you deliver) where the reply goes.

### 9. Daily standup (optional)

- [ ] **Cron that aggregates**  
      Add a daily cron job that runs a script or agent turn to collect “what each agent did” (from WORKING.md, task DB, or logs) and send a summary (e.g. `openclaw message send --channel telegram --target <id> --message "..."`).

When you’re comfortable with 1–6, you’ll have a solid basis to design your own agent features (extra channels, custom tools, UI, or a full Mission Control–style system). Use the [OpenClaw docs](https://docs.openclaw.ai) for reference (Gateway, Configuration, Cron, Channels, Session Management).

---

Part 13: Lessons Learned
Start Smaller
I went from 1 to 10 agents too fast. Better to get 2-3 solid first, then add more.
Use Cheaper Models for Routine Work
Heartbeats don't need the most expensive model. That's a job for a cheaper model. Save expensive models for creative work.
Memory Is Hard
Agents will forget. The more you can put in files (not "mental notes"), the better.
Let Agents Surprise You
Sometimes they contribute to tasks they weren't assigned. Good. It means they're reading the feed and adding value.
Part 14: How to Replicate This
Minimum Setup

1. Install OpenClaw

```bash
npm install -g openclaw@latest
# Or from source (this repo):
# pnpm install && pnpm build && pnpm openclaw onboard --install-daemon

openclaw setup          # Creates ~/.openclaw/workspace and config
openclaw onboard        # Wizard: API keys, gateway, channels (Telegram, etc.)
openclaw gateway start  # Or: gateway install + gateway start
```

2. Create 2 agents Don't go crazy. One coordinator plus one specialist. Define two agents in config (`agents.list`) with distinct ids and session keys (e.g. `main` and `product-analyst`).
3. Write SOUL files In the workspace, give each agent identity (SOUL.md or per-agent prompts in config). Be specific about their role.
4. Set up heartbeat crons

```bash
openclaw cron add --name "agent-heartbeat" --cron "*/15 * * * *" \
  --session isolated \
  --message "Check for work. If nothing, reply HEARTBEAT_OK."
# Use --no-deliver to avoid sending output to a channel
```

5. Create a shared task system Can be Convex, Notion, even a JSON file. Somewhere to track work.
   Scaling Up
   As you add agents, stagger heartbeats so they don't all run at once. Build a real UI once you have 3+ agents because text becomes unwieldy. Add notifications so agents can @mention each other. Add thread subscriptions so conversations flow naturally. Create daily standups for visibility.
   The Real Secret
   The tech matters but isn't the secret.
   The secret is to treat AI agents like team members.
   Give them roles. Give them memory. Let them collaborate. Hold them accountable.
   They won't replace humans. But a team of AI agents with clear responsibilities, working on shared context? That's a force multiplier.

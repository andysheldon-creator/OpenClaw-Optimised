# OpenClaw-Optimised — User Guide

Your complete guide to setting up, configuring, and getting the most from OpenClaw-Optimised.

---

# Part 1: Core Setup

Everything you need to get your AI assistant running and talking to you on at least one platform.

---

## What is OpenClaw-Optimised?

OpenClaw-Optimised is a fork of Clawdis — an AI assistant gateway that connects Claude (Anthropic's LLM) to your messaging apps. You message it on WhatsApp, Telegram, Discord, Signal, or iMessage, and it messages you back. It runs on your own machine, keeps your data local, and remembers your conversations.

This optimised fork adds:
- **Cost savings** — hybrid routing sends simple queries to free local models (Ollama), saving 40-50% on API costs
- **Board of Directors** — six specialised AI agents instead of one generalist (Research, Finance, Content, Strategy, Critic + a General orchestrator)
- **Autonomous tasks** — the assistant can work on long-running projects in the background
- **Voice calls** — talk to your assistant via ElevenLabs voice AI
- **Crash alerting** — get notified on Telegram/Discord/WhatsApp if the service goes down
- **Budget caps** — set monthly spending limits so you never get a surprise bill

---

## Prerequisites

Before you start, make sure you have:

| Requirement | Why you need it | How to check |
|-------------|----------------|--------------|
| **Node.js >= 22** | Runs the application | `node --version` |
| **pnpm** | Package manager | `pnpm --version` (install: `npm install -g pnpm`) |
| **Anthropic account** | Powers the AI (Claude Pro/Max subscription OR API key) | [console.anthropic.com](https://console.anthropic.com) |
| **Git** | Clone the repository | `git --version` |

**Optional but recommended:**
- **Ollama** — free local LLM for cost savings → [ollama.com](https://ollama.com)
- **Telegram Bot** — if you want to use Telegram → [@BotFather](https://t.me/BotFather)

---

## Step 1: Install from Source

```bash
# Clone the repository
git clone https://github.com/YOUR-ORG/OpenClaw-Optimised.git
cd OpenClaw-Optimised

# Install dependencies
pnpm install

# Build
pnpm build
```

After build completes, you have a working CLI at `pnpm clawdis`.

---

## Step 2: Run the Setup Wizard

The setup wizard walks you through everything. Run it:

```bash
pnpm clawdis configure
```

You will see a checklist of sections to configure. Use space to select/deselect, then Enter to proceed. Here is what each core section does:

### Workspace

**What it is:** A folder on your machine where the assistant stores its personality, tools, memories, and skills. Think of it as the assistant's "home directory".

**Default location:** `~/clawd` (or `~/.clawdis/workspace`)

**What happens:** The wizard creates this folder and populates it with:
- `SOUL.md` — the assistant's personality (you can edit this to change how it talks)
- `AGENTS.md` — what tools/capabilities the assistant has access to
- Memories, session transcripts, and skill files

**You should:** Accept the default unless you have a specific reason to change it.

### Model / Auth

**What it is:** How the assistant connects to Claude (the AI brain).

**Options:**

| Option | What it means | Best for |
|--------|--------------|----------|
| **Anthropic OAuth (Pro/Max)** | Links your Claude Pro or Max subscription. Opens browser for login. | Personal use with existing Claude subscription |
| **Google Antigravity** | Uses Google's model offerings (Sonnet, Opus 4.5, Gemini 3) | Google Cloud users |
| **Anthropic API Key** | Uses a pay-per-use API key from console.anthropic.com | Developers, teams, or if you want granular billing |
| **Minimax M2.1 (LM Studio)** | Local model via LM Studio | Fully offline/local setup |
| **Skip** | Configure later | If you are not sure yet |

**You should:** Pick Anthropic OAuth if you have a Claude Pro/Max subscription. Pick API Key if you are on a team or want pay-per-use billing.

### Gateway

**What it is:** The gateway is the central server that bridges your messaging apps to the AI. All messages flow through it. It runs a WebSocket server on a single port.

**Settings:**

| Setting | What it means | Default |
|---------|--------------|---------|
| **Port** | Which port the gateway listens on | `18789` |
| **Bind** | Who can connect — `loopback` (only this machine), `lan` (any device on your network), `tailnet` (Tailscale VPN), `auto` | `loopback` |
| **Auth** | Security — `off` (localhost only), `token` (shared secret), `password` (user/pass) | `off` for loopback, `password` for LAN/tailnet |

**You should:**
- If running on your own laptop for personal use → keep `loopback` with auth `off`
- If you want to access from your phone on the same Wi-Fi → use `lan` with `password`
- If you want access from anywhere via Tailscale → use `tailnet` with `password`

### Daemon

**What it is:** Installs the gateway as a background service so it starts automatically and stays running even after you close the terminal.

**Options:** Install / Restart / Skip

**You should:** Install it. This means the gateway runs in the background at all times, so your messaging bots stay connected 24/7.

### Providers (Platforms)

**What it is:** Which messaging apps to connect. The wizard collects the credentials for each platform you select.

Available platforms:
- **WhatsApp** — QR code pairing (no API key needed)
- **Telegram** — Bot token from @BotFather
- **Discord** — Bot token from Discord Developer Portal
- **Signal** — Requires signal-cli installed
- **iMessage** — macOS only, requires imsg CLI

See Part 2 for detailed setup instructions for each platform.

### Skills

**What it is:** Skills are tools and capabilities the assistant can use — things like web search, code execution, file management, calendar access, etc.

**Settings:**
- **Bundled skills** — which built-in skills to enable
- **Extra directories** — folders containing custom skills you have written
- **Install preferences** — which package manager to use for skill dependencies (npm, pnpm, yarn, bun, or Homebrew)

**You should:** Accept the defaults to start. You can add custom skills later.

---

## Step 3: Connect Your First Platform

The quickest way to test is **WhatsApp** (no API key needed) or **Telegram** (just a bot token).

### Option A: WhatsApp (Easiest)

```bash
pnpm clawdis login
```

1. A QR code appears in your terminal
2. Open WhatsApp on your phone → Settings → Linked Devices → Link a Device
3. Scan the QR code
4. Done — message the linked number and the assistant will reply

### Option B: Telegram

1. Open Telegram and message [@BotFather](https://t.me/BotFather)
2. Send `/newbot`, follow the prompts, and copy the bot token
3. Run `pnpm clawdis configure`, select "Providers", choose Telegram, paste the token
4. Start the gateway: `pnpm clawdis gateway`
5. Message your bot on Telegram — it will reply

---

## Step 4: Start the Gateway

If you installed the daemon, it is already running. Otherwise:

```bash
# Start the gateway (stays in foreground)
pnpm clawdis gateway

# Or in watch mode for development (auto-restarts on code changes)
pnpm gateway:watch
```

---

## Step 5: Verify It Works

Send a message to your connected platform. You should get a reply within a few seconds. If not:

```bash
# Check system health
pnpm clawdis health

# Check logs
pnpm clawdis logs
```

---

## Where Things Live

| What | Location |
|------|----------|
| Config file | `~/.clawdis/clawdis.json` |
| Workspace (personality, skills, memories) | `~/clawd` (or whatever you set) |
| Session transcripts | `~/.clawdis/sessions/` |
| Task data | `~/.clawdis/tasks/` |
| Logs | `~/.clawdis/logs/` |

You can edit `~/.clawdis/clawdis.json` directly — it is standard JSON. Or re-run `pnpm clawdis configure` to update settings through the wizard.

---

# Part 2: Additional Features

Each feature below is optional. They are listed roughly in order of "most people want this" to "power user stuff". For each one: what it does, what you need, and how to set it up.

---

## 1. Telegram

**What it does for you:** Lets you message your AI assistant through a Telegram bot. Supports private chats, group chats (with @mention filtering), media, and forum topics for the Board of Directors.

**What you need:** A Telegram bot token from [@BotFather](https://t.me/BotFather).

**Setup:**

1. Open Telegram, message `@BotFather`
2. Send `/newbot`
3. Choose a name and username for your bot
4. Copy the bot token (looks like `123456789:ABCdefGHIjklMNOpqrsTUVwxyz`)
5. Run `pnpm clawdis configure` → select "Providers" → Telegram → paste token
6. Restart the gateway

**Key config (`~/.clawdis/clawdis.json`):**

```json
{
  "telegram": {
    "enabled": true,
    "botToken": "123456789:ABCdefGHIjklMNOpqrsTUVwxyz",
    "replyToMode": "first",
    "textChunkLimit": 4000,
    "allowFrom": [],
    "groups": {
      "-1001234567890": { "requireMention": true }
    }
  }
}
```

**Settings explained:**
- `replyToMode` — `"off"` (no threading), `"first"` (reply to the user's message), `"all"` (reply to every chunk)
- `allowFrom` — empty array means everyone can message the bot. Add user IDs or chat IDs to restrict access.
- `groups` — per-group settings. `requireMention: true` means the bot only responds when @mentioned in groups.

---

## 2. WhatsApp

**What it does for you:** Connects the assistant to WhatsApp. You can message it from your phone like any other contact.

**What you need:** A WhatsApp account. No API key or business account needed — uses the web pairing protocol.

**Setup:**

1. Run `pnpm clawdis login`
2. Scan the QR code with WhatsApp (Settings → Linked Devices → Link a Device)
3. Credentials are saved automatically for future sessions

**Key config:**

```json
{
  "whatsapp": {
    "allowFrom": ["+447700900000"],
    "textChunkLimit": 4000,
    "groups": {
      "group-id-here": { "requireMention": true }
    }
  }
}
```

**Settings explained:**
- `allowFrom` — phone numbers in E.164 format that are allowed to message the bot. Empty = everyone.
- `textChunkLimit` — maximum characters per message chunk (WhatsApp has a 64K limit but 4000 is readable).

---

## 3. Discord

**What it does for you:** Adds an AI bot to your Discord server. Supports DMs, channel messages, slash commands, reactions, threads, and granular per-channel/per-guild configuration.

**What you need:** A Discord bot token from the [Discord Developer Portal](https://discord.com/developers/applications).

**Setup:**

1. Go to [Discord Developer Portal](https://discord.com/developers/applications) → New Application
2. Go to Bot → Create Bot → copy the token
3. Under OAuth2 → URL Generator, select `bot` scope with permissions: Send Messages, Read Message History, Add Reactions, Manage Threads
4. Use the generated URL to invite the bot to your server
5. Run `pnpm clawdis configure` → select "Providers" → Discord → paste token
6. Restart the gateway

**Key config:**

```json
{
  "discord": {
    "enabled": true,
    "token": "your-bot-token",
    "textChunkLimit": 2000,
    "replyToMode": "first",
    "dm": { "enabled": true },
    "slashCommand": {
      "enabled": false,
      "name": "clawd",
      "ephemeral": true
    },
    "guilds": {
      "your-guild-id": {
        "requireMention": true,
        "channels": {
          "specific-channel-id": { "allow": true, "requireMention": false }
        }
      }
    }
  }
}
```

**Settings explained:**
- `dm.enabled` — whether the bot responds to direct messages
- `slashCommand` — register a `/clawd` slash command for ephemeral (private) replies
- `guilds` — per-server config. Set `requireMention: true` so the bot only replies when @mentioned
- `actions` — granular tool gating: enable/disable reactions, moderation, pins, threads, etc.

---

## 4. Signal

**What it does for you:** Connects the assistant to Signal for end-to-end encrypted messaging.

**What you need:**
- `signal-cli` installed and registered to a phone number
- signal-cli running in HTTP daemon mode

**Setup:**

1. Install signal-cli: see [signal-cli docs](https://github.com/AsamK/signal-cli)
2. Register or link a phone number: `signal-cli -a +447700900000 register`
3. Run `pnpm clawdis configure` → select "Providers" → Signal → enter your account number
4. The gateway will auto-start signal-cli in HTTP mode (or connect to an existing instance)

**Key config:**

```json
{
  "signal": {
    "enabled": true,
    "account": "+447700900000",
    "httpHost": "127.0.0.1",
    "httpPort": 8080,
    "cliPath": "signal-cli",
    "autoStart": true,
    "allowFrom": [],
    "textChunkLimit": 4000
  }
}
```

---

## 5. iMessage (macOS Only)

**What it does for you:** Connects the assistant to iMessage so you can message it from any Apple device.

**What you need:**
- macOS
- `imsg` CLI tool installed

**Setup:**

1. Install the `imsg` CLI tool
2. Run `pnpm clawdis configure` → select "Providers" → iMessage
3. The assistant will monitor incoming iMessages and reply

**Key config:**

```json
{
  "imessage": {
    "enabled": true,
    "cliPath": "imsg",
    "service": "imessage",
    "allowFrom": [],
    "textChunkLimit": 4000
  }
}
```

---

## 6. Hybrid LLM Routing (Ollama) — Full Install Guide

**What it does for you:** Saves you money — significantly. Instead of sending every message to the paid Anthropic API, OpenClaw-Optimised scores each incoming query for complexity and routes simple ones to a free local model running on your own machine via Ollama. Complex queries still go to Claude. In practice, this saves **40-50% on API costs** with no noticeable quality drop on the queries that get handled locally.

**How the routing works under the hood:**

OpenClaw-Optimised uses a 6-tier routing system. Each incoming message gets a complexity score (0-1) and is classified by task type (greeting, math, coding, reasoning, etc.), then routed to the cheapest model that can handle it:

| Tier | Model | Cost | Handles |
|------|-------|------|---------|
| 1. LOCAL | No LLM needed | Free | Time/date queries, basic math, canned responses |
| 2. OLLAMA_CHAT | `llama3.1:8b` (local) | Free | Greetings, simple facts, translations, casual chat |
| 3. OLLAMA_VISION | `llava:7b` (local) | Free | Image descriptions, screenshot analysis |
| 4. CLAUDE_HAIKU | Claude Haiku (API) | $$ | Medium complexity, structured outputs |
| 5. CLAUDE_SONNET | Claude Sonnet (API) | $$$ | Complex reasoning, code generation |
| 6. CLAUDE_OPUS | Claude Opus (API) | $$$$ | Maximum reasoning, multi-step analysis |

Tiers 1-3 are completely free because they run on your hardware. The system automatically escalates to paid tiers only when it needs to.

### Step-by-Step Ollama Installation

#### Windows

**Option A: Installer (Recommended)**

1. Go to [ollama.com/download/windows](https://ollama.com/download/windows)
2. Download `OllamaSetup.exe`
3. Run the installer — it does not require administrator rights
4. Ollama installs and starts running in the background automatically
5. Verify it is running — open PowerShell or Command Prompt and run:
   ```
   ollama --version
   ```
   You should see a version number like `0.6.x` or later.

**Option B: Via winget**

```powershell
winget install --id Ollama.Ollama
```

#### macOS

```bash
# Option A: Direct download
# Go to https://ollama.com/download/mac and install the .dmg

# Option B: Homebrew
brew install ollama
```

#### Linux

```bash
curl -fsSL https://ollama.com/install.sh | sh
```

### Pull the Required Models

OpenClaw-Optimised uses **three specific models** for different purposes. You need all three for full functionality:

```bash
# 1. CHAT MODEL — handles simple conversations, greetings, basic questions
#    This is the workhorse that saves you the most money
#    Size: ~4.7 GB download, runs on 8GB+ RAM
ollama pull llama3.1:8b

# 2. EMBEDDING MODEL — powers RAG (semantic memory search)
#    Converts text into vectors for finding relevant past conversations
#    Size: ~274 MB download, very lightweight
ollama pull nomic-embed-text

# 3. VISION MODEL — analyses images sent to the assistant
#    Handles screenshots, photos, diagrams without using paid API
#    Size: ~4.7 GB download, needs 8GB+ RAM
ollama pull llava:7b
```

**Total download: ~9.7 GB** (one-time download, stored locally)

**Hardware note:** You need at least **8 GB of RAM** to run the chat and vision models. 16 GB is recommended if you want to run both concurrently. If you have a dedicated GPU (NVIDIA with CUDA, or Apple Silicon), inference will be significantly faster, but it works on CPU too — just slower.

### Verify Ollama Is Working

After pulling the models, test each one:

```bash
# Test the chat model
ollama run llama3.1:8b "What is 2+2?"
# Should respond: "4" (or similar)

# Test the embedding model
curl http://localhost:11434/api/embeddings -d '{"model":"nomic-embed-text","prompt":"test"}'
# Should return a JSON object with an "embedding" array

# Test the vision model
ollama run llava:7b "Describe this image" --images path/to/any/image.jpg
# Should describe the image contents
```

If all three work, Ollama is ready.

### Configure OpenClaw-Optimised to Use Ollama

**Option A: Via .env file**

Add these to your `.env` file:

```bash
# Enable Ollama integration
ENABLE_OLLAMA=true
OLLAMA_HOST=http://localhost:11434

# Models (these are the defaults — only set if you want different ones)
OLLAMA_MODEL=llama3.1:8b
OLLAMA_EMBED_MODEL=nomic-embed-text
OLLAMA_VISION_MODEL=llava:7b

# Enable all the features that use Ollama
ENABLE_HYBRID_ROUTING=true
ENABLE_EMBEDDINGS=true
ENABLE_RAG=true
ENABLE_SUMMARIZATION=true
ENABLE_VISION_ROUTING=true

# Routing mode
HYBRID_ROUTING_MODE=balanced
```

**Option B: Via the setup wizard**

```bash
pnpm clawdis configure
```

Select "Budget & cost controls" → enable Ollama → enter the host URL. The wizard will probe Ollama, show you which models are available, and warn you if any are missing.

**Option C: Via clawdis.json directly**

```json
{
  "agent": {
    "hybridRouting": {
      "enabled": true,
      "mode": "balanced",
      "visionEnabled": true,
      "visionModel": "llava:7b",
      "summarizationEnabled": true,
      "summarizeThreshold": 15,
      "summarizeKeepRecent": 6
    },
    "rag": {
      "enabled": true,
      "topK": 10,
      "minScore": 0.35,
      "recencyWindow": 4
    }
  }
}
```

### Routing Modes Explained

| Mode | What it does | Best for |
|------|-------------|----------|
| `"aggressive"` | Routes as much as possible to Ollama. Only sends clearly complex queries to Claude. | Maximum cost savings. Fine for casual personal use. |
| `"balanced"` | Smart scoring — simple queries go local, complex ones go to Claude. Default. | Most users. Good balance of quality and savings. |
| `"quality"` | Only routes trivially simple queries to Ollama (greetings, time, basic math). | When quality matters most. Business-facing bots, client demos. |

### Verify It's All Working Together

After starting the gateway (`pnpm clawdis gateway`), send these test messages and check the logs:

1. **"Hi, how are you?"** → should route to Ollama (free). Logs show `[hybrid] → ollama_chat`
2. **"Write me a Python function that sorts a linked list"** → should route to Claude Sonnet. Logs show `[hybrid] → claude_sonnet`
3. **Send a photo** → should route to Ollama vision (free). Logs show `[hybrid] → ollama_vision`

### Troubleshooting Ollama

**"Ollama not reachable"**
- Check Ollama is running: `ollama list` (should show your pulled models)
- On Windows, Ollama runs as a background service — check the system tray icon
- Verify the URL: `curl http://localhost:11434/api/tags` should return JSON with your models

**"Model not found"**
- The specific error message tells you which model to pull: `ollama pull <model-name>`
- Run `ollama list` to see what you have installed

**"Slow responses from Ollama"**
- CPU inference is slower than GPU. On CPU, expect 2-5 seconds for simple queries.
- If you have an NVIDIA GPU, install CUDA drivers — Ollama uses GPU automatically.
- On Apple Silicon (M1/M2/M3/M4), Ollama uses the GPU by default — should be fast.
- Consider using a smaller chat model: set `OLLAMA_MODEL=llama3.2:3b` for faster (but slightly lower quality) responses.

**"Out of memory"**
- Close other memory-heavy applications
- Use the smaller 3B model: `ollama pull llama3.2:3b` and set `OLLAMA_MODEL=llama3.2:3b`
- Disable vision routing if you don't need it: set `ENABLE_VISION_ROUTING=false`

**"Ollama works but queries still go to Claude"**
- Check `ENABLE_HYBRID_ROUTING=true` in your `.env`
- Try `HYBRID_ROUTING_MODE=aggressive` to force more queries through Ollama
- Check gateway logs for routing decisions — each message shows which tier was selected

---

## 7. RAG (Smart Memory Retrieval)

**What it does for you:** Reduces token usage by 70-80%. Instead of sending your entire conversation history to Claude every time, RAG searches for the most relevant past messages and only includes those. This makes responses faster, cheaper, and more focused.

**What you need:** Nothing — it is enabled by default.

**Key config:**

```json
{
  "agent": {
    "rag": {
      "enabled": true,
      "topK": 10,
      "minScore": 0.35,
      "recencyWindow": 4
    }
  }
}
```

**Settings explained:**
- `topK` — how many relevant past messages to retrieve (default: 10)
- `minScore` — minimum relevance score to include a memory (default: 0.35, range 0-1)
- `recencyWindow` — always include the N most recent messages regardless of relevance (default: 4)

---

## 8. Autonomous Tasks

**What it does for you:** The assistant can work on long-running projects in the background. You say "research competitors in the UK fitness market and write me a report" and it works through the task step-by-step, even if you close the chat.

**What you need:** Nothing extra — just enable it in the wizard.

**Setup:**

1. Run `pnpm clawdis configure` → select "Autonomous tasks"
2. Enable tasks → set limits

**Key config:**

```json
{
  "tasks": {
    "enabled": true,
    "maxConcurrentTasks": 3,
    "maxStepsPerTask": 50,
    "defaultStepIntervalMs": 30000,
    "defaultTimeoutPerStepMs": 600000
  }
}
```

**Settings explained:**
- `maxConcurrentTasks` — how many tasks can run at once (default: 3)
- `maxStepsPerTask` — safety limit on how many steps a task can take (default: 50)
- `defaultStepIntervalMs` — pause between steps in milliseconds (default: 30 seconds)
- `defaultTimeoutPerStepMs` — max time per step before it is killed (default: 10 minutes)

---

## 9. Voice Calls (ElevenLabs)

**What it does for you:** Gives your assistant a voice. You can have spoken conversations through Telegram or trigger text-to-speech on any platform. The conversational mode lets you say "call me" in Telegram and the assistant calls you for a live voice chat.

**What you need:** An [ElevenLabs](https://elevenlabs.io) account and API key.

**Setup:**

1. Sign up at [elevenlabs.io](https://elevenlabs.io)
2. Go to Profile → API Key → copy it
3. Pick a voice at [elevenlabs.io/app/voices](https://elevenlabs.io/app/voices) → copy the Voice ID
4. Run `pnpm clawdis configure` → select "Voice calls"
5. Paste your API key and Voice ID
6. Optionally enable conversational mode (Telegram live calls)

**Key config:**

```json
{
  "talk": {
    "apiKey": "your-elevenlabs-api-key",
    "voiceId": "your-voice-id",
    "conversational": {
      "enabled": false,
      "triggerWords": ["call me"],
      "maxDurationMs": 1800000
    }
  }
}
```

**Settings explained:**
- `triggerWords` — what the user says to start a voice call (default: "call me")
- `maxDurationMs` — maximum call length in milliseconds (default: 30 minutes)
- You can also set the `ELEVENLABS_API_KEY` environment variable instead of putting it in config

---

## 10. Crash & Restart Alerting

**What it does for you:** Sends you a notification if the gateway crashes or restarts. You find out immediately instead of discovering hours later that your bot has been offline.

**What you need:** At least one notification channel (Telegram chat ID, Discord webhook URL, WhatsApp number, or any webhook URL).

**Setup:**

1. Run `pnpm clawdis configure` → select "Crash alerting"
2. Enable alerting → choose alert channels → enter the details for each
3. The wizard lets you add multiple channels (e.g., both Telegram and Discord)

**Key config:**

```json
{
  "alerting": {
    "enabled": true,
    "onCrash": true,
    "onRestart": true,
    "channels": [
      { "type": "telegram", "to": "-1001234567890" },
      { "type": "discord", "url": "https://discord.com/api/webhooks/..." },
      { "type": "webhook", "url": "https://your-server.com/alerts" }
    ]
  }
}
```

**Channel types:**
- `"webhook"` — HTTP POST to any URL
- `"telegram"` — message to a Telegram chat ID (uses your bot token)
- `"whatsapp"` — message to a phone number
- `"discord"` — post to a Discord webhook URL
- `"signal"` — message to a Signal number

---

## 11. Budget & Cost Controls

**What it does for you:** Prevents surprise bills. Set a monthly cap and the assistant will warn you as you approach it. Combine with Ollama hybrid routing for maximum savings.

**What you need:** Nothing extra.

**Setup:**

1. Run `pnpm clawdis configure` → select "Budget & cost controls"
2. Set a monthly budget cap in USD
3. Optionally enable Ollama for local routing (see Feature 6)

**Key config:**

```json
{
  "agent": {
    "monthlyBudgetUsd": 50.00
  }
}
```

**Environment variables (alternative):**
- `COST_MONTHLY_LIMIT` — monthly cap in USD
- `COST_DAILY_LIMIT` — daily cap in USD

---

## 12. Board of Directors (Multi-Agent System)

**What it does for you:** Instead of one generalist AI, you get six specialists that work together like an executive team. Each agent has its own personality, expertise, and conversation memory:

| Agent | Role | Speciality |
|-------|------|-----------|
| General | Orchestrator | Delegation, synthesis, final decisions |
| Research | Analyst | Data, evidence, trends |
| Content | CMO | Brand, messaging, audience |
| Finance | CFO | Costs, ROI, budgets |
| Strategy | CEO | Long-term vision, competitive positioning |
| Critic | Devil's Advocate | Risks, flaws, stress-testing |

**What you need:** Nothing extra for basic use. For Telegram topic routing, you need a Telegram supergroup with Topics enabled.

**Setup:**

1. Run `pnpm clawdis configure` → select "Board of Directors"
2. Optionally enter your Telegram supergroup chat ID for topic-based routing
3. Configure meetings and consultation settings

**How to talk to specific agents:**
- `@finance What's our runway?` — mention an agent
- `/agent:research What are the market trends?` — use a directive
- Post in a Telegram forum topic — each agent gets its own topic

**How to run a board meeting:**
The General agent can coordinate all specialists on a complex question. All five specialists weigh in, then General synthesizes a recommendation.

**Key config:**

```json
{
  "board": {
    "enabled": true,
    "telegramGroupId": -1001234567890,
    "meetings": {
      "enabled": true,
      "maxDurationMs": 600000
    },
    "consultation": {
      "enabled": true,
      "maxDepth": 2
    }
  }
}
```

**Full details:** See [BOARD_OF_DIRECTORS_GUIDE.md](./BOARD_OF_DIRECTORS_GUIDE.md) for the complete deep-dive including Telegram forum setup, personality customisation, and architecture overview.

---

## 13. Cron Jobs (Scheduled Tasks)

**What it does for you:** Run tasks on a schedule. "Every Monday at 9am, summarise my unread emails" or "Every hour, check the Bitcoin price."

**What you need:** Nothing extra.

**Key config:**

```json
{
  "cron": {
    "enabled": true,
    "maxConcurrentRuns": 3
  }
}
```

Cron jobs are managed through the assistant itself or the Control UI. You can add, list, and remove scheduled jobs.

---

## 14. Webhooks & Hooks

**What it does for you:** Lets external services trigger the assistant. A GitHub push, a Stripe payment, a form submission — any HTTP webhook can wake the assistant and tell it what happened.

**What you need:** The gateway must be reachable from the internet (via Tailscale Funnel, a reverse proxy, or port forwarding).

**Key config:**

```json
{
  "hooks": {
    "enabled": true,
    "path": "/hooks",
    "token": "your-secret-token",
    "mappings": [
      {
        "match": { "source": "github" },
        "action": "agent",
        "messageTemplate": "GitHub event: {{event}}",
        "deliver": true,
        "channel": "telegram"
      }
    ]
  }
}
```

**Gmail integration:**
Hooks also support Gmail Pub/Sub — get notified when you receive specific emails. Set up with `pnpm clawdis hooks gmail setup`.

---

## 15. Browser Automation

**What it does for you:** The assistant can control a Chrome browser — navigate pages, click buttons, fill forms, take screenshots. Useful for web research, testing, and automation.

**What you need:** Google Chrome installed.

**Key config:**

```json
{
  "browser": {
    "enabled": true,
    "headless": false
  }
}
```

**Settings explained:**
- `headless: false` — you can watch what the browser does (set to `true` for background operation)
- `executablePath` — custom Chrome path if it is not in the default location

---

## 16. Heartbeat (Proactive Check-ins)

**What it does for you:** The assistant periodically "wakes up" and sends you a message — a daily summary, a reminder, or whatever prompt you configure. Think of it as a proactive assistant that does not wait for you to ask.

**What you need:** Nothing extra.

**Key config:**

```json
{
  "agent": {
    "heartbeat": {
      "every": "60",
      "model": "anthropic/claude-sonnet-4-20250514",
      "target": "telegram",
      "prompt": "Check my calendar and summarise what's coming up today."
    }
  }
}
```

**Settings explained:**
- `every` — interval in minutes (e.g., `"60"` = every hour, `"1440"` = once a day)
- `target` — which platform to send the heartbeat message to
- `prompt` — what the assistant does on each heartbeat

---

## 17. Mission Control Dashboard

**What it does for you:** A web dashboard for monitoring your Clawdis instance — active sessions, message history, system status. Proxied through the gateway.

**What you need:** Mission Control running (separate service).

**Setup:**

1. Run `pnpm clawdis configure` → select "Mission Control"
2. Enter the Mission Control upstream URL (default: `http://127.0.0.1:3100`)
3. Set the base path (default: `/mc`)
4. Access it at `http://localhost:18789/mc`

**Key config:**

```json
{
  "gateway": {
    "missionControl": {
      "enabled": true,
      "url": "http://127.0.0.1:3100",
      "basePath": "/mc"
    }
  }
}
```

---

## 18. Tailscale Exposure

**What it does for you:** Makes your gateway accessible from anywhere via [Tailscale](https://tailscale.com) — a zero-config VPN. Use `serve` for private access within your tailnet, or `funnel` for public HTTPS access from the internet (no port forwarding needed).

**What you need:** Tailscale installed and logged in.

**Setup:**

1. Install Tailscale: [tailscale.com/download](https://tailscale.com/download)
2. Run `pnpm clawdis configure` → Gateway → set bind to `tailnet`
3. Choose Tailscale mode: `serve` (tailnet only) or `funnel` (public internet)
4. If using `funnel`, set auth to `password` (required for public exposure)

**Key config:**

```json
{
  "gateway": {
    "bind": "tailnet",
    "auth": {
      "mode": "password",
      "password": "your-strong-password"
    },
    "tailscale": {
      "mode": "funnel",
      "resetOnExit": false
    }
  }
}
```

**Modes explained:**
- `"off"` — no Tailscale integration
- `"serve"` — private HTTPS on your tailnet (only your devices can access it)
- `"funnel"` — public HTTPS URL anyone can access (password auth required)

---

## 19. Health Check

**What it does for you:** Runs a diagnostic check on your entire setup — API connectivity, platform connections, model availability, disk space, and service status.

**How to use:**

```bash
pnpm clawdis health
```

Or through the configure wizard → select "Health check".

The health check reports green/yellow/red status for each component and suggests fixes for any issues.

---

# Part 3: Quick Reference

---

## Environment Variables

| Variable | Purpose | Default |
|----------|---------|---------|
| `CLAWDIS_STATE_DIR` | State/data directory | `~/.clawdis` |
| `CLAWDIS_CONFIG_PATH` | Config file path | `~/.clawdis/clawdis.json` |
| `CLAWDIS_GATEWAY_PORT` | Gateway port override | `18789` |
| `CLAWDIS_GATEWAY_TOKEN` | Gateway auth token | (from config) |
| `CLAWDIS_GATEWAY_PASSWORD` | Gateway auth password | (from config) |
| `ELEVENLABS_API_KEY` | ElevenLabs voice API key | (from config) |
| `OLLAMA_HOST` | Ollama server URL | `http://localhost:11434` |
| `ENABLE_OLLAMA` | Force-enable Ollama routing | (from config) |
| `ENABLE_HYBRID_ROUTING` | Force-enable hybrid routing | (from config) |
| `COST_MONTHLY_LIMIT` | Monthly budget cap (USD) | (from config) |
| `COST_DAILY_LIMIT` | Daily budget cap (USD) | (from config) |

---

## CLI Commands

| Command | What it does |
|---------|-------------|
| `pnpm clawdis configure` | Run the interactive setup wizard |
| `pnpm clawdis gateway` | Start the gateway server |
| `pnpm clawdis login` | Link WhatsApp via QR code |
| `pnpm clawdis health` | Run system health check |
| `pnpm clawdis agent` | Start the agent in CLI mode |
| `pnpm gateway:watch` | Start gateway with auto-reload on code changes |
| `pnpm test` | Run unit tests |
| `pnpm build` | Compile TypeScript |
| `pnpm lint` | Run linter (Biome + oxlint) |
| `pnpm lint:fix` | Auto-fix lint issues |

---

## Config File Cheat Sheet

The most common fields you will want to change in `~/.clawdis/clawdis.json`:

```json
{
  "agent": {
    "model": "anthropic/claude-sonnet-4-20250514",
    "workspace": "~/clawd",
    "thinkingDefault": "medium",
    "rag": { "enabled": true },
    "hybridRouting": { "enabled": true, "mode": "balanced" },
    "heartbeat": { "every": "60", "target": "telegram" }
  },
  "gateway": {
    "port": 18789,
    "bind": "loopback",
    "auth": { "mode": "off" }
  },
  "telegram": {
    "enabled": true,
    "botToken": "your-token"
  },
  "whatsapp": {
    "allowFrom": []
  },
  "tasks": {
    "enabled": true,
    "maxConcurrentTasks": 3
  },
  "board": {
    "enabled": true
  },
  "alerting": {
    "enabled": true,
    "channels": [{ "type": "telegram", "to": "-100..." }]
  }
}
```

---

## Troubleshooting

### "The gateway won't start"
- Check if the port is already in use: `lsof -i :18789` (macOS/Linux) or `netstat -ano | findstr 18789` (Windows)
- Try a different port in config
- Check logs: `pnpm clawdis logs`

### "My bot doesn't reply on Telegram"
- Verify the bot token is correct: `curl https://api.telegram.org/bot<TOKEN>/getMe`
- Check that the gateway is running: `pnpm clawdis health`
- If in a group, make sure `requireMention` is not blocking replies (try DM first)

### "My bot doesn't reply on WhatsApp"
- Re-link: `pnpm clawdis login` (QR codes expire)
- Check `allowFrom` — if set, only listed numbers can message the bot

### "Claude API errors / 401 Unauthorized"
- Re-run `pnpm clawdis configure` → Model/auth → re-authenticate
- If using API key, verify it at [console.anthropic.com](https://console.anthropic.com)
- Check your subscription/billing status

### "Ollama routing not working"
- Verify Ollama is running: `curl http://localhost:11434/api/tags`
- Pull a model: `ollama pull llama3.2`
- Check `hybridRouting.enabled` is `true` in config

### "Board of Directors agents all go to General"
- Verify `board.enabled` is `true`
- For Telegram topic routing: check that the supergroup has Topics enabled and the bot has "Manage Topics" permission
- Try explicit routing: `@finance What's our budget?`

### "Voice calls not working"
- Verify ElevenLabs API key: check at [elevenlabs.io/app/profile](https://elevenlabs.io/app/profile)
- Make sure voice ID exists and is accessible to your account
- Check that `talk.conversational.enabled` is `true` for live calls

### "High API costs"
- Enable hybrid routing with Ollama (Feature 6)
- Set a monthly budget cap (Feature 11)
- Check that RAG is enabled (Feature 7) — it reduces token usage by 70-80%
- Use `"mode": "aggressive"` for maximum Ollama routing

---

## Further Reading

| Topic | Document |
|-------|----------|
| Board of Directors deep-dive | [BOARD_OF_DIRECTORS_GUIDE.md](./BOARD_OF_DIRECTORS_GUIDE.md) |
| Board architecture | [BOARD_OF_DIRECTORS_DESIGN.md](./BOARD_OF_DIRECTORS_DESIGN.md) |
| RAG implementation | [RAG_IMPLEMENTATION.md](./RAG_IMPLEMENTATION.md) |
| Hybrid routing details | [OLLAMA_HYBRID.md](./OLLAMA_HYBRID.md) |
| Memory tier system | [MEMORY_TIERS.md](./MEMORY_TIERS.md) |
| Security audit | [SECURITY_AUDIT.md](./SECURITY_AUDIT.md) |
| Feature backlog | [BACKLOG.md](./BACKLOG.md) |

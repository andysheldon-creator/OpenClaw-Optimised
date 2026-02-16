# Board of Directors — Setup Guide

Your Clawdis instance now comes with a **Board of Directors**: six specialized AI agents that work together like an executive team. Instead of one generalist AI that does everything, you get a squad of specialists — each with their own personality, expertise, and conversation memory.

---

## What You Get

| Agent | Role | Think of them as... |
|-------|------|---------------------|
| **General** | Orchestrator | The CEO's chief of staff — delegates, synthesizes, makes final calls |
| **Research** | Research Analyst | Your data nerd — evidence-based, citation-aware, skeptical |
| **Content** | CMO (Marketing) | Your brand voice — audience-first, creative, narrative-driven |
| **Finance** | CFO (Finance) | Your numbers person — cost analysis, ROI, budgets, runway |
| **Strategy** | CEO (Strategy) | Your big-picture thinker — long-term vision, competitive positioning |
| **Critic** | Devil's Advocate | Your stress-tester — finds flaws, challenges assumptions, flags risks |

Each agent maintains its own conversation history, so the Finance agent remembers your budget discussions and the Research agent remembers the data it found for you — even across separate conversations.

---

## Quick Start (5 Minutes)

### Step 1: Run the Configure Wizard

```bash
pnpm clawdis configure
```

Select **"Board of Directors"** from the setup menu. The wizard will ask you:

1. **Telegram supergroup chat ID** — the group where your board will live (optional, but recommended)
2. **Board meetings** — whether to enable multi-agent discussions (yes/no, default: yes)
3. **Meeting duration** — how long a board meeting can run (default: 10 minutes)
4. **Cross-agent consultation** — whether agents can ask each other questions (yes/no, default: yes)
5. **Consultation depth** — how deep the consultation chain can go (default: 2 levels)

That's it for basic setup. The board is now active.

### Step 2: Talk to Your Board

You can now talk to any agent using these methods (from any connected platform — Telegram, WhatsApp, Discord, Signal, or the web UI):

**Method 1: @mention an agent**
```
@finance What's our burn rate looking like?
```

**Method 2: Use the /agent directive**
```
/agent:research What are the latest trends in AI-assisted coding?
```

**Method 3: Just send a message**
If your message is clearly about one domain (e.g., lots of financial keywords), the router will automatically send it to the right agent. Otherwise it goes to General, who may delegate.

---

## Setting Up Telegram (Recommended)

Telegram's forum topics feature is the best way to use the Board of Directors. Each agent gets its own topic (thread) in a Telegram supergroup — post in the Finance topic and the Finance agent answers.

### Prerequisites

- A Telegram Bot (you likely already have one if you're using Clawdis with Telegram)
- A Telegram **supergroup** (not a regular group)

### Step-by-Step Telegram Setup

#### 1. Create a Supergroup (if you don't have one)

1. Open Telegram
2. Tap **New Group** > add yourself (and your bot) > give it a name like "My Board Room"
3. Open the group settings (tap the group name at the top)
4. Scroll down and tap **"Convert to Supergroup"** (or on desktop: group name > Edit > "Upgrade to Supergroup")

#### 2. Enable Topics

1. In your supergroup settings, find **"Topics"** and toggle it **on**
2. Your group will now show a "General" topic by default

#### 3. Make Your Bot an Admin

1. Group settings > **Administrators** > **Add Administrator**
2. Find your Clawdis bot
3. Enable these permissions:
   - **Manage Topics** (required — this lets the bot create agent topics)
   - **Send Messages**
   - **Delete Messages** (optional but useful)
4. Save

#### 4. Get Your Group's Chat ID

The easiest way:

1. Add `@RawDataBot` to your group temporarily
2. It will send a message showing the group's `chat.id` — it'll look like `-1001234567890`
3. Copy that number
4. Remove `@RawDataBot` from the group

Alternatively, check your Clawdis logs when the bot receives a message in the group — the chat ID will be logged.

#### 5. Run the Configure Wizard

```bash
pnpm clawdis configure
```

Select **Board of Directors** and enter your Telegram supergroup chat ID when prompted.

#### 6. Create the Agent Topics

After configuring, the system will create six forum topics in your supergroup — one per agent:

| Topic | Color | Agent |
|-------|-------|-------|
| General | Blue | General (Orchestrator) |
| Research Analyst | Gold | Research |
| Content Director | Purple | Content / CMO |
| Finance Director | Green | Finance / CFO |
| Strategy Director | Pink | Strategy / CEO |
| Critic | Red | Critic / Devil's Advocate |

Now you can post in any topic and the right agent will respond. Post in the Finance topic — the Finance agent answers. Post in the Research topic — the Research agent answers.

---

## Commands Reference

### Talking to Specific Agents

| Command | What it does | Example |
|---------|-------------|---------|
| `@research <question>` | Ask the Research agent | `@research What's the market size for AI tools?` |
| `@finance <question>` | Ask the Finance agent | `@finance Can we afford to hire two more engineers?` |
| `@content <question>` | Ask the Content/CMO agent | `@content How should we position this product launch?` |
| `@strategy <question>` | Ask the Strategy/CEO agent | `@strategy Should we expand into the European market?` |
| `@critic <question>` | Ask the Critic agent | `@critic What could go wrong with this plan?` |
| `@general <question>` | Ask the General agent directly | `@general Summarize what we discussed today` |
| `/agent:<role> <question>` | Alternative directive syntax | `/agent:finance What's our runway?` |

### Board Meetings

Board meetings are the killer feature. When you need a well-rounded decision, the General agent coordinates all five specialists to weigh in on a topic, then synthesizes everything into one recommendation.

**How agents trigger a board meeting:**

When the General agent decides a question needs multiple perspectives, it includes a special tag in its response:

```
[[board_meeting]] Should we pivot our pricing model to usage-based?
```

This triggers the full meeting flow:

1. **Research** analyzes market data and comparable models
2. **Finance** models the revenue impact and cost implications
3. **Content** evaluates how the change affects brand positioning and messaging
4. **Strategy** maps the long-term competitive implications
5. **Critic** stress-tests the idea and identifies risks
6. **General** reads all five perspectives and delivers a synthesized recommendation

The meeting result comes back as a formatted summary showing each agent's input and the final recommendation.

**Tips for getting the best board meetings:**

- Ask big, multi-faceted questions: "Should we enter the Japanese market?" not "What's Japan's GDP?"
- Give context: "We're a 15-person SaaS startup with $2M ARR" helps agents give relevant advice
- Follow up: After a meeting, ask individual agents to dig deeper on their area

### Cross-Agent Consultation

Agents can ask each other questions mid-conversation. When an agent needs input from a colleague, it includes a consultation tag:

```
[[consult:finance]] What would this cost over 6 months?
```

The Finance agent answers the question, and the response gets injected back into the original agent's context. This happens automatically — you don't need to do anything.

**Consultation limits (to prevent runaway loops):**
- Default max depth: 2 levels (Agent A asks B, B can ask C, but C can't ask anyone)
- Max 10 concurrent consultations
- 30-second timeout per consultation

---

## Customizing Agent Personalities

Each agent has a built-in personality, but you can override them with custom SOUL files.

### Where Personality Files Live

```
<workspace>/
  board/
    general.soul.md     # General agent personality
    research.soul.md    # Research agent personality
    content.soul.md     # Content/CMO personality
    finance.soul.md     # Finance/CFO personality
    strategy.soul.md    # Strategy/CEO personality
    critic.soul.md      # Critic personality
```

### Creating Custom Personalities

1. Navigate to your Clawdis workspace directory
2. Create a `board/` folder if it doesn't exist
3. Create a file like `board/finance.soul.md`
4. Write your personality in Markdown:

```markdown
You are the **CFO** on the Board of Directors.

You specialize in SaaS financial metrics. You always think in terms of:
- MRR, ARR, and growth rate
- CAC, LTV, and the LTV:CAC ratio
- Burn rate and runway
- Unit economics

When asked about costs, you always provide a range (optimistic, expected, pessimistic).
You are conservative by nature — you'd rather over-estimate costs than under-estimate them.
```

If no custom file exists, the agent uses its built-in default personality. You can override just one agent and leave the rest on defaults.

### Personality Tips

- **Be specific about reasoning style.** "You are methodical and data-driven" is better than "You are smart."
- **Define how they interact with other agents.** "When you disagree with Finance, explain your reasoning with evidence."
- **Set decision frameworks.** Give them a numbered process for approaching problems.
- **Match your domain.** If you're in crypto, teach the Finance agent about tokenomics. If you're in healthcare, teach the Research agent about clinical trials.

---

## Configuration Reference

Here's what the board configuration looks like in `clawdis.json` after setup:

```json
{
  "board": {
    "enabled": true,
    "telegramGroupId": -1001234567890,
    "agents": [
      {
        "role": "finance",
        "name": "Finance Director",
        "emoji": "📊",
        "model": "anthropic/claude-sonnet-4-20250514",
        "telegramTopicId": 42
      }
    ],
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

### Config Fields

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `board.enabled` | boolean | `false` | Master switch for the Board of Directors |
| `board.telegramGroupId` | number | — | Telegram supergroup ID for topic routing |
| `board.agents` | array | — | Per-agent overrides (name, emoji, model, topic ID) |
| `board.meetings.enabled` | boolean | `true` | Whether board meetings are allowed |
| `board.meetings.maxDurationMs` | number | `600000` | Meeting timeout (10 min default) |
| `board.consultation.enabled` | boolean | `true` | Whether agents can consult each other |
| `board.consultation.maxDepth` | number | `2` | Max consultation chain depth |

### Per-Agent Overrides

You can override any agent's defaults in the `board.agents` array:

| Field | Type | Description |
|-------|------|-------------|
| `role` | string | Which agent to override (required): `general`, `research`, `content`, `finance`, `strategy`, `critic` |
| `name` | string | Custom display name |
| `emoji` | string | Custom emoji prefix |
| `model` | string | LLM model override (e.g., `anthropic/claude-sonnet-4-20250514`) |
| `soulFile` | string | Custom path to personality file |
| `thinkingDefault` | string | Thinking level: `off`, `minimal`, `low`, `medium`, `high` |
| `telegramTopicId` | number | Telegram forum topic ID (set automatically during setup) |

---

## How Message Routing Works

When a message comes in, the router checks these sources in order (first match wins):

1. **Telegram topic ID** — If the message is in a forum topic that maps to an agent, that agent handles it
2. **Directive** — `/agent:finance` explicitly targets the Finance agent
3. **@mention** — `@research` targets the Research agent
4. **Keyword inference** — If the message contains strong domain keywords (3+ matches, 2x gap over next domain), the matching agent handles it. Weak or ambiguous signals fall through.
5. **Default** — If nothing matches, the General agent handles it

This means you can just talk naturally. Domain-specific questions usually route themselves.

---

## Getting the Best Results

### Do

- **Ask big questions to General and let it delegate.** "How should we approach international expansion?" will trigger consultations or a board meeting.
- **Ask specific questions directly to specialists.** "@finance What's our unit economics?" gets you a focused answer.
- **Use board meetings for strategic decisions.** Anything that touches multiple domains benefits from all perspectives.
- **Customize personalities for your industry.** A finance agent that knows SaaS metrics is more useful than a generic one.
- **Build up context over time.** Each agent remembers its conversations. The more you discuss finances with the Finance agent, the better its answers get.

### Don't

- **Don't micro-manage routing.** The keyword router is smart enough for most messages. Only use @mentions or /agent directives when you specifically want a particular perspective.
- **Don't ask the Critic for creative ideas.** That's what Content is for. The Critic's job is to poke holes, not build things.
- **Don't expect real-time data.** Agents work with the context they have. If you need fresh data, tell the Research agent to look something up (if web tools are enabled).
- **Don't overload board meetings.** They're best for 1-2 focused questions, not 10-item agendas.

---

## Troubleshooting

### "My messages all go to General"

- Check that your Telegram group has topics enabled and the bot has "Manage Topics" permission
- Make sure you ran `clawdis configure` and entered your supergroup ID
- Try using explicit `@agent` mentions to verify routing works

### "Board meetings time out"

- Increase the meeting duration in config (up to 30 minutes)
- Check that all agents are responding — if one agent's model is slow or offline, it blocks the meeting
- Reduce the meeting scope — ask a more focused question

### "Agents give generic answers"

- Customize their personalities with SOUL files (see "Customizing Agent Personalities" above)
- Give more context in your messages — agents work better when they know your situation
- Build conversation history — agents improve as they learn about your business

### "Consultation loops or errors"

- The system has built-in depth limits (default: 2) to prevent infinite loops
- If you see timeout errors, check that the model behind each agent is reachable
- Reduce consultation depth to 1 if you're seeing cascading failures

---

## Architecture Overview (For the Curious)

```
User Message
     |
     v
  Router  ─── topic? ──> Telegram topic ID lookup
     |         ├── directive? ──> /agent:role parse
     |         ├── mention? ──> @role parse
     |         ├── keywords? ──> domain scoring
     |         └── default ──> General
     |
     v
  Agent Session (board:<role> or board:<role>:<group>)
     |
     ├── Personality loaded from board/<role>.soul.md (or defaults)
     ├── Own conversation history (isolated from other agents)
     ├── Can consult other agents via [[consult:<role>]]
     └── General can trigger meetings via [[board_meeting]]
```

Each agent runs through the same Clawdis reply pipeline but with its own:
- **Session key** — `board:finance`, `board:research:group:-100123`, etc.
- **System prompt** — includes its personality, role description, and instructions for consulting colleagues
- **Model** — can be overridden per-agent (e.g., use a faster model for the Critic)

The General agent is special — it has instructions to delegate complex questions and synthesize multi-agent board meeting results.

---

## What's Next

The Board of Directors system is designed to grow with you:

- **Workspace memory** — Each agent builds expertise in its domain over time through conversation history
- **Custom agents** — The six-agent structure covers most use cases, but the system is built to be extensible
- **Integration** — Board agents can use the same tools (web search, code execution, etc.) as the base Clawdis agent, scoped to their specialty

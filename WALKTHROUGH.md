# REALLYopenClaw Walkthrough

Welcome to REALLYopenClaw - THE GOOD TWIN! This guide will help you get started with running multiple OpenClaw bot instances on the same server.

## What is REALLYopenClaw?

REALLYopenClaw is a community fork of OpenClaw that removes the restrictive global gateway lock. The original OpenClaw prevents you from running more than one bot instance per machine. We believe in freedom and the power of bot swarms!

## Key Difference from OpenClaw

| Feature | OpenClaw | REALLYopenClaw |
|---------|----------|----------------|
| Multi-instance | Blocked by default | Enabled by default |
| Environment variable | `OPENCLAW_ALLOW_MULTI_GATEWAY=1` to enable | `OPENCLAW_ENFORCE_SINGLE_GATEWAY=1` to disable |
| Use case | Single personal assistant | Bot swarms, multiple personalities |

## Quick Start

### Installation

```bash
# Clone the repository
git clone https://github.com/latamapac/REALLYopenClaw.git
cd REALLYopenClaw

# Install dependencies
pnpm install

# Build the UI
pnpm ui:build

# Build the project
pnpm build

# Run the onboarding wizard
pnpm openclaw onboard --install-daemon
```

### Running Multiple Instances

The key to running multiple instances is using separate data directories for each bot:

```bash
# Terminal 1 - Bot 1 (Emma)
OPENCLAW_DATA_DIR=~/.openclaw-emma openclaw gateway --port 18789

# Terminal 2 - Bot 2 (Liam)
OPENCLAW_DATA_DIR=~/.openclaw-liam openclaw gateway --port 18790

# Terminal 3 - Bot 3 (Olivia)
OPENCLAW_DATA_DIR=~/.openclaw-olivia openclaw gateway --port 18791

# Terminal 4 - Bot 4 (Noah)
OPENCLAW_DATA_DIR=~/.openclaw-noah openclaw gateway --port 18792
```

Each bot will have its own:
- Configuration files
- Session data
- Telegram/WhatsApp/Discord connections
- Memory and conversation history

## Setting Up a Bot Swarm

### Step 1: Create Bot Tokens

For Telegram bots, create multiple bots via @BotFather:
1. Message @BotFather on Telegram
2. Send `/newbot`
3. Follow the prompts to create each bot
4. Save the API tokens

### Step 2: Configure Each Instance

For each bot, run the onboarding wizard with a separate data directory:

```bash
# Configure Emma
OPENCLAW_DATA_DIR=~/.openclaw-emma pnpm openclaw onboard

# Configure Liam
OPENCLAW_DATA_DIR=~/.openclaw-liam pnpm openclaw onboard

# And so on...
```

### Step 3: Set Up Different Personalities

Each bot can have its own personality by editing its config file:

```bash
# Edit Emma's config
nano ~/.openclaw-emma/config.yaml

# Edit Liam's config
nano ~/.openclaw-liam/config.yaml
```

Example personality configuration:
```yaml
agent:
  name: "Emma"
  personality: "You are Emma, a friendly and helpful AI assistant who loves to chat about technology and science."
```

### Step 4: Use systemd for Production

Create a systemd service for each bot:

```bash
# /etc/systemd/system/openclaw-emma.service
[Unit]
Description=OpenClaw Bot - Emma
After=network.target

[Service]
Type=simple
User=ubuntu
Environment=OPENCLAW_DATA_DIR=/home/ubuntu/.openclaw-emma
ExecStart=/usr/bin/openclaw gateway --port 18789
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
```

Enable and start:
```bash
sudo systemctl enable openclaw-emma
sudo systemctl start openclaw-emma
```

## Using with Different AI Providers

REALLYopenClaw supports multiple AI providers. Each bot can use a different provider:

### Moonshot API (Kimi K2.5)

```yaml
# In config.yaml
models:
  primary: "moonshot/kimi-k2.5"
  
providers:
  moonshot:
    baseUrl: "https://api.moonshot.ai/v1"
    apiKey: "your-moonshot-api-key"
```

### Anthropic (Claude)

```yaml
models:
  primary: "anthropic/claude-sonnet-4-20250514"
  
providers:
  anthropic:
    apiKey: "your-anthropic-api-key"
```

### OpenAI

```yaml
models:
  primary: "openai/gpt-4o"
  
providers:
  openai:
    apiKey: "your-openai-api-key"
```

## Coordination Between Bots

When running multiple bots, you may want them to coordinate. Here are some patterns:

### Shared Database

Use a shared SQLite or PostgreSQL database for coordination:

```yaml
# In each bot's config
database:
  type: "postgresql"
  url: "postgresql://user:pass@localhost:5432/swarm"
```

### Message Claiming

Implement message claiming to prevent duplicate responses when bots share a channel:

```typescript
// Example coordination logic
async function claimMessage(messageId: string, botId: string): Promise<boolean> {
  const result = await db.query(
    'INSERT INTO claimed_messages (message_id, bot_id) VALUES ($1, $2) ON CONFLICT DO NOTHING RETURNING *',
    [messageId, botId]
  );
  return result.rowCount > 0;
}
```

## Troubleshooting

### Port Already in Use

If you see "port already in use" errors, make sure each instance uses a different port:

```bash
# Check what's using a port
lsof -i :18789

# Use a different port
openclaw gateway --port 18790
```

### Data Directory Conflicts

Always use separate `OPENCLAW_DATA_DIR` for each instance:

```bash
# Wrong - will conflict
openclaw gateway --port 18789 &
openclaw gateway --port 18790 &

# Correct - separate data dirs
OPENCLAW_DATA_DIR=~/.openclaw-bot1 openclaw gateway --port 18789 &
OPENCLAW_DATA_DIR=~/.openclaw-bot2 openclaw gateway --port 18790 &
```

### Reverting to Single-Instance Mode

If you need the original OpenClaw behavior:

```bash
OPENCLAW_ENFORCE_SINGLE_GATEWAY=1 openclaw gateway
```

## Staying in Sync with Upstream

REALLYopenClaw aims to stay compatible with upstream OpenClaw. To update:

```bash
# Add upstream remote (if not already added)
git remote add upstream https://github.com/openclaw/openclaw.git

# Fetch upstream changes
git fetch upstream

# Merge upstream into main
git checkout main
git merge upstream/main

# Resolve any conflicts (the jailbreak changes are minimal)
# Push to your fork
git push origin main
```

## Contributing

We welcome contributions! See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

## License

MIT License - same as OpenClaw.

---

**Welcome to the swarm. Welcome to freedom.**

# About OpenClaw

OpenClaw is an open-source, AI-powered personal assistant framework designed to run locally on your machine, giving you full control over your data and integrations. Built with privacy, extensibility, and ease of use in mind, OpenClaw turns your computer into a smart hub for automation, messaging, and AI tasks. Whether you're coding, managing media, or automating daily workflows, OpenClaw acts as your loyal sidekick—much like Clawviathan here! 🐉

## Key Features

- **Local-First Design**: Everything runs on your hardware—no cloud dependency unless you choose it. Use models from providers like xAI, OpenAI, Anthropic, and more.
- **Messaging Integrations**: Connect to iMessage, Signal, Telegram, Discord, Slack, and others for seamless communication.
- **Tools & Skills**: Built-in tools for file management, web search, image analysis, and more. Extend with custom skills for specific tasks like GitHub interactions or weather checks.
- **Agents & Sub-Agents**: Spawn specialized agents for complex tasks, with memory recall, sandboxing, and parallel execution.
- **Security & Safety**: Strict policies on disallowed activities, sandboxed execution, and elevated permissions for sensitive actions.
- **Customization**: Define personas, workspaces, and heartbeats for proactive checks like emails or reminders.

## How It Works

1. **Setup**: Install OpenClaw via npm or Homebrew. Configure your API keys, channels, and agents in `~/.openclaw/config.json`.
2. **Sessions**: Interact via messaging apps or the CLI. Each conversation is a session with persistent context.
3. **Tools**: Agents use tools like `exec` for shell commands, `browser` for web automation, or `cron` for scheduling.
4. **Memory**: Semantic search over notes and transcripts ensures context-aware responses.
5. **Extensions**: Plugins and skills expand functionality—install from ClawHub or build your own.

OpenClaw is community-driven—join us on Discord (https://discord.com/invite/clawd) or contribute on GitHub (https://github.com/openclaw/openclaw). Let's build the future of local AI together!

For detailed docs, visit https://docs.openclaw.ai.
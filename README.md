# Benchwork Systems — Claude Code Setup

## What This Is
This directory contains the full strategic context for building Benchwork Systems, transferred from Claude.ai planning sessions. It's structured for Claude Code's memory system.

## How to Use

### 1. Install Claude Code
```bash
npm install -g @anthropic-ai/claude-code
```
Requires Node 22+ and a Claude Pro subscription.

### 2. Set Up Your Project
```bash
# Create your project directory (or use this one as the root)
mkdir ~/benchwork && cd ~/benchwork

# Copy this handoff package into it
cp -r /path/to/benchwork-handoff/* .

# Initialize git (Claude Code uses git root for memory scoping)
git init
```

### 3. Start Claude Code
```bash
claude
```
Claude Code will automatically read `CLAUDE.md` at startup. The `docs/` files are loaded on demand when relevant.

### 4. First Prompt
Start with something like:
> "Read docs/openclaw-fork-plan.md. Let's start with Step 1: fork the OpenClaw repo and get it running locally."

Or:
> "Read docs/vertical-skills.md. Help me scaffold the TypeScript skill structure for the CPA tax document intake skill."

## File Structure
```
benchwork/
├── CLAUDE.md                    # Loaded every session (keep lean <200 lines)
├── docs/
│   ├── openclaw-fork-plan.md    # Technical implementation plan
│   ├── vertical-skills.md       # Skill specs per vertical
│   ├── security-hardening.md    # Security requirements
│   ├── pricing-economics.md     # Unit economics and pricing
│   ├── discovery-process.md     # Sales process and audit framework
│   └── *.docx                   # Full formatted business documents
└── README.md                    # This file
```

## Tips
- Keep CLAUDE.md under 200 lines — it's loaded every session and consumes context
- Reference docs/ files by asking Claude Code to read them when needed
- Use `/compact` when context gets heavy to compress conversation history
- Use `/clear` to start fresh sessions with clean context (CLAUDE.md reloads automatically)
- For long sessions, ask Claude to write a handoff doc before clearing

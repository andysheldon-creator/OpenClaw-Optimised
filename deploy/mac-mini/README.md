# SHARPS EDGE Builder Edition - Mac Mini Deployment

## Architecture

```
┌─────────────────────────────────────────────────────┐
│                    DANNO (OpenClaw)                  │
│                                                     │
│  THINKING: OpenRouter Free Models                   │
│  - DeepSeek R1 0528 (reasoning)                     │
│  - Llama 3.3 70B (general)                          │
│  Cost: $0                                           │
│                                                     │
│  BUILDING: Claude Code CLI                          │
│  - Run: claude "write code that..."                 │
│  - Full development capability                      │
│  Cost: $200/month flat (unlimited)                  │
└─────────────────────────────────────────────────────┘
```

Danno uses free OpenRouter models for thinking/planning/conversation, and shells
out to Claude Code CLI (`claude`) for all actual code writing - the same way a
human developer would vibe code with Claude.

## Prerequisites

- macOS (Mac Mini)
- Node.js 22+ (`brew install node`)
- Claude Code CLI (from https://claude.ai/code)
- OpenRouter account (free at https://openrouter.ai)

## Quick Setup

```bash
# Set your OpenRouter key
export OPENROUTER_API_KEY='sk-or-...'

# Run automated setup
./setup-mac-mini.sh

# Complete onboarding
openclaw onboard --install-daemon

# Scan WhatsApp QR code when prompted

# Send bootstrap message from FIRST_MESSAGE.md to Danno
```

## Files

| File | Purpose |
|------|---------|
| `openclaw.json` | OpenClaw config (OpenRouter free models, SHARPS EDGE extension) |
| `setup-mac-mini.sh` | Automated install script |
| `FIRST_MESSAGE.md` | Bootstrap message to initialize Danno |
| `README.md` | This file |

## Monthly Costs

| Item | Cost |
|------|------|
| OpenRouter (free models) | $0 |
| Claude Code Max | $200/mo |
| Cloudflare Workers | $0 (free tier) |
| The Odds API | $0 (500 req/mo) |
| **Total** | **$200/mo** |

## Success Metric

Danno builds SHARPS EDGE, receives first x402 payment, $200+/mo revenue = breakeven.

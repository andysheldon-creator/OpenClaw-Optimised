---
name: memU Memory
description: "24/7 Always-On Proactive Memory for AI Agents. Use this skill to memorize conversations, facts, and user preferences automatically. It reduces token costs by providing context-aware retrieval."
---

# memU Memory

memU is a memory framework built for proactive agents. It continuously captures and understands user intent across sessions.

## Core APIs

### memorize

Processes inputs in real-time and immediately updates memory.

```bash
# Handled automatically by the system in proactive mode
```

### retrieve

Retrieve memory based on a query. Supports both RAG (fast context) and LLM (deep reasoning) methods.

## Configuration

The skill is configured via `openclaw.json` as an MCP server.

- **Provider**: memU (Python 3.13)
- **Venv Path**: `/tmp/memu-venv`
- **Source Path**: `/tmp/memu`

## Implementation Details

This skill works as an MCP server providing `memu_memory` and `memu_todos` tools.

- `memu_memory(query: str)`: Retrieve memory based on a query.
- `memu_todos()`: Retrieve auto-extracted todos from memory.

## Setup Requirements

Required Python 3.13+ and OpenAI/OpenRouter API key.
Currently using local venv at `/tmp/memu-venv`.

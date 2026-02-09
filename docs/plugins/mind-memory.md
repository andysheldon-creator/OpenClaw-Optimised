---
summary: "Mind Memory plugin: Long-term identity and autobiographical storytelling"
read_when:
  - You want to enable persistent, narrative memory for your agent
  - You need to set up Graphiti for subconscious resonance
---

# Mind Memory Plugin

The Mind Memory plugin provides Moltbot with a sophisticated long-term memory system based on the **Dual-Process Theory of Mind**. It allows agents to maintain a consistent identity and a developing relationship arc with the user.

## Features

- **Subconscious Resonance**: Automatically searches a knowledge graph (via Graphiti) for past "Flashbacks" relevant to the current conversation.
- **Narrative Story (`STORY.md`)**: Maintains a first-person autobiography that is injected into the agent's system prompt.
- **Self-Narrating Compaction**: Prunes short-term memory by distilling it into the long-term story.
- **Cross-Platform Docker Management**: Automatically manages the Graphiti lifecycle (installation and startup) on macOS, Windows, and Linux.

## Setup

The plugin requires **Docker** and **Graphiti** to function. 

### Automated Setup

You can prepare the environment automatically by running:

```bash
moltbot mind-memory setup
```

This command will:
1. Detect your platform (macOS, Windows, or Linux).
2. Check if Docker is installed. If missing, it will attempt to install it via:
   - **macOS**: [Homebrew](https://brew.sh) (`brew install --cask docker`)
   - **Windows**: [winget](https://learn.microsoft.com/en-us/windows/package-manager/winget/) (`winget install Docker.DockerDesktop`)
   - **Linux**: `apt-get` (`sudo apt-get install docker.io`)
3. Launch the Docker application if it is closed.
4. Start the Graphiti and FalkorDB containers via Docker Compose.

### Manual Configuration

If you prefer to manage Docker yourself, ensure a Graphiti instance is running at `http://localhost:8001`. You can then configure the plugin in `moltbot.json`:

```json5
{
  "plugins": {
    "entries": {
      "mind-memory": {
        "enabled": true,
        "config": {
          "graphiti": {
            "baseUrl": "http://localhost:8001",
            "autoStart": true
          }
        }
      }
    }
  }
}
```

## How it Works

### 1. The Pending Log
To ensure only meaningful interactions enter the narrative, the system uses a `pending-episodes.log` file in your memory directory.
- **Filtering**: Heartbeat messages and technical prompts are automatically excluded from memory storage and narrativization.
- **Batching**: The narrative story is updated when the log reaches a threshold (default: 5000 tokens).

### 2. Global Memory Scope
The plugin uses a stable session ID (`global-user-memory`) to ensure that facts learned in one chat session are remembered across all channels (WhatsApp, Telegram, etc.).

### 3. Subconscious Retrieval
Before every turn, the agent queries the knowledge graph for "resonant" facts. These facts are added to the context as "Subconscious Flashbacks," allowing the agent to remember details like:
*"I remember you mentioned Johana is from Medellín..."*

## CLI Commands

- `moltbot mind-memory setup`: Interactive environment preparation.
- `moltbot mind-memory status`: (Internal) Check health of the memory system.

## Troubleshooting

- **Docker not starting**: Ensure the Docker application is in your Applications folder (macOS) or Program Files (Windows).
- **Graph connection failure**: Check if another service is using port `8001` or `6379`.

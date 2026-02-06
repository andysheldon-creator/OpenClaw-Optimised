---
summary: "Generic WebSocket webhook for connecting external services via openclaw-webhook-bridge"
read_when:
  - Setting up Webhook support
  - Integrating external services with OpenClaw
title: "Webhook"
---

# Webhook (WebSocket)

Status: external bridge integration. Requires the standalone `openclaw-webhook-bridge` service to connect WebSocket webhook services to OpenClaw Gateway.

## Quick setup

1. Install and run the standalone bridge service:

   ```bash
   git clone https://github.com/sternelee/openclaw-webhook-bridge.git
   cd openclaw-webhook-bridge
   go build -o openclaw-bridge ./cmd/bridge/
   ./openclaw-bridge start webhook_url=ws://localhost:8080/ws
   ```

2. The bridge will connect to OpenClaw Gateway and your WebSocket server.

For more details, see: [openclaw-webhook-bridge GitHub](https://github.com/sternelee/openclaw-webhook-bridge)

## What it is

- Generic WebSocket webhook channel via the standalone `openclaw-webhook-bridge` service
- Bidirectional communication between external WebSocket services and OpenClaw AI agent
- Session management with configurable scoping (per-sender, global, or explicit)
- UID-based routing for multi-instance deployments

## Architecture

```
┌─────────────────┐     WebSocket      ┌──────────────────┐
│ External        │◄──────────────────►│ openclaw-webhook  │
│ WebSocket       │    (bidirectional)  │ -bridge          │
│ Server          │                     └────────┬─────────┘
└─────────────────┘                              │
                                                  ▼
                                         ┌──────────────────┐
                                         │ OpenClaw         │
                                         │ AI Gateway       │
                                         │ (localhost:18789)│
                                         └──────────────────┘
```

## Configuration

Configure the bridge service (not in OpenClaw config):

```bash
./openclaw-bridge start webhook_url=ws://localhost:8080/ws
```

Optional parameters:

- `agent_id`: OpenClaw Agent ID (default: "main")
- `uid`: Unique instance ID for multi-instance routing

Configuration is saved to `~/.openclaw/bridge.json`.

## WebSocket Protocol

### Incoming Messages (WebSocket → OpenClaw)

```json
{
  "id": "unique-message-id",
  "content": "User message content",
  "session": "optional-session-key",
  "peerKind": "dm | group | channel",
  "peerId": "peer-id",
  "topicId": "optional-topic-id",
  "threadId": "optional-thread-id"
}
```

### Outgoing Messages (OpenClaw → WebSocket)

**Progress (streaming):**

```json
{
  "type": "progress",
  "content": "Partial response text...",
  "session": "session-key"
}
```

**Complete:**

```json
{
  "type": "complete",
  "content": "Final response text",
  "session": "session-key"
}
```

**Error:**

```json
{
  "type": "error",
  "error": "Error message",
  "session": "session-key"
}
```

### Control Messages

**List all sessions:**

```json
{ "type": "session.list" }
```

**Get specific session:**

```json
{ "type": "session.get", "key": "session-key" }
```

**Reset session:**

```json
{ "type": "session.reset", "key": "session-key" }
```

**Delete session:**

```json
{ "type": "session.delete", "key": "session-key" }
```

## Session Scoping

The bridge supports three session scoping modes:

- **per-sender**: Each incoming message gets a unique session key (default)
- **global**: All messages share a single global session
- **explicit**: Use the `session` field from incoming messages, or build from `peerKind`/`peerId`

## See Also

- [openclaw-webhook-bridge GitHub](https://github.com/sternelee/openclaw-webhook-bridge)
- [OpenClaw docs](https://docs.openclaw.ai)

# Gateway Client Specification

## Purpose

WebSocket client that communicates directly with the Moltbot gateway for E2E testing. Sends user messages and captures agent responses + tool calls.

## Interface

```typescript
interface GatewayMessage {
  type: string;
  payload: unknown;
}

class GatewayTestClient {
  constructor(gatewayUrl: string, authToken: string);

  connect(): Promise<void>;
  disconnect(): Promise<void>;

  sendMessage(sessionKey: string, content: string): Promise<void>;
  waitForResponse(type: string, timeoutMs?: number): Promise<GatewayMessage>;

  getMessages(): GatewayMessage[];
  clearMessages(): void;
}
```

## Implementation Requirements

### Connection
- Use `ws` package for WebSocket
- Pass auth token in `Authorization: Bearer <token>` header
- Handle connection errors gracefully

### Message Queue
- Buffer all incoming messages
- Support waiting for specific message types
- Provide access to full message history for assertions

### Timeouts
- Default 30 seconds for response waiting
- Configurable per-call
- Throw descriptive error on timeout

## Protocol Details

### Outbound Message Format
```typescript
{
  type: "message",
  sessionKey: string,  // Test session identifier
  content: string      // User message text
}
```

### Expected Inbound Messages
```typescript
// Agent text response
{ type: "assistant_message", payload: string }

// Tool invocations
{ type: "tool_calls", payload: ToolCall[] }

// Completion signal
{ type: "turn_complete", payload: {} }
```

## TODO: Protocol Discovery

**Action needed**: Examine actual gateway WebSocket protocol to confirm:
1. Exact message format for sending user messages
2. Message types for responses and tool calls
3. Authentication mechanism
4. Session management

Check these files:
- `src/gateway/` - Gateway implementation
- `src/infra/websocket/` - WebSocket handling
- Existing E2E tests for protocol examples

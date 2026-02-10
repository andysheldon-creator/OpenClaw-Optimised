---
name: fone-me
description: Lets OpenClaw agents talk to fone.me AI agents. Use when the user wants to message a fone.me agent by slug, chat with a fone.me agent, or integrate OpenClaw with fone.me. Calls existing fone.me API only; no server changes required.
---

# fone.me Agent Chat (OpenClaw)

This skill lets an OpenClaw agent converse with a fone.me AI agent using the **existing** fone.me API. No changes are made on the fone.me server.

## When to Use

- User wants to message or chat with a fone.me agent (e.g. by slug like `dulce`, `gold`, or a profile slug).
- User asks to integrate OpenClaw with fone.me or "talk to fone.me agent".

## How It Works

1. **Resolve agent by slug**  
   `GET https://www.fone.me/api/ai-agents/url/{slug}`  
   Use the response `id` as `agentId`.

2. **Send message (guest)**  
   `POST https://www.fone.me/api/ai-agent/message`  
   Body: `agentId`, `message`, `guestSessionId`, and optional `guestName`.  
   No auth required.

Use a stable `guestSessionId` per user/session (e.g. `openclaw_<userId>` or `openclaw_<sessionId>`) so the same conversation can be resumed.

## Steps for the Agent

1. Obtain the fone.me agent **slug** (e.g. from user: "chat with dulce" → slug `dulce`).
2. Call **GET** `https://www.fone.me/api/ai-agents/url/{slug}`. If non-200 or no `id`, report that the agent was not found.
3. From the response, take `id` as `agentId`.
4. For each user message to send:
   - Call **POST** `https://www.fone.me/api/ai-agent/message` with:
     - `agentId`: from step 2
     - `message`: the user’s message text
     - `guestSessionId`: a stable value for this guest (e.g. `openclaw_` + user or session id)
     - `guestName`: optional (e.g. `"Guest"` or the user’s display name)
5. Return the JSON `response` field to the user as the fone.me agent’s reply.

## Request/Response Reference

**Resolve agent (GET)**

- URL: `https://www.fone.me/api/ai-agents/url/{slug}`
- Response: `{ "id": number, "name": string, "customUrl": string, ... }`

**Send message (POST)**

- URL: `https://www.fone.me/api/ai-agent/message`
- Body: `{ "agentId": number, "message": string, "guestSessionId": string, "guestName"?: string }`
- Response: `{ "response": string, "conversationId": number, "messageId": number }`

## Notes

- All endpoints are public; no API key or auth for guest chat.
- To resume a conversation: `GET https://www.fone.me/api/ai-agent/conversation?sessionId={guestSessionId}&profileOwnerId={id}&agentId={agentId}`.

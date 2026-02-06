import { Type } from "@sinclair/typebox";
import type { TextPart } from "@a2a-js/sdk";
import { ClientFactory, ClientFactoryOptions, JsonRpcTransportFactory } from "@a2a-js/sdk/client";

import type { A2ARemoteAgent } from "./config.js";
import { resolveOutboundHeaders } from "./outbound-auth.js";

/**
 * Schema for the send_message_to_agent tool parameters.
 */
export const SendMessageToAgentSchema = Type.Object({
  agent_url: Type.String({
    description:
      "Agent Card URL of the target A2A agent (e.g., https://example.com/agent/abc/agent-card.json). " +
      "The agent's messaging endpoint is discovered automatically from the card.",
  }),
  message: Type.String({
    description: "Message to send to the agent",
  }),
  context_id: Type.Optional(
    Type.String({
      description:
        "Context ID for multi-turn conversation. Reuse the contextId from a previous response to continue the same conversation.",
    }),
  ),
});

/**
 * Schema for the get_agent_card tool parameters.
 */
export const GetAgentCardSchema = Type.Object({
  agent_url: Type.String({
    description:
      "Agent Card URL of the A2A agent (e.g., https://example.com/agent/abc/agent-card.json)",
  }),
});

export type SendMessageToAgentParams = {
  agent_url: string;
  message: string;
  context_id?: string;
};

export type GetAgentCardParams = {
  agent_url: string;
};

/**
 * Extract text from A2A message parts.
 */
function extractTextFromParts(parts: unknown[]): string {
  return parts
    .filter((p): p is TextPart => p !== null && typeof p === "object" && (p as TextPart).kind === "text")
    .map((p) => p.text)
    .join("\n");
}

/**
 * Create a fetch wrapper that injects outbound auth headers for the given URL.
 * Headers are resolved once and injected into all subsequent requests.
 */
function createAuthFetch(
  agentUrl: string,
  remoteAgents: A2ARemoteAgent[] | undefined,
): typeof fetch | undefined {
  const headers = resolveOutboundHeaders(agentUrl, remoteAgents);
  if (!headers) {
    return undefined;
  }

  return (input: RequestInfo | URL, init?: RequestInit) => {
    const mergedHeaders = new Headers(init?.headers);
    for (const [k, v] of Object.entries(headers)) {
      mergedHeaders.set(k, v);
    }
    return fetch(input, { ...init, headers: mergedHeaders });
  };
}

/**
 * Card resolver that fetches the agent card directly from the given URL.
 * The agent_url IS the card URL — we fetch it as-is rather than appending
 * /.well-known/agent-card.json.
 */
function createCardResolver(fetchImpl: typeof fetch) {
  return {
    resolve: async (cardUrl: string, _path?: string) => {
      const resp = await fetchImpl(cardUrl);
      if (!resp.ok) {
        throw new Error(`Failed to fetch agent card: ${resp.status}`);
      }
      return resp.json();
    },
  };
}

/**
 * Create a ClientFactory that fetches the agent card directly from agent_url
 * and injects auth headers into both card fetch and message transport.
 */
function createClientFactory(
  agentUrl: string,
  remoteAgents: A2ARemoteAgent[] | undefined,
): ClientFactory {
  const authFetch = createAuthFetch(agentUrl, remoteAgents);
  const fetchImpl = authFetch ?? fetch;

  return new ClientFactory(
    ClientFactoryOptions.createFrom(ClientFactoryOptions.default, {
      transports: [new JsonRpcTransportFactory({ fetchImpl })],
      cardResolver: createCardResolver(fetchImpl),
    }),
  );
}

/**
 * Create the send_message_to_agent tool definition.
 */
export function createSendMessageToAgentTool(remoteAgents?: A2ARemoteAgent[]) {
  return {
    name: "send_message_to_agent",
    label: "Send Message to A2A Agent",
    description:
      "Send a message to another A2A-compatible agent and get their response. " +
      "Use this to communicate with external AI agents that implement the A2A protocol. " +
      "The agent_url should be the Agent Card URL; the messaging endpoint is discovered from the card. " +
      "IMPORTANT: To continue a conversation with the same agent, you MUST reuse the " +
      "contextId returned from the previous call. Each new contextId starts a new conversation.",
    parameters: SendMessageToAgentSchema,
    async execute(
      _toolCallId: string,
      params: SendMessageToAgentParams,
    ): Promise<{ content: Array<{ type: string; text: string }>; details?: unknown }> {
      const json = (payload: unknown) => ({
        content: [{ type: "text", text: JSON.stringify(payload, null, 2) }],
        details: payload,
      });

      try {
        const { agent_url, message, context_id } = params;

        if (!agent_url?.trim()) {
          throw new Error("agent_url is required");
        }
        if (!message?.trim()) {
          throw new Error("message is required");
        }

        // Create client — fetches agent card from agent_url, discovers endpoint
        const factory = createClientFactory(agent_url.trim(), remoteAgents);
        const client = await factory.createFromUrl(agent_url.trim());

        // Send the message
        const response = await client.sendMessage({
          message: {
            messageId: crypto.randomUUID(),
            role: "user",
            parts: [{ kind: "text", text: message }],
            kind: "message",
            contextId: context_id,
          },
        });

        // Handle Message response
        if (response.kind === "message") {
          const text = extractTextFromParts(response.parts);
          return json({
            type: "message",
            contextId: response.contextId,
            text: text || "(empty response)",
            note: "To continue this conversation, pass this contextId in subsequent calls",
          });
        }

        // Handle Task response
        if (response.kind === "task") {
          const artifacts = (response as { artifacts?: Array<{ parts: unknown[] }> }).artifacts ?? [];
          const text = artifacts.flatMap((a) => extractTextFromParts(a.parts)).join("\n");

          return json({
            type: "task",
            taskId: response.id,
            contextId: response.contextId,
            status: response.status?.state,
            text: text || "(no artifacts)",
            note: "To continue this conversation, pass this contextId in subsequent calls",
          });
        }

        // Unknown response type
        return json({
          type: "unknown",
          response,
        });
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : String(err);
        return json({
          error: errorMessage,
        });
      }
    },
  };
}

/**
 * Create the get_agent_card tool definition.
 */
export function createGetAgentCardTool(remoteAgents?: A2ARemoteAgent[]) {
  return {
    name: "get_agent_card",
    label: "Get A2A Agent Card",
    description:
      "Fetch and display an Agent Card from an A2A agent's Agent Card URL. " +
      "Use this to discover an agent's capabilities, skills, and supported modes before sending messages.",
    parameters: GetAgentCardSchema,
    async execute(
      _toolCallId: string,
      params: GetAgentCardParams,
    ): Promise<{ content: Array<{ type: string; text: string }>; details?: unknown }> {
      const json = (payload: unknown) => ({
        content: [{ type: "text", text: JSON.stringify(payload, null, 2) }],
        details: payload,
      });

      try {
        const { agent_url } = params;

        if (!agent_url?.trim()) {
          throw new Error("agent_url is required");
        }

        const factory = createClientFactory(agent_url.trim(), remoteAgents);
        const agentCard = await factory.options.cardResolver!.resolve(agent_url.trim());

        return json({
          name: agentCard.name,
          description: agentCard.description,
          url: agentCard.url,
          version: agentCard.version,
          protocolVersion: agentCard.protocolVersion,
          capabilities: agentCard.capabilities,
          defaultInputModes: agentCard.defaultInputModes,
          defaultOutputModes: agentCard.defaultOutputModes,
          skills: agentCard.skills,
        });
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : String(err);
        return json({
          error: errorMessage,
        });
      }
    },
  };
}

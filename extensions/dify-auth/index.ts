import type { IncomingMessage, ServerResponse } from "node:http";
import { emptyPluginConfigSchema, type OpenClawPluginApi } from "openclaw/plugin-sdk";

const PROVIDER_ID = "dify";
const PROVIDER_LABEL = "dify";
const PROXY_PATH = "/plugins/dify-auth/proxy";
const DEFAULT_BASE_URL = "https://api.dify.ai/v1";
const HEADER_AUTHORIZATION = "Authorization";
const HEADER_CONTENT_TYPE = "Content-Type";

// Helper to manage the composite key format: apiKey;baseUrl;appType
const createCompositeKey = (apiKey: string, baseUrl: string, appType: string) =>
  `${apiKey};${baseUrl};${appType}`;

const parseCompositeKey = (compositeKey: string) => {
  const parts = compositeKey.split(";");
  return {
    apiKey: parts[0] || "",
    baseUrl: parts[1] || "",
    appType: (parts[2] || "chat") as "chat" | "agent",
  };
};

const resolveToolArguments = (input: unknown) => {
  if (typeof input === "string") {
    const trimmed = input.trim();
    return trimmed.length > 0 ? trimmed : "{}";
  }
  return JSON.stringify(input ?? {});
};

const resolveToolCallId = (candidate: unknown) => {
  if (typeof candidate === "string" || typeof candidate === "number") {
    const value = String(candidate).trim();
    if (!value) {
      return "";
    }
    return value.startsWith("call_") ? value : `call_${value}`;
  }
  return "";
};

const resolveDifyToolCall = (data: Record<string, unknown>, appType: "chat" | "agent") => {
  if (appType !== "agent") {
    return null;
  }
  const event = typeof data.event === "string" ? data.event : "";
  if (event === "agent_thought") {
    const toolName = typeof data.tool === "string" ? data.tool.trim() : "";
    if (!toolName) {
      return null;
    }
    const argsString = resolveToolArguments(data.tool_input);
    const callId =
      resolveToolCallId(data.tool_call_id) ||
      resolveToolCallId(data.id) ||
      resolveToolCallId(data.task_id) ||
      `call_${Date.now()}`;
    return { toolName, argsString, callId };
  }
  if (event === "tool_call") {
    const toolName = typeof data.name === "string" ? data.name.trim() : "";
    if (!toolName) {
      return null;
    }
    const argsString = resolveToolArguments(data.arguments);
    const callId =
      resolveToolCallId(data.tool_call_id) ||
      resolveToolCallId(data.task_id) ||
      `call_${Date.now()}`;
    return { toolName, argsString, callId };
  }
  return null;
};

const resolveToolResultPrefix = (message: {
  role?: string;
  name?: string;
  toolName?: string;
  toolCallId?: string;
  toolUseId?: string;
}) => {
  const role = message.role?.toLowerCase();
  if (role !== "toolresult" && role !== "tool" && role !== "tool_result") {
    return "";
  }
  const toolName =
    (typeof message.toolName === "string" && message.toolName.trim()) ||
    (typeof message.name === "string" && message.name.trim()) ||
    "tool";
  const toolCallId =
    (typeof message.toolCallId === "string" && message.toolCallId.trim()) ||
    (typeof message.toolUseId === "string" && message.toolUseId.trim()) ||
    "";
  const idSuffix = toolCallId ? ` id=${toolCallId}` : "";
  return `Tool result (${toolName})${idSuffix}:`;
};

async function verifyDifyKey(apiKey: string, baseUrl: string) {
  const res = await fetch(`${baseUrl}/site`, {
    headers: { [HEADER_AUTHORIZATION]: `Bearer ${apiKey}` },
  });
  if (!res.ok) {
    throw new Error(`Status ${res.status}`);
  }
  return (await res.json()) as { title?: string };
}

const difyAuthPlugin = {
  id: "dify-auth",
  name: "Dify Auth",
  description: "Dify provider authentication and proxy",
  configSchema: emptyPluginConfigSchema(),
  register(api: OpenClawPluginApi) {
    // 1. Register HTTP Proxy Route
    api.registerHttpRoute({ path: PROXY_PATH, handler: handleProxyRequest });

    // 2. Register Provider
    api.registerProvider({
      id: PROVIDER_ID,
      label: PROVIDER_LABEL,
      auth: [
        {
          id: "dify-api-key",
          label: "Dify API Key",
          hint: "API Key & Base URL",
          kind: "api_key",
          run: async (ctx) => {
            // Ask for API Key
            const apiKey = await ctx.prompter.text({
              message: "Enter Dify App API Key",
              validate: (val) => (val?.trim().length > 5 ? undefined : "Invalid Key"),
            });

            // Ask for Base URL
            const baseUrl = await ctx.prompter.text({
              message: "Enter Dify API Base URL",
              initialValue: DEFAULT_BASE_URL,
              validate: (val) =>
                val?.startsWith("http") ? undefined : "Must start with http/https",
            });

            // Ask for App Type
            const appType = await ctx.prompter.select({
              message: "Select App Type",
              options: [
                { value: "chat", label: "ChatFlow" },
                { value: "agent", label: "Agent" },
              ],
            });

            // Verify Key
            const progress = ctx.prompter.progress("Verifying Dify API Key...");
            let siteInfo: { title?: string } = {};
            try {
              siteInfo = await verifyDifyKey(apiKey, baseUrl);
              progress.stop(`Verified: ${siteInfo.title || "Dify App"}`);
            } catch (err) {
              progress.stop("Verification failed");
              throw new Error(`Failed to verify key: ${String(err)}`, { cause: err });
            }

            // Construct Config Patch
            const compositeKey = createCompositeKey(apiKey, baseUrl, appType);

            // Resolve Gateway Port (default to 18789 if not found)
            const gatewayPort = ctx.config.gateway?.port ?? 18789;
            const proxyUrl = `http://127.0.0.1:${gatewayPort}${PROXY_PATH}`;

            // Determine Model ID
            const modelId = appType === "chat" ? "chat-flow" : "agent";
            const defaultName = appType === "chat" ? "Dify ChatFlow" : "Dify Agent";

            return {
              profiles: [
                {
                  profileId: `${PROVIDER_ID}:default`,
                  credential: {
                    type: "api_key",
                    provider: PROVIDER_ID,
                    key: compositeKey,
                  },
                },
              ],
              configPatch: {
                models: {
                  providers: {
                    [PROVIDER_ID]: {
                      baseUrl: proxyUrl,
                      apiKey: compositeKey,
                      api: "openai-completions",
                      models: [
                        {
                          id: modelId,
                          name: siteInfo.title || defaultName,
                          contextWindow: 16000,
                          maxTokens: 4096,
                          // Fix: Add missing required properties
                          reasoning: false,
                          input: ["text", "image"],
                          cost: {
                            input: 0,
                            output: 0,
                            cacheRead: 0,
                            cacheWrite: 0,
                          },
                        },
                      ],
                    },
                  },
                },
                agents: {
                  defaults: {
                    model: {
                      primary: `${PROVIDER_ID}/${modelId}`,
                    },
                  },
                },
              },
            };
          },
        },
      ],
    });
  },
};

const CONVERSATION_TTL_MS = 30 * 60 * 1000;
const MAX_CONVERSATIONS = 1000;

const conversationMap = new Map<string, { id: string; lastSeen: number }>();

const pruneConversationMap = (now: number) => {
  for (const [key, entry] of conversationMap) {
    if (now - entry.lastSeen > CONVERSATION_TTL_MS) {
      conversationMap.delete(key);
    }
  }
  if (conversationMap.size <= MAX_CONVERSATIONS) {
    return;
  }
  const entries = Array.from(conversationMap.entries()).toSorted(
    (a, b) => a[1].lastSeen - b[1].lastSeen,
  );
  const overflow = entries.length - MAX_CONVERSATIONS;
  for (let i = 0; i < overflow; i += 1) {
    conversationMap.delete(entries[i][0]);
  }
};

const getConversationId = (sessionKey: string, now: number) => {
  const entry = conversationMap.get(sessionKey);
  if (!entry) {
    return "";
  }
  entry.lastSeen = now;
  return entry.id;
};

const setConversationId = (sessionKey: string, id: string, now: number) => {
  conversationMap.set(sessionKey, { id, lastSeen: now });
};

// Proxy Handler
async function handleProxyRequest(req: IncomingMessage, res: ServerResponse) {
  // CORS
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type, Accept");
  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    res.end();
    return;
  }

  if (req.method !== "POST") {
    res.statusCode = 405;
    res.end("Method Not Allowed");
    return;
  }

  // Parse Headers
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    res.statusCode = 401;
    res.end("Missing Authorization");
    return;
  }

  const compositeKey = authHeader.replace("Bearer ", "").trim();
  const { apiKey, baseUrl, appType } = parseCompositeKey(compositeKey);

  if (!apiKey || !baseUrl) {
    res.statusCode = 401;
    res.end("Invalid Authorization Format");
    return;
  }

  // Read Body
  const buffers: Buffer[] = [];
  for await (const chunk of req) {
    buffers.push(chunk);
  }
  const bodyStr = Buffer.concat(buffers).toString();
  let body: {
    user?: string;
    messages?: Array<{
      role?: string;
      name?: string;
      toolName?: string;
      toolCallId?: string;
      toolUseId?: string;
      content: string | Array<{ type: string; text?: string; image_url?: { url: string } }>;
    }>;
  };
  try {
    body = JSON.parse(bodyStr);
  } catch {
    res.statusCode = 400;
    res.end("Invalid JSON");
    return;
  }

  console.log("[dify-auth] Proxying request to", baseUrl);

  const messages = body.messages || [];
  const lastMessageEntry = messages[messages.length - 1];
  const lastMessage = lastMessageEntry?.content ?? "";
  const toolResultPrefix = lastMessageEntry ? resolveToolResultPrefix(lastMessageEntry) : "";
  let systemMessage = "";
  for (const message of messages) {
    if (
      typeof message === "object" &&
      message !== null &&
      "role" in message &&
      message.role === "system"
    ) {
      if (typeof message.content === "string") {
        systemMessage = message.content;
      }
      break;
    }
  }

  const userId = body.user || "openclaw-user";
  const sessionKey = `${apiKey}:${userId}`;
  const now = Date.now();
  pruneConversationMap(now);
  let conversationId = getConversationId(sessionKey, now);

  const isReset =
    typeof lastMessage === "string" && lastMessage.includes("A new session was started");
  if (isReset) {
    console.log(`[dify-auth] Resetting session for user ${userId}`);
    conversationId = "";
    conversationMap.delete(sessionKey);
  }

  const difyPayload: {
    inputs: Record<string, unknown>;
    query: string;
    response_mode: string;
    conversation_id: string;
    user: string;
    files: Array<{
      type: string;
      transfer_method: string;
      url?: string;
      upload_file_id?: string;
    }>;
  } = {
    inputs: {},
    query: "",
    response_mode: "streaming",
    conversation_id: conversationId,
    user: userId,
    files: [],
  };

  if (Array.isArray(lastMessage)) {
    const textPart = lastMessage.find((p) => p.type === "text");
    if (textPart?.text) {
      difyPayload.query = toolResultPrefix
        ? `${toolResultPrefix}\n${textPart.text}`
        : textPart.text;
    }

    const imageParts = lastMessage.filter((p) => p.type === "image_url");
    for (const img of imageParts) {
      const url = img.image_url?.url;
      if (!url) {
        continue;
      }

      if (url.startsWith("http")) {
        difyPayload.files.push({
          type: "image",
          transfer_method: "remote_url",
          url: url,
        });
      } else {
        try {
          const fileId = await uploadToDify(url, apiKey, baseUrl);
          difyPayload.files.push({
            type: "image",
            transfer_method: "local_file",
            upload_file_id: fileId,
          });
        } catch {
          // Ignore upload failures for now
        }
      }
    }
  } else {
    const textValue = String(lastMessage);
    difyPayload.query = toolResultPrefix ? `${toolResultPrefix}\n${textValue}` : textValue;
  }

  if (!conversationId && systemMessage && typeof difyPayload.query === "string") {
    console.log("[dify-auth] Injecting System Prompt into new session");
    difyPayload.query = `${systemMessage}\n\n${difyPayload.query}`;
  }

  console.log("[dify-auth] Request payload:", JSON.stringify(difyPayload, null, 2));

  try {
    const endpoint = "/chat-messages";
    const difyRes = await fetch(`${baseUrl}${endpoint}`, {
      method: "POST",
      headers: {
        [HEADER_AUTHORIZATION]: `Bearer ${apiKey}`,
        [HEADER_CONTENT_TYPE]: "application/json",
      },
      body: JSON.stringify(difyPayload),
    });

    if (!difyRes.ok) {
      res.statusCode = difyRes.status;
      res.end(await difyRes.text());
      return;
    }

    res.setHeader(HEADER_CONTENT_TYPE, "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");

    const reader = difyRes.body?.getReader();
    const decoder = new TextDecoder();

    if (!reader) {
      console.error("[dify-auth] No response body reader available");
      res.end();
      return;
    }

    let buffer = "";
    const responseId = `chatcmpl-${Date.now()}`;
    const created = Math.floor(Date.now() / 1000);

    let roleSent = false;
    let toolCallEmitted = false;

    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        if (line.trim() === "") {
          continue;
        }
        if (line.startsWith("data: ")) {
          try {
            const data = JSON.parse(line.slice(6));

            if (data.conversation_id && !conversationMap.has(sessionKey)) {
              setConversationId(sessionKey, data.conversation_id, Date.now());
              console.log(
                `[dify-auth] New session started: ${data.conversation_id} for user ${userId}`,
              );
            } else if (
              data.conversation_id &&
              conversationMap.get(sessionKey)?.id !== data.conversation_id
            ) {
              setConversationId(sessionKey, data.conversation_id, Date.now());
            } else if (data.conversation_id) {
              setConversationId(sessionKey, data.conversation_id, Date.now());
            }

            const toolCall = resolveDifyToolCall(data as Record<string, unknown>, appType);
            if (toolCall) {
              const chunk = {
                id: responseId,
                object: "chat.completion.chunk",
                created,
                model: "dify-app",
                choices: [
                  {
                    index: 0,
                    delta: {
                      ...(roleSent ? {} : { role: "assistant" }),
                      tool_calls: [
                        {
                          index: 0,
                          id: toolCall.callId,
                          type: "function",
                          function: {
                            name: toolCall.toolName,
                            arguments: toolCall.argsString,
                          },
                        },
                      ],
                    },
                    finish_reason: null,
                  },
                ],
              };
              roleSent = true;
              res.write(`data: ${JSON.stringify(chunk)}\n\n`);
              const doneChunk = {
                id: responseId,
                object: "chat.completion.chunk",
                created,
                model: "dify-app",
                choices: [
                  {
                    index: 0,
                    delta: {},
                    finish_reason: "tool_calls",
                  },
                ],
              };
              res.write(`data: ${JSON.stringify(doneChunk)}\n\n`);
              toolCallEmitted = true;
              break;
            }

            const openaiChunk = transformEvent(data);
            if (openaiChunk) {
              if (!roleSent) {
                roleSent = true;
                res.write(
                  `data: ${JSON.stringify({
                    id: responseId,
                    object: "chat.completion.chunk",
                    created,
                    model: "dify-app",
                    choices: [{ index: 0, delta: { role: "assistant" } }],
                  })}\n\n`,
                );
              }
              res.write(`data: ${JSON.stringify(openaiChunk)}\n\n`);
            }
          } catch (e) {
            console.warn("[dify-auth] Parse error:", e, "Line:", line);
          }
        }
      }
      if (toolCallEmitted) {
        break;
      }
    }

    res.write("data: [DONE]\n\n");
    res.end();
  } catch (err) {
    console.error("[dify-auth] Proxy error:", err);
    res.statusCode = 500;
    res.end(String(err));
  }
}

async function uploadToDify(imageUrl: string, apiKey: string, baseUrl: string): Promise<string> {
  const blob = await (await fetch(imageUrl)).blob();
  const formData = new FormData();
  formData.append("file", blob, "image.png");
  formData.append("user", "openclaw-user");

  const res = await fetch(`${baseUrl}/files/upload`, {
    method: "POST",
    headers: { [HEADER_AUTHORIZATION]: `Bearer ${apiKey}` },
    body: formData,
  });

  if (!res.ok) {
    throw new Error(`Upload failed: ${res.status} ${res.statusText}`);
  }

  const json = await res.json();
  return json.id;
}

function transformEvent(difyData: {
  event: string;
  answer?: string;
  thought?: string;
  message?: string;
  task_id?: string;
}) {
  const event = difyData.event;
  let content = "";

  if (event === "message" || event === "agent_message") {
    content = difyData.answer || "";
  } else if (event === "agent_thought") {
    return null;
  } else if (event === "message_end") {
    return null;
  } else if (event === "error") {
    content = `Error: ${difyData.message}`;
  }

  if (!content) {
    return null;
  }

  return {
    id: "chatcmpl-" + (difyData.task_id || "id"),
    object: "chat.completion.chunk",
    created: Math.floor(Date.now() / 1000),
    model: "dify-app",
    choices: [
      {
        index: 0,
        delta: { content },
        finish_reason: null,
      },
    ],
  };
}

export default difyAuthPlugin;

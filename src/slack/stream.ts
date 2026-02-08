import type { WebClient } from "@slack/web-api";
import { logVerbose } from "../globals.js";

export type SlackStreamHandle = {
  /** Append markdown text to the live-updating message. */
  append: (text: string) => Promise<void>;
  /** Finalize the stream. The message becomes a normal Slack message. */
  stop: () => Promise<void>;
};

/**
 * Start a Slack streaming message using the `chat.startStream` /
 * `chat.appendStream` / `chat.stopStream` API family (Web API ≥ 7.11).
 *
 * The helper uses `client.chatStream()` when available and falls back to
 * raw `apiCall` for older SDK builds that expose the methods but not the
 * convenience wrapper.
 */
export async function startSlackStream(params: {
  client: WebClient;
  channel: string;
  threadTs?: string;
}): Promise<SlackStreamHandle> {
  const { client, channel, threadTs } = params;

  // The @slack/web-api >=7.11 exposes chatStream() as a convenience helper.
  const clientAny = client as unknown as {
    chatStream?: (opts: Record<string, unknown>) => {
      append: (opts: { markdown_text: string }) => Promise<void>;
      stop: () => Promise<void>;
    };
  };

  if (typeof clientAny.chatStream === "function") {
    const streamer = clientAny.chatStream({
      channel,
      ...(threadTs ? { thread_ts: threadTs } : {}),
    });
    return {
      append: (text: string) => streamer.append({ markdown_text: text }),
      stop: () => streamer.stop(),
    };
  }

  // Fallback: call raw API methods.
  const startResult = (await client.apiCall("chat.startStream", {
    channel,
    ...(threadTs ? { thread_ts: threadTs } : {}),
  })) as { stream_id?: string };

  const streamId = startResult.stream_id;
  if (!streamId) {
    throw new Error("chat.startStream did not return a stream_id");
  }

  return {
    append: async (text: string) => {
      await client.apiCall("chat.appendStream", {
        stream_id: streamId,
        text,
      });
    },
    stop: async () => {
      await client.apiCall("chat.stopStream", {
        stream_id: streamId,
      });
    },
  };
}

/**
 * Deliver a complete message via streaming, chunking the text into
 * incremental appends.  Falls back to returning `null` if the stream
 * API is unavailable so callers can use the normal `postMessage` path.
 */
export async function deliverViaStream(params: {
  client: WebClient;
  channel: string;
  text: string;
  threadTs?: string;
}): Promise<boolean> {
  try {
    const stream = await startSlackStream({
      client: params.client,
      channel: params.channel,
      threadTs: params.threadTs,
    });
    await stream.append(params.text);
    await stream.stop();
    return true;
  } catch (err) {
    logVerbose(`slack stream delivery failed, will fall back: ${String(err)}`);
    return false;
  }
}

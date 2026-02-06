import type { AgentEvent } from "@mariozechner/pi-agent-core";
import type { EmbeddedPiSubscribeContext } from "./pi-embedded-subscribe.handlers.types.js";
import { emitAgentEvent } from "../infra/agent-events.js";
import { createInlineCodeState } from "../markdown/code-spans.js";

export function handleAgentStart(ctx: EmbeddedPiSubscribeContext) {
  ctx.log.debug(`embedded run agent start: runId=${ctx.params.runId}`);
  emitAgentEvent({
    runId: ctx.params.runId,
    stream: "lifecycle",
    data: {
      phase: "start",
      startedAt: Date.now(),
    },
  });
  void ctx.params.onAgentEvent?.({
    stream: "lifecycle",
    data: { phase: "start" },
  });
}

export function handleAutoCompactionStart(ctx: EmbeddedPiSubscribeContext) {
  ctx.state.compactionInFlight = true;
  ctx.ensureCompactionPromise();
  ctx.log.debug(`embedded run compaction start: runId=${ctx.params.runId}`);
  emitAgentEvent({
    runId: ctx.params.runId,
    stream: "compaction",
    data: { phase: "start" },
  });
  void ctx.params.onAgentEvent?.({
    stream: "compaction",
    data: { phase: "start" },
  });
}

export function handleAutoCompactionEnd(
  ctx: EmbeddedPiSubscribeContext,
  evt: AgentEvent & { willRetry?: unknown },
) {
  ctx.state.compactionInFlight = false;
  const willRetry = Boolean(evt.willRetry);
  if (willRetry) {
    ctx.noteCompactionRetry();
    ctx.resetForCompactionRetry();
    ctx.log.debug(`embedded run compaction retry: runId=${ctx.params.runId}`);
  } else {
    ctx.maybeResolveCompactionWait();
  }
  emitAgentEvent({
    runId: ctx.params.runId,
    stream: "compaction",
    data: { phase: "end", willRetry },
  });
  void ctx.params.onAgentEvent?.({
    stream: "compaction",
    data: { phase: "end", willRetry },
  });
}

export function handleAgentEnd(ctx: EmbeddedPiSubscribeContext) {
  ctx.log.debug(
    `embedded run agent end: runId=${ctx.params.runId} assistantTexts=${ctx.state.assistantTexts.length} messagingToolSentTexts=${ctx.state.messagingToolSentTexts.length}`,
  );

  // When the agent delivered its response via a messaging tool (e.g. sessions_send)
  // and no assistant text was streamed (tool_use-only assistant messages), emit a
  // synthetic assistant event so the WS streaming buffer gets populated before
  // lifecycle end triggers emitChatFinal. Without this, webchat clients receive
  // an empty chat final. Mirrors the CLI backend fallback in agent-runner-execution.ts.
  if (ctx.state.messagingToolSentTexts.length > 0 && ctx.state.assistantTexts.length === 0) {
    const syntheticText = ctx.state.messagingToolSentTexts.join("\n\n").trim();
    if (syntheticText) {
      ctx.log.debug(
        `emitting synthetic assistant event from messaging tool text: runId=${ctx.params.runId} len=${syntheticText.length}`,
      );
      emitAgentEvent({
        runId: ctx.params.runId,
        stream: "assistant",
        data: { text: syntheticText, delta: syntheticText },
      });
    }
  }

  emitAgentEvent({
    runId: ctx.params.runId,
    stream: "lifecycle",
    data: {
      phase: "end",
      endedAt: Date.now(),
    },
  });
  void ctx.params.onAgentEvent?.({
    stream: "lifecycle",
    data: { phase: "end" },
  });

  if (ctx.params.onBlockReply) {
    if (ctx.blockChunker?.hasBuffered()) {
      ctx.blockChunker.drain({ force: true, emit: ctx.emitBlockChunk });
      ctx.blockChunker.reset();
    } else if (ctx.state.blockBuffer.length > 0) {
      ctx.emitBlockChunk(ctx.state.blockBuffer);
      ctx.state.blockBuffer = "";
    }
  }

  ctx.state.blockState.thinking = false;
  ctx.state.blockState.final = false;
  ctx.state.blockState.inlineCode = createInlineCodeState();

  if (ctx.state.pendingCompactionRetry > 0) {
    ctx.resolveCompactionRetry();
  } else {
    ctx.maybeResolveCompactionWait();
  }
}

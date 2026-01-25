export type PendingReceipt = {
  id: string;
  createdAt: string;
  params?: Record<string, unknown>;
};

export type ToolCtx = {
  sessionKey?: string;
  toolName: string;
  toolCallId?: string;
};

function makeKey(ctx: ToolCtx) {
  const callId = ctx.toolCallId?.trim();
  if (callId) return callId;
  return `${ctx.sessionKey ?? ""}::${ctx.toolName}`;
}

export function createReceiptStore() {
  const pending = new Map<string, PendingReceipt>();

  return {
    setPending(ctx: ToolCtx, receipt: PendingReceipt) {
      pending.set(makeKey(ctx), receipt);
    },

    getPending(ctx: ToolCtx): PendingReceipt | undefined {
      return pending.get(makeKey(ctx));
    },

    takePending(ctx: ToolCtx): PendingReceipt | undefined {
      const key = makeKey(ctx);
      const value = pending.get(key);
      pending.delete(key);
      return value;
    },
  };
}

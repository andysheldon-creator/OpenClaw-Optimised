import { AsyncLocalStorage } from "node:async_hooks";

export type ServerContext = {
  orgId: string;
  userId: string;
  agentId?: string;
  sessionId?: string;
  correlationId?: string;
};

const storage = new AsyncLocalStorage<ServerContext>();

export function runWithServerContext<T>(ctx: ServerContext, fn: () => T): T {
  return storage.run(ctx, fn);
}

export function getServerContext(): ServerContext | undefined {
  return storage.getStore();
}

export function requireServerContext(): ServerContext {
  const ctx = storage.getStore();
  if (!ctx) {
    throw new Error("Server context not found (AsyncLocalStorage is empty)");
  }
  return ctx;
}

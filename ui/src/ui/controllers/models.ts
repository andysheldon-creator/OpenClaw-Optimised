import type { GatewayBrowserClient } from "../gateway";

export type ModelEntry = {
  id: string;
  name?: string;
  provider?: string;
  contextWindow?: number;
  reasoning?: boolean;
};

export type ModelsState = {
  client: GatewayBrowserClient | null;
  connected: boolean;
  debugModels: ModelEntry[];
};

export async function loadAvailableModels(state: ModelsState) {
  if (!state.client || !state.connected) return;
  try {
    const res = await state.client.request("models.list", {});
    const payload = res as
      | {
          models?: Array<
            | string
            | {
                id: string;
                name?: string;
                provider?: string;
                contextWindow?: number;
                reasoning?: boolean;
              }
          >;
        }
      | undefined;
    const raw = Array.isArray(payload?.models) ? payload?.models : [];
    state.debugModels = raw.map((m): ModelEntry => {
      if (typeof m === "string") return { id: m, name: m };
      return {
        id: m.id,
        name: m.name,
        provider: m.provider,
        contextWindow: m.contextWindow,
        reasoning: m.reasoning,
      };
    });
  } catch (err) {
    console.warn("[models] Failed to load model catalog:", err);
  }
}

/**
 * HTTP client for Memory Service API
 * @see https://github.com/your-org/memory-service
 */

export const DEFAULT_MEMORY_SERVICE_ENDPOINT = "http://localhost:8002";
export const DEFAULT_MEMORY_SERVICE_TIMEOUT_MS = 30_000;

export type MemoryServiceSearchParams = {
  query: string;
  limit?: number;
};

export type MemoryServiceMemory = {
  id: string;
  content: string;
  score?: number;
  metadata?: Record<string, unknown>;
  createdAt?: string;
};

export type MemoryServiceSearchResponse = {
  memories: MemoryServiceMemory[];
  total?: number;
};

export type MemoryServiceEntity = {
  name: string;
  type?: string;
  count?: number;
  metadata?: Record<string, unknown>;
};

export type MemoryServiceClientOptions = {
  endpoint?: string;
  timeout?: number;
};

export class MemoryServiceClient {
  private readonly endpoint: string;
  private readonly timeout: number;

  constructor(options: MemoryServiceClientOptions = {}) {
    this.endpoint = options.endpoint?.replace(/\/$/, "") || DEFAULT_MEMORY_SERVICE_ENDPOINT;
    this.timeout = options.timeout ?? DEFAULT_MEMORY_SERVICE_TIMEOUT_MS;
  }

  /**
   * Health check for Memory Service
   */
  async health(): Promise<boolean> {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.timeout);

      const url = `${this.endpoint}/health`;
      const res = await fetch(url, {
        method: "GET",
        signal: controller.signal,
      });

      clearTimeout(timeoutId);
      return res.ok;
    } catch (err) {
      return false;
    }
  }

  /**
   * Search memories by query
   */
  async search(params: MemoryServiceSearchParams): Promise<MemoryServiceSearchResponse> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const url = new URL(`${this.endpoint}/memories/search`);
      url.searchParams.set("query", params.query);
      if (params.limit !== undefined) {
        url.searchParams.set("limit", params.limit.toString());
      }

      const res = await fetch(url.toString(), {
        method: "GET",
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!res.ok) {
        const text = await res.text();
        throw new Error(`memory service search failed: ${res.status} ${text}`);
      }

      const data = (await res.json()) as {
        memories?: Array<{
          id?: string;
          content?: string;
          score?: number;
          metadata?: Record<string, unknown>;
          created_at?: string;
        }>;
        total?: number;
      };

      return {
        memories: (data.memories ?? []).map((m) => ({
          id: m.id ?? "",
          content: m.content ?? "",
          score: m.score,
          metadata: m.metadata,
          createdAt: m.created_at,
        })),
        total: data.total,
      };
    } catch (err) {
      clearTimeout(timeoutId);
      if (err instanceof Error && err.name === "AbortError") {
        throw new Error(`memory service search timeout after ${this.timeout}ms`);
      }
      throw err;
    }
  }

  /**
   * List entities from the memory service
   */
  async listEntities(): Promise<MemoryServiceEntity[]> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const url = `${this.endpoint}/entities`;
      const res = await fetch(url, {
        method: "GET",
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!res.ok) {
        const text = await res.text();
        throw new Error(`memory service list entities failed: ${res.status} ${text}`);
      }

      const data = (await res.json()) as {
        entities?: Array<{
          name?: string;
          type?: string;
          count?: number;
          metadata?: Record<string, unknown>;
        }>;
      };

      return (data.entities ?? []).map((e) => ({
        name: e.name ?? "",
        type: e.type,
        count: e.count,
        metadata: e.metadata,
      }));
    } catch (err) {
      clearTimeout(timeoutId);
      if (err instanceof Error && err.name === "AbortError") {
        throw new Error(`memory service list entities timeout after ${this.timeout}ms`);
      }
      throw err;
    }
  }
}

/**
 * Create a Memory Service client with the given options
 */
export function createMemoryServiceClient(
  options: MemoryServiceClientOptions = {},
): MemoryServiceClient {
  return new MemoryServiceClient(options);
}

import { afterEach, describe, expect, it } from "vitest";
import { loadDotEnvWithSupabase } from "./dotenv.js";
import { fetchSupabaseEnvVars, loadSupabaseEnv, resolveSupabaseEnvConfig } from "./supabase-env.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createMockFetch(body: unknown, status = 200, statusText = "OK"): typeof globalThis.fetch {
  return async (_input: string | URL | Request, _init?: RequestInit) => {
    return new Response(JSON.stringify(body), {
      status,
      statusText,
      headers: { "Content-Type": "application/json" },
    });
  };
}

function createTimeoutFetch(): typeof globalThis.fetch {
  return async (_input: string | URL | Request, init?: RequestInit) => {
    return new Promise((_resolve, reject) => {
      const onAbort = () => {
        const err = new DOMException("The operation was aborted.", "AbortError");
        reject(err);
      };
      if (init?.signal?.aborted) {
        onAbort();
        return;
      }
      init?.signal?.addEventListener("abort", onAbort, { once: true });
    });
  };
}

function createErrorFetch(): typeof globalThis.fetch {
  return async () => {
    throw new Error("Network failure");
  };
}

// ---------------------------------------------------------------------------
// resolveSupabaseEnvConfig
// ---------------------------------------------------------------------------

describe("resolveSupabaseEnvConfig", () => {
  it("returns null when SUPABASE_URL is missing", () => {
    const env = { SUPABASE_SERVICE_ROLE_KEY: "key123" } as NodeJS.ProcessEnv;
    expect(resolveSupabaseEnvConfig(env)).toBeNull();
  });

  it("returns null when SUPABASE_SERVICE_ROLE_KEY is missing", () => {
    const env = { SUPABASE_URL: "https://xyz.supabase.co" } as NodeJS.ProcessEnv;
    expect(resolveSupabaseEnvConfig(env)).toBeNull();
  });

  it("returns null when both vars are empty strings", () => {
    const env = {
      SUPABASE_URL: "  ",
      SUPABASE_SERVICE_ROLE_KEY: "",
    } as NodeJS.ProcessEnv;
    expect(resolveSupabaseEnvConfig(env)).toBeNull();
  });

  it("returns config with defaults when both bootstrap vars are set", () => {
    const env = {
      SUPABASE_URL: "https://xyz.supabase.co",
      SUPABASE_SERVICE_ROLE_KEY: "key123",
    } as NodeJS.ProcessEnv;

    const config = resolveSupabaseEnvConfig(env);
    expect(config).toEqual({
      supabaseUrl: "https://xyz.supabase.co",
      supabaseKey: "key123",
      table: "env_vars",
      timeoutMs: 5000,
    });
  });

  it("respects custom table and timeout overrides", () => {
    const env = {
      SUPABASE_URL: "https://xyz.supabase.co",
      SUPABASE_SERVICE_ROLE_KEY: "key123",
      SUPABASE_ENV_TABLE: "my_secrets",
      SUPABASE_ENV_TIMEOUT_MS: "3000",
    } as NodeJS.ProcessEnv;

    const config = resolveSupabaseEnvConfig(env);
    expect(config).toEqual({
      supabaseUrl: "https://xyz.supabase.co",
      supabaseKey: "key123",
      table: "my_secrets",
      timeoutMs: 3000,
    });
  });

  it("falls back to default timeout for invalid values", () => {
    const env = {
      SUPABASE_URL: "https://xyz.supabase.co",
      SUPABASE_SERVICE_ROLE_KEY: "key123",
      SUPABASE_ENV_TIMEOUT_MS: "not-a-number",
    } as NodeJS.ProcessEnv;

    const config = resolveSupabaseEnvConfig(env);
    expect(config?.timeoutMs).toBe(5000);
  });
});

// ---------------------------------------------------------------------------
// fetchSupabaseEnvVars
// ---------------------------------------------------------------------------

describe("fetchSupabaseEnvVars", () => {
  it("fetches rows from the PostgREST endpoint", async () => {
    const mockData = [
      { key: "OPENAI_API_KEY", value: "sk-test-123" },
      { key: "TELEGRAM_BOT_TOKEN", value: "12345:ABCDEF" },
    ];

    const rows = await fetchSupabaseEnvVars({
      supabaseUrl: "https://xyz.supabase.co",
      supabaseKey: "test-key",
      fetchFn: createMockFetch(mockData),
    });

    expect(rows).toEqual(mockData);
  });

  it("sends correct headers", async () => {
    let capturedHeaders: Record<string, string> = {};

    const spyFetch: typeof globalThis.fetch = async (
      _input: string | URL | Request,
      init?: RequestInit,
    ) => {
      const headers = init?.headers as Record<string, string> | undefined;
      capturedHeaders = { ...headers };
      return new Response("[]", {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    };

    await fetchSupabaseEnvVars({
      supabaseUrl: "https://xyz.supabase.co",
      supabaseKey: "my-service-key",
      fetchFn: spyFetch,
    });

    expect(capturedHeaders.apikey).toBe("my-service-key");
    expect(capturedHeaders.Authorization).toBe("Bearer my-service-key");
    expect(capturedHeaders.Accept).toBe("application/json");
  });

  it("queries the correct URL with custom table name", async () => {
    let capturedUrl = "";

    const spyFetch: typeof globalThis.fetch = async (
      input: string | URL | Request,
      _init?: RequestInit,
    ) => {
      capturedUrl = String(input);
      return new Response("[]", {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    };

    await fetchSupabaseEnvVars({
      supabaseUrl: "https://xyz.supabase.co/",
      supabaseKey: "test-key",
      table: "custom_secrets",
      fetchFn: spyFetch,
    });

    expect(capturedUrl).toBe("https://xyz.supabase.co/rest/v1/custom_secrets?select=key,value");
  });

  it("strips trailing slashes from the URL", async () => {
    let capturedUrl = "";

    const spyFetch: typeof globalThis.fetch = async (
      input: string | URL | Request,
      _init?: RequestInit,
    ) => {
      capturedUrl = String(input);
      return new Response("[]", {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    };

    await fetchSupabaseEnvVars({
      supabaseUrl: "https://xyz.supabase.co///",
      supabaseKey: "test-key",
      fetchFn: spyFetch,
    });

    expect(capturedUrl).toContain("https://xyz.supabase.co/rest/v1/env_vars");
  });

  it("returns empty array on HTTP error", async () => {
    const rows = await fetchSupabaseEnvVars({
      supabaseUrl: "https://xyz.supabase.co",
      supabaseKey: "test-key",
      fetchFn: createMockFetch({ message: "Unauthorized" }, 401, "Unauthorized"),
    });

    expect(rows).toEqual([]);
  });

  it("returns empty array on non-array response", async () => {
    const rows = await fetchSupabaseEnvVars({
      supabaseUrl: "https://xyz.supabase.co",
      supabaseKey: "test-key",
      fetchFn: createMockFetch({ error: "not an array" }),
    });

    expect(rows).toEqual([]);
  });

  it("filters out rows with missing key or value", async () => {
    const mockData = [
      { key: "GOOD_KEY", value: "good-value" },
      { key: 123, value: "bad-key-type" },
      { key: "MISSING_VALUE" },
      { value: "missing_key" },
      null,
      "not-an-object",
    ];

    const rows = await fetchSupabaseEnvVars({
      supabaseUrl: "https://xyz.supabase.co",
      supabaseKey: "test-key",
      fetchFn: createMockFetch(mockData),
    });

    expect(rows).toEqual([{ key: "GOOD_KEY", value: "good-value" }]);
  });

  it("returns empty array on timeout", async () => {
    const rows = await fetchSupabaseEnvVars({
      supabaseUrl: "https://xyz.supabase.co",
      supabaseKey: "test-key",
      timeoutMs: 1,
      fetchFn: createTimeoutFetch(),
    });

    expect(rows).toEqual([]);
  });

  it("returns empty array on network error", async () => {
    const rows = await fetchSupabaseEnvVars({
      supabaseUrl: "https://xyz.supabase.co",
      supabaseKey: "test-key",
      fetchFn: createErrorFetch(),
    });

    expect(rows).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// loadSupabaseEnv
// ---------------------------------------------------------------------------

describe("loadSupabaseEnv", () => {
  const savedEnv: Record<string, string | undefined> = {};
  const keysToClean: string[] = [];

  function saveKey(key: string): void {
    savedEnv[key] = process.env[key];
    keysToClean.push(key);
  }

  afterEach(() => {
    for (const key of keysToClean) {
      if (savedEnv[key] === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = savedEnv[key];
      }
    }
    keysToClean.length = 0;
  });

  it("returns 0 when bootstrap vars are not set", async () => {
    const env: NodeJS.ProcessEnv = {};
    const result = await loadSupabaseEnv({ env });
    expect(result).toBe(0);
  });

  it("applies fetched env vars to the env object", async () => {
    const env: NodeJS.ProcessEnv = {
      SUPABASE_URL: "https://xyz.supabase.co",
      SUPABASE_SERVICE_ROLE_KEY: "test-key",
    };

    const mockData = [
      { key: "MY_SECRET_A", value: "value-a" },
      { key: "MY_SECRET_B", value: "value-b" },
    ];

    const result = await loadSupabaseEnv({
      env,
      fetchFn: createMockFetch(mockData),
    });

    expect(result).toBe(2);
    expect(env.MY_SECRET_A).toBe("value-a");
    expect(env.MY_SECRET_B).toBe("value-b");
  });

  it("does not override existing non-empty env vars", async () => {
    const env: NodeJS.ProcessEnv = {
      SUPABASE_URL: "https://xyz.supabase.co",
      SUPABASE_SERVICE_ROLE_KEY: "test-key",
      EXISTING_KEY: "original-value",
    };

    const mockData = [
      { key: "EXISTING_KEY", value: "supabase-value" },
      { key: "NEW_KEY", value: "new-value" },
    ];

    const result = await loadSupabaseEnv({
      env,
      fetchFn: createMockFetch(mockData),
    });

    expect(result).toBe(1);
    expect(env.EXISTING_KEY).toBe("original-value");
    expect(env.NEW_KEY).toBe("new-value");
  });

  it("overrides empty-string env vars", async () => {
    const env: NodeJS.ProcessEnv = {
      SUPABASE_URL: "https://xyz.supabase.co",
      SUPABASE_SERVICE_ROLE_KEY: "test-key",
      EMPTY_KEY: "",
    };

    const mockData = [{ key: "EMPTY_KEY", value: "filled-from-supabase" }];

    const result = await loadSupabaseEnv({
      env,
      fetchFn: createMockFetch(mockData),
    });

    expect(result).toBe(1);
    expect(env.EMPTY_KEY).toBe("filled-from-supabase");
  });

  it("skips rows with blank keys", async () => {
    const env: NodeJS.ProcessEnv = {
      SUPABASE_URL: "https://xyz.supabase.co",
      SUPABASE_SERVICE_ROLE_KEY: "test-key",
    };

    const mockData = [
      { key: "  ", value: "blank-key" },
      { key: "VALID_KEY", value: "valid-value" },
    ];

    const result = await loadSupabaseEnv({
      env,
      fetchFn: createMockFetch(mockData),
    });

    expect(result).toBe(1);
    expect(env.VALID_KEY).toBe("valid-value");
  });

  it("returns 0 on fetch failure without crashing", async () => {
    const env: NodeJS.ProcessEnv = {
      SUPABASE_URL: "https://xyz.supabase.co",
      SUPABASE_SERVICE_ROLE_KEY: "test-key",
    };

    const result = await loadSupabaseEnv({
      env,
      fetchFn: createErrorFetch(),
    });

    expect(result).toBe(0);
  });

  it("works with process.env when bootstrap vars are present", async () => {
    saveKey("SUPABASE_URL");
    saveKey("SUPABASE_SERVICE_ROLE_KEY");
    saveKey("SUPABASE_TEST_INJECTED");

    process.env.SUPABASE_URL = "https://xyz.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "test-key";
    delete process.env.SUPABASE_TEST_INJECTED;

    const mockData = [{ key: "SUPABASE_TEST_INJECTED", value: "it-works" }];

    const result = await loadSupabaseEnv({
      fetchFn: createMockFetch(mockData),
    });

    expect(result).toBe(1);
    expect(process.env.SUPABASE_TEST_INJECTED).toBe("it-works");
  });
});

// ---------------------------------------------------------------------------
// Integration: loadDotEnvWithSupabase (full flow simulation)
// ---------------------------------------------------------------------------

describe("loadDotEnvWithSupabase integration", () => {
  const savedEnv: Record<string, string | undefined> = {};
  const keysToClean: string[] = [];

  function saveKey(key: string): void {
    savedEnv[key] = process.env[key];
    keysToClean.push(key);
  }

  afterEach(() => {
    for (const key of keysToClean) {
      if (savedEnv[key] === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = savedEnv[key];
      }
    }
    keysToClean.length = 0;
  });

  it("returns supabaseApplied=0 when bootstrap vars are unset", async () => {
    saveKey("SUPABASE_URL");
    saveKey("SUPABASE_SERVICE_ROLE_KEY");
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;

    const result = await loadDotEnvWithSupabase({ quiet: true });
    expect(result.supabaseApplied).toBe(0);
  });

  it("makes Supabase vars available in process.env before config would load", async () => {
    saveKey("SUPABASE_URL");
    saveKey("SUPABASE_SERVICE_ROLE_KEY");
    saveKey("OPENAI_API_KEY");
    saveKey("TELEGRAM_BOT_TOKEN");

    process.env.SUPABASE_URL = "https://test.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "test-key";
    delete process.env.OPENAI_API_KEY;
    delete process.env.TELEGRAM_BOT_TOKEN;

    // Monkey-patch global fetch for this test
    const originalFetch = globalThis.fetch;
    globalThis.fetch = createMockFetch([
      { key: "OPENAI_API_KEY", value: "sk-from-supabase" },
      { key: "TELEGRAM_BOT_TOKEN", value: "123:from-supabase" },
    ]);

    try {
      const result = await loadDotEnvWithSupabase({ quiet: true });

      expect(result.supabaseApplied).toBe(2);

      // At this point in real startup, loadConfig() would run and see these:
      expect(process.env.OPENAI_API_KEY).toBe("sk-from-supabase");
      expect(process.env.TELEGRAM_BOT_TOKEN).toBe("123:from-supabase");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("local .env vars take precedence over Supabase vars", async () => {
    saveKey("SUPABASE_URL");
    saveKey("SUPABASE_SERVICE_ROLE_KEY");
    saveKey("ALREADY_SET_KEY");

    process.env.SUPABASE_URL = "https://test.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "test-key";
    process.env.ALREADY_SET_KEY = "local-value";

    const originalFetch = globalThis.fetch;
    globalThis.fetch = createMockFetch([{ key: "ALREADY_SET_KEY", value: "supabase-value" }]);

    try {
      const result = await loadDotEnvWithSupabase({ quiet: true });

      expect(result.supabaseApplied).toBe(0);
      expect(process.env.ALREADY_SET_KEY).toBe("local-value");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

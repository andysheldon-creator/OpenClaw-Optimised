import { execFile } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import { promisify } from "node:util";
import type { EmbeddingProvider, EmbeddingProviderOptions } from "./embeddings.js";
import { isTruthyEnvValue } from "../infra/env.js";
import { createSubsystemLogger } from "../logging/subsystem.js";

const execFileAsync = promisify(execFile);

export type VertexEmbeddingClient = {
  project: string;
  location: string;
  model: string;
  getAccessToken: () => Promise<string>;
};

export const DEFAULT_VERTEX_EMBEDDING_MODEL = "text-embedding-005";

const DEFAULT_VERTEX_LOCATION = "us-central1";
const SCOPES = "https://www.googleapis.com/auth/cloud-platform";
const TOKEN_URL = "https://oauth2.googleapis.com/token";

const debugEmbeddings = isTruthyEnvValue(process.env.OPENCLAW_DEBUG_MEMORY_EMBEDDINGS);
const log = createSubsystemLogger("memory/embeddings");

const debugLog = (message: string, meta?: Record<string, unknown>) => {
  if (!debugEmbeddings) {
    return;
  }
  const suffix = meta ? ` ${JSON.stringify(meta)}` : "";
  log.raw(`${message}${suffix}`);
};

function resolveLocation(): string {
  const raw = process.env.GOOGLE_CLOUD_LOCATION?.trim();
  if (!raw || raw === "global") {
    return DEFAULT_VERTEX_LOCATION;
  }
  return raw;
}

export function normalizeVertexModel(model: string): string {
  const trimmed = model.trim();
  if (!trimmed) {
    return DEFAULT_VERTEX_EMBEDDING_MODEL;
  }
  if (trimmed.startsWith("google-vertex/")) {
    return trimmed.slice("google-vertex/".length);
  }
  if (trimmed.startsWith("vertex/")) {
    return trimmed.slice("vertex/".length);
  }
  return trimmed;
}

interface ServiceAccountKey {
  client_email: string;
  private_key: string;
}

async function getAccessTokenFromGcloud(): Promise<string> {
  try {
    const { stdout } = await execFileAsync("gcloud", ["auth", "print-access-token"], {
      timeout: 10000,
      encoding: "utf-8",
    });
    const token = stdout.trim();
    if (!token) {
      throw new Error("gcloud auth print-access-token returned empty result");
    }
    return token;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(
      `Failed to get access token via gcloud CLI: ${msg}. ` +
        `Either set GOOGLE_APPLICATION_CREDENTIALS to a service account key file, ` +
        `or run 'gcloud auth login' and ensure gcloud is installed.`,
      { cause: err },
    );
  }
}

function createTokenResolver(saPath: string | undefined): () => Promise<string> {
  let cachedToken: string | null = null;
  let cachedTokenExpiry = 0;

  return async () => {
    const now = Math.floor(Date.now() / 1000);
    if (cachedToken && now < cachedTokenExpiry) {
      return cachedToken;
    }

    if (saPath) {
      debugLog("vertex auth: using service account key", { saPath });

      let sa: ServiceAccountKey;
      try {
        sa = JSON.parse(fs.readFileSync(saPath, "utf-8")) as ServiceAccountKey;
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        throw new Error(
          `Failed to read service account key from ${saPath}: ${msg}. ` +
            `Ensure GOOGLE_APPLICATION_CREDENTIALS points to a valid JSON service account key file.`,
          { cause: err },
        );
      }
      if (!sa.client_email || !sa.private_key) {
        throw new Error(
          `Service account key at ${saPath} is missing required fields (client_email, private_key). ` +
            `Ensure the file is a valid Google Cloud service account key in JSON format.`,
        );
      }

      const header = Buffer.from(JSON.stringify({ alg: "RS256", typ: "JWT" })).toString(
        "base64url",
      );
      const payload = Buffer.from(
        JSON.stringify({
          iss: sa.client_email,
          scope: SCOPES,
          aud: TOKEN_URL,
          iat: now,
          exp: now + 3600,
        }),
      ).toString("base64url");

      const unsigned = `${header}.${payload}`;
      const signer = crypto.createSign("RSA-SHA256");
      signer.update(unsigned);
      const signature = signer.sign(sa.private_key, "base64url");
      const jwt = `${unsigned}.${signature}`;

      const res = await fetch(TOKEN_URL, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`,
      });
      if (!res.ok) {
        const text = await res.text();
        cachedToken = null;
        cachedTokenExpiry = 0;
        throw new Error(`Vertex AI token exchange failed: ${res.status} ${text}`);
      }
      const data = (await res.json()) as { access_token: string; expires_in: number };
      // Cache with 5-minute safety margin.
      cachedToken = data.access_token;
      cachedTokenExpiry = now + data.expires_in - 300;
      return data.access_token;
    }

    debugLog("vertex auth: falling back to gcloud CLI");
    // gcloud tokens are short-lived; don't cache them aggressively.
    const token = await getAccessTokenFromGcloud();
    cachedToken = token;
    // gcloud tokens typically last 3600s; cache for 50 minutes.
    cachedTokenExpiry = now + 3000;
    return token;
  };
}

function buildPredictUrl(project: string, location: string, model: string): string {
  return `https://${location}-aiplatform.googleapis.com/v1/projects/${project}/locations/${location}/publishers/google/models/${model}:predict`;
}

export async function createVertexEmbeddingProvider(
  options: EmbeddingProviderOptions,
): Promise<{ provider: EmbeddingProvider; client: VertexEmbeddingClient }> {
  const project = process.env.GOOGLE_CLOUD_PROJECT?.trim();
  if (!project) {
    throw new Error(
      "GOOGLE_CLOUD_PROJECT environment variable is required for google-vertex embedding provider.",
    );
  }

  const location = resolveLocation();
  const model = normalizeVertexModel(options.model);
  const predictUrl = buildPredictUrl(project, location, model);

  const saPath = process.env.GOOGLE_APPLICATION_CREDENTIALS?.trim() || undefined;
  const resolveAccessToken = createTokenResolver(saPath);

  debugLog("vertex provider: created", {
    project,
    location,
    model,
    predictUrl,
    authMethod: saPath ? "service-account" : "gcloud-cli",
  });

  const client: VertexEmbeddingClient = {
    project,
    location,
    model,
    getAccessToken: resolveAccessToken,
  };

  const predict = async (
    instances: Array<{ content: string; task_type: string }>,
  ): Promise<number[][]> => {
    if (instances.length === 0) {
      return [];
    }
    const token = await client.getAccessToken();
    const res = await fetch(predictUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ instances }),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`vertex embeddings failed: ${res.status} ${text}`);
    }
    const responseBody = (await res.json()) as {
      predictions?: Array<{ embeddings?: { values?: number[] } }>;
    };
    const predictions = responseBody.predictions;
    if (!predictions || !Array.isArray(predictions)) {
      throw new Error(`vertex embeddings: unexpected response shape — missing 'predictions' array`);
    }
    if (predictions.length !== instances.length) {
      throw new Error(
        `vertex embeddings: expected ${instances.length} predictions but got ${predictions.length}`,
      );
    }
    return predictions.map((p, i) => {
      const values = p.embeddings?.values;
      if (!values || !Array.isArray(values) || values.length === 0) {
        throw new Error(
          `vertex embeddings: prediction[${i}] has missing or empty embeddings.values`,
        );
      }
      return values;
    });
  };

  const embedQuery = async (text: string): Promise<number[]> => {
    if (!text.trim()) {
      return [];
    }
    const results = await predict([{ content: text, task_type: "RETRIEVAL_QUERY" }]);
    return results[0] ?? [];
  };

  const embedBatch = async (texts: string[]): Promise<number[][]> => {
    if (texts.length === 0) {
      return [];
    }
    const instances = texts.map((text) => ({ content: text, task_type: "RETRIEVAL_DOCUMENT" }));
    return predict(instances);
  };

  return {
    provider: {
      id: "google-vertex",
      model,
      embedQuery,
      embedBatch,
    },
    client,
  };
}

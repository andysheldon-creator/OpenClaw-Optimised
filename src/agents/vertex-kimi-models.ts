import type { ModelDefinitionConfig } from "../config/types.models.js";
import type { ProviderConfig } from "./models-config.providers.js";

// ---------------------------------------------------------------------------
// GCP environment resolution
// ---------------------------------------------------------------------------

const GCP_PROJECT_ENV_VARS = [
  "GOOGLE_CLOUD_PROJECT",
  "GCLOUD_PROJECT",
  "CLOUDSDK_CORE_PROJECT",
] as const;

const GCP_LOCATION_ENV_VARS = ["GOOGLE_CLOUD_LOCATION", "CLOUDSDK_COMPUTE_REGION"] as const;

/** Default Vertex AI location for Kimi models. */
const DEFAULT_GCP_LOCATION = "us-central1";

/**
 * Resolve the GCP project ID from environment variables.
 * Returns the first non-empty value found, or `undefined`.
 */
export function resolveGcpProject(env: NodeJS.ProcessEnv = process.env): string | undefined {
  for (const envVar of GCP_PROJECT_ENV_VARS) {
    const value = env[envVar]?.trim();
    if (value) {
      return value;
    }
  }
  return undefined;
}

/**
 * Resolve the GCP location (region) from environment variables.
 * Falls back to {@link DEFAULT_GCP_LOCATION} when nothing is set.
 */
export function resolveGcpLocation(env: NodeJS.ProcessEnv = process.env): string {
  for (const envVar of GCP_LOCATION_ENV_VARS) {
    const value = env[envVar]?.trim();
    if (value) {
      return value;
    }
  }
  return DEFAULT_GCP_LOCATION;
}

/**
 * Detect whether gcloud Application Default Credentials are available.
 * Checks the `GOOGLE_APPLICATION_CREDENTIALS` env var which points to a
 * service-account key file or workload-identity config.
 */
export function hasGcloudAdc(env: NodeJS.ProcessEnv = process.env): boolean {
  return Boolean(env.GOOGLE_APPLICATION_CREDENTIALS?.trim());
}

// ---------------------------------------------------------------------------
// Vertex AI base URL
// ---------------------------------------------------------------------------

/**
 * Build the OpenAI-compatible base URL for Vertex AI.
 *
 * Format:
 * `https://{LOCATION}-aiplatform.googleapis.com/v1beta1/projects/{PROJECT}/locations/{LOCATION}/endpoints/openapi`
 *
 * The OpenAI SDK appends `/chat/completions` automatically.
 */
export function buildVertexKimiBaseUrl(project: string, location: string): string {
  return `https://${location}-aiplatform.googleapis.com/v1beta1/projects/${project}/locations/${location}/endpoints/openapi`;
}

// ---------------------------------------------------------------------------
// Kimi K2 model catalog on Vertex AI
// ---------------------------------------------------------------------------

/** Publisher prefix used for Kimi models on Vertex AI Model Garden. */
const VERTEX_KIMI_PUBLISHER = "moonshotai";

const VERTEX_KIMI_CONTEXT_WINDOW = 131072;
const VERTEX_KIMI_MAX_TOKENS = 8192;

const VERTEX_KIMI_COST = {
  input: 0,
  output: 0,
  cacheRead: 0,
  cacheWrite: 0,
} as const;

interface VertexKimiModelEntry {
  /** Vertex model ID without the publisher prefix (e.g. "kimi-k2"). */
  id: string;
  name: string;
  reasoning: boolean;
}

const VERTEX_KIMI_MODEL_CATALOG: readonly VertexKimiModelEntry[] = [
  { id: "kimi-k2", name: "Kimi K2", reasoning: false },
  { id: "kimi-k2-thinking", name: "Kimi K2 Thinking", reasoning: true },
] as const;

/**
 * Return the full list of Kimi K2 model definitions for Vertex AI.
 * Model IDs are prefixed with the publisher (`moonshotai/kimi-k2`).
 */
export function getVertexKimiModels(): ModelDefinitionConfig[] {
  return VERTEX_KIMI_MODEL_CATALOG.map((entry) => ({
    id: `${VERTEX_KIMI_PUBLISHER}/${entry.id}`,
    name: entry.name,
    reasoning: entry.reasoning,
    input: ["text"] as Array<"text" | "image">,
    cost: { ...VERTEX_KIMI_COST },
    contextWindow: VERTEX_KIMI_CONTEXT_WINDOW,
    maxTokens: VERTEX_KIMI_MAX_TOKENS,
  }));
}

// ---------------------------------------------------------------------------
// Provider builder
// ---------------------------------------------------------------------------

/**
 * Build the `vertex-kimi` provider configuration.
 *
 * Uses the OpenAI-compatible chat completions endpoint on Vertex AI with
 * gcloud ADC bearer-token auth.
 */
export function buildVertexKimiProvider(project: string, location: string): ProviderConfig {
  return {
    baseUrl: buildVertexKimiBaseUrl(project, location),
    api: "openai-completions",
    models: getVertexKimiModels(),
  };
}

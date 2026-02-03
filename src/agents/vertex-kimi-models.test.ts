import { describe, expect, it } from "vitest";
import {
  buildVertexKimiBaseUrl,
  buildVertexKimiProvider,
  getVertexKimiModels,
  hasGcloudAdc,
  resolveGcpLocation,
  resolveGcpProject,
} from "./vertex-kimi-models.js";

describe("resolveGcpProject", () => {
  it("returns GOOGLE_CLOUD_PROJECT when set", () => {
    expect(resolveGcpProject({ GOOGLE_CLOUD_PROJECT: "my-project" })).toBe("my-project");
  });

  it("returns GCLOUD_PROJECT when GOOGLE_CLOUD_PROJECT is empty", () => {
    expect(
      resolveGcpProject({ GOOGLE_CLOUD_PROJECT: "", GCLOUD_PROJECT: "fallback-project" }),
    ).toBe("fallback-project");
  });

  it("returns CLOUDSDK_CORE_PROJECT as last resort", () => {
    expect(resolveGcpProject({ CLOUDSDK_CORE_PROJECT: "sdk-project" })).toBe("sdk-project");
  });

  it("returns undefined when no env vars are set", () => {
    expect(resolveGcpProject({})).toBeUndefined();
  });

  it("trims whitespace from project ID", () => {
    expect(resolveGcpProject({ GOOGLE_CLOUD_PROJECT: "  spaced-project  " })).toBe(
      "spaced-project",
    );
  });
});

describe("resolveGcpLocation", () => {
  it("returns GOOGLE_CLOUD_LOCATION when set", () => {
    expect(resolveGcpLocation({ GOOGLE_CLOUD_LOCATION: "europe-west1" })).toBe("europe-west1");
  });

  it("returns CLOUDSDK_COMPUTE_REGION as fallback", () => {
    expect(resolveGcpLocation({ CLOUDSDK_COMPUTE_REGION: "asia-southeast1" })).toBe(
      "asia-southeast1",
    );
  });

  it("returns us-central1 when no env vars are set", () => {
    expect(resolveGcpLocation({})).toBe("us-central1");
  });

  it("trims whitespace from location", () => {
    expect(resolveGcpLocation({ GOOGLE_CLOUD_LOCATION: "  us-east4  " })).toBe("us-east4");
  });
});

describe("hasGcloudAdc", () => {
  it("returns true when GOOGLE_APPLICATION_CREDENTIALS is set", () => {
    expect(hasGcloudAdc({ GOOGLE_APPLICATION_CREDENTIALS: "/path/to/key.json" })).toBe(true);
  });

  it("returns false when GOOGLE_APPLICATION_CREDENTIALS is empty", () => {
    expect(hasGcloudAdc({ GOOGLE_APPLICATION_CREDENTIALS: "  " })).toBe(false);
  });

  it("returns false when GOOGLE_APPLICATION_CREDENTIALS is not set", () => {
    expect(hasGcloudAdc({})).toBe(false);
  });
});

describe("buildVertexKimiBaseUrl", () => {
  it("constructs the correct OpenAI-compatible base URL", () => {
    const url = buildVertexKimiBaseUrl("my-project", "us-central1");
    expect(url).toBe(
      "https://us-central1-aiplatform.googleapis.com/v1beta1/projects/my-project/locations/us-central1/endpoints/openapi",
    );
  });

  it("uses location in both the hostname and path", () => {
    const url = buildVertexKimiBaseUrl("proj-123", "europe-west1");
    expect(url).toContain("europe-west1-aiplatform.googleapis.com");
    expect(url).toContain("/locations/europe-west1/");
  });
});

describe("getVertexKimiModels", () => {
  it("returns Kimi K2 models with moonshotai publisher prefix", () => {
    const models = getVertexKimiModels();
    expect(models.length).toBeGreaterThanOrEqual(2);

    const ids = models.map((m) => m.id);
    expect(ids).toContain("moonshotai/kimi-k2");
    expect(ids).toContain("moonshotai/kimi-k2-thinking");
  });

  it("marks kimi-k2-thinking as a reasoning model", () => {
    const models = getVertexKimiModels();
    const thinking = models.find((m) => m.id === "moonshotai/kimi-k2-thinking");
    expect(thinking?.reasoning).toBe(true);
  });

  it("marks kimi-k2 as a non-reasoning model", () => {
    const models = getVertexKimiModels();
    const base = models.find((m) => m.id === "moonshotai/kimi-k2");
    expect(base?.reasoning).toBe(false);
  });

  it("all models have text input and valid context/tokens", () => {
    for (const model of getVertexKimiModels()) {
      expect(model.input).toContain("text");
      expect(model.contextWindow).toBeGreaterThan(0);
      expect(model.maxTokens).toBeGreaterThan(0);
    }
  });
});

describe("buildVertexKimiProvider", () => {
  it("returns a provider with openai-completions api", () => {
    const provider = buildVertexKimiProvider("my-project", "us-central1");
    expect(provider.api).toBe("openai-completions");
  });

  it("includes the correct base URL", () => {
    const provider = buildVertexKimiProvider("proj-1", "asia-southeast1");
    expect(provider.baseUrl).toBe(
      "https://asia-southeast1-aiplatform.googleapis.com/v1beta1/projects/proj-1/locations/asia-southeast1/endpoints/openapi",
    );
  });

  it("includes models from the catalog", () => {
    const provider = buildVertexKimiProvider("proj-1", "us-central1");
    expect(provider.models.length).toBeGreaterThanOrEqual(2);
  });
});

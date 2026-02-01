import { describe, expect, it } from "vitest";
import {
  buildAzureOpenAILiteLLMProvider,
  generateAzureLiteLLMConfig,
} from "./models-config.providers.js";

describe("Azure OpenAI provider helpers", () => {
  describe("buildAzureOpenAILiteLLMProvider", () => {
    it("generates provider config for LiteLLM proxy", () => {
      const provider = buildAzureOpenAILiteLLMProvider({
        litellmBaseUrl: "http://localhost:4000/v1",
        litellmApiKey: "test-key",
        deployments: {
          "gpt-4o-mini": "my-gpt4o-deployment",
          "gpt-5.2-codex": "my-gpt5-deployment",
        },
      });

      expect(provider.baseUrl).toBe("http://localhost:4000/v1");
      expect(provider.apiKey).toBe("test-key");
      expect(provider.api).toBe("openai-completions");
      expect(provider.models).toHaveLength(2);

      const gpt4Model = provider.models.find((m) => m.id === "gpt-4o-mini");
      expect(gpt4Model).toBeDefined();
      expect(gpt4Model?.name).toBe("gpt-4o-mini");
      expect(gpt4Model?.compat?.supportsStore).toBe(false);

      const gpt5Model = provider.models.find((m) => m.id === "gpt-5.2-codex");
      expect(gpt5Model).toBeDefined();
      expect(gpt5Model?.contextWindow).toBe(200000);
    });

    it("strips trailing slash from baseUrl", () => {
      const provider = buildAzureOpenAILiteLLMProvider({
        litellmBaseUrl: "http://localhost:4000/v1/",
        deployments: { "gpt-4o": "deploy" },
      });

      expect(provider.baseUrl).toBe("http://localhost:4000/v1");
    });

    it("detects reasoning models (o1, o3)", () => {
      const provider = buildAzureOpenAILiteLLMProvider({
        litellmBaseUrl: "http://localhost:4000/v1",
        deployments: {
          "o1-preview": "o1-deploy",
          "o3-mini": "o3-deploy",
          "gpt-4o": "gpt4-deploy",
        },
      });

      const o1Model = provider.models.find((m) => m.id === "o1-preview");
      expect(o1Model?.reasoning).toBe(true);

      const o3Model = provider.models.find((m) => m.id === "o3-mini");
      expect(o3Model?.reasoning).toBe(true);

      const gptModel = provider.models.find((m) => m.id === "gpt-4o");
      expect(gptModel?.reasoning).toBe(false);
    });
  });

  describe("generateAzureLiteLLMConfig", () => {
    it("generates valid LiteLLM config YAML", () => {
      const yaml = generateAzureLiteLLMConfig({
        endpoint: "https://my-resource.openai.azure.com",
        apiVersion: "2024-10-21",
        deployments: {
          "gpt-4o-mini": "my-gpt4o-mini-deployment",
        },
      });

      expect(yaml).toContain("model_list:");
      expect(yaml).toContain("model_name: gpt-4o-mini");
      expect(yaml).toContain("model: azure/my-gpt4o-mini-deployment");
      expect(yaml).toContain("api_base: https://my-resource.openai.azure.com");
      expect(yaml).toContain('api_version: "2024-10-21"');
      expect(yaml).toContain("drop_params: true");
    });

    it("uses default API version when not specified", () => {
      const yaml = generateAzureLiteLLMConfig({
        endpoint: "https://test.openai.azure.com",
        deployments: { "gpt-4o": "deploy" },
      });

      expect(yaml).toContain('api_version: "2024-10-21"');
    });

    it("generates config for multiple deployments", () => {
      const yaml = generateAzureLiteLLMConfig({
        endpoint: "https://test.openai.azure.com",
        deployments: {
          "gpt-4o-mini": "deploy-1",
          "gpt-5.2-codex": "deploy-2",
        },
      });

      expect(yaml).toContain("model_name: gpt-4o-mini");
      expect(yaml).toContain("model_name: gpt-5.2-codex");
      expect(yaml).toContain("model: azure/deploy-1");
      expect(yaml).toContain("model: azure/deploy-2");
    });
  });
});

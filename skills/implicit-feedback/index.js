import { z } from "zod";

function cosineSimilarity(vecA, vecB) {
  if (vecA.length !== vecB.length) {
    throw new Error("Vectors must have same dimensions");
  }
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

export default {
  id: "implicit-feedback",
  name: "Implicit Feedback",
  description:
    "Analyzes semantic similarity between texts to detect implicit feedback or repetition.",
  async register(api) {
    let createEmbeddingProvider;
    let loadConfig;

    try {
      // Dynamic imports for ESM
      // src path (development)
      const embeddingsModule = await import("../../src/memory/embeddings.ts").catch(
        () =>
          // fallback to dist (production)
          import("../../dist/memory/embeddings.js"),
      );

      const configModule = await import("../../src/config/config.ts").catch(
        () => import("../../dist/config/config.js"),
      );

      createEmbeddingProvider = embeddingsModule?.createEmbeddingProvider;
      loadConfig = configModule?.loadConfig;
    } catch (e) {
      console.warn("Failed to load internal modules:", e);
    }

    if (!createEmbeddingProvider || !loadConfig) {
      api.logger.warn("Implicit Feedback skill disabled: Modules loaded but functions missing.");
      return;
    }

    api.registerTool({
      name: "semantic_compare",
      description:
        "Compare the semantic meaning of two texts and return a similarity score (0-1). Useful for detecting if a user is repeating themselves or contradicting previous statements.",
      schema: z.object({
        text1: z.string().describe("First text to compare"),
        text2: z.string().describe("Second text to compare"),
        threshold: z
          .number()
          .optional()
          .default(0.8)
          .describe("Threshold for considering texts 'similar'"),
      }),
      func: async (args) => {
        try {
          // Mock config for now since we don't have full server options here
          const config = loadConfig ? await loadConfig() : {};

          const providerResult = await createEmbeddingProvider({
            config,
            provider: "auto",
            model: "text-embedding-3-small",
            fallback: "none",
          });

          const embedding1 = await providerResult.provider.embedQuery(args.text1);
          const embedding2 = await providerResult.provider.embedQuery(args.text2);

          const score = cosineSimilarity(embedding1, embedding2);

          return {
            similarity: score,
            is_similar: score >= args.threshold,
            interpretation:
              score > 0.9 ? "Very High" : score > 0.75 ? "High" : score > 0.5 ? "Medium" : "Low",
          };
        } catch (error) {
          api.logger.error(`Semantic compare failed: ${error.message}`);
          return { error: error.message };
        }
      },
    });
  },
};

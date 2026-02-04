const { z } = require("zod");

function cosineSimilarity(vecA, vecB) {
  if (vecA.length !== vecB.length) {
    throw new Error("Vectors must have same dimensions");
  }
  let dotProduct = 0;
  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecB[i];
  }
  // Vectors from createEmbeddingProvider are already normalized to magnitude 1,
  // so dot product is the cosine similarity.
  return dotProduct;
}

module.exports = {
  id: "implicit-feedback",
  name: "Implicit Feedback",
  description:
    "Analyzes semantic similarity between texts to detect implicit feedback or repetition.",
  async register(api) {
    let createEmbeddingProvider;
    let loadConfig;

    try {
      // Try importing from source (for dev/test)
      const embeddingsModule = await import("../../src/memory/embeddings.ts");
      const configModule = await import("../../src/config/config.ts");
      createEmbeddingProvider = embeddingsModule.createEmbeddingProvider;
      loadConfig = configModule.loadConfig;
    } catch (e) {
      try {
        // Try importing from dist (for prod)
        // Note: Using absolute path resolution or checking relative to this file
        const embeddingsModule = await import("../../dist/memory/embeddings.js");
        const configModule = await import("../../dist/config/config.js");
        createEmbeddingProvider = embeddingsModule.createEmbeddingProvider;
        loadConfig = configModule.loadConfig;
      } catch (e2) {
        api.logger.warn("Implicit Feedback skill disabled: Internal modules not found.", e2);
        return;
      }
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
          const config = loadConfig();
          // Use 'auto' or configured provider from config
          const providerResult = await createEmbeddingProvider({
            config,
            provider: "auto",
            model: "text-embedding-3-small", // Default fallback
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
          return { error: String(error) };
        }
      },
    });
  },
};

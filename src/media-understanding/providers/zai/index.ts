import type { MediaUnderstandingProvider } from "../../types.js";
import { describeImageWithModel } from "../image.js";

/**
 * ZAI provider for media understanding.
 *
 * Supports:
 * - image: GLM-4.6V and other vision-capable models
 *
 * Note: Video is not currently supported through the ZAI API.
 * Models like zai/glm-4.6v support image input via the pi-ai SDK.
 */
export const zaiProvider: MediaUnderstandingProvider = {
  id: "zai",
  capabilities: ["image"],
  describeImage: describeImageWithModel,
};

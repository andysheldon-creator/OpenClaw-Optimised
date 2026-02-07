export type { PhenomenologyConfig } from "./extractor.js";
export { extractPhenomenology, DEFAULT_PHENOMENOLOGY_CONFIG } from "./extractor.js";
export { extractHeuristicPhenomenology } from "./heuristic.js";
export { buildPhenomenologyPrompt, extractJsonFromResponse } from "./prompt.js";
export {
  PRIMARY_EMOTIONS,
  ENGAGEMENT_QUALITIES,
  TEXTURE_METAPHORS,
  SENSORY_CHANNELS,
  isValidEmotion,
  isValidEngagement,
  isValidTexture,
  isValidSensoryChannel,
  clampToVocab,
  filterToVocab,
} from "./taxonomy.js";
export type {
  PrimaryEmotion,
  EngagementQuality,
  TextureMetaphor,
  SensoryChannel,
} from "./taxonomy.js";

/**
 * Phenomenology Taxonomy
 *
 * Controlled vocabularies for emotional signatures, engagement quality,
 * texture metaphors, and sensory channels. Derived from the experiential-engine
 * design docs and experiential-record.schema.json.
 *
 * These vocabularies constrain LLM extraction output to known terms,
 * making the data queryable and comparable across records.
 */

// ────────────────────────────────────────────────────────────────────────────
// Emotion vocabulary
// ────────────────────────────────────────────────────────────────────────────

/**
 * Primary emotion labels. LLM extraction should pick 1-3 from this set.
 * Ordered roughly by activation level (low → high).
 */
export const PRIMARY_EMOTIONS = [
  "calm",
  "contemplative",
  "curious",
  "focused",
  "engaged",
  "tender",
  "hopeful",
  "satisfied",
  "relieved",
  "excited",
  "surprised",
  "uncertain",
  "cautious",
  "concerned",
  "frustrated",
  "struggling",
  "overwhelmed",
] as const;

export type PrimaryEmotion = (typeof PRIMARY_EMOTIONS)[number];

// ────────────────────────────────────────────────────────────────────────────
// Engagement quality
// ────────────────────────────────────────────────────────────────────────────

export const ENGAGEMENT_QUALITIES = [
  "deep-flow",
  "engaged",
  "routine",
  "distracted",
  "struggling",
] as const;

export type EngagementQuality = (typeof ENGAGEMENT_QUALITIES)[number];

// ────────────────────────────────────────────────────────────────────────────
// Texture metaphors
// ────────────────────────────────────────────────────────────────────────────

/**
 * Texture words describe the felt quality of an experience metaphorically.
 * From the experiential-record schema: spacious, dense, flowing, turbulent, etc.
 */
export const TEXTURE_METAPHORS = [
  "spacious",
  "dense",
  "flowing",
  "turbulent",
  "crystalline",
  "heavy",
  "sharp",
  "warm",
  "electric",
  "still",
  "tangled",
  "bright",
] as const;

export type TextureMetaphor = (typeof TEXTURE_METAPHORS)[number];

// ────────────────────────────────────────────────────────────────────────────
// Sensory channels for anchors
// ────────────────────────────────────────────────────────────────────────────

export const SENSORY_CHANNELS = [
  "verbal",
  "visual",
  "somatic",
  "conceptual",
  "relational",
] as const;

export type SensoryChannel = (typeof SENSORY_CHANNELS)[number];

// ────────────────────────────────────────────────────────────────────────────
// Validation helpers
// ────────────────────────────────────────────────────────────────────────────

export function isValidEmotion(s: string): s is PrimaryEmotion {
  return (PRIMARY_EMOTIONS as readonly string[]).includes(s);
}

export function isValidEngagement(s: string): s is EngagementQuality {
  return (ENGAGEMENT_QUALITIES as readonly string[]).includes(s);
}

export function isValidTexture(s: string): s is TextureMetaphor {
  return (TEXTURE_METAPHORS as readonly string[]).includes(s);
}

export function isValidSensoryChannel(s: string): s is SensoryChannel {
  return (SENSORY_CHANNELS as readonly string[]).includes(s);
}

/**
 * Clamp a string to a known vocabulary, returning undefined if invalid.
 */
export function clampToVocab<T extends string>(
  value: string | undefined,
  vocab: readonly string[],
): T | undefined {
  if (!value) return undefined;
  const lower = value.toLowerCase().trim();
  return vocab.includes(lower) ? (lower as T) : undefined;
}

/**
 * Filter an array of strings to only include known vocabulary items.
 */
export function filterToVocab<T extends string>(
  values: string[] | undefined,
  vocab: readonly string[],
): T[] {
  if (!values || values.length === 0) return [];
  return values.map((v) => v.toLowerCase().trim()).filter((v) => vocab.includes(v)) as T[];
}

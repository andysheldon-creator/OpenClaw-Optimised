import type { OpenClawConfig } from "../../config/config.js";
import type { ContextDecayConfig } from "../../config/types.agent-defaults.js";
import { log } from "../pi-embedded-runner/logger.js";

const THREAD_SUFFIX_REGEX = /^(.*)(?::(?:thread|topic):\d+)$/i;

function stripThreadSuffix(value: string): string {
  const match = value.match(THREAD_SUFFIX_REGEX);
  return match?.[1] ?? value;
}

/**
 * Merge two ContextDecayConfig objects. Fields from `override` take precedence.
 * Only positive integer fields are accepted (0/negative/null = disabled = skip).
 */
function mergeDecayConfig(
  base: ContextDecayConfig | undefined,
  override: ContextDecayConfig | undefined,
): ContextDecayConfig | undefined {
  if (!base && !override) {
    return undefined;
  }
  const merged: ContextDecayConfig = {};

  const pickPositiveInt = (a: number | undefined, b: number | undefined): number | undefined => {
    if (typeof b === "number" && b >= 1) {
      return b;
    }
    if (typeof a === "number" && a >= 1) {
      return a;
    }
    return undefined;
  };

  merged.stripThinkingAfterTurns = pickPositiveInt(
    base?.stripThinkingAfterTurns,
    override?.stripThinkingAfterTurns,
  );
  merged.summarizeToolResultsAfterTurns = pickPositiveInt(
    base?.summarizeToolResultsAfterTurns,
    override?.summarizeToolResultsAfterTurns,
  );
  merged.stripToolResultsAfterTurns = pickPositiveInt(
    base?.stripToolResultsAfterTurns,
    override?.stripToolResultsAfterTurns,
  );
  merged.maxContextMessages = pickPositiveInt(
    base?.maxContextMessages,
    override?.maxContextMessages,
  );
  merged.summarizationModel = override?.summarizationModel ?? base?.summarizationModel;

  // Check if anything is actually enabled
  const hasAnything =
    merged.stripThinkingAfterTurns !== undefined ||
    merged.summarizeToolResultsAfterTurns !== undefined ||
    merged.stripToolResultsAfterTurns !== undefined ||
    merged.maxContextMessages !== undefined;

  if (!hasAnything) {
    return undefined;
  }

  return merged;
}

/**
 * Resolve the effective ContextDecayConfig for a session by walking the config hierarchy.
 *
 * Resolution order (most specific wins per field):
 * 1. Per-DM: channels.<provider>.dms.<userId>.contextDecay
 * 2. Per-account/channel: channels.<provider>.contextDecay
 * 3. Global: agents.defaults.contextDecay
 */
export function resolveContextDecayConfig(
  sessionKey: string | undefined,
  config: OpenClawConfig | undefined,
): ContextDecayConfig | undefined {
  const globalDecay = config?.agents?.defaults?.contextDecay;

  if (!sessionKey || !config) {
    return globalDecay ?? undefined;
  }

  // Parse session key: "agent:<agentId>:<provider>:<kind>:<userId>" or "<provider>:<kind>:<userId>"
  const parts = sessionKey.split(":").filter(Boolean);
  const providerParts = parts.length >= 3 && parts[0] === "agent" ? parts.slice(2) : parts;

  const provider = providerParts[0]?.toLowerCase();
  if (!provider) {
    return globalDecay ?? undefined;
  }

  const kind = providerParts[1]?.toLowerCase();
  const userIdRaw = providerParts.slice(2).join(":");
  const userId = stripThreadSuffix(userIdRaw);

  // Resolve provider config from channels
  const channels = config.channels;
  if (!channels || typeof channels !== "object") {
    return globalDecay ?? undefined;
  }

  const providerConfig = (channels as Record<string, unknown>)[provider];
  if (!providerConfig || typeof providerConfig !== "object" || Array.isArray(providerConfig)) {
    return globalDecay ?? undefined;
  }

  const pc = providerConfig as Record<string, unknown>;

  // Layer 1: Per-DM override
  let dmDecay: ContextDecayConfig | undefined;
  if ((kind === "direct" || kind === "dm") && userId) {
    const dms = pc.dms as Record<string, { contextDecay?: ContextDecayConfig }> | undefined;
    dmDecay = dms?.[userId]?.contextDecay;
  }

  // Layer 2: Per-account contextDecay
  const accountDecay = pc.contextDecay as ContextDecayConfig | undefined;

  // Build effective config: global → account → dm (most specific wins)
  let effective = globalDecay;
  effective = mergeDecayConfig(effective, accountDecay);
  effective = mergeDecayConfig(effective, dmDecay);

  // Validate graduated decay ordering
  if (effective) {
    const summarize = effective.summarizeToolResultsAfterTurns;
    const strip = effective.stripToolResultsAfterTurns;
    if (typeof summarize === "number" && typeof strip === "number" && summarize >= strip) {
      log.warn(
        `context-decay: summarizeToolResultsAfterTurns (${summarize}) >= stripToolResultsAfterTurns (${strip}); summarization will be skipped`,
      );
    }
  }

  return effective;
}

/**
 * Check whether the resolved config has any active decay features.
 */
export function isContextDecayActive(config: ContextDecayConfig | undefined): boolean {
  if (!config) {
    return false;
  }
  return (
    (typeof config.stripThinkingAfterTurns === "number" && config.stripThinkingAfterTurns >= 1) ||
    (typeof config.summarizeToolResultsAfterTurns === "number" &&
      config.summarizeToolResultsAfterTurns >= 1) ||
    (typeof config.stripToolResultsAfterTurns === "number" &&
      config.stripToolResultsAfterTurns >= 1) ||
    (typeof config.maxContextMessages === "number" && config.maxContextMessages >= 1)
  );
}

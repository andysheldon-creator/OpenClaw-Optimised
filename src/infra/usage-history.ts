import fs from "node:fs/promises";
import path from "node:path";

import { CONFIG_DIR } from "../utils.js";
import {
  readAnthropicRateLimitSnapshot,
  type AnthropicRateLimitSnapshot,
} from "./anthropic-rate-limits.js";

const HISTORY_PATH = path.join(CONFIG_DIR, "usage-history.jsonl");
const SNAPSHOT_PATH = path.join(CONFIG_DIR, "rate-limits.json");

type UsageHistoryUnified = {
  fiveHour: NonNullable<AnthropicRateLimitSnapshot["unified"]>["fiveHour"] | null;
  sevenDay: NonNullable<AnthropicRateLimitSnapshot["unified"]>["sevenDay"] | null;
  fallback: string | null;
  fallbackPercentage: number | null;
  representativeClaim: string | null;
};

export async function appendUsageHistoryEntry() {
  const snapshot = await readAnthropicRateLimitSnapshot();
  if (!snapshot) {
    throw new Error(`No rate limit snapshot found at ${SNAPSHOT_PATH}`);
  }

  const unified: UsageHistoryUnified = {
    fiveHour: snapshot.unified?.fiveHour ?? null,
    sevenDay: snapshot.unified?.sevenDay ?? null,
    fallback: snapshot.unified?.fallback ?? null,
    fallbackPercentage: snapshot.unified?.fallbackPercentage ?? null,
    representativeClaim: snapshot.unified?.representativeClaim ?? null,
  };

  const entry = {
    timestamp: new Date().toISOString(),
    ...snapshot,
    unified,
  };

  await fs.mkdir(CONFIG_DIR, { recursive: true, mode: 0o700 });
  await fs.appendFile(HISTORY_PATH, `${JSON.stringify(entry)}\n`, "utf8");
  return entry;
}

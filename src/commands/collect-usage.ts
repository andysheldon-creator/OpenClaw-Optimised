import type { RuntimeEnv } from "../runtime.js";
import { appendUsageHistoryEntry } from "../infra/usage-history.js";

type CollectUsageCommandOptions = {
  json?: boolean;
};

export async function collectUsageCommand(
  opts: CollectUsageCommandOptions,
  runtime: RuntimeEnv,
) {
  const entry = await appendUsageHistoryEntry();
  if (opts.json) {
    runtime.log(JSON.stringify(entry, null, 2));
  }
}

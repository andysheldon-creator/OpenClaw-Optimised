#!/usr/bin/env tsx

import { appendUsageHistoryEntry } from "../src/infra/usage-history.js";

async function main() {
  await appendUsageHistoryEntry();
}

main().catch((err) => {
  console.error(String(err));
  process.exit(1);
});

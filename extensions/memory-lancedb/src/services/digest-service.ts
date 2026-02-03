import type { ClawdbrainPluginApi } from "clawdbrain/plugin-sdk";
import type { MemoryStore, Synthesizer, Embedder, Notifier } from "../types.js";

export class DigestService {
  constructor(
    private store: MemoryStore,
    private synthesizer: Synthesizer,
    private embedder: Embedder,
    private notifier: Notifier,
  ) {}

  async runDailyMaintenance(api: ClawdbrainPluginApi, dryRun = false): Promise<string> {
    api.logger.info("memory-lancedb: Starting daily maintenance...");

    // 1. Fetch memories (TODO: add date filtering to store.getAll)
    const allMemories = await this.store.getAll(100); // Limit to 100 recent for safety

    // 2. Synthesize
    const result = await this.synthesizer.synthesize(allMemories, api);

    if (dryRun) {
      api.logger.info(
        `[Dry Run] Would archive ${result.archived.length} items and create ${result.merged.length} new ones.`,
      );
      return result.summary;
    }

    // 3. Apply Changes
    // A. Archive/Delete
    for (const id of result.archived) {
      await this.store.delete(id);
    }

    // B. Store New Merged Entries
    for (const entry of result.merged) {
      // Need to embed the new text
      const vector = await this.embedder.embed(entry.text);
      await this.store.store({
        ...entry,
        vector,
      });
    }

    // 4. Notify
    if (result.summary && result.summary.length > 10) {
      await this.notifier.notify(result.summary);
    }

    api.logger.info(
      `memory-lancedb: Maintenance complete. Archived ${result.archived.length}, Merged ${result.merged.length}.`,
    );
    return result.summary;
  }
}

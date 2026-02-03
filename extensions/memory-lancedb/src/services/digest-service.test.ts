import { describe, test, expect, vi } from "vitest";
import type { MemoryStore, Synthesizer, Embedder, Notifier } from "../types.js";
import { DigestService } from "./digest-service.js";

describe("DigestService", () => {
  const mockStore: MemoryStore = {
    store: vi.fn(),
    search: vi.fn(),
    delete: vi.fn(),
    count: vi.fn(),
    getAll: vi.fn().mockResolvedValue([
      { id: "1", text: "Old duplicate" },
      { id: "2", text: "Another duplicate" },
    ]),
  };

  const mockSynthesizer: Synthesizer = {
    synthesize: vi.fn().mockResolvedValue({
      merged: [{ text: "Merged entry", id: "new-1" }],
      archived: ["1", "2"],
      summary: "Merged 2 items.",
    }),
  };

  const mockEmbedder: Embedder = {
    embed: vi.fn().mockResolvedValue([0.1, 0.2]),
  };

  const mockNotifier: Notifier = {
    notify: vi.fn().mockResolvedValue(undefined),
  };

  const mockApi = {
    logger: {
      info: vi.fn(),
    },
  };

  test("runDailyMaintenance performs merge and archive", async () => {
    const service = new DigestService(mockStore, mockSynthesizer, mockEmbedder, mockNotifier);
    const summary = await service.runDailyMaintenance(mockApi as unknown as ClawdbrainPluginApi, false);

    expect(summary).toBe("Merged 2 items.");

    // Check archive
    expect(mockStore.delete).toHaveBeenCalledWith("1");
    expect(mockStore.delete).toHaveBeenCalledWith("2");

    // Check store new
    expect(mockStore.store).toHaveBeenCalledWith(
      expect.objectContaining({
        text: "Merged entry",
        vector: [0.1, 0.2],
      }),
    );

    // Check notify
    expect(mockNotifier.notify).toHaveBeenCalledWith("Merged 2 items.");
  });

  test("runDailyMaintenance dry-run does not apply changes", async () => {
    vi.clearAllMocks();
    const service = new DigestService(mockStore, mockSynthesizer, mockEmbedder, mockNotifier);
    await service.runDailyMaintenance(mockApi as unknown as ClawdbrainPluginApi, true);

    expect(mockStore.delete).not.toHaveBeenCalled();
    expect(mockStore.store).not.toHaveBeenCalled();
    expect(mockNotifier.notify).not.toHaveBeenCalled(); // Typically dry-run shouldn't notify, or should notify preview
  });
});

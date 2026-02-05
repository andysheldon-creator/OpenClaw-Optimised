import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { describe, expect, it, vi } from "vitest";
import type { MsgContext } from "../auto-reply/templating.js";
import type { OpenClawConfig } from "../config/config.js";
import {
  buildProviderRegistry,
  createMediaAttachmentCache,
  normalizeMediaAttachments,
  runCapability,
} from "./runner.js";

const catalog = [
  {
    id: "gpt-4.1",
    name: "GPT-4.1",
    provider: "openai",
    input: ["text", "image"] as const,
  },
];

vi.mock("../agents/model-catalog.js", async () => {
  const actual = await vi.importActual<typeof import("../agents/model-catalog.js")>(
    "../agents/model-catalog.js",
  );
  return {
    ...actual,
    loadModelCatalog: vi.fn(async () => catalog),
  };
});

describe("runCapability image skip", () => {
  it("skips image understanding when the active model supports vision", async () => {
    // Create a small temp file to satisfy size check
    const tmpFile = path.join(os.tmpdir(), `test-image-${Date.now()}.png`);
    await fs.writeFile(tmpFile, Buffer.from("fake image data"));

    try {
      const ctx: MsgContext = { MediaPath: tmpFile, MediaType: "image/png" };
      const media = normalizeMediaAttachments(ctx);
      const cache = createMediaAttachmentCache(media);
      const cfg = {} as OpenClawConfig;

      try {
        const result = await runCapability({
          capability: "image",
          cfg,
          ctx,
          attachments: cache,
          media,
          providerRegistry: buildProviderRegistry(),
          activeModel: { provider: "openai", model: "gpt-4.1" },
        });

        expect(result.outputs).toHaveLength(0);
        expect(result.decision.outcome).toBe("skipped");
        expect(result.decision.attachments).toHaveLength(1);
        expect(result.decision.attachments[0]?.attachmentIndex).toBe(0);
        expect(result.decision.attachments[0]?.attempts[0]?.outcome).toBe("skipped");
        expect(result.decision.attachments[0]?.attempts[0]?.reason).toBe(
          "primary model supports vision natively",
        );
      } finally {
        await cache.cleanup();
      }
    } finally {
      await fs.unlink(tmpFile).catch(() => {});
    }
  });
});

import fs from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { readToolResultArtifactPayload, rehydrateToolResultMessage } from "./artifact-store.js";

describe("artifact-store", () => {
  it("reads and rehydrates tool result artifacts", () => {
    const dir = fs.mkdtempSync(path.join(tmpdir(), "openclaw-artifact-store-"));
    const artifactPath = path.join(dir, "art_1.json");
    const payload = {
      id: "art_1",
      type: "tool-result",
      toolName: "exec",
      createdAt: new Date().toISOString(),
      sizeBytes: 12,
      summary: "hello",
      content: [{ type: "text", text: "output" }],
    };
    fs.writeFileSync(artifactPath, `${JSON.stringify(payload)}\n`, "utf-8");

    const read = readToolResultArtifactPayload(artifactPath);
    expect(read?.id).toBe("art_1");
    expect(read?.content?.[0]?.type).toBe("text");

    const message = rehydrateToolResultMessage({
      artifactRef: {
        id: "art_1",
        type: "tool-result",
        createdAt: payload.createdAt,
        sizeBytes: payload.sizeBytes,
        summary: payload.summary,
        path: artifactPath,
      },
      toolCallId: "call-1",
    });
    expect(message?.toolName).toBe("exec");
    expect(message?.content?.[0]?.text).toBe("output");
    expect(message?.details?.artifactRef?.id).toBe("art_1");
  });
});

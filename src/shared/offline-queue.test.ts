import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { describe, it, expect } from "vitest";
import { OfflineQueue } from "./offline-queue.js";

function mkq(onExec?: (t: any) => Promise<boolean>) {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), "q-"));
  return { queue: new OfflineQueue(d, onExec), dir: d };
}

describe("OfflineQueue", () => {
  it("enqueues and persists", () => {
    const { queue, dir } = mkq();
    queue.enqueue("message", { text: "hi" });
    queue.enqueue("command", { cmd: "s" });
    expect(queue.size).toBe(2);
    expect(new OfflineQueue(dir).size).toBe(2);
    fs.rmSync(dir, { recursive: true });
  });

  it("flushes successfully", async () => {
    const ids: string[] = [];
    const { queue, dir } = mkq(async (t) => {
      ids.push(t.id);
      return true;
    });
    queue.enqueue("message", { text: "1" });
    queue.enqueue("message", { text: "2" });
    queue.enqueue("message", { text: "3" });
    const r = await queue.flush();
    expect(r.completed).toBe(3);
    expect(r.remaining).toBe(0);
    fs.rmSync(dir, { recursive: true });
  });

  it("retries on failure", async () => {
    let n = 0;
    const { queue, dir } = mkq(async () => {
      n++;
      return n > 2;
    });
    queue.enqueue("message", { text: "retry" });
    await queue.flush();
    expect(queue.size).toBe(1);
    await queue.flush();
    expect(queue.size).toBe(1);
    await queue.flush();
    expect(queue.size).toBe(0);
    fs.rmSync(dir, { recursive: true });
  });

  it("cleanup removes completed", async () => {
    const { queue, dir } = mkq(async () => true);
    queue.enqueue("message", { text: "done" });
    await queue.flush();
    expect(queue.cleanup()).toBe(1);
    fs.rmSync(dir, { recursive: true });
  });
});

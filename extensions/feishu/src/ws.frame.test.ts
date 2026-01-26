import { describe, expect, it } from "vitest";

import { decodeFeishuLongConnectionFrame, encodeFeishuLongConnectionFrame } from "./ws.js";

describe("Feishu long connection frame codec", () => {
  it("roundtrips a ping frame", () => {
    const frame = {
      SeqID: 0n,
      LogID: 0n,
      service: 123,
      method: 0,
      headers: [{ key: "type", value: "ping" }],
    };
    const encoded = encodeFeishuLongConnectionFrame(frame);
    expect(Array.from(encoded.slice(0, 8))).toEqual([8, 0, 16, 0, 24, 123, 32, 0]);
    const decoded = decodeFeishuLongConnectionFrame(encoded);
    expect(decoded.SeqID).toBe(frame.SeqID);
    expect(decoded.LogID).toBe(frame.LogID);
    expect(decoded.service).toBe(frame.service);
    expect(decoded.method).toBe(frame.method);
    expect(decoded.headers).toEqual(frame.headers);
    expect(decoded.payload).toBeUndefined();
  });

  it("roundtrips frames with payload and metadata", () => {
    const payload = new TextEncoder().encode(JSON.stringify({ code: 200 }));
    const frame = {
      SeqID: 12n,
      LogID: 34n,
      service: 9,
      method: 1,
      headers: [
        { key: "type", value: "event" },
        { key: "message_id", value: "m_1" },
      ],
      payloadEncoding: "raw",
      payloadType: "json",
      LogIDNew: "log_1",
      payload,
    };
    const encoded = encodeFeishuLongConnectionFrame(frame);
    const decoded = decodeFeishuLongConnectionFrame(encoded);
    expect(decoded.SeqID).toBe(frame.SeqID);
    expect(decoded.LogID).toBe(frame.LogID);
    expect(decoded.service).toBe(frame.service);
    expect(decoded.method).toBe(frame.method);
    expect(decoded.headers).toEqual(frame.headers);
    expect(decoded.payloadEncoding).toBe("raw");
    expect(decoded.payloadType).toBe("json");
    expect(decoded.LogIDNew).toBe("log_1");
    expect(decoded.payload).toEqual(payload);
  });
});

import { describe, expect, it } from "vitest";
import { MatrixConfigSchema } from "./config-schema.js";

describe("Matrix config schema", () => {
  it("accepts room session scope", () => {
    const parsed = MatrixConfigSchema.parse({
      sessionScope: "room",
    });

    expect(parsed.sessionScope).toBe("room");
  });

  it("accepts agent session scope", () => {
    const parsed = MatrixConfigSchema.parse({
      sessionScope: "agent",
    });

    expect(parsed.sessionScope).toBe("agent");
  });

  it("rejects invalid session scope", () => {
    const parsed = MatrixConfigSchema.safeParse({
      sessionScope: "invalid",
    });

    expect(parsed.success).toBe(false);
  });
});

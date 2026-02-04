import { describe, it, expect, vi } from "vitest";
import skill from "./index.js";

describe("role-router skill", () => {
  it("registers tools", async () => {
    const api = {
      registerTool: vi.fn(),
      logger: { warn: vi.fn(), error: vi.fn() },
    };
    await skill.register(api);
    expect(api.registerTool).toHaveBeenCalledTimes(2);
    expect(api.registerTool).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "check_permission",
      }),
    );
  });

  it("allows admin everything", async () => {
    const api = { registerTool: vi.fn() };
    await skill.register(api);

    const checkTool = (api.registerTool as any).mock.calls.find(
      (c: any) => c[0].name === "check_permission",
    )[0];

    const result = await checkTool.func({
      role: "admin",
      action: "delete_database",
    });

    expect(result.allowed).toBe(true);
  });

  it("restricts sales_rep", async () => {
    const api = { registerTool: vi.fn() };
    await skill.register(api);

    const checkTool = (api.registerTool as any).mock.calls.find(
      (c: any) => c[0].name === "check_permission",
    )[0];

    const result = await checkTool.func({
      role: "sales_rep",
      action: "approve_deals", // Only manager has this
    });

    expect(result.allowed).toBe(false);
  });
});

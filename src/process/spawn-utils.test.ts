import { describe, expect, it } from "vitest";
import { resolveCommandStdio } from "./spawn-utils.js";

describe("resolveCommandStdio", () => {
  it("keeps stdout/stderr piped by default", () => {
    const stdio = resolveCommandStdio({
      hasInput: false,
      preferInheritStdIn: true,
    });

    expect(stdio).toEqual(["inherit", "pipe", "pipe"]);
  });

  it("inherits stdout/stderr when preferInheritStdOut is true", () => {
    const stdio = resolveCommandStdio({
      hasInput: false,
      preferInheritStdIn: true,
      preferInheritStdOut: true,
    });

    expect(stdio).toEqual(["inherit", "inherit", "inherit"]);
  });
});

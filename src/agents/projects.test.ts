import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { OpenClawConfig } from "../config/config.js";
import {
  applyNamingConvention,
  resolveProjectDir,
  resolveProjectNamingConvention,
  resolveProjectsRootDir,
} from "./projects.js";

function makeConfig(projects?: {
  rootDir?: string;
  namingConvention?: "kebab-case" | "snake_case" | "camelCase" | "PascalCase";
}): OpenClawConfig {
  return {
    agents: {
      defaults: {
        projects,
      },
    },
  } as OpenClawConfig;
}

describe("resolveProjectsRootDir", () => {
  it("should return undefined when config is undefined", () => {
    expect(resolveProjectsRootDir(undefined)).toBeUndefined();
  });

  it("should return undefined when projects is not configured", () => {
    expect(resolveProjectsRootDir(makeConfig(undefined))).toBeUndefined();
  });

  it("should return undefined when rootDir is empty", () => {
    expect(resolveProjectsRootDir(makeConfig({ rootDir: "" }))).toBeUndefined();
    expect(resolveProjectsRootDir(makeConfig({ rootDir: "  " }))).toBeUndefined();
  });

  it("should expand tilde to home directory", () => {
    const result = resolveProjectsRootDir(makeConfig({ rootDir: "~/projects" }));
    expect(result).toBe(path.join(os.homedir(), "projects"));
  });

  it("should handle bare tilde", () => {
    const result = resolveProjectsRootDir(makeConfig({ rootDir: "~" }));
    expect(result).toBe(os.homedir());
  });

  it("should resolve absolute paths", () => {
    const result = resolveProjectsRootDir(makeConfig({ rootDir: "/opt/dev" }));
    expect(result).toBe("/opt/dev");
  });

  it("should resolve relative paths", () => {
    const result = resolveProjectsRootDir(makeConfig({ rootDir: "dev" }));
    expect(result).toBe(path.resolve("dev"));
  });
});

describe("resolveProjectNamingConvention", () => {
  it("should default to kebab-case when config is undefined", () => {
    expect(resolveProjectNamingConvention(undefined)).toBe("kebab-case");
  });

  it("should default to kebab-case when convention is not set", () => {
    expect(resolveProjectNamingConvention(makeConfig({}))).toBe("kebab-case");
  });

  it("should return configured convention", () => {
    expect(resolveProjectNamingConvention(makeConfig({ namingConvention: "snake_case" }))).toBe(
      "snake_case",
    );
    expect(resolveProjectNamingConvention(makeConfig({ namingConvention: "camelCase" }))).toBe(
      "camelCase",
    );
    expect(resolveProjectNamingConvention(makeConfig({ namingConvention: "PascalCase" }))).toBe(
      "PascalCase",
    );
  });
});

describe("applyNamingConvention", () => {
  describe("kebab-case", () => {
    it("should convert space-separated words", () => {
      expect(applyNamingConvention("my new project", "kebab-case")).toBe("my-new-project");
    });

    it("should convert camelCase input", () => {
      expect(applyNamingConvention("myNewProject", "kebab-case")).toBe("my-new-project");
    });

    it("should convert PascalCase input", () => {
      expect(applyNamingConvention("MyNewProject", "kebab-case")).toBe("my-new-project");
    });

    it("should convert snake_case input", () => {
      expect(applyNamingConvention("my_new_project", "kebab-case")).toBe("my-new-project");
    });

    it("should handle single word", () => {
      expect(applyNamingConvention("project", "kebab-case")).toBe("project");
    });

    it("should handle consecutive uppercase (acronyms)", () => {
      expect(applyNamingConvention("myAPIProject", "kebab-case")).toBe("my-api-project");
    });
  });

  describe("snake_case", () => {
    it("should convert space-separated words", () => {
      expect(applyNamingConvention("my new project", "snake_case")).toBe("my_new_project");
    });

    it("should convert kebab-case input", () => {
      expect(applyNamingConvention("my-new-project", "snake_case")).toBe("my_new_project");
    });

    it("should convert camelCase input", () => {
      expect(applyNamingConvention("myNewProject", "snake_case")).toBe("my_new_project");
    });
  });

  describe("camelCase", () => {
    it("should convert space-separated words", () => {
      expect(applyNamingConvention("my new project", "camelCase")).toBe("myNewProject");
    });

    it("should convert kebab-case input", () => {
      expect(applyNamingConvention("my-new-project", "camelCase")).toBe("myNewProject");
    });

    it("should convert snake_case input", () => {
      expect(applyNamingConvention("my_new_project", "camelCase")).toBe("myNewProject");
    });

    it("should keep first word lowercase", () => {
      expect(applyNamingConvention("My Project", "camelCase")).toBe("myProject");
    });
  });

  describe("PascalCase", () => {
    it("should convert space-separated words", () => {
      expect(applyNamingConvention("my new project", "PascalCase")).toBe("MyNewProject");
    });

    it("should convert kebab-case input", () => {
      expect(applyNamingConvention("my-new-project", "PascalCase")).toBe("MyNewProject");
    });

    it("should convert snake_case input", () => {
      expect(applyNamingConvention("my_new_project", "PascalCase")).toBe("MyNewProject");
    });

    it("should capitalize first letter of each word", () => {
      expect(applyNamingConvention("open claw dev", "PascalCase")).toBe("OpenClawDev");
    });
  });

  describe("edge cases", () => {
    it("should return original for empty-ish input", () => {
      expect(applyNamingConvention("", "kebab-case")).toBe("");
    });

    it("should handle mixed separators", () => {
      expect(applyNamingConvention("my-new_project test", "kebab-case")).toBe(
        "my-new-project-test",
      );
    });
  });
});

describe("resolveProjectDir", () => {
  it("should return undefined when rootDir is not configured", () => {
    expect(resolveProjectDir(undefined, "my project")).toBeUndefined();
    expect(resolveProjectDir(makeConfig(undefined), "my project")).toBeUndefined();
  });

  it("should resolve full path with naming convention applied", () => {
    const config = makeConfig({ rootDir: "/opt/dev", namingConvention: "kebab-case" });
    expect(resolveProjectDir(config, "my new project")).toBe("/opt/dev/my-new-project");
  });

  it("should use snake_case convention", () => {
    const config = makeConfig({ rootDir: "/opt/dev", namingConvention: "snake_case" });
    expect(resolveProjectDir(config, "my new project")).toBe("/opt/dev/my_new_project");
  });

  it("should expand tilde in root dir", () => {
    const config = makeConfig({ rootDir: "~/projects", namingConvention: "PascalCase" });
    const result = resolveProjectDir(config, "open claw");
    expect(result).toBe(path.join(os.homedir(), "projects", "OpenClaw"));
  });

  it("should default to kebab-case when convention not set", () => {
    const config = makeConfig({ rootDir: "/opt/dev" });
    expect(resolveProjectDir(config, "My Project")).toBe("/opt/dev/my-project");
  });
});

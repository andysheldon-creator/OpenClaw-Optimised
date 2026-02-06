import { describe, expect, it, vi } from "vitest";

const fsWatcherCtorMock = vi.fn();

vi.mock("chokidar", () => {
  class FSWatcherMock {
    constructor(opts: unknown) {
      fsWatcherCtorMock(opts);
    }
    on = vi.fn(() => this);
    add = vi.fn(() => this);
    close = vi.fn(async () => undefined);
  }

  return {
    default: { FSWatcher: FSWatcherMock },
  };
});

describe("ensureSkillsWatcher", () => {
  it("ignores node_modules, dist, and .git by default", async () => {
    const mod = await import("./refresh.js");
    mod.ensureSkillsWatcher({ workspaceDir: "/tmp/workspace" });

    expect(fsWatcherCtorMock).toHaveBeenCalledTimes(1);
    const opts = fsWatcherCtorMock.mock.calls[0]?.[0] as { ignored?: unknown };

    expect(opts.ignored).toBe(mod.DEFAULT_SKILLS_WATCH_IGNORED);
    const ignored = mod.DEFAULT_SKILLS_WATCH_IGNORED;
    expect(ignored.some((re) => re.test("/tmp/workspace/skills/node_modules/pkg/index.js"))).toBe(
      true,
    );
    expect(ignored.some((re) => re.test("/tmp/workspace/skills/dist/index.js"))).toBe(true);
    expect(ignored.some((re) => re.test("/tmp/workspace/skills/.git/config"))).toBe(true);
    expect(
      ignored.some((re) =>
        re.test("/tmp/workspace/skills/voyage-server/venv/lib/python3.12/site-packages/x.py"),
      ),
    ).toBe(true);
    expect(
      ignored.some((re) =>
        re.test("/tmp/workspace/skills/voyage-server/.venv/lib/python3.12/site-packages/x.py"),
      ),
    ).toBe(true);
    expect(ignored.some((re) => re.test("/tmp/workspace/skills/__pycache__/x.pyc"))).toBe(true);
    expect(ignored.some((re) => re.test("/tmp/.hidden/skills/index.md"))).toBe(false);
  });
});

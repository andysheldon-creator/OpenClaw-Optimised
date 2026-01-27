import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { ClawdbrainApp } from "./app";
import "../styles.css";

const originalConnect = ClawdbrainApp.prototype.connect;

function mountApp(pathname: string) {
  window.history.replaceState({}, "", pathname);
  const app = document.createElement("clawdbrain-app") as ClawdbrainApp;
  document.body.append(app);
  return app;
}

function nextFrame() {
  return new Promise<void>((resolve) => {
    requestAnimationFrame(() => resolve());
  });
}

beforeEach(() => {
  ClawdbrainApp.prototype.connect = () => {
    // no-op: avoid real gateway WS connections in browser tests
  };
  window.__CLAWDBRAIN_CONTROL_UI_BASE_PATH__ = undefined;
  localStorage.clear();
  document.body.innerHTML = "";
});

afterEach(() => {
  ClawdbrainApp.prototype.connect = originalConnect;
  window.__CLAWDBRAIN_CONTROL_UI_BASE_PATH__ = undefined;
  localStorage.clear();
  document.body.innerHTML = "";
});

describe("control UI routing", () => {
  it("hydrates the tab from the location", async () => {
    const app = mountApp("/#/sessions");
    await app.updateComplete;

    expect(app.tab).toBe("sessions");
    expect(window.location.pathname).toBe("/");
    expect(window.location.hash).toBe("#/sessions");
  });

  it("respects /ui base paths", async () => {
    const app = mountApp("/ui/#/cron");
    await app.updateComplete;

    expect(app.basePath).toBe("/ui");
    expect(app.tab).toBe("cron");
    expect(window.location.pathname).toBe("/ui/");
    expect(window.location.hash).toBe("#/cron");
  });

  it("infers nested base paths", async () => {
    const app = mountApp("/apps/clawdbrain/#/cron");
    await app.updateComplete;

    expect(app.basePath).toBe("/apps/clawdbrain");
    expect(app.tab).toBe("cron");
    expect(window.location.pathname).toBe("/apps/clawdbrain/");
    expect(window.location.hash).toBe("#/cron");
  });

  it("honors explicit base path overrides", async () => {
    window.__CLAWDBRAIN_CONTROL_UI_BASE_PATH__ = "/clawdbrain";
    const app = mountApp("/clawdbrain/#/sessions");
    await app.updateComplete;

    expect(app.basePath).toBe("/clawdbrain");
    expect(app.tab).toBe("sessions");
    expect(window.location.pathname).toBe("/clawdbrain/");
    expect(window.location.hash).toBe("#/sessions");
  });

  it("updates the URL when clicking nav items", async () => {
    const app = mountApp("/#/chat");
    await app.updateComplete;

    const link = app.querySelector<HTMLAnchorElement>(
      'a.nav-item[href="/#/channels"]',
    );
    expect(link).not.toBeNull();
    link?.dispatchEvent(
      new MouseEvent("click", { bubbles: true, cancelable: true, button: 0 }),
    );

    await app.updateComplete;
    expect(app.tab).toBe("channels");
    expect(window.location.pathname).toBe("/");
    expect(window.location.hash).toBe("#/channels");
  });

  it("keeps chat and nav usable on narrow viewports", async () => {
    const app = mountApp("/#/chat");
    await app.updateComplete;

    expect(window.matchMedia("(max-width: 768px)").matches).toBe(true);

    const split = app.querySelector(".chat-split-container") as HTMLElement | null;
    expect(split).not.toBeNull();
    if (split) {
      expect(getComputedStyle(split).position).not.toBe("fixed");
    }

    const chatMain = app.querySelector(".chat-main") as HTMLElement | null;
    expect(chatMain).not.toBeNull();
    if (chatMain) {
      expect(getComputedStyle(chatMain).display).not.toBe("none");
    }

    if (split) {
      split.classList.add("chat-split-container--open");
      await app.updateComplete;
      expect(getComputedStyle(split).position).toBe("fixed");
    }
    if (chatMain) {
      expect(getComputedStyle(chatMain).display).toBe("none");
    }
  });

  it("auto-scrolls chat history to the latest message", async () => {
    const app = mountApp("/#/chat");
    await app.updateComplete;

    const initialContainer = app.querySelector(".chat-thread") as HTMLElement | null;
    expect(initialContainer).not.toBeNull();
    if (!initialContainer) return;
    initialContainer.style.maxHeight = "180px";
    initialContainer.style.overflow = "auto";

    app.chatMessages = Array.from({ length: 60 }, (_, index) => ({
      role: "assistant",
      content: `Line ${index} - ${"x".repeat(200)}`,
      timestamp: Date.now() + index,
    }));

    await app.updateComplete;
    for (let i = 0; i < 6; i++) {
      await nextFrame();
    }

    const container = app.querySelector(".chat-thread") as HTMLElement | null;
    expect(container).not.toBeNull();
    if (!container) return;
    const maxScroll = container.scrollHeight - container.clientHeight;
    expect(maxScroll).toBeGreaterThan(0);
    for (let i = 0; i < 10; i++) {
      if (container.scrollTop === maxScroll) break;
      await nextFrame();
    }
    expect(container.scrollTop).toBe(maxScroll);
  });

  it("hydrates token from URL params and strips it", async () => {
    const app = mountApp("/ui/?token=abc123#/overview");
    await app.updateComplete;

    expect(app.settings.token).toBe("abc123");
    expect(window.location.pathname).toBe("/ui/");
    expect(window.location.hash).toBe("#/overview");
    expect(window.location.search).toBe("");
  });

  it("hydrates password from URL params and strips it", async () => {
    const app = mountApp("/ui/?password=sekret#/overview");
    await app.updateComplete;

    expect(app.password).toBe("sekret");
    expect(window.location.pathname).toBe("/ui/");
    expect(window.location.hash).toBe("#/overview");
    expect(window.location.search).toBe("");
  });

  it("hydrates token from URL params even when settings already set", async () => {
    localStorage.setItem(
      "clawdbrain.control.settings.v1",
      JSON.stringify({ token: "existing-token" }),
    );
    const app = mountApp("/ui/?token=abc123#/overview");
    await app.updateComplete;

    expect(app.settings.token).toBe("abc123");
    expect(window.location.pathname).toBe("/ui/");
    expect(window.location.hash).toBe("#/overview");
    expect(window.location.search).toBe("");
  });
});

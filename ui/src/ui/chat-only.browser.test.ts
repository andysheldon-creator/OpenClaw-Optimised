import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { ClawdbotApp } from "./app";

const originalConnect = ClawdbotApp.prototype.connect;

function mountApp(pathname: string) {
  window.history.replaceState({}, "", pathname);
  const app = document.createElement("clawdbot-app") as ClawdbotApp;
  document.body.append(app);
  return app;
}

beforeEach(() => {
  ClawdbotApp.prototype.connect = () => {
    // no-op: avoid real gateway WS connections in browser tests
  };
  window.__CLAWDBOT_CONTROL_UI_BASE_PATH__ = undefined;
  localStorage.clear();
  document.body.innerHTML = "";
});

afterEach(() => {
  ClawdbotApp.prototype.connect = originalConnect;
  window.__CLAWDBOT_CONTROL_UI_BASE_PATH__ = undefined;
  localStorage.clear();
  document.body.innerHTML = "";
});

describe("chat-only route", () => {
  it("renders chat-only chrome (no sidebar/topbar)", async () => {
    const app = mountApp("/chat-only");
    await app.updateComplete;

    expect(app.tab).toBe("chat");
    expect(window.location.pathname).toBe("/chat-only");

    expect(app.querySelector(".nav")).toBeNull();
    expect(app.querySelector(".topbar")).toBeNull();
    expect(app.querySelector(".content-header")).toBeNull();

    expect(app.querySelector(".chat-compose")).not.toBeNull();
  });

  it("blocks in-app navigation away from chat-only", async () => {
    const app = mountApp("/chat-only");
    await app.updateComplete;

    app.setTab("connections");
    await app.updateComplete;

    expect(app.tab).toBe("chat");
    expect(window.location.pathname).toBe("/chat-only");
  });

  it("blocks popstate navigation away from chat-only", async () => {
    const app = mountApp("/chat-only");
    await app.updateComplete;

    window.history.pushState({}, "", "/connections");
    window.dispatchEvent(new PopStateEvent("popstate"));
    await app.updateComplete;

    expect(app.tab).toBe("chat");
    expect(window.location.pathname).toBe("/chat-only");
  });
});


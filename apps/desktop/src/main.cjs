const path = require("node:path");
const fs = require("node:fs");
const { spawn } = require("node:child_process");
const net = require("node:net");
const { app, BrowserWindow, dialog, ipcMain, Menu, shell, Tray } = require("electron");
const { startStaticServer } = require("./static-server.cjs");

const PRODUCT_NAME = "OpenClaw CN";

const DEFAULT_GATEWAY_HOST = "127.0.0.1";
const DEFAULT_GATEWAY_PORT = 18789;

function augmentPathEnv(env) {
  const home = app.getPath("home");
  const candidates = [
    path.join(home, "Library", "pnpm"),
    path.join(home, ".local", "share", "pnpm"),
    path.join(home, ".local", "bin"),
    path.join(home, ".npm-global", "bin"),
  ];

  if (process.platform === "win32") {
    const appData =
      env.APPDATA && String(env.APPDATA).trim()
        ? String(env.APPDATA).trim()
        : path.join(home, "AppData", "Roaming");
    candidates.unshift(path.join(appData, "npm"));
  }

  const current = typeof env.PATH === "string" ? env.PATH : "";
  const parts = current.split(path.delimiter).filter(Boolean);
  for (const candidate of candidates) {
    if (!fs.existsSync(candidate)) continue;
    if (parts.includes(candidate)) continue;
    parts.unshift(candidate);
  }

  return { ...env, PATH: parts.join(path.delimiter) };
}

function runCommand(command, args, { timeoutMs = 5 * 60_000, env, cwd } = {}) {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      windowsHide: true,
      env: env ? augmentPathEnv(env) : augmentPathEnv(process.env),
      cwd: cwd || undefined,
      stdio: ["ignore", "pipe", "pipe"],
    });

    const out = [];
    const err = [];
    const MAX_BYTES = 200_000;
    let settled = false;

    const pushLimited = (arr, chunk) => {
      const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk));
      const size = arr.reduce((sum, b) => sum + b.length, 0);
      if (size >= MAX_BYTES) return;
      arr.push(buf.slice(0, Math.max(0, MAX_BYTES - size)));
    };

    child.stdout.on("data", (chunk) => pushLimited(out, chunk));
    child.stderr.on("data", (chunk) => pushLimited(err, chunk));

    let killed = false;
    const timer = setTimeout(() => {
      killed = true;
      try {
        child.kill("SIGKILL");
      } catch {
        // ignore
      }
    }, timeoutMs);

    child.on("error", (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({
        ok: false,
        code: null,
        killed,
        stdout: Buffer.concat(out).toString("utf8"),
        stderr: Buffer.concat(err).toString("utf8"),
        error: error ? String(error) : "Unknown error",
      });
    });

    child.on("close", (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({
        ok: code === 0 && !killed,
        code,
        killed,
        stdout: Buffer.concat(out).toString("utf8"),
        stderr: Buffer.concat(err).toString("utf8"),
      });
    });
  });
}

function resolveManagedStateDir() {
  // Keep desktop state isolated from any system-installed OpenClaw.
  return path.join(app.getPath("userData"), "gateway-state");
}

function resolveOpenClawDistIndex() {
  // Packaged: extraResources -> <resources>/openclaw-runtime
  const packagedRoot = path.join(process.resourcesPath, "openclaw-runtime");
  const packagedIndex = path.join(packagedRoot, "dist", "index.js");
  if (fs.existsSync(packagedIndex)) {
    return packagedIndex;
  }

  // Dev fallback: repoRoot/dist/index.js
  const repoRoot = path.resolve(__dirname, "..", "..", "..");
  return path.join(repoRoot, "dist", "index.js");
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function pickEphemeralPort(host) {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.on("error", reject);
    server.listen(0, host, () => {
      const addr = server.address();
      const port = addr && typeof addr === "object" ? addr.port : null;
      server.close(() => resolve(port));
    });
  });
}

function injectDesktopDefaultsIntoIndexHtml(html, defaults) {
  const payload = [
    defaults.gatewayUrl
      ? `window.__OPENCLAW_DESKTOP_DEFAULT_GATEWAY_URL__=${JSON.stringify(defaults.gatewayUrl)};`
      : "",
    defaults.token
      ? `window.__OPENCLAW_DESKTOP_DEFAULT_GATEWAY_TOKEN__=${JSON.stringify(defaults.token)};`
      : "",
  ]
    .filter(Boolean)
    .join("");

  if (!payload) {
    return html;
  }
  const tag = `<script>${payload}</script>`;
  const idx = html.lastIndexOf("</head>");
  if (idx === -1) {
    return `${tag}\n${html}`;
  }
  return `${html.slice(0, idx)}${tag}\n${html.slice(idx)}`;
}

let managedGateway = {
  child: null,
  gatewayUrl: null,
  port: null,
  stateDir: null,
  lastOutput: "",
};

async function startManagedGateway({ preferredPort = DEFAULT_GATEWAY_PORT } = {}) {
  if (process.env.OPENCLAW_CN_AUTOSTART_GATEWAY === "0") {
    return null;
  }
  if (managedGateway.child) {
    return managedGateway;
  }

  const stateDir = resolveManagedStateDir();
  fs.mkdirSync(stateDir, { recursive: true });
  const configPath = path.join(stateDir, "openclaw.json");
  const openclawIndex = resolveOpenClawDistIndex();
  if (!fs.existsSync(openclawIndex)) {
    throw new Error(
      `Missing OpenClaw runtime at ${openclawIndex}. Build it first (pnpm build) or ensure the desktop app bundles it.`,
    );
  }

  const envBase = {
    ...augmentPathEnv(process.env),
    ELECTRON_RUN_AS_NODE: "1",
    OPENCLAW_STATE_DIR: stateDir,
    OPENCLAW_CONFIG_PATH: configPath,
    OPENCLAW_CN_DESKTOP: "1",
  };

  const spawnOnce = async (port) => {
    const runtimeRoot = path.dirname(path.dirname(openclawIndex));
    const args = [
      openclawIndex,
      "gateway",
      "run",
      "--allow-unconfigured",
      "--bind",
      "loopback",
      "--port",
      String(port),
      "--compact",
    ];

    const child = spawn(process.execPath, args, {
      windowsHide: true,
      env: envBase,
      cwd: runtimeRoot,
      stdio: ["ignore", "pipe", "pipe"],
    });

    const out = [];
    const err = [];
    const MAX_BYTES = 120_000;
    const pushLimited = (arr, chunk) => {
      const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk));
      const size = arr.reduce((sum, b) => sum + b.length, 0);
      if (size >= MAX_BYTES) return;
      arr.push(buf.slice(0, Math.max(0, MAX_BYTES - size)));
    };
    child.stdout.on("data", (chunk) => pushLimited(out, chunk));
    child.stderr.on("data", (chunk) => pushLimited(err, chunk));

    let exited = false;
    child.once("exit", () => {
      exited = true;
    });

    await sleep(450);
    const output = Buffer.concat([...err, ...out]).toString("utf8");
    return { child, exited, output };
  };

  let port = preferredPort;
  for (let attempt = 0; attempt < 4; attempt++) {
    if (attempt > 0) {
      const picked = await pickEphemeralPort(DEFAULT_GATEWAY_HOST);
      port = typeof picked === "number" && picked > 0 ? picked : preferredPort;
    }
    const { child, exited, output } = await spawnOnce(port);
    if (!exited) {
      managedGateway = {
        child,
        port,
        stateDir,
        gatewayUrl: `ws://${DEFAULT_GATEWAY_HOST}:${port}`,
        lastOutput: output,
      };
      child.once("exit", (code, signal) => {
        managedGateway.child = null;
        managedGateway.lastOutput = `gateway exited (code=${code}, signal=${signal ?? ""})\n${managedGateway.lastOutput}`;
      });
      return managedGateway;
    }
    try {
      child.kill("SIGKILL");
    } catch {
      // ignore
    }
  }

  throw new Error("Failed to start embedded gateway.");
}

async function stopManagedGateway({ force = false } = {}) {
  const child = managedGateway.child;
  if (!child) {
    return { ok: true };
  }
  return await new Promise((resolve) => {
    let settled = false;
    const settle = (ok) => {
      if (settled) return;
      settled = true;
      managedGateway.child = null;
      resolve({ ok });
    };
    const timer = setTimeout(() => {
      if (force) {
        try {
          child.kill("SIGKILL");
        } catch {
          // ignore
        }
      }
      settle(false);
    }, 3500);

    child.once("exit", () => {
      clearTimeout(timer);
      settle(true);
    });

    try {
      child.kill("SIGTERM");
    } catch {
      clearTimeout(timer);
      settle(false);
    }
  });
}

function buildEmbeddedCliEnv() {
  const env = { ...augmentPathEnv(process.env) };
  env.ELECTRON_RUN_AS_NODE = "1";
  return env;
}

async function runEmbeddedCli(args, { timeoutMs = 3 * 60_000 } = {}) {
  const openclawIndex = resolveOpenClawDistIndex();
  const runtimeRoot = path.dirname(path.dirname(openclawIndex));
  return await runCommand(process.execPath, [openclawIndex, ...args], {
    timeoutMs,
    env: buildEmbeddedCliEnv(),
    cwd: runtimeRoot,
  });
}

async function runGatewayUninstall(win, opts = {}) {
  const includeWorkspace = Boolean(opts.includeWorkspace); // unused (desktop state is isolated)
  const dryRun = Boolean(opts.dryRun);

  const stateDir = managedGateway.stateDir ?? resolveManagedStateDir();
  const preview = `Remove desktop gateway state:\n${stateDir}`;
  const { response, checkboxChecked } = await dialog.showMessageBox(win, {
    type: "warning",
    title: "Uninstall gateway",
    message: "This will stop the embedded gateway and remove its local state/config.",
    detail:
      "Desktop app stays installed. This does not uninstall any system-installed OpenClaw.\n\n" +
      preview,
    buttons: ["Cancel", dryRun ? "Dry-run" : "Remove"],
    defaultId: 1,
    cancelId: 0,
    checkboxLabel: "Also stop the gateway immediately (recommended)",
    checkboxChecked: true,
    noLink: true,
  });

  if (response !== 1) {
    return { ok: false, cancelled: true };
  }

  if (win && !win.isDestroyed()) {
    // Indeterminate progress bar while the CLI runs.
    win.setProgressBar(2);
  }

  if (!dryRun && checkboxChecked) {
    await stopManagedGateway({ force: true });
  }

  let rmOk = true;
  if (!dryRun) {
    try {
      fs.rmSync(stateDir, { recursive: true, force: true });
    } catch (err) {
      rmOk = false;
      managedGateway.lastOutput = `${managedGateway.lastOutput}\nremove state failed: ${String(err)}`;
    }
  }

  if (win && !win.isDestroyed()) {
    win.setProgressBar(-1);
  }

  await dialog.showMessageBox(win, {
    type: rmOk ? "info" : "error",
    title: rmOk ? "Uninstall complete" : "Uninstall failed",
    message: dryRun ? "Dry-run complete." : rmOk ? "Gateway data removed." : "Failed to remove gateway data.",
    detail: managedGateway.lastOutput || "",
    buttons: ["OK"],
    defaultId: 0,
    noLink: true,
  });
  return { ok: dryRun ? true : rmOk };
}

async function runLegacyGatewayStop(win) {
  const { response } = await dialog.showMessageBox(win, {
    type: "warning",
    title: "Stop legacy gateway service",
    message: "Stop an older system-installed OpenClaw gateway service?",
    detail:
      "Use this if you previously installed OpenClaw via npm/pnpm and it's still running as a background service.\n\nThis does not affect the embedded gateway used by OpenClaw CN.",
    buttons: ["Cancel", "Stop"],
    defaultId: 1,
    cancelId: 0,
    noLink: true,
  });
  if (response !== 1) {
    return { ok: false, cancelled: true };
  }

  if (win && !win.isDestroyed()) {
    win.setProgressBar(2);
  }
  const result = await runEmbeddedCli(["gateway", "stop", "--json"]);
  if (win && !win.isDestroyed()) {
    win.setProgressBar(-1);
  }

  await dialog.showMessageBox(win, {
    type: result.ok ? "info" : "error",
    title: result.ok ? "Legacy gateway stopped" : "Stop failed",
    message: result.ok ? "Done." : "Failed to stop legacy gateway service.",
    detail: [result.error, result.stderr, result.stdout].filter(Boolean).join("\n"),
    buttons: ["OK"],
    defaultId: 0,
    noLink: true,
  });
  return result;
}

async function runLegacyGatewayUninstall(win) {
  const { response } = await dialog.showMessageBox(win, {
    type: "warning",
    title: "Uninstall legacy gateway service",
    message: "Uninstall an older system-installed OpenClaw gateway service?",
    detail:
      "This removes the background service (launchd/systemd/schtasks). It does not delete your ~/.openclaw state.\n\nThis does not affect the embedded gateway used by OpenClaw CN.",
    buttons: ["Cancel", "Uninstall service"],
    defaultId: 1,
    cancelId: 0,
    noLink: true,
  });
  if (response !== 1) {
    return { ok: false, cancelled: true };
  }

  if (win && !win.isDestroyed()) {
    win.setProgressBar(2);
  }
  const result = await runEmbeddedCli(["gateway", "uninstall", "--json"]);
  if (win && !win.isDestroyed()) {
    win.setProgressBar(-1);
  }

  await dialog.showMessageBox(win, {
    type: result.ok ? "info" : "error",
    title: result.ok ? "Legacy gateway uninstalled" : "Uninstall failed",
    message: result.ok ? "Done." : "Failed to uninstall legacy gateway service.",
    detail: [result.error, result.stderr, result.stdout].filter(Boolean).join("\n"),
    buttons: ["OK"],
    defaultId: 0,
    noLink: true,
  });
  return result;
}

function resolveUiRoot() {
  // Packaged: extraResources -> <resources>/control-ui
  const packagedRoot = path.join(process.resourcesPath, "control-ui");
  if (fs.existsSync(path.join(packagedRoot, "index.html"))) {
    return packagedRoot;
  }

  // Dev: repoRoot/dist/control-ui
  const repoRoot = path.resolve(__dirname, "..", "..", "..");
  return path.join(repoRoot, "dist", "control-ui");
}

function createMainWindow(opts) {
  const win = new BrowserWindow({
    width: 1220,
    height: 820,
    minWidth: 1020,
    minHeight: 640,
    title: PRODUCT_NAME,
    backgroundColor: "#12141a",
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, "preload.cjs"),
    },
  });

  win.once("ready-to-show", () => win.show());

  // Handle external links safely.
  win.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
    return { action: "deny" };
  });
  win.webContents.on("will-navigate", (event, url) => {
    try {
      const parsed = new URL(url);
      // Allow our local UI server only; open other URLs externally.
      if (opts && opts.allowedOrigin && parsed.origin === opts.allowedOrigin) {
        return;
      }
      event.preventDefault();
      void shell.openExternal(url);
    } catch {
      // ignore
    }
  });

  return win;
}

function buildAppMenu(win) {
  const isMac = process.platform === "darwin";
  const template = [
    ...(isMac
      ? [
          {
            label: app.name,
            submenu: [{ role: "about" }, { type: "separator" }, { role: "quit" }],
          },
        ]
      : []),
    {
      label: "View",
      submenu: [
        { role: "reload" },
        { role: "forceReload" },
        { type: "separator" },
        { role: "toggleDevTools" },
        { type: "separator" },
        { role: "resetZoom" },
        { role: "zoomIn" },
        { role: "zoomOut" },
        { type: "separator" },
        { role: "togglefullscreen" },
      ],
    },
    {
      label: "Window",
      submenu: [
        {
          label: "Command Center",
          accelerator: "CommandOrControl+K",
          click: () => {
            if (!win) return;
            win.focus();
            // UI has its own Ctrl/Cmd+K listener; this is just a safe fallback.
            void win.webContents.executeJavaScript(
              "window.dispatchEvent(new CustomEvent('openclawDesktop:openCommandCenter'))",
            );
          },
        },
        { type: "separator" },
        { role: "minimize" },
        ...(isMac ? [{ role: "close" }] : [{ role: "close" }]),
      ],
    },
    {
      label: "Gateway",
      submenu: [
        {
          label: "Command Center",
          click: () => {
            if (!win) return;
            win.show();
            win.focus();
            void win.webContents.executeJavaScript(
              "window.dispatchEvent(new CustomEvent('openclawDesktop:openCommandCenter'))",
            );
          },
        },
        {
          label: "Remove gateway data…",
          click: () => {
            if (!win) return;
            void runGatewayUninstall(win, {});
          },
        },
        { type: "separator" },
        {
          label: "Stop legacy gateway service…",
          click: () => {
            if (!win) return;
            void runLegacyGatewayStop(win);
          },
        },
        {
          label: "Uninstall legacy gateway service…",
          click: () => {
            if (!win) return;
            void runLegacyGatewayUninstall(win);
          },
        },
      ],
    },
    {
      label: "Help",
      submenu: [
        {
          label: "Docs (zh-CN)",
          click: () => void shell.openExternal("https://docs.openclaw.ai/zh-CN/index"),
        },
        {
          label: "ClawHub",
          click: () => void shell.openExternal("https://clawhub.com"),
        },
      ],
    },
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

function createTray(win) {
  // Use a safe fallback icon if not found; tray is optional.
  const repoRoot = path.resolve(__dirname, "..", "..", "..");
  const fallbackPng = path.join(repoRoot, "assets", "chrome-extension", "icons", "icon32.png");
  const trayIcon = fs.existsSync(fallbackPng) ? fallbackPng : undefined;
  if (!trayIcon) {
    return null;
  }
  const tray = new Tray(trayIcon);
  tray.setToolTip(PRODUCT_NAME);
  const menu = Menu.buildFromTemplate([
    {
      label: "Open",
      click: () => {
        win.show();
        win.focus();
      },
    },
    { type: "separator" },
    {
      label: "Command Center",
      click: () => {
        win.show();
        win.focus();
        void win.webContents.executeJavaScript(
          "window.dispatchEvent(new CustomEvent('openclawDesktop:openCommandCenter'))",
        );
      },
    },
    {
      label: "Remove gateway data…",
      click: () => {
        win.show();
        win.focus();
        void runGatewayUninstall(win, {});
      },
    },
    { type: "separator" },
    { label: "Quit", click: () => app.quit() },
  ]);
  tray.setContextMenu(menu);
  tray.on("click", () => {
    win.show();
    win.focus();
  });
  return tray;
}

async function main() {
  app.setName(PRODUCT_NAME);

  const uiUrlOverride = process.env.OPENCLAW_CN_UI_URL;
  let server = null;
  let origin = null;
  let startUrl = null;

  if (uiUrlOverride && uiUrlOverride.trim()) {
    startUrl = uiUrlOverride.trim().replace(/\/$/, "");
    origin = new URL(startUrl).origin;
  } else {
    // Start the embedded gateway first so we can inject a working default gateway URL into the UI.
    await startManagedGateway().catch(async (err) => {
      // Non-fatal: still show the UI so the user can point to a remote gateway.
      try {
        await dialog.showMessageBox({
          type: "error",
          title: "Gateway failed to start",
          message: "OpenClaw CN could not start the embedded gateway.",
          detail: String(err),
          buttons: ["OK"],
          defaultId: 0,
          noLink: true,
        });
      } catch {
        // ignore
      }
    });

    const uiRoot = resolveUiRoot();
    server = await startStaticServer(uiRoot, {
      host: "127.0.0.1",
      port: 0,
      injectHtml: (html) =>
        injectDesktopDefaultsIntoIndexHtml(html, {
          gatewayUrl: managedGateway.gatewayUrl ?? `ws://${DEFAULT_GATEWAY_HOST}:${DEFAULT_GATEWAY_PORT}`,
        }),
    });
    startUrl = server.url;
    origin = server.url;
  }

  const win = createMainWindow({ allowedOrigin: origin });
  buildAppMenu(win);
  createTray(win);

  ipcMain.handle("openclawDesktop.version", () => ({
    appVersion: app.getVersion(),
    electron: process.versions.electron,
    chrome: process.versions.chrome,
    node: process.versions.node,
  }));

  ipcMain.handle("openclawDesktop.openCommandCenter", async () => {
    if (!win || win.isDestroyed()) return { ok: false };
    win.show();
    win.focus();
    await win.webContents.executeJavaScript(
      "window.dispatchEvent(new CustomEvent('openclawDesktop:openCommandCenter'))",
    );
    return { ok: true };
  });

  ipcMain.handle("openclawDesktop.gatewayUninstall", async (_event, opts) => {
    return await runGatewayUninstall(win, opts && typeof opts === "object" ? opts : {});
  });

  ipcMain.handle("openclawDesktop.legacyGatewayStop", async () => {
    return await runLegacyGatewayStop(win);
  });

  ipcMain.handle("openclawDesktop.legacyGatewayUninstall", async () => {
    return await runLegacyGatewayUninstall(win);
  });

  // Note: Control UI uses History API; our local server supports SPA fallback.
  await win.loadURL(`${startUrl}/`);
}

app.whenReady().then(() => {
  void main();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("before-quit", () => {
  void stopManagedGateway({ force: true });
});

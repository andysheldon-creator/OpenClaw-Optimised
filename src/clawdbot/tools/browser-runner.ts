/**
 * TOOLS-004 (#40) -- Browser runner
 *
 * Playwright-driven browser automation runner. Executes a sequence of
 * browser actions (navigate, click, type, wait, extract) against a URL
 * and returns structured results including screenshots and extracted data.
 *
 * @see ./browser-vault.ts for credential management
 * @see ./browser-commit-gate.ts for commit/destructive-action gating
 * @module
 */

import { chromium } from "playwright-core";
import { CommitStepDetector } from "./browser-commit-gate.js";

// ---------------------------------------------------------------------------
// BrowserAction
// ---------------------------------------------------------------------------

/** The kind of browser action to perform. */
export type BrowserActionType =
  | "navigate"
  | "click"
  | "type"
  | "wait"
  | "extract"
  | "scroll"
  | "select"
  | "hover";

/**
 * A single browser action within a sequence.
 *
 * The `selector` and `value` fields are interpreted based on `type`:
 *
 * - `navigate` -- `value` is the target URL; `selector` is unused.
 * - `click`    -- `selector` identifies the element to click.
 * - `type`     -- `selector` identifies the input; `value` is the text.
 * - `wait`     -- `selector` is a CSS selector to wait for (or omit for
 *                 a timed wait using `value` as milliseconds).
 * - `extract`  -- `selector` identifies the element; extracted text is
 *                 stored in results.
 * - `scroll`   -- `value` is the scroll direction/amount (e.g. `"down 500"`).
 * - `select`   -- `selector` identifies a `<select>`; `value` is the option.
 * - `hover`    -- `selector` identifies the element to hover over.
 */
export type BrowserAction = {
  /** The kind of action to perform. */
  type: BrowserActionType;

  /**
   * CSS selector targeting the element to interact with.
   * Unused for `navigate` and timed `wait` actions.
   */
  selector?: string;

  /**
   * Action-specific value (URL for navigate, text for type, ms for wait, etc.).
   */
  value?: string;

  /** Optional human-readable label for logging / audit. */
  label?: string;
};

// ---------------------------------------------------------------------------
// Options
// ---------------------------------------------------------------------------

/** Configuration for a browser runner invocation. */
export type BrowserRunnerOptions = {
  /** The initial URL to navigate to. */
  url: string;

  /** Ordered sequence of actions to perform after initial navigation. */
  actions: BrowserAction[];

  /**
   * Whether to capture a screenshot after each action.
   * Defaults to `false`; set to `true` for debugging or audit trails.
   */
  screenshot?: boolean;

  /**
   * Maximum time in milliseconds for the entire browser session.
   * Defaults to 60 000 ms when omitted.
   */
  timeout_ms?: number;

  /** Viewport width in pixels. Defaults to 1280. */
  viewport_width?: number;

  /** Viewport height in pixels. Defaults to 720. */
  viewport_height?: number;

  /** Whether to run the browser in headless mode. Defaults to `true`. */
  headless?: boolean;

  /**
   * Domain whose credentials should be loaded from the vault.
   * When set, the runner retrieves credentials via `BrowserSessionStore`
   * before navigating.
   */
  credential_domain?: string;

  /**
   * When true, allows interactions that match destructive commit-gate
   * heuristics (submit/payment/delete/confirm).
   */
  allow_commit_actions?: boolean;
};

// ---------------------------------------------------------------------------
// Result
// ---------------------------------------------------------------------------

/** A captured screenshot with metadata. */
export type BrowserScreenshot = {
  /** The action index (0-based) that triggered this screenshot. */
  action_index: number;

  /** Base-64 encoded PNG image data. */
  data_base64: string;

  /** Page URL at the time of capture. */
  url: string;

  /** ISO-8601 timestamp of the capture. */
  captured_at: string;
};

/** Outcome of a completed browser session. */
export type BrowserRunnerResult = {
  /** Screenshots captured during the session (empty when `screenshot` is `false`). */
  screenshots: BrowserScreenshot[];

  /**
   * Data extracted by `extract` actions, keyed by action index.
   * Each value is the text content of the matched element.
   */
  extracted_data: Record<number, string>;

  /** The `<title>` of the page at the end of the session. */
  page_title: string;

  /** The URL the browser ended on (may differ from the initial URL due to redirects). */
  final_url: string;

  /** Wall-clock duration of the entire session in milliseconds. */
  duration_ms: number;

  /** Per-action success flags. `true` means the action completed without error. */
  action_results: boolean[];
};

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

const DEFAULT_TIMEOUT_MS = 60_000;
const DEFAULT_VIEWPORT_WIDTH = 1280;
const DEFAULT_VIEWPORT_HEIGHT = 720;

// ---------------------------------------------------------------------------
// Runner
// ---------------------------------------------------------------------------

/**
 * Drives a browser session through a sequence of actions and returns
 * structured results.
 *
 * Usage:
 * ```ts
 * const runner = new BrowserRunner();
 * const result = await runner.execute({
 *   url: "https://example.com/login",
 *   actions: [
 *     { type: "type", selector: "#email", value: "user@example.com" },
 *     { type: "type", selector: "#password", value: "vault://acme/password" },
 *     { type: "click", selector: "button[type=submit]" },
 *     { type: "wait", selector: ".dashboard" },
 *     { type: "extract", selector: ".welcome-message" },
 *   ],
 *   screenshot: true,
 * });
 * ```
 */
export class BrowserRunner {
  /**
   * Execute a browser automation session.
   *
   * The implementation should:
   * 1. Launch a browser instance (Playwright Chromium, headless by default).
   * 2. Navigate to the initial URL.
   * 3. Execute each action in order, capturing screenshots if requested.
   * 4. Run the commit gate detector before any submit/pay/delete action.
   * 5. Close the browser and return the result.
   *
   * @throws {Error} If the browser cannot be launched.
   * @throws {Error} If the session exceeds `timeout_ms`.
   */
  async execute(opts: BrowserRunnerOptions): Promise<BrowserRunnerResult> {
    const timeoutMs = opts.timeout_ms ?? DEFAULT_TIMEOUT_MS;
    const startedAt = Date.now();
    const screenshots: BrowserScreenshot[] = [];
    const extractedData: Record<number, string> = {};
    const actionResults: boolean[] = [];
    const detector = new CommitStepDetector();

    const browser = await chromium.launch({ headless: opts.headless ?? true });
    const context = await browser.newContext({
      viewport: {
        width: opts.viewport_width ?? DEFAULT_VIEWPORT_WIDTH,
        height: opts.viewport_height ?? DEFAULT_VIEWPORT_HEIGHT,
      },
    });
    const page = await context.newPage();

    try {
      await page.goto(opts.url, { waitUntil: "domcontentloaded", timeout: timeoutMs });

      for (const [index, action] of opts.actions.entries()) {
        const elapsed = Date.now() - startedAt;
        const remaining = timeoutMs - elapsed;
        if (remaining <= 0) {
          throw new Error(`BrowserRunner timed out after ${timeoutMs}ms.`);
        }

        try {
          await this.executeAction(
            page,
            action,
            remaining,
            detector,
            Boolean(opts.allow_commit_actions),
          );
          actionResults.push(true);
        } catch (error) {
          actionResults.push(false);
          throw error;
        }

        if (opts.screenshot) {
          const shot = await page.screenshot({ fullPage: true, type: "png" });
          screenshots.push({
            action_index: index,
            data_base64: Buffer.from(shot).toString("base64"),
            url: page.url(),
            captured_at: new Date().toISOString(),
          });
        }

        if (action.type === "extract") {
          const selector = action.selector?.trim();
          if (!selector) {
            throw new Error("extract action requires selector");
          }
          const value = (await page.locator(selector).first().textContent()) ?? "";
          extractedData[index] = value.trim();
        }
      }

      return {
        screenshots,
        extracted_data: extractedData,
        page_title: await page.title(),
        final_url: page.url(),
        duration_ms: Date.now() - startedAt,
        action_results: actionResults,
      };
    } finally {
      await context.close().catch(() => {});
      await browser.close().catch(() => {});
    }
  }

  private async executeAction(
    page: import("playwright-core").Page,
    action: BrowserAction,
    timeoutMs: number,
    detector: CommitStepDetector,
    allowCommitActions: boolean,
  ): Promise<void> {
    switch (action.type) {
      case "navigate": {
        const url = action.value?.trim();
        if (!url) {
          throw new Error("navigate action requires value (url)");
        }
        await page.goto(url, { waitUntil: "domcontentloaded", timeout: timeoutMs });
        return;
      }
      case "click": {
        const selector = action.selector?.trim();
        if (!selector) {
          throw new Error("click action requires selector");
        }
        const text = ((await page.locator(selector).first().textContent()) ?? "").trim();
        const gates = detector.detect([{ selector, text }]);
        const gated = gates.find((gate) => gate.requires_approval);
        if (gated && !allowCommitActions) {
          throw new Error(
            `commit gate triggered for "${selector}" (${gated.action_type}); approval required`,
          );
        }
        await page.locator(selector).first().click({ timeout: timeoutMs });
        return;
      }
      case "type": {
        const selector = action.selector?.trim();
        if (!selector) {
          throw new Error("type action requires selector");
        }
        await page
          .locator(selector)
          .first()
          .fill(action.value ?? "", { timeout: timeoutMs });
        return;
      }
      case "wait": {
        const selector = action.selector?.trim();
        if (selector) {
          await page.waitForSelector(selector, { timeout: timeoutMs });
          return;
        }
        const parsed = Number.parseInt(action.value ?? "", 10);
        const delay = Number.isFinite(parsed) ? Math.max(0, parsed) : 500;
        await page.waitForTimeout(Math.min(delay, timeoutMs));
        return;
      }
      case "extract": {
        return;
      }
      case "scroll": {
        const parsed = Number.parseInt(action.value ?? "", 10);
        const delta = Number.isFinite(parsed) ? parsed : 400;
        await page.mouse.wheel(0, delta);
        return;
      }
      case "select": {
        const selector = action.selector?.trim();
        if (!selector) {
          throw new Error("select action requires selector");
        }
        const value = action.value ?? "";
        await page.locator(selector).first().selectOption(value, { timeout: timeoutMs });
        return;
      }
      case "hover": {
        const selector = action.selector?.trim();
        if (!selector) {
          throw new Error("hover action requires selector");
        }
        await page.locator(selector).first().hover({ timeout: timeoutMs });
        return;
      }
      default:
        throw new Error(`Unsupported browser action type: ${String(action.type)}`);
    }
  }
}

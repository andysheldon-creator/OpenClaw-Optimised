import path from "node:path";

import { ensureMediaDir, saveMediaBuffer } from "../../media/store.js";
import { captureScreenshot, snapshotAria } from "../cdp.js";
import {
  DEFAULT_AI_SNAPSHOT_EFFICIENT_DEPTH,
  DEFAULT_AI_SNAPSHOT_EFFICIENT_MAX_CHARS,
  DEFAULT_AI_SNAPSHOT_MAX_CHARS,
} from "../constants.js";
import {
  DEFAULT_BROWSER_SCREENSHOT_MAX_BYTES,
  DEFAULT_BROWSER_SCREENSHOT_MAX_SIDE,
  normalizeBrowserScreenshot,
} from "../screenshot.js";
import type { BrowserRouteContext } from "../server-context.js";
import type { ProfileContext } from "../server-context.types.js";
import {
  getPwAiModule,
  handleRouteError,
  readBody,
  requirePwAi,
  resolveProfileContext,
} from "./agent.shared.js";
import { jsonError, toBoolean, toNumber, toStringOrEmpty } from "./utils.js";
import type { BrowserResponse, BrowserRouteRegistrar } from "./types.js";

type SnapshotResponseOpts = {
  targetId?: string;
  format: "aria" | "ai";
  limit?: number;
  resolvedMaxChars?: number;
  efficientMode?: boolean;
  labels?: boolean;
  interactive?: boolean;
  compact?: boolean;
  depth?: number;
  selector: string;
  frameSelector: string;
  refsMode?: "aria" | "role";
  includeTab?: boolean;
};

async function respondWithSnapshot(
  profileCtx: ProfileContext,
  ctx: BrowserRouteContext,
  res: BrowserResponse,
  opts: SnapshotResponseOpts,
): Promise<void> {
  const isRtrvr =
    profileCtx.profile.driver === "rtrvr" || profileCtx.profile.driver === "rtrvr-cloud";
  try {
    const tab = await profileCtx.ensureTabAvailable(opts.targetId);
    const send = (payload: unknown) => {
      if (opts.includeTab) {
        return res.json({ ok: true, tab, snapshot: payload });
      }
      return res.json(payload);
    };
    if ((opts.labels || opts.efficientMode) && opts.format === "aria") {
      return jsonError(res, 400, "labels/mode=efficient require format=ai");
    }
    if (isRtrvr) {
      if (opts.labels) {
        return jsonError(res, 501, "Snapshot labels are not supported for rtrvr.ai profiles");
      }
      if (opts.selector.trim() || opts.frameSelector.trim()) {
        return jsonError(
          res,
          400,
          "selector/frame snapshots are not supported for rtrvr.ai profiles",
        );
      }
      const provider = profileCtx.getRtrvrProvider?.();
      if (!provider) return jsonError(res, 500, "rtrvr.ai provider unavailable");
      const snap = await provider.snapshot({
        format: opts.format,
        targetId: tab.targetId,
        maxChars: opts.resolvedMaxChars,
        limit: opts.limit,
      });
      return send(snap);
    }
    if (opts.format === "ai") {
      const pw = await requirePwAi(res, "ai snapshot");
      if (!pw) return;
      const wantsRoleSnapshot =
        opts.labels === true ||
        opts.interactive === true ||
        opts.compact === true ||
        opts.depth !== undefined ||
        Boolean(opts.selector.trim()) ||
        Boolean(opts.frameSelector.trim());

      const snap = wantsRoleSnapshot
        ? await pw.snapshotRoleViaPlaywright({
            cdpUrl: profileCtx.profile.cdpUrl,
            targetId: tab.targetId,
            selector: opts.selector.trim() || undefined,
            frameSelector: opts.frameSelector.trim() || undefined,
            refsMode: opts.refsMode,
            options: {
              interactive: opts.interactive ?? undefined,
              compact: opts.compact ?? undefined,
              maxDepth: opts.depth ?? undefined,
            },
          })
        : await pw
            .snapshotAiViaPlaywright({
              cdpUrl: profileCtx.profile.cdpUrl,
              targetId: tab.targetId,
              ...(typeof opts.resolvedMaxChars === "number"
                ? { maxChars: opts.resolvedMaxChars }
                : {}),
            })
            .catch(async (err) => {
              // Public-API fallback when Playwright's private _snapshotForAI is missing.
              if (String(err).toLowerCase().includes("_snapshotforai")) {
                return await pw.snapshotRoleViaPlaywright({
                  cdpUrl: profileCtx.profile.cdpUrl,
                  targetId: tab.targetId,
                  selector: opts.selector.trim() || undefined,
                  frameSelector: opts.frameSelector.trim() || undefined,
                  refsMode: opts.refsMode,
                  options: {
                    interactive: opts.interactive ?? undefined,
                    compact: opts.compact ?? undefined,
                    maxDepth: opts.depth ?? undefined,
                  },
                });
              }
              throw err;
            });

      if (opts.labels) {
        const labeled = await pw.screenshotWithLabelsViaPlaywright({
          cdpUrl: profileCtx.profile.cdpUrl,
          targetId: tab.targetId,
          refs: "refs" in snap ? snap.refs : {},
          type: "png",
        });
        const normalized = await normalizeBrowserScreenshot(labeled.buffer, {
          maxSide: DEFAULT_BROWSER_SCREENSHOT_MAX_SIDE,
          maxBytes: DEFAULT_BROWSER_SCREENSHOT_MAX_BYTES,
        });
        await ensureMediaDir();
        const saved = await saveMediaBuffer(
          normalized.buffer,
          normalized.contentType ?? "image/png",
          "browser",
          DEFAULT_BROWSER_SCREENSHOT_MAX_BYTES,
        );
        const imageType = normalized.contentType?.includes("jpeg") ? "jpeg" : "png";
        return send({
          ok: true,
          format: opts.format,
          targetId: tab.targetId,
          url: tab.url,
          labels: true,
          labelsCount: labeled.labels,
          labelsSkipped: labeled.skipped,
          imagePath: path.resolve(saved.path),
          imageType,
          ...snap,
        });
      }

      return send({
        ok: true,
        format: opts.format,
        targetId: tab.targetId,
        url: tab.url,
        ...snap,
      });
    }

    const snap =
      profileCtx.profile.driver === "extension" || !tab.wsUrl
        ? (() => {
            // Extension relay doesn't expose per-page WS URLs; run AX snapshot via Playwright CDP session.
            // Also covers cases where wsUrl is missing/unusable.
            return requirePwAi(res, "aria snapshot").then(async (pw) => {
              if (!pw) return null;
              return await pw.snapshotAriaViaPlaywright({
                cdpUrl: profileCtx.profile.cdpUrl,
                targetId: tab.targetId,
                limit: opts.limit,
              });
            });
          })()
        : snapshotAria({ wsUrl: tab.wsUrl ?? "", limit: opts.limit });

    const resolved = await Promise.resolve(snap);
    if (!resolved) return;
    return send({
      ok: true,
      format: "aria",
      targetId: tab.targetId,
      url: tab.url,
      ...resolved,
    });
  } catch (err) {
    handleRouteError(ctx, res, err);
  }
}

export function registerBrowserAgentSnapshotRoutes(
  app: BrowserRouteRegistrar,
  ctx: BrowserRouteContext,
) {
  app.post("/navigate", async (req, res) => {
    const profileCtx = resolveProfileContext(req, res, ctx);
    if (!profileCtx) {
      return;
    }
    const body = readBody(req);
    const url = toStringOrEmpty(body.url);
    const targetId = toStringOrEmpty(body.targetId) || undefined;
    if (!url) {
      return jsonError(res, 400, "url is required");
    }
    try {
      const isRtrvr =
        profileCtx.profile.driver === "rtrvr" || profileCtx.profile.driver === "rtrvr-cloud";
      if (isRtrvr) {
        const provider = profileCtx.getRtrvrProvider?.();
        if (!provider) return jsonError(res, 500, "rtrvr.ai provider unavailable");
        const tab = await profileCtx.ensureTabAvailable(targetId);
        const result = await provider.navigate(url, tab.targetId);
        return res.json({ targetId: tab.targetId, ...result });
      }
      const tab = await profileCtx.ensureTabAvailable(targetId);
      const pw = await requirePwAi(res, "navigate");
      if (!pw) {
        return;
      }
      const result = await pw.navigateViaPlaywright({
        cdpUrl: profileCtx.profile.cdpUrl,
        targetId: tab.targetId,
        url,
      });
      res.json({ ok: true, targetId: tab.targetId, ...result });
    } catch (err) {
      handleRouteError(ctx, res, err);
    }
  });

  app.post("/pdf", async (req, res) => {
    const profileCtx = resolveProfileContext(req, res, ctx);
    if (!profileCtx) {
      return;
    }
    const body = readBody(req);
    const targetId = toStringOrEmpty(body.targetId) || undefined;
    try {
      if (profileCtx.profile.driver === "rtrvr" || profileCtx.profile.driver === "rtrvr-cloud") {
        return jsonError(res, 501, "PDF export is not supported for rtrvr.ai profiles");
      }
      const tab = await profileCtx.ensureTabAvailable(targetId);
      const pw = await requirePwAi(res, "pdf");
      if (!pw) {
        return;
      }
      const pdf = await pw.pdfViaPlaywright({
        cdpUrl: profileCtx.profile.cdpUrl,
        targetId: tab.targetId,
      });
      await ensureMediaDir();
      const saved = await saveMediaBuffer(
        pdf.buffer,
        "application/pdf",
        "browser",
        pdf.buffer.byteLength,
      );
      res.json({
        ok: true,
        path: path.resolve(saved.path),
        targetId: tab.targetId,
        url: tab.url,
      });
    } catch (err) {
      handleRouteError(ctx, res, err);
    }
  });

  app.post("/screenshot", async (req, res) => {
    const profileCtx = resolveProfileContext(req, res, ctx);
    if (!profileCtx) {
      return;
    }
    const body = readBody(req);
    const targetId = toStringOrEmpty(body.targetId) || undefined;
    const fullPage = toBoolean(body.fullPage) ?? false;
    const ref = toStringOrEmpty(body.ref) || undefined;
    const element = toStringOrEmpty(body.element) || undefined;
    const type = body.type === "jpeg" ? "jpeg" : "png";

    if (fullPage && (ref || element)) {
      return jsonError(res, 400, "fullPage is not supported for element screenshots");
    }

    try {
      if (profileCtx.profile.driver === "rtrvr" || profileCtx.profile.driver === "rtrvr-cloud") {
        const provider = profileCtx.getRtrvrProvider?.();
        if (!provider) return jsonError(res, 500, "rtrvr.ai provider unavailable");
        const result = await provider.screenshot({
          targetId,
          fullPage,
          type,
        });
        return jsonError(res, 501, result.error);
      }
      const tab = await profileCtx.ensureTabAvailable(targetId);
      let buffer: Buffer;
      const shouldUsePlaywright =
        profileCtx.profile.driver === "extension" || !tab.wsUrl || Boolean(ref) || Boolean(element);
      if (shouldUsePlaywright) {
        const pw = await requirePwAi(res, "screenshot");
        if (!pw) {
          return;
        }
        const snap = await pw.takeScreenshotViaPlaywright({
          cdpUrl: profileCtx.profile.cdpUrl,
          targetId: tab.targetId,
          ref,
          element,
          fullPage,
          type,
        });
        buffer = snap.buffer;
      } else {
        buffer = await captureScreenshot({
          wsUrl: tab.wsUrl ?? "",
          fullPage,
          format: type,
          quality: type === "jpeg" ? 85 : undefined,
        });
      }

      const normalized = await normalizeBrowserScreenshot(buffer, {
        maxSide: DEFAULT_BROWSER_SCREENSHOT_MAX_SIDE,
        maxBytes: DEFAULT_BROWSER_SCREENSHOT_MAX_BYTES,
      });
      await ensureMediaDir();
      const saved = await saveMediaBuffer(
        normalized.buffer,
        normalized.contentType ?? `image/${type}`,
        "browser",
        DEFAULT_BROWSER_SCREENSHOT_MAX_BYTES,
      );
      res.json({
        ok: true,
        path: path.resolve(saved.path),
        targetId: tab.targetId,
        url: tab.url,
      });
    } catch (err) {
      handleRouteError(ctx, res, err);
    }
  });

  app.post("/scrape", async (req, res) => {
    const profileCtx = resolveProfileContext(req, res, ctx);
    if (!profileCtx) return;
    const body = readBody(req);
    const url = toStringOrEmpty(body.url);
    if (!url) return jsonError(res, 400, "url is required");

    const mode = body.mode === "efficient" ? "efficient" : undefined;
    const labels = toBoolean(body.labels) ?? undefined;
    const explicitFormat =
      body.format === "aria" ? "aria" : body.format === "ai" ? "ai" : undefined;
    const isRtrvr =
      profileCtx.profile.driver === "rtrvr" || profileCtx.profile.driver === "rtrvr-cloud";
    const format =
      explicitFormat ?? (isRtrvr ? "ai" : mode ? "ai" : (await getPwAiModule()) ? "ai" : "aria");
    const limitRaw = toNumber(body.limit);
    const hasMaxChars = body && typeof body === "object" && Object.hasOwn(body, "maxChars");
    const maxCharsRaw = toNumber(body.maxChars);
    const limit = Number.isFinite(limitRaw) ? limitRaw : undefined;
    const maxChars =
      typeof maxCharsRaw === "number" && Number.isFinite(maxCharsRaw) && maxCharsRaw > 0
        ? Math.floor(maxCharsRaw)
        : undefined;
    const resolvedMaxChars =
      format === "ai"
        ? hasMaxChars
          ? maxChars
          : mode === "efficient"
            ? DEFAULT_AI_SNAPSHOT_EFFICIENT_MAX_CHARS
            : DEFAULT_AI_SNAPSHOT_MAX_CHARS
        : undefined;
    const interactiveRaw = toBoolean(body.interactive);
    const compactRaw = toBoolean(body.compact);
    const depthRaw = toNumber(body.depth);
    const refsModeRaw = toStringOrEmpty(body.refs).trim();
    const refsMode = refsModeRaw === "aria" ? "aria" : refsModeRaw === "role" ? "role" : undefined;
    const interactive = interactiveRaw ?? (mode === "efficient" ? true : undefined);
    const compact = compactRaw ?? (mode === "efficient" ? true : undefined);
    const depth =
      depthRaw ?? (mode === "efficient" ? DEFAULT_AI_SNAPSHOT_EFFICIENT_DEPTH : undefined);
    const selector = toStringOrEmpty(body.selector);
    const frameSelector = toStringOrEmpty(body.frame);

    try {
      const tab = await profileCtx.openTab(url);
      return await respondWithSnapshot(profileCtx, ctx, res, {
        targetId: tab.targetId,
        format,
        limit,
        resolvedMaxChars,
        efficientMode: mode === "efficient",
        labels,
        interactive,
        compact,
        depth,
        selector,
        frameSelector,
        refsMode,
        includeTab: true,
      });
    } catch (err) {
      handleRouteError(ctx, res, err);
    }
  });

  app.get("/snapshot", async (req, res) => {
    const profileCtx = resolveProfileContext(req, res, ctx);
    if (!profileCtx) {
      return;
    }
    const targetId = typeof req.query.targetId === "string" ? req.query.targetId.trim() : "";
    const mode = req.query.mode === "efficient" ? "efficient" : undefined;
    const labels = toBoolean(req.query.labels) ?? undefined;
    const explicitFormat =
      req.query.format === "aria" ? "aria" : req.query.format === "ai" ? "ai" : undefined;
    const isRtrvr =
      profileCtx.profile.driver === "rtrvr" || profileCtx.profile.driver === "rtrvr-cloud";
    const format =
      explicitFormat ?? (isRtrvr ? "ai" : mode ? "ai" : (await getPwAiModule()) ? "ai" : "aria");
    const limitRaw = typeof req.query.limit === "string" ? Number(req.query.limit) : undefined;
    const hasMaxChars = Object.hasOwn(req.query, "maxChars");
    const maxCharsRaw =
      typeof req.query.maxChars === "string" ? Number(req.query.maxChars) : undefined;
    const limit = Number.isFinite(limitRaw) ? limitRaw : undefined;
    const maxChars =
      typeof maxCharsRaw === "number" && Number.isFinite(maxCharsRaw) && maxCharsRaw > 0
        ? Math.floor(maxCharsRaw)
        : undefined;
    const resolvedMaxChars =
      format === "ai"
        ? hasMaxChars
          ? maxChars
          : mode === "efficient"
            ? DEFAULT_AI_SNAPSHOT_EFFICIENT_MAX_CHARS
            : DEFAULT_AI_SNAPSHOT_MAX_CHARS
        : undefined;
    const interactiveRaw = toBoolean(req.query.interactive);
    const compactRaw = toBoolean(req.query.compact);
    const depthRaw = toNumber(req.query.depth);
    const refsModeRaw = toStringOrEmpty(req.query.refs).trim();
    const refsMode = refsModeRaw === "aria" ? "aria" : refsModeRaw === "role" ? "role" : undefined;
    const interactive = interactiveRaw ?? (mode === "efficient" ? true : undefined);
    const compact = compactRaw ?? (mode === "efficient" ? true : undefined);
    const depth =
      depthRaw ?? (mode === "efficient" ? DEFAULT_AI_SNAPSHOT_EFFICIENT_DEPTH : undefined);
    const selector = toStringOrEmpty(req.query.selector);
    const frameSelector = toStringOrEmpty(req.query.frame);

    return await respondWithSnapshot(profileCtx, ctx, res, {
      targetId: targetId || undefined,
      format,
      limit,
      resolvedMaxChars,
      efficientMode: mode === "efficient",
      labels,
      interactive,
      compact,
      depth,
      selector,
      frameSelector,
      refsMode,
    });
  });
}

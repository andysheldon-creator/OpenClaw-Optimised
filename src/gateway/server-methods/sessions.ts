import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type { GatewayRequestHandlers } from "./types.js";
import { resolveAgentDir, resolveDefaultAgentId } from "../../agents/agent-scope.js";
import { abortEmbeddedPiRun, waitForEmbeddedPiRunEnd } from "../../agents/pi-embedded.js";
import { stopSubagentsForRequester } from "../../auto-reply/reply/abort.js";
import { clearSessionQueues } from "../../auto-reply/reply/queue.js";
import { loadConfig } from "../../config/config.js";
import {
  loadSessionStore,
  snapshotSessionOrigin,
  resolveMainSessionKey,
  type SessionEntry,
  updateSessionStore,
} from "../../config/sessions.js";
import { normalizeAgentId, parseAgentSessionKey } from "../../routing/session-key.js";
import {
  ErrorCodes,
  errorShape,
  formatValidationErrors,
  validateSessionsCompactParams,
  validateSessionsCreateParams,
  validateSessionsDeleteParams,
  validateSessionsListParams,
  validateSessionsPatchParams,
  validateSessionsPreviewParams,
  validateSessionsResetParams,
  validateSessionsResolveParams,
  validateSessionsRestoreParams,
} from "../protocol/index.js";
import {
  archiveFileOnDisk,
  listSessionsFromStore,
  loadCombinedSessionStoreForGateway,
  loadSessionEntry,
  readSessionPreviewItemsFromTranscript,
  resolveGatewaySessionStoreTarget,
  resolveSessionModelRef,
  resolveSessionTranscriptCandidates,
  type SessionsPatchResult,
  type SessionsPreviewEntry,
  type SessionsPreviewResult,
} from "../session-utils.js";
import { applySessionsPatchToStore } from "../sessions-patch.js";
import { resolveSessionKeyFromResolveParams } from "../sessions-resolve.js";

export const sessionsHandlers: GatewayRequestHandlers = {
  "sessions.list": ({ params, respond }) => {
    if (!validateSessionsListParams(params)) {
      respond(
        false,
        undefined,
        errorShape(
          ErrorCodes.INVALID_REQUEST,
          `invalid sessions.list params: ${formatValidationErrors(validateSessionsListParams.errors)}`,
        ),
      );
      return;
    }
    const p = params;
    const cfg = loadConfig();
    const { storePath, store } = loadCombinedSessionStoreForGateway(cfg);
    const result = listSessionsFromStore({
      cfg,
      storePath,
      store,
      opts: p,
    });
    respond(true, result, undefined);
  },
  "sessions.preview": ({ params, respond }) => {
    if (!validateSessionsPreviewParams(params)) {
      respond(
        false,
        undefined,
        errorShape(
          ErrorCodes.INVALID_REQUEST,
          `invalid sessions.preview params: ${formatValidationErrors(
            validateSessionsPreviewParams.errors,
          )}`,
        ),
      );
      return;
    }
    const p = params;
    const keysRaw = Array.isArray(p.keys) ? p.keys : [];
    const keys = keysRaw
      .map((key) => String(key ?? "").trim())
      .filter(Boolean)
      .slice(0, 64);
    const limit =
      typeof p.limit === "number" && Number.isFinite(p.limit) ? Math.max(1, p.limit) : 12;
    const maxChars =
      typeof p.maxChars === "number" && Number.isFinite(p.maxChars)
        ? Math.max(20, p.maxChars)
        : 240;

    if (keys.length === 0) {
      respond(true, { ts: Date.now(), previews: [] } satisfies SessionsPreviewResult, undefined);
      return;
    }

    const cfg = loadConfig();
    const storeCache = new Map<string, Record<string, SessionEntry>>();
    const previews: SessionsPreviewEntry[] = [];

    for (const key of keys) {
      try {
        const target = resolveGatewaySessionStoreTarget({ cfg, key });
        const store = storeCache.get(target.storePath) ?? loadSessionStore(target.storePath);
        storeCache.set(target.storePath, store);
        const entry =
          target.storeKeys.map((candidate) => store[candidate]).find(Boolean) ??
          store[target.canonicalKey];
        if (!entry?.sessionId) {
          previews.push({ key, status: "missing", items: [] });
          continue;
        }
        const items = readSessionPreviewItemsFromTranscript(
          entry.sessionId,
          target.storePath,
          entry.sessionFile,
          target.agentId,
          limit,
          maxChars,
        );
        previews.push({
          key,
          status: items.length > 0 ? "ok" : "empty",
          items,
        });
      } catch {
        previews.push({ key, status: "error", items: [] });
      }
    }

    respond(true, { ts: Date.now(), previews } satisfies SessionsPreviewResult, undefined);
  },
  "sessions.resolve": ({ params, respond }) => {
    if (!validateSessionsResolveParams(params)) {
      respond(
        false,
        undefined,
        errorShape(
          ErrorCodes.INVALID_REQUEST,
          `invalid sessions.resolve params: ${formatValidationErrors(validateSessionsResolveParams.errors)}`,
        ),
      );
      return;
    }
    const p = params;
    const cfg = loadConfig();

    const resolved = resolveSessionKeyFromResolveParams({ cfg, p });
    if (!resolved.ok) {
      respond(false, undefined, resolved.error);
      return;
    }
    respond(true, { ok: true, key: resolved.key }, undefined);
  },
  "sessions.patch": async ({ params, respond, context }) => {
    if (!validateSessionsPatchParams(params)) {
      respond(
        false,
        undefined,
        errorShape(
          ErrorCodes.INVALID_REQUEST,
          `invalid sessions.patch params: ${formatValidationErrors(validateSessionsPatchParams.errors)}`,
        ),
      );
      return;
    }
    const p = params;
    const key = String(p.key ?? "").trim();
    if (!key) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "key required"));
      return;
    }

    const cfg = loadConfig();
    const target = resolveGatewaySessionStoreTarget({ cfg, key });
    const storePath = target.storePath;
    const applied = await updateSessionStore(storePath, async (store) => {
      const primaryKey = target.storeKeys[0] ?? key;
      const existingKey = target.storeKeys.find((candidate) => store[candidate]);
      if (existingKey && existingKey !== primaryKey && !store[primaryKey]) {
        store[primaryKey] = store[existingKey];
        delete store[existingKey];
      }
      return await applySessionsPatchToStore({
        cfg,
        store,
        storeKey: primaryKey,
        patch: p,
        loadGatewayModelCatalog: context.loadGatewayModelCatalog,
      });
    });
    if (!applied.ok) {
      respond(false, undefined, applied.error);
      return;
    }
    const parsed = parseAgentSessionKey(target.canonicalKey ?? key);
    const agentId = normalizeAgentId(parsed?.agentId ?? resolveDefaultAgentId(cfg));
    const resolved = resolveSessionModelRef(cfg, applied.entry, agentId);
    const result: SessionsPatchResult = {
      ok: true,
      path: storePath,
      key: target.canonicalKey,
      entry: applied.entry,
      resolved: {
        modelProvider: resolved.provider,
        model: resolved.model,
      },
    };
    respond(true, result, undefined);
  },
  "sessions.reset": async ({ params, respond }) => {
    if (!validateSessionsResetParams(params)) {
      respond(
        false,
        undefined,
        errorShape(
          ErrorCodes.INVALID_REQUEST,
          `invalid sessions.reset params: ${formatValidationErrors(validateSessionsResetParams.errors)}`,
        ),
      );
      return;
    }
    const p = params;
    const key = String(p.key ?? "").trim();
    if (!key) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "key required"));
      return;
    }

    const cfg = loadConfig();
    const target = resolveGatewaySessionStoreTarget({ cfg, key });
    const storePath = target.storePath;

    // Check if session is persistent before allowing reset
    const store = loadSessionStore(storePath);
    const primaryKey = target.storeKeys[0] ?? key;
    const existingKey = target.storeKeys.find((candidate) => store[candidate]);
    const entry = store[existingKey ?? primaryKey];

    if (entry?.persistent === true) {
      respond(
        false,
        undefined,
        errorShape(
          ErrorCodes.INVALID_REQUEST,
          `Cannot reset persistent session "${entry.label || key}". Use sessions.delete to clear it, or switch to a different session.`,
        ),
      );
      return;
    }

    const next = await updateSessionStore(storePath, (store) => {
      const primaryKey = target.storeKeys[0] ?? key;
      const existingKey = target.storeKeys.find((candidate) => store[candidate]);
      if (existingKey && existingKey !== primaryKey && !store[primaryKey]) {
        store[primaryKey] = store[existingKey];
        delete store[existingKey];
      }
      const entry = store[primaryKey];
      const now = Date.now();
      const nextEntry: SessionEntry = {
        sessionId: randomUUID(),
        updatedAt: now,
        systemSent: false,
        abortedLastRun: false,
        thinkingLevel: entry?.thinkingLevel,
        verboseLevel: entry?.verboseLevel,
        reasoningLevel: entry?.reasoningLevel,
        responseUsage: entry?.responseUsage,
        model: entry?.model,
        contextTokens: entry?.contextTokens,
        sendPolicy: entry?.sendPolicy,
        label: entry?.label,
        origin: snapshotSessionOrigin(entry),
        lastChannel: entry?.lastChannel,
        lastTo: entry?.lastTo,
        skillsSnapshot: entry?.skillsSnapshot,
        // Reset token counts to 0 on session reset (#1523)
        inputTokens: 0,
        outputTokens: 0,
        totalTokens: 0,
      };
      store[primaryKey] = nextEntry;
      return nextEntry;
    });
    respond(true, { ok: true, key: target.canonicalKey, entry: next }, undefined);
  },
  "sessions.delete": async ({ params, respond }) => {
    if (!validateSessionsDeleteParams(params)) {
      respond(
        false,
        undefined,
        errorShape(
          ErrorCodes.INVALID_REQUEST,
          `invalid sessions.delete params: ${formatValidationErrors(validateSessionsDeleteParams.errors)}`,
        ),
      );
      return;
    }
    const p = params;
    const key = String(p.key ?? "").trim();
    if (!key) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "key required"));
      return;
    }

    const cfg = loadConfig();
    const mainKey = resolveMainSessionKey(cfg);
    const target = resolveGatewaySessionStoreTarget({ cfg, key });
    if (target.canonicalKey === mainKey) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, `Cannot delete the main session (${mainKey}).`),
      );
      return;
    }

    const deleteTranscript = typeof p.deleteTranscript === "boolean" ? p.deleteTranscript : true;

    const storePath = target.storePath;
    const { entry } = loadSessionEntry(key);
    const sessionId = entry?.sessionId;
    const existed = Boolean(entry);
    const queueKeys = new Set<string>(target.storeKeys);
    queueKeys.add(target.canonicalKey);
    if (sessionId) {
      queueKeys.add(sessionId);
    }
    clearSessionQueues([...queueKeys]);
    stopSubagentsForRequester({ cfg, requesterSessionKey: target.canonicalKey });
    if (sessionId) {
      abortEmbeddedPiRun(sessionId);
      const ended = await waitForEmbeddedPiRunEnd(sessionId, 15_000);
      if (!ended) {
        respond(
          false,
          undefined,
          errorShape(
            ErrorCodes.UNAVAILABLE,
            `Session ${key} is still active; try again in a moment.`,
          ),
        );
        return;
      }
    }
    await updateSessionStore(storePath, (store) => {
      const primaryKey = target.storeKeys[0] ?? key;
      const existingKey = target.storeKeys.find((candidate) => store[candidate]);
      if (existingKey && existingKey !== primaryKey && !store[primaryKey]) {
        store[primaryKey] = store[existingKey];
        delete store[existingKey];
      }
      if (store[primaryKey]) {
        delete store[primaryKey];
      }
    });

    const archived: string[] = [];
    if (deleteTranscript && sessionId) {
      // Clean up old .deleted archives for this sessionId before creating a new one.
      // We intentionally keep only the most recent archive per session — restore
      // always operates on the latest delete, and stale archives would cause
      // duplicates in the deleted sessions list.
      const agentDir = resolveAgentDir(cfg, target.agentId);
      // resolveAgentDir returns ~/.openclaw/agents/{agentId}/agent
      // We need ~/.openclaw/agents/{agentId}/sessions
      const agentScope = path.dirname(agentDir);
      const sessionsDir = path.join(agentScope, "sessions");
      try {
        const files = fs.readdirSync(sessionsDir);
        const oldDeleted = files.filter(
          (f) => f.startsWith(`${sessionId}.jsonl.deleted.`) || f === `${sessionId}.metadata.json`,
        );
        for (const oldFile of oldDeleted) {
          try {
            fs.unlinkSync(path.join(sessionsDir, oldFile));
          } catch {
            // Best-effort cleanup
          }
        }
      } catch {
        // Directory might not exist, that's fine
      }

      const candidates = resolveSessionTranscriptCandidates(
        sessionId,
        storePath,
        entry?.sessionFile,
        target.agentId,
      );

      // Deduplicate candidates to avoid archiving the same file multiple times
      const uniqueCandidates = Array.from(new Set(candidates));

      // Write session metadata to a sidecar file so transcript files stay clean.
      // Other processes that scan *.jsonl won't be confused by non-message lines.
      if (entry) {
        const sidecarPath = path.join(sessionsDir, `${sessionId}.metadata.json`);
        try {
          fs.writeFileSync(sidecarPath, JSON.stringify(entry, null, 2), "utf-8");
        } catch {
          // Best-effort.
        }
      }

      // Archive existing transcript files
      const existingFiles = uniqueCandidates.filter((c) => fs.existsSync(c));
      for (const candidate of existingFiles) {
        try {
          archived.push(archiveFileOnDisk(candidate, "deleted"));
        } catch {
          // Best-effort.
        }
      }
    }

    respond(true, { ok: true, key: target.canonicalKey, deleted: existed, archived }, undefined);
  },
  "sessions.create": async ({ params, respond }) => {
    if (!validateSessionsCreateParams(params)) {
      respond(
        false,
        undefined,
        errorShape(
          ErrorCodes.INVALID_REQUEST,
          `invalid sessions.create params: ${formatValidationErrors(validateSessionsCreateParams.errors)}`,
        ),
      );
      return;
    }

    const p = params;
    const label = String(p.label ?? "").trim();
    if (!label) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "label required"));
      return;
    }

    const cfg = loadConfig();
    const agentId = normalizeAgentId(p.agentId ?? resolveDefaultAgentId(cfg));

    // Generate unique session key
    const sessionId = randomUUID();
    const sessionKey = `agent:${agentId}:named:${sessionId}`;

    const now = Date.now();
    const persistent = p.persistent !== false; // default to true

    // Copy settings from basedOn session if provided
    let baseEntry: SessionEntry | undefined;
    if (p.basedOn) {
      try {
        const baseTarget = resolveGatewaySessionStoreTarget({ cfg, key: p.basedOn });
        const baseStore = loadSessionStore(baseTarget.storePath);
        baseEntry = baseStore[baseTarget.storeKeys[0] ?? p.basedOn];
      } catch {
        // If basedOn session not found, just proceed without copying
      }
    }

    const entry: SessionEntry = {
      sessionId,
      updatedAt: now,
      createdAt: now,
      systemSent: false,
      abortedLastRun: false,
      persistent,
      userCreated: true,
      label,
      description: p.description?.trim(),
      // Copy preferences from base session if provided
      thinkingLevel: baseEntry?.thinkingLevel,
      verboseLevel: baseEntry?.verboseLevel,
      reasoningLevel: baseEntry?.reasoningLevel,
      elevatedLevel: baseEntry?.elevatedLevel,
      responseUsage: baseEntry?.responseUsage,
      modelOverride: baseEntry?.modelOverride,
      providerOverride: baseEntry?.providerOverride,
      // Start fresh with zero tokens
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
      contextTokens: 0,
    };

    const target = resolveGatewaySessionStoreTarget({ cfg, key: sessionKey });
    await updateSessionStore(target.storePath, (store) => {
      store[sessionKey] = entry;
    });

    respond(true, { ok: true, key: sessionKey, sessionId, entry }, undefined);
  },
  "sessions.compact": async ({ params, respond }) => {
    if (!validateSessionsCompactParams(params)) {
      respond(
        false,
        undefined,
        errorShape(
          ErrorCodes.INVALID_REQUEST,
          `invalid sessions.compact params: ${formatValidationErrors(validateSessionsCompactParams.errors)}`,
        ),
      );
      return;
    }
    const p = params;
    const key = String(p.key ?? "").trim();
    if (!key) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "key required"));
      return;
    }

    const maxLines =
      typeof p.maxLines === "number" && Number.isFinite(p.maxLines)
        ? Math.max(1, Math.floor(p.maxLines))
        : 400;

    const cfg = loadConfig();
    const target = resolveGatewaySessionStoreTarget({ cfg, key });
    const storePath = target.storePath;
    // Lock + read in a short critical section; transcript work happens outside.
    const compactTarget = await updateSessionStore(storePath, (store) => {
      const primaryKey = target.storeKeys[0] ?? key;
      const existingKey = target.storeKeys.find((candidate) => store[candidate]);
      if (existingKey && existingKey !== primaryKey && !store[primaryKey]) {
        store[primaryKey] = store[existingKey];
        delete store[existingKey];
      }
      return { entry: store[primaryKey], primaryKey };
    });
    const entry = compactTarget.entry;
    const sessionId = entry?.sessionId;
    if (!sessionId) {
      respond(
        true,
        {
          ok: true,
          key: target.canonicalKey,
          compacted: false,
          reason: "no sessionId",
        },
        undefined,
      );
      return;
    }

    const filePath = resolveSessionTranscriptCandidates(
      sessionId,
      storePath,
      entry?.sessionFile,
      target.agentId,
    ).find((candidate) => fs.existsSync(candidate));
    if (!filePath) {
      respond(
        true,
        {
          ok: true,
          key: target.canonicalKey,
          compacted: false,
          reason: "no transcript",
        },
        undefined,
      );
      return;
    }

    const raw = fs.readFileSync(filePath, "utf-8");
    const lines = raw.split(/\r?\n/).filter((l) => l.trim().length > 0);
    if (lines.length <= maxLines) {
      respond(
        true,
        {
          ok: true,
          key: target.canonicalKey,
          compacted: false,
          kept: lines.length,
        },
        undefined,
      );
      return;
    }

    const archived = archiveFileOnDisk(filePath, "bak");
    const keptLines = lines.slice(-maxLines);
    fs.writeFileSync(filePath, `${keptLines.join("\n")}\n`, "utf-8");

    await updateSessionStore(storePath, (store) => {
      const entryKey = compactTarget.primaryKey;
      const entryToUpdate = store[entryKey];
      if (!entryToUpdate) {
        return;
      }
      delete entryToUpdate.inputTokens;
      delete entryToUpdate.outputTokens;
      delete entryToUpdate.totalTokens;
      entryToUpdate.updatedAt = Date.now();
    });

    respond(
      true,
      {
        ok: true,
        key: target.canonicalKey,
        compacted: true,
        archived,
        kept: keptLines.length,
      },
      undefined,
    );
  },
  "sessions.restore": async ({ params, respond }) => {
    if (!validateSessionsRestoreParams(params)) {
      respond(
        false,
        undefined,
        errorShape(
          ErrorCodes.INVALID_REQUEST,
          `invalid sessions.restore params: ${formatValidationErrors(validateSessionsRestoreParams.errors)}`,
        ),
      );
      return;
    }

    const p = params;
    const sessionId = String(p.sessionId ?? "").trim();
    if (!sessionId) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "sessionId required"));
      return;
    }

    const cfg = loadConfig();
    const agentId = normalizeAgentId(p.agentId ?? resolveDefaultAgentId(cfg));
    const agentDir = resolveAgentDir(cfg, agentId);
    // resolveAgentDir returns ~/.openclaw/agents/{agentId}/agent
    // We need ~/.openclaw/agents/{agentId}/sessions
    const agentScope = path.dirname(agentDir);
    const sessionsDir = path.join(agentScope, "sessions");

    try {
      // Find the most recent deleted file for this sessionId.
      // sessions.delete cleans up older archives so there should only be one,
      // but we sort by timestamp descending as a safety measure.
      const files = fs.readdirSync(sessionsDir);
      const deletedFile = files
        .filter((f) => f.startsWith(`${sessionId}.jsonl.deleted.`))
        .toSorted()
        .pop();

      // Read metadata from sidecar file
      const sidecarPath = path.join(sessionsDir, `${sessionId}.metadata.json`);
      let metadata: Record<string, unknown> | null = null;
      try {
        const content = fs.readFileSync(sidecarPath, "utf-8");
        const parsed = JSON.parse(content);
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
          metadata = parsed as Record<string, unknown>;
        }
      } catch {
        // No sidecar or invalid JSON
      }

      if (!deletedFile && !metadata) {
        respond(
          false,
          undefined,
          errorShape(ErrorCodes.NOT_FOUND, `No deleted session found for sessionId: ${sessionId}`),
        );
        return;
      }

      const restoredPath = path.join(sessionsDir, `${sessionId}.jsonl`);

      // Check if a session with this ID already exists
      if (fs.existsSync(restoredPath)) {
        respond(
          false,
          undefined,
          errorShape(
            ErrorCodes.INVALID_REQUEST,
            `Session ${sessionId} already exists. Cannot restore.`,
          ),
        );
        return;
      }

      // Restore transcript: just rename the archived file back (no mutation needed)
      if (deletedFile) {
        const deletedPath = path.join(sessionsDir, deletedFile);
        fs.renameSync(deletedPath, restoredPath);
      }

      // Clean up remaining archived transcripts and sidecar
      const allFiles = fs.readdirSync(sessionsDir);
      const toCleanup = allFiles.filter(
        (f) => f.startsWith(`${sessionId}.jsonl.deleted.`) || f === `${sessionId}.metadata.json`,
      );
      for (const oldFile of toCleanup) {
        try {
          fs.unlinkSync(path.join(sessionsDir, oldFile));
        } catch {
          // Best-effort cleanup
        }
      }

      // Restore session entry in sessions.json
      const storePath = path.join(sessionsDir, "sessions.json");

      // Determine the correct session key format
      let sessionKey: string;
      const isNamedSession = metadata && metadata.userCreated === true;

      if (isNamedSession) {
        // Named sessions use agent:agentId:named:sessionId format
        sessionKey = `agent:${agentId}:named:${sessionId}`;
      } else {
        // Regular sessions use agent:agentId:sessionId format
        sessionKey = `agent:${agentId}:${sessionId}`;
      }

      await updateSessionStore(storePath, (store) => {
        if (metadata) {
          // Restore full metadata
          store[sessionKey] = {
            ...metadata,
            sessionId, // Ensure sessionId is always set
            updatedAt: Date.now(),
            sessionFile: restoredPath,
          };
        } else {
          // Fallback to minimal entry if no metadata found
          store[sessionKey] = {
            sessionId,
            updatedAt: Date.now(),
            systemSent: false,
            abortedLastRun: false,
            sessionFile: restoredPath,
            inputTokens: 0,
            outputTokens: 0,
            totalTokens: 0,
            contextTokens: 0,
          };
        }
      });

      respond(true, { ok: true, key: sessionKey, sessionId, restored: deletedFile }, undefined);
    } catch (err) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INTERNAL_ERROR, `Failed to restore session: ${String(err)}`),
      );
    }
  },
};

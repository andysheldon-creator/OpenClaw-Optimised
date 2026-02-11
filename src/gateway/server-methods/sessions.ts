import { randomUUID } from "node:crypto";
import fs from "node:fs";
import type { GatewayRequestHandlers } from "./types.js";
import { resolveAgentConfig, resolveDefaultAgentId } from "../../agents/agent-scope.js";
import { AGENT_LANE_SUBAGENT } from "../../agents/lanes.js";
import { buildSubagentSystemPrompt } from "../../agents/subagent-announce.js";
import { registerSubagentRun } from "../../agents/subagent-registry.js";
import { abortEmbeddedPiRun, waitForEmbeddedPiRunEnd } from "../../agents/pi-embedded.js";
import { formatThinkingLevels, normalizeThinkLevel } from "../../auto-reply/thinking.js";
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
import {
  resolveInternalSessionKey,
  resolveMainSessionAlias,
} from "../../agents/tools/sessions-helpers.js";
import {
  isSubagentSessionKey,
  normalizeAgentId,
  parseAgentSessionKey,
} from "../../routing/session-key.js";
import { normalizeDeliveryContext } from "../../utils/delivery-context.js";
import { callGateway } from "../call.js";
import {
  ErrorCodes,
  errorShape,
  formatValidationErrors,
  validateSessionsCompactParams,
  validateSessionsDeleteParams,
  validateSessionsListParams,
  validateSessionsPatchParams,
  validateSessionsPreviewParams,
  validateSessionsResetParams,
  validateSessionsResolveParams,
  validateSessionsSpawnParams,
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
      for (const candidate of resolveSessionTranscriptCandidates(
        sessionId,
        storePath,
        entry?.sessionFile,
        target.agentId,
      )) {
        if (!fs.existsSync(candidate)) {
          continue;
        }
        try {
          archived.push(archiveFileOnDisk(candidate, "deleted"));
        } catch {
          // Best-effort.
        }
      }
    }

    respond(true, { ok: true, key: target.canonicalKey, deleted: existed, archived }, undefined);
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
  "sessions.spawn": async ({ params, respond }) => {
    if (!validateSessionsSpawnParams(params)) {
      respond(
        false,
        undefined,
        errorShape(
          ErrorCodes.INVALID_REQUEST,
          `invalid sessions.spawn params: ${formatValidationErrors(validateSessionsSpawnParams.errors)}`,
        ),
      );
      return;
    }

    const p = params as {
      task: string;
      label?: string;
      agentId?: string;
      model?: string;
      thinking?: string;
      runTimeoutSeconds?: number;
      timeoutSeconds?: number;
      cleanup?: "delete" | "keep";
      channel?: string;
      accountId?: string;
      to?: string;
      threadId?: string | number;
      requesterSessionKey?: string;
    };

    const task = String(p.task ?? "").trim();
    if (!task) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "task required"));
      return;
    }

    const label = typeof p.label === "string" ? p.label.trim() : "";
    const requestedAgentId = typeof p.agentId === "string" ? p.agentId.trim() : undefined;
    const modelOverride = typeof p.model === "string" ? p.model.trim() : undefined;
    const thinkingOverrideRaw = typeof p.thinking === "string" ? p.thinking.trim() : undefined;
    const cleanup = p.cleanup === "keep" || p.cleanup === "delete" ? p.cleanup : "keep";

    const requesterOrigin = normalizeDeliveryContext({
      channel: p.channel,
      accountId: p.accountId,
      to: p.to,
      threadId: p.threadId,
    });

    const runTimeoutSeconds = (() => {
      const explicit =
        typeof p.runTimeoutSeconds === "number" && Number.isFinite(p.runTimeoutSeconds)
          ? Math.max(0, Math.floor(p.runTimeoutSeconds))
          : undefined;
      if (explicit !== undefined) {
        return explicit;
      }
      const legacy =
        typeof p.timeoutSeconds === "number" && Number.isFinite(p.timeoutSeconds)
          ? Math.max(0, Math.floor(p.timeoutSeconds))
          : undefined;
      return legacy ?? 0;
    })();

    const cfg = loadConfig();

    const requesterSessionKeyRaw =
      typeof p.requesterSessionKey === "string" ? p.requesterSessionKey.trim() : "";

    const { mainKey, alias } = resolveMainSessionAlias(cfg);
    const requesterSessionKey = requesterSessionKeyRaw
      ? resolveInternalSessionKey({
          key: requesterSessionKeyRaw,
          alias,
          mainKey,
        })
      : alias;

    if (isSubagentSessionKey(requesterSessionKey)) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.FORBIDDEN, "sessions.spawn is not allowed from sub-agent sessions"),
      );
      return;
    }

    const parsedRequester = parseAgentSessionKey(requesterSessionKey);
    const requesterAgentId = normalizeAgentId(
      parsedRequester?.agentId ?? resolveDefaultAgentId(cfg),
    );
    const targetAgentId = requestedAgentId ? normalizeAgentId(requestedAgentId) : requesterAgentId;

    if (targetAgentId !== requesterAgentId) {
      const allowAgents = resolveAgentConfig(cfg, requesterAgentId)?.subagents?.allowAgents ?? [];
      const allowAny = allowAgents.some((value) => value.trim() === "*");
      const normalizedTargetId = targetAgentId.toLowerCase();
      const allowSet = new Set(
        allowAgents
          .filter((value) => value.trim() && value.trim() !== "*")
          .map((value) => normalizeAgentId(value).toLowerCase()),
      );
      if (!allowAny && !allowSet.has(normalizedTargetId)) {
        respond(
          false,
          undefined,
          errorShape(ErrorCodes.FORBIDDEN, `agentId "${targetAgentId}" not in subagents.allowAgents`),
        );
        return;
      }
    }

    const childSessionKey = `agent:${targetAgentId}:subagent:${randomUUID()}`;
    const targetAgentConfig = resolveAgentConfig(cfg, targetAgentId);

    const normalizeModelSelection = (value: unknown): string | undefined => {
      if (typeof value === "string") {
        const trimmed = value.trim();
        return trimmed || undefined;
      }
      if (!value || typeof value !== "object") {
        return undefined;
      }
      const primary = (value as { primary?: unknown }).primary;
      if (typeof primary === "string" && primary.trim()) {
        return primary.trim();
      }
      return undefined;
    };

    const resolvedModel =
      normalizeModelSelection(modelOverride) ??
      normalizeModelSelection(targetAgentConfig?.subagents?.model) ??
      normalizeModelSelection(cfg.agents?.defaults?.subagents?.model);

    const resolvedThinkingDefaultRaw = (() => {
      const agentThinking =
        typeof targetAgentConfig?.subagents === "object" && targetAgentConfig?.subagents
          ? (targetAgentConfig.subagents as { thinking?: unknown }).thinking
          : undefined;
      if (typeof agentThinking === "string") {
        return agentThinking;
      }
      const defaultThinking =
        typeof cfg.agents?.defaults?.subagents === "object" && cfg.agents?.defaults?.subagents
          ? (cfg.agents.defaults.subagents as { thinking?: unknown }).thinking
          : undefined;
      if (typeof defaultThinking === "string") {
        return defaultThinking;
      }
      return undefined;
    })();

    const thinkingCandidateRaw = thinkingOverrideRaw || resolvedThinkingDefaultRaw;
    let thinkingOverride: string | undefined;
    if (thinkingCandidateRaw) {
      const normalized = normalizeThinkLevel(thinkingCandidateRaw);
      if (!normalized) {
        const splitModelRef = (ref?: string) => {
          if (!ref) {
            return { provider: undefined, model: undefined };
          }
          const [provider, model] = ref.trim().split("/", 2);
          return model ? { provider, model } : { provider: undefined, model: ref.trim() };
        };
        const { provider, model } = splitModelRef(resolvedModel);
        const hint = formatThinkingLevels(provider, model);
        respond(
          false,
          undefined,
          errorShape(
            ErrorCodes.INVALID_REQUEST,
            `Invalid thinking level "${thinkingCandidateRaw}". Use one of: ${hint}.`,
          ),
        );
        return;
      }
      thinkingOverride = normalized;
    }

    let modelApplied = false;
    let modelWarning: string | undefined;
    if (resolvedModel) {
      try {
        await callGateway({
          method: "sessions.patch",
          params: { key: childSessionKey, model: resolvedModel },
          timeoutMs: 10_000,
        });
        modelApplied = true;
      } catch (err) {
        const messageText =
          err instanceof Error ? err.message : typeof err === "string" ? err : "error";
        const recoverable =
          messageText.includes("invalid model") || messageText.includes("model not allowed");
        if (!recoverable) {
          respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, messageText));
          return;
        }
        modelWarning = messageText;
      }
    }

    const childSystemPrompt = buildSubagentSystemPrompt({
      requesterSessionKey: requesterSessionKey || undefined,
      requesterOrigin,
      childSessionKey,
      label: label || undefined,
      task,
    });

    const childIdem = randomUUID();
    let childRunId: string = childIdem;
    try {
      const response = await callGateway<{ runId: string }>({
        method: "agent",
        params: {
          message: task,
          sessionKey: childSessionKey,
          channel: requesterOrigin?.channel,
          to: requesterOrigin?.to ?? undefined,
          accountId: requesterOrigin?.accountId ?? undefined,
          threadId:
            requesterOrigin?.threadId != null ? String(requesterOrigin.threadId) : undefined,
          idempotencyKey: childIdem,
          deliver: false,
          lane: AGENT_LANE_SUBAGENT,
          extraSystemPrompt: childSystemPrompt,
          thinking: thinkingOverride ?? undefined,
          timeout: runTimeoutSeconds > 0 ? runTimeoutSeconds : undefined,
          label: label || undefined,
          spawnedBy: requesterSessionKey,
          groupId: typeof p.groupId === "string" ? p.groupId : undefined,
          groupChannel: typeof p.groupChannel === "string" ? p.groupChannel : undefined,
          groupSpace: typeof p.groupSpace === "string" ? p.groupSpace : undefined,
        },
        timeoutMs: 10_000,
      });
      if (typeof response?.runId === "string" && response.runId) {
        childRunId = response.runId;
      }
    } catch (err) {
      const messageText = err instanceof Error ? err.message : typeof err === "string" ? err : "error";
      respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, messageText));
      return;
    }

    registerSubagentRun({
      runId: childRunId,
      childSessionKey,
      requesterSessionKey,
      requesterOrigin,
      requesterDisplayKey: requesterSessionKey,
      task,
      cleanup,
      label: label || undefined,
      runTimeoutSeconds,
    });

    respond(
      true,
      {
        ok: true,
        childSessionKey,
        runId: childRunId,
        modelApplied: resolvedModel ? modelApplied : undefined,
        warning: modelWarning,
      },
      undefined,
    );
  },
};

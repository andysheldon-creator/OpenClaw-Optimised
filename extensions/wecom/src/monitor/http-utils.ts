import type { IncomingMessage, ServerResponse } from "node:http";
import type { WecomWebhookTarget } from "./types.js";
import { getWecomRuntime } from "../runtime.js";
import { monitorState } from "./state.js";

// Reference to target registries for checkPruneTimer
// These will be passed in or accessed via closure in the main monitor.ts
let webhookTargetsRef: Map<string, WecomWebhookTarget[]> | undefined;
let agentTargetsRef: Map<string, unknown> | undefined;

/**
 * Set references to the target registries for checkPruneTimer.
 * Called from monitor.ts during initialization.
 */
export function setTargetRegistryRefs(
  webhookTargets: Map<string, WecomWebhookTarget[]>,
  agentTargets: Map<string, unknown>,
): void {
  webhookTargetsRef = webhookTargets;
  agentTargetsRef = agentTargets;
}

/**
 * **normalizeWebhookPath (标准化 Webhook 路径)**
 *
 * 将用户配置的路径统一格式化为以 `/` 开头且不以 `/` 结尾的字符串。
 * 例如: `wecom` -> `/wecom`
 */
export function normalizeWebhookPath(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return "/";
  const withSlash = trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
  if (withSlash.length > 1 && withSlash.endsWith("/")) return withSlash.slice(0, -1);
  return withSlash;
}

/**
 * **ensurePruneTimer (启动清理定时器)**
 *
 * 当有活跃的 Webhook Target 注册时，调用 MonitorState 启动自动清理任务。
 * 清理任务包括：删除过期 Stream、移除无效 Active Reply URL 等。
 */
export function ensurePruneTimer(): void {
  monitorState.startPruning();
}

/**
 * **checkPruneTimer (检查并停止清理定时器)**
 *
 * 当没有活跃的 Webhook Target 时（Bot 和 Agent 均移除），停止清理任务以节省资源。
 */
export function checkPruneTimer(): void {
  const hasBot = webhookTargetsRef ? webhookTargetsRef.size > 0 : false;
  const hasAgent = agentTargetsRef ? agentTargetsRef.size > 0 : false;
  if (!hasBot && !hasAgent) {
    monitorState.stopPruning();
  }
}

export function truncateUtf8Bytes(text: string, maxBytes: number): string {
  const buf = Buffer.from(text, "utf8");
  if (buf.length <= maxBytes) return text;
  const slice = buf.subarray(buf.length - maxBytes);
  return slice.toString("utf8");
}

/**
 * **jsonOk (返回 JSON 响应)**
 *
 * 辅助函数：向企业微信服务器返回 HTTP 200 及 JSON 内容。
 * 注意企业微信要求加密内容以 Content-Type: text/plain 返回，但这里为了通用性使用了标准 JSON 响应，
 * 并通过 Content-Type 修正适配。
 */
export function jsonOk(res: ServerResponse, body: unknown): void {
  res.statusCode = 200;
  // WeCom's reference implementation returns the encrypted JSON as text/plain.
  res.setHeader("Content-Type", "text/plain; charset=utf-8");
  res.end(JSON.stringify(body));
}

/**
 * **readJsonBody (读取 JSON 请求体)**
 *
 * 异步读取 HTTP 请求体并解析为 JSON。包含大小限制检查，防止大包攻击。
 *
 * @param req HTTP 请求对象
 * @param maxBytes 最大允许字节数
 */
export async function readJsonBody(
  req: IncomingMessage,
  maxBytes: number,
): Promise<{ ok: boolean; value?: unknown; error?: string }> {
  const chunks: Buffer[] = [];
  let total = 0;
  return await new Promise<{ ok: boolean; value?: unknown; error?: string }>((resolve) => {
    req.on("data", (chunk: Buffer) => {
      total += chunk.length;
      if (total > maxBytes) {
        resolve({ ok: false, error: "payload too large" });
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      try {
        const raw = Buffer.concat(chunks).toString("utf8");
        if (!raw.trim()) {
          resolve({ ok: false, error: "empty payload" });
          return;
        }
        resolve({ ok: true, value: JSON.parse(raw) as unknown });
      } catch (err) {
        resolve({ ok: false, error: err instanceof Error ? err.message : String(err) });
      }
    });
    req.on("error", (err) => {
      resolve({ ok: false, error: err instanceof Error ? err.message : String(err) });
    });
  });
}

export function resolveQueryParams(req: IncomingMessage): URLSearchParams {
  const url = new URL(req.url ?? "/", "http://localhost");
  return url.searchParams;
}

export function resolvePath(req: IncomingMessage): string {
  const url = new URL(req.url ?? "/", "http://localhost");
  return normalizeWebhookPath(url.pathname || "/");
}

export function resolveSignatureParam(params: URLSearchParams): string {
  return params.get("msg_signature") ?? params.get("msgsignature") ?? params.get("signature") ?? "";
}

export function logVerbose(target: WecomWebhookTarget, message: string): void {
  const should =
    target.core.logging?.shouldLogVerbose?.() ??
    (() => {
      try {
        return getWecomRuntime().logging.shouldLogVerbose();
      } catch {
        return false;
      }
    })();
  if (!should) return;
  target.runtime.log?.(`[wecom] ${message}`);
}

export function wecomLogInfo(target: WecomWebhookTarget, message: string): void {
  target.runtime.log?.(`[wecom] ${message}`);
}

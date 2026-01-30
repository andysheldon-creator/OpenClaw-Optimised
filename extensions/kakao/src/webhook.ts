import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { KakaoIncomingMessage, KakaoSkillResponse, ResolvedKakaoAccount } from "./types.js";
import { createKakaoApiClient } from "./api-client.js";
import { getConsultationButton, isLegalQuestion } from "./lawcall-router.js";
import {
  handleBillingCommand,
  preBillingCheck,
  postBillingDeduct,
  getCreditStatusMessage,
} from "./billing-handler.js";

export interface KakaoWebhookOptions {
  account: ResolvedKakaoAccount;
  port?: number;
  host?: string;
  path?: string;
  abortSignal?: AbortSignal;
  onMessage: (params: {
    userId: string;
    userType: string;
    text: string;
    botId: string;
    blockId: string;
    timestamp: number;
  }) => Promise<{ text: string; quickReplies?: string[] }>;
  onError?: (error: Error) => void;
  logger?: {
    info: (msg: string) => void;
    warn: (msg: string) => void;
    error: (msg: string) => void;
  };
}

/**
 * Create and start a Kakao webhook server
 * This receives messages from Kakao i Open Builder skill server
 */
export async function startKakaoWebhook(opts: KakaoWebhookOptions): Promise<{
  stop: () => Promise<void>;
  port: number;
  url: string;
}> {
  const {
    account,
    port = account.config.webhookPort ?? 8788,
    host = "0.0.0.0",
    path = account.config.webhookPath ?? "/kakao/webhook",
    abortSignal,
    onMessage,
    onError,
    logger = console,
  } = opts;

  const apiClient = createKakaoApiClient(account);
  let server: ReturnType<typeof createServer> | null = null;

  const handleRequest = async (req: IncomingMessage, res: ServerResponse) => {
    // Health check
    if (req.url === "/health" && req.method === "GET") {
      res.writeHead(200, { "Content-Type": "text/plain" });
      res.end("ok");
      return;
    }

    // Only accept POST to webhook path
    if (req.url !== path || req.method !== "POST") {
      res.writeHead(404);
      res.end("Not Found");
      return;
    }

    // Parse JSON body
    let body = "";
    for await (const chunk of req) {
      body += chunk;
    }

    let kakaoRequest: KakaoIncomingMessage;
    try {
      kakaoRequest = JSON.parse(body) as KakaoIncomingMessage;
    } catch {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Invalid JSON" }));
      return;
    }

    const userId = kakaoRequest.userRequest?.user?.id ?? "";
    const userType = kakaoRequest.userRequest?.user?.type ?? "";
    const utterance = kakaoRequest.userRequest?.utterance ?? "";
    const botId = kakaoRequest.bot?.id ?? "";
    const blockId = kakaoRequest.action?.id ?? "";

    logger.info(
      `[kakao] Received message from ${userId.slice(0, 8)}...: "${utterance.slice(0, 50)}${utterance.length > 50 ? "..." : ""}"`,
    );

    // Check allowlist if configured
    if (account.config.dmPolicy === "allowlist") {
      const allowFrom = account.config.allowFrom ?? [];
      if (!allowFrom.includes(userId)) {
        logger.warn(`[kakao] User ${userId.slice(0, 8)}... not in allowlist`);
        const response = apiClient.buildSkillResponse(
          "죄송합니다. 허용되지 않은 사용자입니다.",
        );
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(response));
        return;
      }
    }

    if (account.config.dmPolicy === "disabled") {
      const response = apiClient.buildSkillResponse(
        "현재 메시지 수신이 비활성화되어 있습니다.",
      );
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(response));
      return;
    }

    try {
      // Step 1: Check for billing commands (잔액, 충전, API키 등록 등)
      const billingCmd = handleBillingCommand(userId, utterance);
      if (billingCmd.handled) {
        let response: KakaoSkillResponse;
        if (billingCmd.paymentUrl) {
          // Build response with payment link button
          response = apiClient.buildTextWithButtonResponse(
            billingCmd.response ?? "",
            "결제하기",
            billingCmd.paymentUrl,
            billingCmd.quickReplies,
          );
        } else {
          response = apiClient.buildSkillResponse(
            billingCmd.response ?? "",
            billingCmd.quickReplies,
          );
        }
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(response));
        logger.info(`[kakao] Handled billing command for ${userId.slice(0, 8)}...`);
        return;
      }

      // Step 2: Pre-billing check (verify credits or custom API key)
      const billingCheck = preBillingCheck(userId);
      if (billingCheck.handled) {
        const response = apiClient.buildSkillResponse(
          billingCheck.response ?? "",
          billingCheck.quickReplies,
        );
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(response));
        logger.info(`[kakao] Billing check failed for ${userId.slice(0, 8)}...: insufficient credits`);
        return;
      }

      // Step 3: Call the message handler (this will route to Moltbot agent)
      const usedPlatformKey = !billingCheck.billingCheck?.useCustomKey;
      const result = await onMessage({
        userId,
        userType,
        text: utterance,
        botId,
        blockId,
        timestamp: Date.now(),
      });

      // Step 4: Post-billing deduct (if using platform API key)
      // Estimate tokens: ~4 chars per token for Korean
      const estimatedInputTokens = Math.ceil(utterance.length / 4);
      const estimatedOutputTokens = Math.ceil(result.text.length / 4);
      const model = process.env.MOLTBOT_MODEL ?? "claude-3-haiku-20240307";

      const billingResult = postBillingDeduct(
        userId,
        model,
        estimatedInputTokens,
        estimatedOutputTokens,
        usedPlatformKey,
      );

      // Step 5: Append credit status to response (if charged)
      const creditMessage = getCreditStatusMessage(userId, billingResult.creditsUsed, usedPlatformKey);
      const finalText = result.text + creditMessage;

      // Check if this is a legal question and add consultation button
      let response: KakaoSkillResponse;

      if (isLegalQuestion(utterance) || isLegalQuestion(result.text)) {
        const consultButton = getConsultationButton(utterance);
        response = apiClient.buildTextWithButtonResponse(
          finalText,
          consultButton.label,
          consultButton.url,
          result.quickReplies,
        );
        logger.info(`[kakao] Detected legal question, added ${consultButton.category} link`);
      } else {
        response = apiClient.buildSkillResponse(finalText, result.quickReplies);
      }

      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(response));

      logger.info(
        `[kakao] Sent response to ${userId.slice(0, 8)}...: "${result.text.slice(0, 50)}${result.text.length > 50 ? "..." : ""}" (credits: -${billingResult.creditsUsed})`,
      );
    } catch (err) {
      logger.error(`[kakao] Error processing message: ${err}`);
      onError?.(err instanceof Error ? err : new Error(String(err)));

      // Send error response
      const response = apiClient.buildSkillResponse(
        "죄송합니다. 메시지 처리 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.",
      );
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(response));
    }
  };

  return new Promise((resolve, reject) => {
    server = createServer(handleRequest);

    server.on("error", (err) => {
      logger.error(`[kakao] Server error: ${err}`);
      reject(err);
    });

    // Handle abort signal
    if (abortSignal) {
      abortSignal.addEventListener("abort", () => {
        server?.close();
      });
    }

    server.listen(port, host, () => {
      const url = `http://${host === "0.0.0.0" ? "localhost" : host}:${port}${path}`;
      logger.info(`[kakao] Webhook server started at ${url}`);

      resolve({
        port,
        url,
        stop: async () => {
          return new Promise((res) => {
            if (server) {
              server.close(() => {
                logger.info("[kakao] Webhook server stopped");
                res();
              });
            } else {
              res();
            }
          });
        },
      });
    });
  });
}

/**
 * Parse Kakao webhook request body
 */
export function parseKakaoWebhookBody(body: string): KakaoIncomingMessage | null {
  try {
    return JSON.parse(body) as KakaoIncomingMessage;
  } catch {
    return null;
  }
}

/**
 * Build error response for Kakao
 */
export function buildKakaoErrorResponse(message: string): KakaoSkillResponse {
  return {
    version: "2.0",
    template: {
      outputs: [{ simpleText: { text: message } }],
    },
  };
}

/**
 * Validate Kakao webhook request (optional signature verification)
 */
export function validateKakaoWebhook(
  headers: Record<string, string | string[] | undefined>,
  _body: string,
  _secretKey?: string,
): boolean {
  // Kakao i Open Builder doesn't have built-in signature verification
  // You can implement custom validation here if needed
  // _body and _secretKey are reserved for future signature verification

  // For now, just check Content-Type
  const contentType = headers["content-type"];
  if (typeof contentType === "string" && !contentType.includes("application/json")) {
    return false;
  }

  return true;
}

/**
 * Extract user info from Kakao request
 */
export function extractKakaoUserInfo(request: KakaoIncomingMessage): {
  userId: string;
  userType: string;
  timezone: string;
  lang: string | null;
  properties: Record<string, string>;
} {
  return {
    userId: request.userRequest?.user?.id ?? "",
    userType: request.userRequest?.user?.type ?? "",
    timezone: request.userRequest?.timezone ?? "Asia/Seoul",
    lang: request.userRequest?.lang ?? null,
    properties: request.userRequest?.user?.properties ?? {},
  };
}

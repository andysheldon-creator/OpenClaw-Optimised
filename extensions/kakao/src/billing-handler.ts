/**
 * Billing Handler
 *
 * Handles billing-related commands in KakaoTalk chat.
 * Integrates with billing.ts and payment.ts
 */

import {
  checkBilling,
  deductCredits,
  getCredits,
  getUserStats,
  setUserApiKey,
  hasCustomApiKey,
  formatCredits,
  getPricingMessage,
  addCredits,
} from "./billing.js";
import {
  isPaymentCommand,
  isApiKeyCommand,
  getPackageSelectionMessage,
  parsePackageSelection,
  getApiKeyGuide,
  parseApiKey,
  createPaymentSession,
  CREDIT_PACKAGES,
} from "./payment.js";

export interface BillingHandlerResult {
  handled: boolean;
  response?: string;
  quickReplies?: string[];
  paymentUrl?: string;
  billingCheck?: {
    allowed: boolean;
    useCustomKey: boolean;
    customApiKey?: string;
    customProvider?: string;
  };
}

/**
 * Handle billing-related commands
 * Returns handled=true if the message was a billing command
 */
export function handleBillingCommand(
  userId: string,
  message: string,
): BillingHandlerResult {
  const normalizedMessage = message.toLowerCase().trim();

  // Check balance command
  if (normalizedMessage === "잔액" || normalizedMessage === "크레딧" || normalizedMessage === "잔고") {
    const stats = getUserStats(userId);
    const response = `💰 크레딧 잔액: ${formatCredits(stats.credits)}

📊 누적 사용: ${formatCredits(stats.totalSpent)}
🔑 나만의 API 키: ${stats.hasCustomKey ? "✅ 등록됨 (무료 이용)" : "❌ 미등록"}

${stats.hasCustomKey ? "" : '💡 "API키 등록"이라고 말씀하시면 무료로 이용할 수 있어요!'}
💳 "충전"이라고 말씀하시면 크레딧을 충전할 수 있어요.`;

    return {
      handled: true,
      response,
      quickReplies: ["충전", "API키 등록", "요금 안내"],
    };
  }

  // Pricing info command
  if (normalizedMessage === "요금" || normalizedMessage === "요금 안내" || normalizedMessage === "가격") {
    return {
      handled: true,
      response: getPricingMessage(),
      quickReplies: ["충전", "API키 등록", "잔액"],
    };
  }

  // API key registration guide
  if (isApiKeyCommand(message) && !parseApiKey(message)) {
    return {
      handled: true,
      response: getApiKeyGuide(),
      quickReplies: ["잔액", "충전"],
    };
  }

  // API key registration
  const apiKeyInfo = parseApiKey(message);
  if (apiKeyInfo) {
    setUserApiKey(userId, apiKeyInfo.apiKey, apiKeyInfo.provider);
    return {
      handled: true,
      response: `✅ API 키가 등록되었습니다!

🔑 제공자: ${apiKeyInfo.provider === "anthropic" ? "Anthropic (Claude)" : "OpenAI (GPT)"}
💰 이제부터 무료로 이용하실 수 있습니다.

법률 상담을 시작하시려면 질문해 주세요.`,
      quickReplies: ["민사 상담", "형사 상담", "이혼 상담"],
    };
  }

  // Credit charge command
  if (normalizedMessage === "충전" || normalizedMessage === "크레딧 충전") {
    return {
      handled: true,
      response: getPackageSelectionMessage(),
      quickReplies: CREDIT_PACKAGES.map(p => `${p.name} 충전`),
    };
  }

  // Package selection
  const selectedPackage = parsePackageSelection(message);
  if (selectedPackage && isPaymentCommand(message)) {
    const result = createPaymentSession(userId, selectedPackage.id);

    if ("error" in result) {
      return {
        handled: true,
        response: `❌ ${result.error}`,
        quickReplies: ["충전", "잔액"],
      };
    }

    const totalCredits = selectedPackage.credits + (selectedPackage.bonus ?? 0);
    return {
      handled: true,
      response: `💳 결제 안내

📦 ${selectedPackage.name} 패키지
💰 금액: ${selectedPackage.price.toLocaleString()}원
🎁 크레딧: ${totalCredits.toLocaleString()}

아래 링크를 클릭하여 결제를 진행해주세요.`,
      paymentUrl: result.paymentUrl,
      quickReplies: ["취소"],
    };
  }

  // Not a billing command
  return { handled: false };
}

/**
 * Pre-check billing before making LLM request
 * Returns billing status and API key to use
 */
export function preBillingCheck(
  userId: string,
  estimatedTokens: number = 1000,
): BillingHandlerResult {
  const billingResult = checkBilling(userId, undefined, estimatedTokens);

  if (!billingResult.allowed) {
    return {
      handled: true,
      response: `${billingResult.error}

💳 크레딧을 충전하시거나,
🔑 나만의 API 키를 등록하시면 무료로 이용하실 수 있습니다.`,
      quickReplies: ["충전", "API키 등록", "잔액"],
    };
  }

  return {
    handled: false,
    billingCheck: {
      allowed: true,
      useCustomKey: billingResult.useCustomKey,
      customApiKey: billingResult.customApiKey,
      customProvider: billingResult.customProvider,
    },
  };
}

/**
 * Post-billing: deduct credits after successful LLM request
 */
export function postBillingDeduct(
  userId: string,
  model: string,
  inputTokens: number,
  outputTokens: number,
  usedPlatformKey: boolean,
): { creditsUsed: number; remainingCredits: number } {
  return deductCredits(userId, model, inputTokens, outputTokens, usedPlatformKey);
}

/**
 * Add credits after successful payment
 */
export function completePayment(
  userId: string,
  credits: number,
): string {
  const newBalance = addCredits(userId, credits);
  return `✅ 결제가 완료되었습니다!

🎁 충전된 크레딧: ${formatCredits(credits)}
💰 현재 잔액: ${formatCredits(newBalance)}

이제 법률 상담을 시작하실 수 있습니다.`;
}

/**
 * Get credit status message for appending to responses
 */
export function getCreditStatusMessage(
  userId: string,
  creditsUsed: number,
  usedPlatformKey: boolean,
): string {
  if (!usedPlatformKey) {
    return ""; // No charge for custom API key
  }

  const remaining = getCredits(userId);

  if (remaining < 100) {
    return `\n\n⚠️ 크레딧 잔액이 부족합니다 (${formatCredits(remaining)})\n"충전"이라고 말씀해주세요.`;
  }

  return `\n\n💳 -${creditsUsed} 크레딧 (잔액: ${formatCredits(remaining)})`;
}

/**
 * Check if user has enough credits or custom API key
 */
export function canUserChat(userId: string): boolean {
  if (hasCustomApiKey(userId)) {
    return true;
  }
  return getCredits(userId) > 0;
}

/**
 * Payment Integration (Toss Payments)
 *
 * Handles credit purchases via Toss Payments API.
 * https://docs.tosspayments.com/
 */

export interface PaymentConfig {
  clientKey: string; // Toss Payments Client Key
  secretKey: string; // Toss Payments Secret Key
  successUrl: string; // Payment success callback URL
  failUrl: string; // Payment failure callback URL
}

export interface CreditPackage {
  id: string;
  name: string;
  credits: number;
  price: number; // KRW
  bonus?: number; // Bonus credits
}

// Available credit packages
export const CREDIT_PACKAGES: CreditPackage[] = [
  { id: "basic", name: "기본", credits: 5000, price: 5000 },
  { id: "standard", name: "표준", credits: 12000, price: 10000, bonus: 2000 },
  { id: "premium", name: "프리미엄", credits: 30000, price: 20000, bonus: 10000 },
  { id: "pro", name: "프로", credits: 60000, price: 50000, bonus: 10000 },
];

export interface PaymentSession {
  orderId: string;
  userId: string;
  packageId: string;
  amount: number;
  credits: number;
  status: "pending" | "completed" | "failed" | "cancelled";
  createdAt: number;
  completedAt?: number;
  paymentKey?: string;
}

// In-memory storage (replace with database in production)
const paymentSessions: Map<string, PaymentSession> = new Map();

/**
 * Get payment configuration from environment
 */
function getPaymentConfig(): PaymentConfig | null {
  const clientKey = process.env.TOSS_CLIENT_KEY;
  const secretKey = process.env.TOSS_SECRET_KEY;
  const baseUrl = process.env.LAWCALL_BASE_URL ?? "https://lawcall.com";

  if (!clientKey || !secretKey) {
    return null;
  }

  return {
    clientKey,
    secretKey,
    successUrl: `${baseUrl}/payment/success`,
    failUrl: `${baseUrl}/payment/fail`,
  };
}

/**
 * Generate unique order ID
 */
function generateOrderId(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).slice(2, 8);
  return `LC${timestamp}${random}`.toUpperCase();
}

/**
 * Create a payment session for credit purchase
 */
export function createPaymentSession(
  userId: string,
  packageId: string,
): { session: PaymentSession; paymentUrl: string } | { error: string } {
  const config = getPaymentConfig();
  if (!config) {
    return { error: "결제 시스템이 설정되지 않았습니다." };
  }

  const pkg = CREDIT_PACKAGES.find(p => p.id === packageId);
  if (!pkg) {
    return { error: "유효하지 않은 패키지입니다." };
  }

  const orderId = generateOrderId();
  const totalCredits = pkg.credits + (pkg.bonus ?? 0);

  const session: PaymentSession = {
    orderId,
    userId,
    packageId,
    amount: pkg.price,
    credits: totalCredits,
    status: "pending",
    createdAt: Date.now(),
  };

  paymentSessions.set(orderId, session);

  // Toss Payments checkout URL
  const params = new URLSearchParams({
    clientKey: config.clientKey,
    amount: pkg.price.toString(),
    orderId,
    orderName: `LawCall 크레딧 ${pkg.name} (${totalCredits.toLocaleString()} 크레딧)`,
    successUrl: config.successUrl,
    failUrl: config.failUrl,
  });

  const paymentUrl = `https://api.tosspayments.com/v1/payments?${params}`;

  return { session, paymentUrl };
}

/**
 * Confirm payment after successful checkout
 */
export async function confirmPayment(
  orderId: string,
  paymentKey: string,
  amount: number,
): Promise<{ success: boolean; credits?: number; error?: string }> {
  const config = getPaymentConfig();
  if (!config) {
    return { success: false, error: "결제 시스템 오류" };
  }

  const session = paymentSessions.get(orderId);
  if (!session) {
    return { success: false, error: "결제 세션을 찾을 수 없습니다." };
  }

  if (session.amount !== amount) {
    return { success: false, error: "결제 금액이 일치하지 않습니다." };
  }

  try {
    // Confirm payment with Toss API
    const response = await fetch("https://api.tosspayments.com/v1/payments/confirm", {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${config.secretKey}:`).toString("base64")}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        paymentKey,
        orderId,
        amount,
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      return { success: false, error: error.message ?? "결제 확인 실패" };
    }

    // Update session
    session.status = "completed";
    session.completedAt = Date.now();
    session.paymentKey = paymentKey;

    return { success: true, credits: session.credits };
  } catch (err) {
    return { success: false, error: "결제 처리 중 오류가 발생했습니다." };
  }
}

/**
 * Get payment session by order ID
 */
export function getPaymentSession(orderId: string): PaymentSession | null {
  return paymentSessions.get(orderId) ?? null;
}

/**
 * Generate credit package selection message for KakaoTalk
 */
export function getPackageSelectionMessage(): string {
  const lines = ["💳 크레딧 충전\n"];

  for (const pkg of CREDIT_PACKAGES) {
    const totalCredits = pkg.credits + (pkg.bonus ?? 0);
    const bonusText = pkg.bonus ? ` (+${pkg.bonus.toLocaleString()} 보너스!)` : "";
    lines.push(`${pkg.name}: ${totalCredits.toLocaleString()} 크레딧 - ${pkg.price.toLocaleString()}원${bonusText}`);
  }

  lines.push("\n원하시는 패키지를 선택해주세요:");
  lines.push('"기본 충전", "표준 충전", "프리미엄 충전", "프로 충전"');

  return lines.join("\n");
}

/**
 * Parse package selection from user message
 */
export function parsePackageSelection(message: string): CreditPackage | null {
  const normalized = message.toLowerCase().replace(/\s+/g, "");

  for (const pkg of CREDIT_PACKAGES) {
    if (normalized.includes(pkg.id) || normalized.includes(pkg.name)) {
      return pkg;
    }
  }

  // Try to match by price
  const priceMatch = message.match(/(\d+)원/);
  if (priceMatch) {
    const price = Number.parseInt(priceMatch[1], 10);
    return CREDIT_PACKAGES.find(p => p.price === price) ?? null;
  }

  return null;
}

/**
 * Check if message is a payment-related command
 */
export function isPaymentCommand(message: string): boolean {
  const paymentKeywords = ["충전", "결제", "크레딧", "구매", "패키지"];
  const normalized = message.toLowerCase();
  return paymentKeywords.some(kw => normalized.includes(kw));
}

/**
 * Check if user wants to set their own API key
 */
export function isApiKeyCommand(message: string): boolean {
  const apiKeyKeywords = ["api키", "api key", "apikey", "내 키", "나의 키", "키 등록", "키등록"];
  const normalized = message.toLowerCase().replace(/\s+/g, "");
  return apiKeyKeywords.some(kw => normalized.includes(kw.replace(/\s+/g, "")));
}

/**
 * Get API key registration guide
 */
export function getApiKeyGuide(): string {
  return `🔑 나만의 API 키 등록

API 키를 등록하면 무료로 이용할 수 있습니다!

📌 Anthropic (Claude)
1. console.anthropic.com 가입
2. API Keys 메뉴에서 키 생성
3. 여기에 키 입력: "anthropic sk-ant-..."

📌 OpenAI (GPT)
1. platform.openai.com 가입
2. API keys 메뉴에서 키 생성
3. 여기에 키 입력: "openai sk-..."

⚠️ 키는 암호화되어 안전하게 저장됩니다.`;
}

/**
 * Parse API key from user message
 */
export function parseApiKey(message: string): {
  provider: "anthropic" | "openai";
  apiKey: string;
} | null {
  // Anthropic key pattern
  const anthropicMatch = message.match(/anthropic\s+(sk-ant-[a-zA-Z0-9_-]+)/i);
  if (anthropicMatch) {
    return { provider: "anthropic", apiKey: anthropicMatch[1] };
  }

  // OpenAI key pattern
  const openaiMatch = message.match(/openai\s+(sk-[a-zA-Z0-9_-]+)/i);
  if (openaiMatch) {
    return { provider: "openai", apiKey: openaiMatch[1] };
  }

  // Direct key patterns
  if (message.includes("sk-ant-")) {
    const match = message.match(/sk-ant-[a-zA-Z0-9_-]+/);
    if (match) return { provider: "anthropic", apiKey: match[0] };
  }

  if (message.match(/sk-[a-zA-Z0-9]{20,}/)) {
    const match = message.match(/sk-[a-zA-Z0-9_-]+/);
    if (match && !match[0].startsWith("sk-ant-")) {
      return { provider: "openai", apiKey: match[0] };
    }
  }

  return null;
}

/**
 * Credits & Billing System
 *
 * Manages user credits for LLM API usage.
 * - Users with their own API key: FREE
 * - Users using platform API key: 2x cost in credits
 */

import { createHash } from "node:crypto";

// Credit cost multiplier when using platform API
const PLATFORM_API_MULTIPLIER = 2;

// LLM model pricing (per 1M tokens, in credits)
// 1 credit = 1 KRW (Korean Won)
const MODEL_PRICING: Record<string, { input: number; output: number }> = {
  // Claude models
  "claude-opus-4-5-20251101": { input: 15000, output: 75000 },
  "claude-sonnet-4-20250514": { input: 3000, output: 15000 },
  "claude-3-5-sonnet-20241022": { input: 3000, output: 15000 },
  "claude-3-haiku-20240307": { input: 250, output: 1250 },
  // OpenAI models
  "gpt-4o": { input: 2500, output: 10000 },
  "gpt-4o-mini": { input: 150, output: 600 },
  "gpt-4-turbo": { input: 10000, output: 30000 },
  "gpt-3.5-turbo": { input: 500, output: 1500 },
};

// Default model if not specified
const DEFAULT_MODEL = "claude-3-haiku-20240307";

export interface UserAccount {
  oduserId: string; // Kakao user ID (hashed)
  credits: number; // Available credits
  totalSpent: number; // Total credits spent
  customApiKey?: string; // User's own API key (encrypted)
  customProvider?: "anthropic" | "openai"; // Provider for custom key
  createdAt: number;
  updatedAt: number;
}

export interface UsageRecord {
  userId: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  creditsUsed: number;
  usedPlatformKey: boolean;
  timestamp: number;
}

export interface BillingResult {
  allowed: boolean;
  useCustomKey: boolean;
  customApiKey?: string;
  customProvider?: string;
  estimatedCost?: number;
  remainingCredits?: number;
  error?: string;
}

// In-memory storage (replace with database in production)
const users: Map<string, UserAccount> = new Map();
const usageHistory: UsageRecord[] = [];

/**
 * Hash user ID for privacy
 */
function hashUserId(kakaoUserId: string): string {
  return createHash("sha256").update(kakaoUserId).digest("hex").slice(0, 16);
}

/**
 * Get or create user account
 */
export function getOrCreateUser(kakaoUserId: string): UserAccount {
  const oduserId = hashUserId(kakaoUserId);

  let user = users.get(oduserId);
  if (!user) {
    user = {
      oduserId,
      credits: Number(process.env.LAWCALL_FREE_CREDITS ?? 1000), // 1000 free credits for new users
      totalSpent: 0,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    users.set(oduserId, user);
  }

  return user;
}

/**
 * Set user's custom API key
 */
export function setUserApiKey(
  kakaoUserId: string,
  apiKey: string,
  provider: "anthropic" | "openai",
): void {
  const user = getOrCreateUser(kakaoUserId);
  user.customApiKey = apiKey; // In production, encrypt this!
  user.customProvider = provider;
  user.updatedAt = Date.now();
}

/**
 * Check if user has custom API key
 */
export function hasCustomApiKey(kakaoUserId: string): boolean {
  const user = getOrCreateUser(kakaoUserId);
  return !!user.customApiKey;
}

/**
 * Calculate cost in credits for a request
 */
export function calculateCost(
  model: string,
  inputTokens: number,
  outputTokens: number,
  usePlatformKey: boolean,
): number {
  const pricing = MODEL_PRICING[model] ?? MODEL_PRICING[DEFAULT_MODEL];

  // Cost per token (pricing is per 1M tokens)
  const inputCost = (inputTokens / 1_000_000) * pricing.input;
  const outputCost = (outputTokens / 1_000_000) * pricing.output;
  let totalCost = inputCost + outputCost;

  // Apply multiplier if using platform key
  if (usePlatformKey) {
    totalCost *= PLATFORM_API_MULTIPLIER;
  }

  // Round up to nearest credit
  return Math.ceil(totalCost);
}

/**
 * Estimate cost before making request
 */
export function estimateCost(
  model: string,
  estimatedInputTokens: number,
  estimatedOutputTokens: number,
  usePlatformKey: boolean,
): number {
  return calculateCost(model, estimatedInputTokens, estimatedOutputTokens, usePlatformKey);
}

/**
 * Check if user can make a request
 */
export function checkBilling(
  kakaoUserId: string,
  model: string = DEFAULT_MODEL,
  estimatedTokens: number = 1000, // Estimate for typical request
): BillingResult {
  const user = getOrCreateUser(kakaoUserId);

  // If user has custom API key, allow for free
  if (user.customApiKey && user.customProvider) {
    return {
      allowed: true,
      useCustomKey: true,
      customApiKey: user.customApiKey,
      customProvider: user.customProvider,
      estimatedCost: 0,
      remainingCredits: user.credits,
    };
  }

  // Estimate cost for platform key usage
  const estimatedCost = estimateCost(model, estimatedTokens, estimatedTokens * 2, true);

  // Check if user has enough credits
  if (user.credits < estimatedCost) {
    return {
      allowed: false,
      useCustomKey: false,
      estimatedCost,
      remainingCredits: user.credits,
      error: `크레딧이 부족합니다. 필요: ${estimatedCost}, 보유: ${user.credits}`,
    };
  }

  return {
    allowed: true,
    useCustomKey: false,
    estimatedCost,
    remainingCredits: user.credits,
  };
}

/**
 * Deduct credits after successful request
 */
export function deductCredits(
  kakaoUserId: string,
  model: string,
  inputTokens: number,
  outputTokens: number,
  usedPlatformKey: boolean,
): { creditsUsed: number; remainingCredits: number } {
  const user = getOrCreateUser(kakaoUserId);

  // No charge if using custom key
  if (!usedPlatformKey) {
    return { creditsUsed: 0, remainingCredits: user.credits };
  }

  const creditsUsed = calculateCost(model, inputTokens, outputTokens, true);

  user.credits = Math.max(0, user.credits - creditsUsed);
  user.totalSpent += creditsUsed;
  user.updatedAt = Date.now();

  // Record usage
  usageHistory.push({
    userId: user.oduserId,
    model,
    inputTokens,
    outputTokens,
    creditsUsed,
    usedPlatformKey,
    timestamp: Date.now(),
  });

  return { creditsUsed, remainingCredits: user.credits };
}

/**
 * Add credits to user account (after payment)
 */
export function addCredits(kakaoUserId: string, amount: number): number {
  const user = getOrCreateUser(kakaoUserId);
  user.credits += amount;
  user.updatedAt = Date.now();
  return user.credits;
}

/**
 * Get user's credit balance
 */
export function getCredits(kakaoUserId: string): number {
  const user = getOrCreateUser(kakaoUserId);
  return user.credits;
}

/**
 * Get user's usage statistics
 */
export function getUserStats(kakaoUserId: string): {
  credits: number;
  totalSpent: number;
  hasCustomKey: boolean;
  recentUsage: UsageRecord[];
} {
  const user = getOrCreateUser(kakaoUserId);
  const oduserId = hashUserId(kakaoUserId);

  const recentUsage = usageHistory
    .filter(u => u.userId === oduserId)
    .slice(-10);

  return {
    credits: user.credits,
    totalSpent: user.totalSpent,
    hasCustomKey: !!user.customApiKey,
    recentUsage,
  };
}

/**
 * Format credits for display
 */
export function formatCredits(credits: number): string {
  if (credits >= 10000) {
    return `${(credits / 10000).toFixed(1)}만`;
  }
  return credits.toLocaleString();
}

/**
 * Get pricing info message
 */
export function getPricingMessage(): string {
  return `💳 크레딧 안내

📌 나만의 API 키 사용 시: 무료!
   - Anthropic: console.anthropic.com
   - OpenAI: platform.openai.com

📌 플랫폼 API 사용 시: 2배 비용
   - Claude Haiku: 약 1-2 크레딧/대화
   - Claude Sonnet: 약 10-20 크레딧/대화
   - GPT-4o-mini: 약 2-3 크레딧/대화

💰 크레딧 충전:
   "충전"이라고 말씀해주세요.`;
}

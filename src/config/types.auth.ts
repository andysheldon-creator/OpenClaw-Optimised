export type AuthProfileConfig = {
  provider: string;
  /**
   * Credential type expected in auth-profiles.json for this profile id.
   * - api_key: static provider API key
   * - oauth: refreshable OAuth credentials (access+refresh+expires)
   * - token: static bearer-style token (optionally expiring; no refresh)
   */
  mode: "api_key" | "oauth" | "token";
  email?: string;
};

export type AuthConfig = {
  profiles?: Record<string, AuthProfileConfig>;
  order?: Record<string, string[]>;
  cooldowns?: {
    /** Default billing backoff (hours). Default: 5. */
    billingBackoffHours?: number;
    /** Optional per-provider billing backoff (hours). */
    billingBackoffHoursByProvider?: Record<string, number>;
    /** Billing backoff cap (hours). Default: 24. */
    billingMaxHours?: number;
    /**
     * Failure window for backoff counters (hours). If no failures occur within
     * this window, counters reset. Default: 24.
     */
    failureWindowHours?: number;
    /**
     * How to handle billing/402 errors.
     * - "disable": (default) Disable the profile for hours (exponential backoff).
     *   Best for provider API keys where credits require manual action.
     * - "retry": Short 5-minute cooldown then retry. Best for prepaid credit
     *   systems (like Fuel) where top-ups are fast and automated.
     * - "notify": No cooldown — just show the error and continue. The profile
     *   stays available for immediate retry after the user tops up.
     */
    billingRecoveryMode?: "disable" | "retry" | "notify";
  };
};

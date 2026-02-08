export type PrivacyConfig = {
  /**
   * PII scrubbing mode (off|on). When on, common PII (phone, email, credit cards)
   * is masked before being sent to LLMs.
   */
  piiScrubbing?: "off" | "on";
  /**
   * Custom patterns for PII scrubbing (regex strings).
   */
  piiPatterns?: string[];
};

export type SecurityConfig = {
  /** Privacy protection settings. */
  privacy?: PrivacyConfig;
};

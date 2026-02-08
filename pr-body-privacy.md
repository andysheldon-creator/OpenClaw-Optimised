## Summary

Add a Privacy Shield layer that scans and redacts PII (Personally Identifiable Information) from the agent's context (system prompt and message history) before it is sent to LLMs.

## Motivation

Protecting user privacy is critical when using cloud-based LLMs. This feature ensures that sensitive information like email addresses, phone numbers, and credit card numbers are masked by default when the privacy shield is enabled.

## Features

- **Default PII Redaction**: Automatically masks Emails, Phone numbers, Credit Card numbers, and IPv4 addresses.
- **Configurable**: Users can enable/disable this feature via `security.privacy.piiScrubbing`.
- **Custom Patterns**: Users can provide their own regex patterns for additional redaction.
- **Comprehensive Scrubbing**: Scrubs both the System Prompt and the entire message history turns.

## Configuration Example

```json
{
  "security": {
    "privacy": {
      "piiScrubbing": "on",
      "piiPatterns": ["\\bsecret-project-code\\b"]
    }
  }
}
```

## Behavior Changes

| Input                        | Output (Redacted)             |
| ---------------------------- | ----------------------------- |
| "Call me at 123-456-7890"    | "Call me at [PHONE_REDACTED]" |
| "Email me: user@example.com" | "Email me: [EMAIL_REDACTED]"  |

## Files Changed

- `src/infra/privacy.ts`: Core PII scrubbing logic.
- `src/config/types.security.ts`: New security configuration types.
- `src/agents/pi-embedded-runner/run/attempt.ts`: Integration into the model request pipeline.
- `src/config/zod-schema.ts`: Configuration schema validation.

## AI-Assisted Contribution 🤖

- [x] AI-assisted (Claude)
- [x] Code reviewed and tested locally

lobster-biscuit

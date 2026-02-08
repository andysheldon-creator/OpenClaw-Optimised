## Summary

Add a Privacy Shield layer that scans and redacts PII (Personally Identifiable Information) from the agent's **outbound responses** before they are sent to chat channels.

## Motivation

This is specifically designed to combat **Prompt Injection attacks**. While the model needs access to sensitive info in its context to be helpful, we want to prevent that info from being "leaked" to external chat channels if the model is tricked or "hallucinates" private data into its output.

## Features

- **Output Interception**: Intercepts messages at the final delivery stage (e.g., Telegram, Discord).
- **Preserves Model Intelligence**: Input context remains unscrubbed so the model stays smart.
- **Default PII Redaction**: Automatically masks Emails, Phone numbers, Credit Card numbers, and IPv4 addresses.
- **Configurable**: Users can enable/disable this feature via `security.privacy.piiScrubbing`.
- **Custom Patterns**: Users can provide their own regex patterns for additional redaction.

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

| Context (What Model Sees)      | Output (What is Sent to User)   |
| ------------------------------ | ------------------------------- |
| "Call my boss at 123-456-7890" | "Calling [PHONE_REDACTED]..."   |
| "The secret code is XYZ-123"   | "The secret code is [REDACTED]" |

## Files Changed

- `src/infra/privacy.ts`: Core PII scrubbing logic.
- `src/infra/outbound/deliver.ts`: Integration into the outbound delivery pipeline.
- `src/config/types.security.ts`: New security configuration types.
- `src/config/zod-schema.ts`: Configuration schema validation.

## AI-Assisted Contribution 🤖

- [x] AI-assisted (Claude)
- [x] Focused on Prompt Injection defense
- [x] Tested output scrubbing locally

lobster-biscuit

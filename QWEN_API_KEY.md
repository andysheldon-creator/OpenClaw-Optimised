# Qwen DashScope API Key Support

Add DashScope API Key authentication for Qwen provider in OpenClaw.

## Summary

This PR enables users to authenticate with Qwen using DashScope API keys, complementing the existing OAuth flow. Supports both International (Singapore) and China regions with 9 verified models.

## Changes

### Modified Files (5)

1. **src/agents/model-auth.ts** - Added `QWEN_API_KEY` environment variable
2. **extensions/qwen-portal-auth/index.ts** - API key auth method with region selection
3. **src/commands/onboard-types.ts** - Added `qwen-api-key` type
4. **src/commands/auth-choice-options.ts** - Added API key option in wizard
5. **src/commands/auth-choice.apply.qwen-portal.ts** - Updated routing logic

**Total**: ~185 lines changed (163 added, 16 removed)

## New Features

- API Key authentication for paid DashScope tier
- Region selection: International (Singapore) / China
- Auto-configuration of correct endpoint based on region
- 9 verified models (tested against live APIs)
- Environment variable support: `QWEN_API_KEY`
- Onboard wizard integration

## Supported Models

All models verified in both International and China regions:

**Coding Models**

- qwen3-coder-plus (alias: qwen3-coder)
- qwen-coder-plus (alias: qwen-coder)
- qwen3-coder-flash

**General Models**

- qwen3-max
- qwen-max
- qwen-plus (alias: qwen)
- qwen-turbo

**Vision Models**

- qwen3-vl-plus
- qwen-vl-plus

## Region Configuration

### International (Singapore)

- Endpoint: `https://dashscope-intl.aliyuncs.com/compatible-mode/v1`
- For users outside mainland China
- Documentation: https://www.alibabacloud.com/help/en/model-studio/

### China

- Endpoint: `https://dashscope.aliyuncs.com/compatible-mode/v1`
- For users in mainland China
- Documentation: https://dashscope.aliyuncs.com/

Note: API keys are region-specific and not interchangeable between endpoints.

## Testing

### Automated Test

Test script verifies all code changes and runs build.

### Verification Completed

- International region tested with real API key
- China region tested with real API key
- All 9 models verified against live APIs
- OAuth flow unchanged (no regression)
- TypeScript compilation successful

## Implementation Details

### Authentication Flow

User selects API Key → Choose region → Enter key → Validate format → Auto-configure endpoint → Save to profile

### Plugin Pattern

Follows existing OpenClaw plugin authentication patterns:

- Region selection via `ctx.prompter.select`
- API key input via `ctx.prompter.text` with format validation
- Returns standard `AuthResult` structure
- Integrates with auth profile system

## Backwards Compatibility

- No breaking changes
- Existing OAuth users unaffected
- All configurations remain valid
- Existing tests pass

## Security

- API keys stored in auth-profiles.json with restricted file permissions
- Input validation enforces `sk-` prefix format
- No secrets committed to repository
- Supports environment variables for automation

## OAuth vs API Key Comparison

| Feature  | OAuth (Free)   | API Key (Paid)                 |
| -------- | -------------- | ------------------------------ |
| Setup    | Browser login  | Direct API key                 |
| Cost     | Free tier      | Pay per use                    |
| Endpoint | portal.qwen.ai | dashscope-intl/cn.aliyuncs.com |
| Models   | 2              | 9+                             |
| Use Case | Testing        | Production                     |

---

**Status**: Ready for review  
**Last Updated**: 2026-02-11  
**Tested**: International (SG) + China regions with real API keys

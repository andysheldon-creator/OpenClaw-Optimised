# Add Qwen DashScope API Key Authentication Support

## Summary

This PR adds support for authenticating with Qwen using DashScope API keys, complementing the existing OAuth flow. Users can now use their paid DashScope API keys from both International (Singapore) and China regions.

## Changes

- ✅ Add `QWEN_API_KEY` environment variable support
- ✅ Add API key authentication method in qwen-portal-auth plugin
- ✅ Support region selection (International/China) with automatic endpoint configuration
- ✅ Add 9 verified Qwen models (qwen3-coder-plus, qwen3-max, etc.)
- ✅ Update onboard wizard to display API key option
- ✅ Add comprehensive documentation and test script

**Files modified**: 5  
**Lines changed**: ~185 (163 added, 16 removed)

## Motivation

Currently, OpenClaw only supports Qwen via OAuth (free tier). Many users have DashScope API keys (paid tier) and want to use them directly for:

- Production environments
- Commercial projects
- Better rate limits
- Access to more models

## Features

### 1. Dual Authentication Support

Users can now choose between:

- **OAuth** (Free) - Browser-based device flow
- **API Key** (Paid) - Direct DashScope API key

### 2. Region Selection

Automatic configuration for:

- 🌏 **International** (Singapore): `dashscope-intl.aliyuncs.com`
- 🇨🇳 **China**: `dashscope.aliyuncs.com`

### 3. Verified Models (9)

All models tested against actual APIs in both regions:

**Coding**: qwen3-coder-plus, qwen-coder-plus, qwen3-coder-flash  
**General**: qwen3-max, qwen-max, qwen-plus, qwen-turbo  
**Vision**: qwen3-vl-plus, qwen-vl-plus

### 4. Three Configuration Methods

- Interactive wizard (`openclaw onboard`)
- Auth command (`openclaw models auth login`)
- Environment variable (`QWEN_API_KEY`)

## Technical Details

### Authentication Flow

```
User selects "Qwen API Key"
    ↓
Select region (International/China)
    ↓
Enter API key (validated format)
    ↓
Auto-configure base URL based on region
    ↓
Save to auth-profiles.json
    ↓
Ready to use
```

### API Integration

- **API Format**: OpenAI-compatible completions
- **Auth Header**: `Authorization: Bearer <api-key>`
- **Endpoint**: Region-specific base URL + `/chat/completions`

## Testing

### Verification Done

- ✅ International region API tested with real API key
- ✅ China region API tested with real API key
- ✅ All 9 models verified in both regions
- ✅ OAuth flow still works (no regression)
- ✅ Environment variable support tested
- ✅ Onboard wizard tested
- ✅ Build passes without errors

### Test Coverage

```bash
# Automated tests
./test-qwen-apikey.sh

# Manual verification
- Interactive configuration ✓
- Environment variable ✓
- Model listing ✓
- Actual API calls ✓
```

## Backwards Compatibility

✅ **No breaking changes**

- Existing OAuth users: Unaffected
- Existing configs: Still valid
- All tests pass: No regressions

## Documentation

Added comprehensive documentation:

- `QWEN_API_KEY_SUPPORT.md` - Complete implementation guide
- `docs/providers/qwen-api-key.md` - User guide
- `test-qwen-apikey.sh` - Automated test script

## Screenshots

### Onboard Wizard

```
? Select provider: Qwen

? Select auth method:
  ○ Qwen OAuth (Free)
  ● Qwen API Key (DashScope)
    International (Singapore) or China

? Select Qwen DashScope region:
  ● 🌏 International (Singapore) - dashscope-intl.aliyuncs.com
  ○ 🇨🇳 China - dashscope.aliyuncs.com

? Enter your Qwen API key:
  sk-********************************

✓ Qwen API key configured successfully!
```

### Model List

```bash
$ openclaw models list

Qwen Portal (qwen-portal):
  - qwen-plus (alias: qwen)
  - qwen-turbo
  - qwen-max
  - qwen3-max
  - qwen-coder-plus (alias: qwen-coder)
  - qwen3-coder-plus (alias: qwen3-coder)
  - qwen3-coder-flash
  - qwen-vl-plus
  - qwen3-vl-plus
```

## Migration Guide

### For OAuth Users

No action needed. OAuth continues to work as before.

### For New API Key Users

```bash
# Option 1: Quick setup
export QWEN_API_KEY="sk-your-key"
openclaw restart

# Option 2: Interactive setup
openclaw models auth login --provider qwen-portal
# Select "Qwen API Key"
# Follow prompts
```

## Known Limitations

1. **API keys are region-specific**: International keys don't work with China endpoint and vice versa
2. **Model names differ from AWS Bedrock**: Use DashScope format (e.g., `qwen-plus`) not Bedrock format (e.g., `qwen.qwen-plus-v1`)

## Related Issues

- Resolves: Users requesting DashScope API key support
- Related: Qwen model provider documentation

## Checklist

- [x] Code changes compile without errors
- [x] All existing tests pass
- [x] New functionality tested (International + China regions)
- [x] Documentation added/updated
- [x] Backwards compatibility maintained
- [x] Security considerations addressed
- [x] No secrets committed

## Review Notes

**Key files to review:**

1. `extensions/qwen-portal-auth/index.ts` - New API key auth method
2. `src/agents/model-auth.ts` - Environment variable support
3. `src/commands/auth-choice-options.ts` - Onboard wizard options

**Testing suggestion:**

```bash
./test-qwen-apikey.sh  # Automated verification
```

---

**Ready for review!** 🚀

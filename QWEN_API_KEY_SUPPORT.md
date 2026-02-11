# Qwen DashScope API Key Support

## Overview

This PR adds support for Qwen DashScope API Key authentication, in addition to the existing OAuth flow. Users can now authenticate using their DashScope API keys from both International (Singapore) and China regions.

**Date**: 2026-02-11  
**Files Modified**: 5  
**Lines Added**: ~160

---

## Motivation

Currently, OpenClaw only supports Qwen authentication via OAuth (free-tier portal). However, many users have DashScope API keys (paid tier) and want to use them directly without going through the OAuth flow.

**Benefits:**

- ✅ Support both free (OAuth) and paid (API Key) tiers
- ✅ Better integration with existing DashScope workflows
- ✅ Support for International (Singapore) and China regions
- ✅ Access to more models (9 verified models)

---

## Changes Summary

### Modified Files

#### 1. `src/agents/model-auth.ts` (Line 275-277)

**Added environment variable support:**

```typescript
// Before
if (normalized === "qwen-portal") {
  return pick("QWEN_OAUTH_TOKEN") ?? pick("QWEN_PORTAL_API_KEY");
}

// After
if (normalized === "qwen-portal") {
  return pick("QWEN_API_KEY") ?? pick("QWEN_OAUTH_TOKEN") ?? pick("QWEN_PORTAL_API_KEY");
}
```

**Purpose**: Allow users to set API key via `QWEN_API_KEY` environment variable

---

#### 2. `extensions/qwen-portal-auth/index.ts`

**Major changes:**

1. **Added constants** (Lines 4-12):

```typescript
const DEFAULT_MODEL = "qwen-portal/qwen-plus";
const DEFAULT_BASE_URL_OAUTH = "https://portal.qwen.ai/v1";
const DEFAULT_BASE_URL_INTL = "https://dashscope-intl.aliyuncs.com/compatible-mode/v1";
const DEFAULT_BASE_URL_CN = "https://dashscope.aliyuncs.com/compatible-mode/v1";
```

2. **Updated plugin metadata**:

```typescript
name: "Qwen OAuth & API Key",
description: "OAuth flow and API key authentication for Qwen models",
```

3. **Added API Key authentication method** (Lines 127-240):
   - Region selection (International/China)
   - API key input with validation
   - Automatic base URL configuration
   - 9 verified models configured

**Supported models:**

- `qwen-plus` (General purpose, alias: `qwen`)
- `qwen-turbo` (Fast responses)
- `qwen-max` (Most capable)
- `qwen3-max` (Latest, most capable)
- `qwen-coder-plus` (Coding, alias: `qwen-coder`)
- `qwen3-coder-plus` (Latest coding, alias: `qwen3-coder`)
- `qwen3-coder-flash` (Fast coding)
- `qwen-vl-plus` (Vision)
- `qwen3-vl-plus` (Latest vision)

---

#### 3. `src/commands/onboard-types.ts` (Line 37-38)

**Added type definition:**

```typescript
| "qwen-portal"
| "qwen-api-key"  // ← New
| "xai-api-key"
```

**Purpose**: TypeScript type support for the new auth choice

---

#### 4. `src/commands/auth-choice-options.ts`

**Change 1 - Updated group definition** (Lines 85-89):

```typescript
{
  value: "qwen",
  label: "Qwen",
  hint: "OAuth + API key",  // Changed from "OAuth"
  choices: ["qwen-portal", "qwen-api-key"],  // Added qwen-api-key
}
```

**Change 2 - Added option** (Lines 221-226):

```typescript
options.push({ value: "qwen-portal", label: "Qwen OAuth (Free)" });
options.push({
  value: "qwen-api-key",
  label: "Qwen API Key (DashScope)",
  hint: "International (Singapore) or China",
});
```

**Purpose**: Display API Key option in `openclaw onboard` wizard

---

#### 5. `src/commands/auth-choice.apply.qwen-portal.ts` (Complete rewrite)

**Updated routing logic:**

```typescript
export async function applyAuthChoiceQwenPortal(
  params: ApplyAuthChoiceParams,
): Promise<ApplyAuthChoiceResult | null> {
  // Match qwen-portal (OAuth)
  if (params.authChoice === "qwen-portal") {
    return await applyAuthChoicePluginProvider(params, {
      authChoice: "qwen-portal",
      pluginId: "qwen-portal-auth",
      providerId: "qwen-portal",
      methodId: "device",
      label: "Qwen OAuth",
    });
  }

  // Match qwen-api-key (API Key)
  if (params.authChoice === "qwen-api-key") {
    return await applyAuthChoicePluginProvider(params, {
      authChoice: "qwen-api-key",
      pluginId: "qwen-portal-auth",
      providerId: "qwen-portal",
      methodId: "api-key",
      label: "Qwen API Key",
    });
  }

  return null;
}
```

**Purpose**: Route user's choice to the correct authentication method

---

## Usage

### Method 1: Interactive Configuration (Recommended)

```bash
openclaw models auth login --provider qwen-portal
# Select "Qwen API Key"
# Choose region (International or China)
# Enter API key (sk-...)
```

### Method 2: Environment Variable

```bash
export QWEN_API_KEY="sk-your-key"
openclaw restart
```

### Method 3: Onboard Wizard

```bash
openclaw onboard
# Select "Qwen"
# Choose "Qwen API Key (DashScope)"
# Follow the prompts
```

---

## Region Endpoints

### International (Singapore)

- **Base URL**: `https://dashscope-intl.aliyuncs.com/compatible-mode/v1`
- **Use case**: Users outside mainland China
- **Documentation**: https://www.alibabacloud.com/help/en/model-studio/

### China

- **Base URL**: `https://dashscope.aliyuncs.com/compatible-mode/v1`
- **Use case**: Users in mainland China
- **Documentation**: https://dashscope.aliyuncs.com/

---

## Model Verification

All models have been verified against actual DashScope APIs:

**International Region** (tested with API):

- ✅ All 9 models verified

**China Region** (tested with API):

- ✅ All 9 models verified
- ✅ Additional models available (qwen-coder-turbo, qwen2.5-coder variants)

**Cross-region compatibility**: All configured models work in both regions.

---

## Testing

### Automated Test

```bash
cd /path/to/OpenClaw
./test-qwen-apikey.sh
```

### Manual Test

```bash
# 1. Build
npm run build

# 2. Configure
openclaw models auth login --provider qwen-portal

# 3. Test
openclaw chat "Hello, test Qwen API"

# 4. Verify
openclaw models list
```

---

## Backwards Compatibility

- ✅ OAuth authentication still works
- ✅ Existing configurations remain valid
- ✅ No breaking changes
- ✅ Environment variable priority is preserved

---

## Security Considerations

1. API keys are stored in `~/.openclaw/agents/main/agent/auth-profiles.json`
2. File permissions should be set to `600` (owner read/write only)
3. API keys are never committed to version control
4. Environment variables are suitable for temporary testing only

---

## Code Statistics

| File                             | Lines Changed | Lines Added | Lines Removed |
| -------------------------------- | ------------- | ----------- | ------------- |
| model-auth.ts                    | 3             | 1           | 1             |
| qwen-portal-auth/index.ts        | 140+          | 125+        | 5             |
| auth-choice.apply.qwen-portal.ts | 30            | 28          | 8             |
| onboard-types.ts                 | 2             | 1           | 0             |
| auth-choice-options.ts           | 10            | 8           | 2             |
| **Total**                        | **185**       | **163**     | **16**        |

---

## Future Improvements

- [ ] Add API key encryption in storage
- [ ] Support multiple API key profiles
- [ ] Add usage statistics tracking
- [ ] Add API key validation check
- [ ] Support more Qwen models (480B variants, etc.)

---

## References

- Qwen Portal OAuth: https://portal.qwen.ai/
- DashScope International: https://www.alibabacloud.com/help/en/model-studio/
- DashScope China: https://dashscope.aliyuncs.com/

---

## Contributors

- Initial implementation: [Your Name]
- Testing: International and China regions verified

---

## License

Same as OpenClaw project license.

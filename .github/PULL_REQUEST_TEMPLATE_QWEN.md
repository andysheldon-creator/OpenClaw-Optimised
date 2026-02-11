## Description

Add DashScope API Key authentication support for Qwen provider, enabling users to authenticate using their paid DashScope API keys alongside the existing free OAuth flow.

## Type of Change

- [x] New feature (non-breaking change which adds functionality)
- [ ] Bug fix (non-breaking change which fixes an issue)
- [ ] Breaking change (fix or feature that would cause existing functionality to not work as expected)
- [x] Documentation update

## Motivation

Many users have DashScope API keys (paid tier) but currently can only use Qwen via OAuth (free tier). This PR enables:

- Direct API key usage without OAuth flow
- Support for both International (Singapore) and China regions
- Access to 9+ verified Qwen models
- Better integration with existing DashScope workflows

## Changes

### Core Changes

- **Environment Variable**: Added `QWEN_API_KEY` support
- **Authentication Method**: New API key auth in qwen-portal-auth plugin
- **Region Support**: Automatic endpoint selection (International/China)
- **Models**: 9 verified models across both regions
- **Onboard Wizard**: API key option integrated

### Files Modified

- `src/agents/model-auth.ts` - Environment variable support
- `src/commands/onboard-types.ts` - Type definitions
- `src/commands/auth-choice-options.ts` - Wizard options
- `src/commands/auth-choice.apply.qwen-portal.ts` - Routing logic
- `extensions/qwen-portal-auth/index.ts` - API key auth method

## Testing

### Automated Tests

```bash
./test-qwen-apikey.sh
```

**Results**: ✅ All checks passed

### Manual Testing

- [x] International region (Singapore) tested with real API
- [x] China region tested with real API
- [x] All 9 models verified in both regions
- [x] OAuth flow still works (no regression)
- [x] Environment variable support tested
- [x] Onboard wizard tested
- [x] Build succeeds without errors

### Verified Models

Both regions support:

- qwen-plus, qwen-turbo, qwen-max
- qwen3-max
- qwen-coder-plus, qwen3-coder-plus, qwen3-coder-flash
- qwen-vl-plus, qwen3-vl-plus

## Backwards Compatibility

- [x] No breaking changes
- [x] Existing OAuth users unaffected
- [x] Existing configurations remain valid
- [x] All existing tests pass

## Documentation

- [x] Code is well-commented
- [x] User guide added (`docs/providers/qwen-api-key.md`)
- [x] Implementation guide added (`QWEN_API_KEY_SUPPORT.md`)
- [x] PR description included (`QWEN_API_KEY_PR.md`)
- [x] Test script included (`test-qwen-apikey.sh`)

## Security

- [x] No secrets committed
- [x] API keys stored securely in auth-profiles.json
- [x] Input validation added
- [x] Error messages don't expose sensitive data

## Checklist

- [x] My code follows the project's code style
- [x] I have performed a self-review of my code
- [x] I have commented my code where necessary
- [x] I have made corresponding changes to documentation
- [x] My changes generate no new warnings
- [x] I have added tests that prove my feature works
- [x] New and existing tests pass locally
- [x] Any dependent changes have been merged

## Screenshots

### Onboard Wizard

```
? Select provider: Qwen

? Select auth method:
  ○ Qwen OAuth (Free)
  ● Qwen API Key (DashScope)

? Select Qwen DashScope region:
  ● 🌏 International (Singapore)
  ○ 🇨🇳 China

? Enter your Qwen API key:
  sk-********************************

✓ Configuration complete!
```

## Additional Context

- Tested with both International and China region API keys
- Model list verified against actual DashScope API endpoints
- Region selection ensures correct base URL configuration
- Compatible with OpenAI-compatible completions API

## Related Issues

Closes #[issue-number] (if applicable)

## Reviewer Notes

**Suggested review order:**

1. `extensions/qwen-portal-auth/index.ts` - Main implementation
2. `src/agents/model-auth.ts` - Environment variable
3. `src/commands/auth-choice-options.ts` - Onboard integration
4. Documentation files

**Key areas to review:**

- API key validation logic
- Region selection flow
- Model configuration accuracy
- Error handling

---

**Questions?** See `QWEN_API_KEY_SUPPORT.md` for complete implementation details.

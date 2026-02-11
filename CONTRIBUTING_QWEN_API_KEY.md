# Qwen DashScope API Key Support - Contribution Guide

## Quick Summary

This feature adds DashScope API Key authentication support for Qwen, enabling users to use paid DashScope API keys alongside the existing free OAuth flow.

## What's New

- **API Key Authentication**: Users can now use DashScope API keys
- **Region Support**: International (Singapore) and China endpoints
- **9 Verified Models**: Including qwen3-coder-plus, qwen3-max, etc.
- **Environment Variable**: `QWEN_API_KEY` support
- **Onboard Integration**: API key option in setup wizard

## Files Modified

```
src/agents/model-auth.ts                           (+1, -1)
src/commands/onboard-types.ts                      (+1)
src/commands/auth-choice-options.ts                (+8, -2)
src/commands/auth-choice.apply.qwen-portal.ts      (+28, -8)
extensions/qwen-portal-auth/index.ts               (+125, -5)
```

## Testing

All changes have been tested:

- ✅ International region (tested with real API key)
- ✅ China region (tested with real API key)
- ✅ All 9 models verified in both regions
- ✅ OAuth flow still works (no regression)
- ✅ Build passes without errors

**Run automated tests:**

```bash
./test-qwen-apikey.sh
```

## Documentation

- `QWEN_API_KEY_SUPPORT.md` - Implementation details
- `docs/providers/qwen-api-key.md` - User guide
- `QWEN_API_KEY_PR.md` - PR description

## For Maintainers

### Review Focus Areas

1. **Security**: API keys are stored securely in auth-profiles.json
2. **UX**: Region selection is clear and intuitive
3. **Compatibility**: No breaking changes to existing OAuth flow
4. **Code Quality**: Follows existing plugin patterns

### Key Design Decisions

1. **Separate auth method**: API key is a distinct auth method, not a modification of OAuth
2. **Region-aware**: Base URL automatically configured based on region selection
3. **Model verification**: All models tested against actual APIs
4. **Graceful validation**: User-friendly error messages and validation

### Testing Checklist

- [x] Unit tests pass (if applicable)
- [x] Integration tests pass
- [x] Manual testing in both regions
- [x] OAuth flow not affected
- [x] Documentation is complete
- [x] No hardcoded secrets

## Questions?

For questions about this contribution:

1. Review `QWEN_API_KEY_SUPPORT.md` for technical details
2. Check `docs/providers/qwen-api-key.md` for user guide
3. Run `./test-qwen-apikey.sh` to verify

---

**Ready for merge!** All tests pass, documentation is complete, and backwards compatibility is maintained.

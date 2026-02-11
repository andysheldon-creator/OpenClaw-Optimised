# Qwen DashScope API Key Support

> Add DashScope API Key authentication for Qwen provider in OpenClaw

## Quick Start

```bash
# Configure API key
openclaw models auth login --provider qwen-portal

# Select "Qwen API Key (DashScope)"
# Choose your region (International or China)
# Enter API key: sk-...

# Start using
openclaw chat "Hello, test Qwen API"
```

## Features

- ✅ DashScope API Key authentication (International + China)
- ✅ 9 verified Qwen models (qwen3-coder-plus, qwen3-max, etc.)
- ✅ Environment variable support (`QWEN_API_KEY`)
- ✅ Region-aware endpoint configuration
- ✅ Fully compatible with existing OAuth flow

## Documentation

| File                             | Purpose                       |
| -------------------------------- | ----------------------------- |
| `QWEN_API_KEY_SUPPORT.md`        | Complete implementation guide |
| `docs/providers/qwen-api-key.md` | User documentation            |
| `QWEN_API_KEY_PR.md`             | Pull request description      |
| `CONTRIBUTING_QWEN_API_KEY.md`   | Contribution guide            |
| `test-qwen-apikey.sh`            | Automated test script         |

## Testing

```bash
# Automated verification
./test-qwen-apikey.sh

# Manual test
npm run build
openclaw models auth login --provider qwen-portal
openclaw chat "Test message"
```

## Verified Models

### Both International and China Regions

**Coding**:

- `qwen3-coder-plus` (Latest, recommended)
- `qwen-coder-plus`
- `qwen3-coder-flash` (Fast)

**General**:

- `qwen3-max` (Most capable)
- `qwen-max`
- `qwen-plus` (Recommended)
- `qwen-turbo` (Fast)

**Vision**:

- `qwen3-vl-plus` (Latest)
- `qwen-vl-plus`

## Files Modified

```
src/agents/model-auth.ts                           3 lines
src/commands/onboard-types.ts                      2 lines
src/commands/auth-choice-options.ts               10 lines
src/commands/auth-choice.apply.qwen-portal.ts     30 lines
extensions/qwen-portal-auth/index.ts             140 lines
```

**Total**: ~185 lines changed (163 added, 16 removed)

## Compatibility

- ✅ No breaking changes
- ✅ OAuth flow unchanged
- ✅ Backwards compatible
- ✅ All tests pass

## Contributing

See `CONTRIBUTING_QWEN_API_KEY.md` for detailed contribution guidelines.

## License

Same as OpenClaw project license.

---

**Status**: Ready for review ✅  
**Last Updated**: 2026-02-11  
**Tested**: International (SG) + China regions

# Changelog

Docs: https://docs.openclaw.ai

## 2026.2.2

### Changes

- Web UI: add Agents dashboard for managing agent files, tools, skills, models, channels, and cron jobs.
- Memory: implement the opt-in QMD backend for workspace memory. (#3160) Thanks @vignesh07.
- Config: allow setting a default subagent thinking level via `agents.defaults.subagents.thinking` (and per-agent `agents.list[].subagents.thinking`). (#7372) Thanks @tyler6204.
- Security: add healthcheck skill and bootstrap audit guidance. (#7641) Thanks @Takhoffman.
- Docs: zh-CN translation polish + pipeline guidance. (#8202, #6995) Thanks @AaronWander, @taiyi747, @Explorer1092, @rendaoyuan.
- Docs: zh-CN translations seed + nav polish + landing notice + typo fix. (#6619, #7242, #7303, #7415) Thanks @joshp123, @lailoo.
- Feishu: add Feishu/Lark plugin support + docs. (#7313) Thanks @jiulingyun (openclaw-cn).

### Fixes

- Security: Matrix allowlists now require full MXIDs; ambiguous name resolution no longer grants access. Thanks @MegaManSec.
- Security: enforce access-group gating for Slack slash commands when channel type lookup fails.
- Security: require validated shared-secret auth before skipping device identity on gateway connect.
- Mac: detect and clean stale SPM workspace state with hardcoded paths (e.g., from repo rebrand/rename). (#7469) Thanks @JoshuaLelon.
- Security: guard skill installer downloads with SSRF checks (block private/localhost URLs).
- Security: harden Windows exec allowlist; block cmd.exe bypass via single &. Thanks @simecek.
- Media understanding: apply SSRF guardrails to provider fetches; allow private baseUrl overrides explicitly.
- fix(voice-call): harden inbound allowlist; reject anonymous callers; require Telnyx publicKey for allowlist; token-gate Twilio media streams; cap webhook body size (thanks @simecek)
- fix(webchat): respect user scroll position during streaming and refresh (#7226) (thanks @marcomarandiz)
- Telegram: recover from grammY long-poll timed out errors. (#7466) Thanks @macmimi23.
- Agents: repair malformed tool calls and session transcripts. (#7473) Thanks @justinhuangcode.
- fix(agents): validate AbortSignal instances before calling AbortSignal.any() (#7277) (thanks @Elarwei001)
- Media understanding: skip binary media from file text extraction. (#7475) Thanks @AlexZhangji.
- Onboarding: keep TUI flow exclusive (skip completion prompt + background Web UI seed); completion prompt now handled by install/update.
- TUI: block onboarding output while TUI is active and restore terminal state on exit.
- CLI/Zsh completion: cache scripts in state dir and escape option descriptions to avoid invalid option errors.
- fix(ui): resolve Control UI asset path correctly.
- fix(ui): refresh agent files after external edits.
- Docs: finish renaming the QMD memory docs to reference the OpenClaw state dir.
- Tests: stub SSRF DNS pinning in web auto-reply + Gemini video coverage. (#6619) Thanks @joshp123.

## 2026.2.1

### Changes

- Docs: onboarding/install/i18n/exec-approvals/Control UI/exe.dev/cacheRetention updates + misc nav/typos. (#3050, #3461, #4064, #4675, #4729, #4763, #5003, #5402, #5446, #5474, #5663, #5689, #5694, #5967, #6270, #6300, #6311, #6416, #6487, #6550, #6789)
- Telegram: use shared pairing store. (#6127) Thanks @obviyus.
- Agents: add OpenRouter app attribution headers. Thanks @alexanderatallah.
- Agents: add system prompt safety guardrails. (#5445) Thanks @joshp123.
- Agents: update pi-ai to 0.50.9 and rename cacheControlTtl -> cacheRetention (with back-compat mapping).
- Agents: extend CreateAgentSessionOptions with systemPrompt/skills/contextFiles.
- Agents: add tool policy conformance snapshot (no runtime behavior change). (#6011)
- Auth: update MiniMax OAuth hint + portal auth note copy.
- Discord: inherit thread parent bindings for routing. (#3892) Thanks @aerolalit.
- Gateway: inject timestamps into agent and chat.send messages. (#3705) Thanks @conroywhitney, @CashWilliams.
- Gateway: require TLS 1.3 minimum for TLS listeners. (#5970) Thanks @loganaden.
- Web UI: refine chat layout + extend session active duration.
- Web UI: add login-required mode and WebAuthn passkey auth. (#6006) Thanks @loganaden.
- Tests: extend Windows CI coverage (exec tool, cron, browser).

### Fixes

- Browser proxy: apply viewport size before navigation for cross-context screenshot consistency. (#6117) Thanks @AielloChan.
- Agents: fix race in server-side event source closing. (#6088) Thanks @AielloChan.
- Agents: Gemini tool-streaming resilience for malformed delta chunks.
- Browser: improve Chrome relay handshake timeout handling.
- Config: fallback to default config on malformed YAML parse. (#6070) Thanks @Takhoffman.
- Markdown: escape pipe characters in table cells for valid table rendering.
- Sessions: fallback to internalId when session key is missing in spawn-sub. (#5938)
- Telegram: defer user-object hydration until after chat context is set. (#6127) Thanks @obviyus.
- Windows: spawn Detours-injected child in proper CWD to fix exec sandboxing.
- Tests: fix Zod schema export + snapshot refresh for tool-policy conformance.

## 2026.1.28

### Changes

- Agents: expose bedrock-converse-text provider + add Bedrock Claude Sonnet model aliases. (#5614) Thanks @zyd14.
- Agents: add MiniMax provider (abab6.5, abab7). Thanks @AielloChan.
- Docs: add Tencent Hunyuan provider docs and expand mistral/Codestral info. (#5580) Thanks @yaojin3616.
- Docs: add troubleshooting guide for OpenClaw (#5587) Thanks @jenniferzhou1.
- Docs: update memory & personas pages with MEMORY.md patterns. (#5493) Thanks @AlexZhangji, @LvCZ-97.
- Message: add optional sticker/stickerName support to /msg command.
- CLI: add --yes flag to accept prompts non-interactively. (#5689)
- CLI: surface status subcommand for quick system checks.
- Gateway: cache-control headers for static PWA assets.

### Fixes

- Gateway: handle HTTP/2 GOAWAY gracefully during long requests (HTTP 502 on restart).
- Exec: reject inline shell metacharacter sequences (&& || ; | > >> < << $() ``) outside allowlist. (#5651)
- Exec: Windows sandbox - more robust Detours DLL handling.
- Exec: Windows sandbox - ensure CWD override propagates to child.
- Agents: handle XAI streaming connection drops more gracefully. (#5643) Thanks @AielloChan.
- Telegram: rate-limit handler with exponential backoff. (#5623) Thanks @macmimi23.
- Discord: truncate message content to 2000 chars for Discord limits. (#5621) Thanks @aerolalit.
- Browser: skip CDP events for destroyed targets. (#5642) Thanks @AielloChan.
- Browser: recover CDP session after target crash.
- Tests: fix flaky stream-retry test by mocking timers.

## 2026.1.21

### Changes

- Telegram: add inline-keyboard button support via bot.sendMessage with replyMarkup. (#5431) Thanks @AielloChan.
- Discord: threaded-channel matching improvements. (#5414) Thanks @aerolalit.
- Gateway: add CORS support for REST endpoints. (#5410) Thanks @loganaden.
- CLI: add /reasoning toggle for extended-thinking control. (#5407)
- Docs: add LM Studio local model guide. (#5400) Thanks @AlexZhangji.
- Agents: add Cloudflare Workers AI as model provider. (#5395) Thanks @AielloChan.

### Fixes

- Telegram: fix inline-keyboard callback routing in group chats.
- CLI: handle empty completions during streaming gracefully.
- Browser: fix target-not-found errors during navigation. (#5423) Thanks @AielloChan.
- Exec: fix command injection via newlines in args. (#5420)
- Docs: various typo fixes. (#5412, #5413) Thanks @GuyWithBag, @jenniferzhou1.

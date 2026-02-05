# C Azure Agent (Mobile) - Android Architecture Plan

> Status: Draft
> Date: 2026-02-05
> Scope: Turn the OpenClaw repository into a standalone Android app

---

## PHASE 0: Repo Map and Truth Table

### 0.1 Architecture Map

#### Main Packages/Modules

| Package | Purpose | Key Entry Points |
|---------|---------|-----------------|
| `src/agents/` | Agent execution engine: model selection, auth, embedded runner, tool policy, sandbox | `pi-embedded-runner/run/attempt.ts` |
| `src/agents/models-config.providers.ts` | Provider definitions (Claude, OpenAI, Google, Bedrock, Ollama, etc.) | `normalizeProviders()` |
| `src/agents/model-auth.ts` | Credential resolution: auth profiles -> env vars -> config -> AWS SDK | `resolveApiKeyForProvider()` |
| `src/agents/auth-profiles/` | Auth profile CRUD: ApiKey, Token, OAuth credential types | `auth-profiles.json` per agent |
| `src/config/` | JSON5-based config with Zod validation (`config.json`) | `io.ts`, `types.ts`, `types.models.ts` |
| `src/gateway/` | WebSocket server: routes RPC calls to the embedded runner | `server.impl.ts`, `server-methods/` |
| `src/gateway/protocol/` | Typebox-defined protocol: frames, schemas, primitives (v3) | `frames.ts`, `schema/*.ts` |
| `src/gateway/openai-http.ts` | OpenAI-compatible `/v1/chat/completions` HTTP endpoint | wraps `agentCommand()` |
| `src/gateway/auth.ts` | Gateway auth: device tokens, gateway tokens, passwords, Tailscale | `authenticateConnection()` |
| `src/cli/` | CLI wiring: command registration, progress UI | `progress.ts` |
| `src/commands/` | CLI commands: `agent`, `send`, `config`, `gateway`, etc. | `agent.ts` |
| `src/web/` | WhatsApp Web channel implementation | `session.ts`, `auth-store.ts` |
| `src/telegram/`, `src/discord/`, `src/slack/`, `src/signal/`, `src/imessage/` | Messaging channel providers | various |
| `src/media/` | Media pipeline: image optimization, JPEG compression | shared across channels |
| `src/infra/` | Infrastructure: provider usage tracking, telemetry | `provider-usage.ts` |
| `apps/android/` | **Existing Android app** (Kotlin + Compose, 52 files) | `MainActivity.kt` |
| `apps/ios/` | Existing iOS app (SwiftUI) | `Sources/` |
| `apps/shared/OpenClawKit/` | Shared protocol definitions (generated Swift models) | `GatewayModels.swift` |

#### Entrypoints

- **CLI**: `src/cli/` -> `src/commands/agent.ts` -> `runEmbeddedPiAgent()`
- **Gateway server**: `src/gateway/server.impl.ts` -> starts WS + HTTP
- **OpenAI HTTP**: `src/gateway/openai-http.ts` -> `/v1/chat/completions`
- **Android app**: `apps/android/` -> `MainActivity.kt` -> `NodeRuntime` -> `GatewaySession` (WS client)
- **iOS app**: `apps/ios/Sources/` -> SwiftUI + `GatewayNodeSession`

#### UI Components (Existing Android)

The existing Android app at `apps/android/` already has:

| Component | File | What It Does |
|-----------|------|--------------|
| Root screen | `ui/RootScreen.kt` | Canvas WebView + overlay buttons (chat, settings, talk) |
| Chat sheet | `ui/ChatSheet.kt` | Bottom sheet with chat messages, send, attachments |
| Settings sheet | `ui/SettingsSheet.kt` | Gateway connection, display name, camera, voice wake |
| Status pill | `ui/StatusPill.kt` | Connection status indicator |
| Talk orb overlay | `ui/TalkOrbOverlay.kt` | Voice mode visual feedback |
| Camera HUD | `ui/CameraHudOverlay.kt` | Camera capture overlay |
| Chat bubble UI | `ui/chat/` | Message bubbles, markdown rendering |
| Theme | `ui/OpenClawTheme.kt` | Material3 theming |

#### Config Format

JSON5 at `~/.openclaw/config.json`:
```json5
{
  models: {
    providers: {
      "openai": { baseUrl: "...", apiKey: "...", api: "openai-completions", models: [...] },
      "anthropic": { baseUrl: "...", apiKey: "...", api: "anthropic-messages", models: [...] }
    }
  },
  agents: { defaults: { model: "claude-sonnet-4-5" } },
  gateway: { auth: { token: "...", password: "..." } }
}
```

Defined in `src/config/types.ts` and `src/config/types.models.ts`.

#### Session Store

- Sessions stored as JSONL files: `~/.openclaw/agents/<agentId>/sessions/*.jsonl`
- Session keys (string IDs), session history (messages array with role/content)
- Gateway exposes: `sessions.list`, `sessions.preview`, `sessions.resolve`, `sessions.patch`, `sessions.reset`, `sessions.delete`

#### Model/Provider Interfaces

Defined in `src/config/types.models.ts`:
```typescript
ModelProviderConfig {
  baseUrl: string
  apiKey?: string  // resolved at runtime
  auth: "api-key" | "aws-sdk" | "oauth" | "token"
  api: "openai-completions" | "anthropic-messages" | "google-generative-ai" | "bedrock-converse-stream" | ...
  models: ModelDefinitionConfig[]
}
```

Key libraries: `@mariozechner/pi-ai` (streamSimple for LLM calls), `@mariozechner/pi-coding-agent` (SessionManager).

#### Tool Sandboxing

- Tools defined as JSON schema objects (Anthropic-style)
- Execution via Docker containers with workspace access
- Tool policy: per-channel/agent allowlists/denylists (`src/agents/tool-policy.ts`)
- Built-in tools: browser, image, memory, etc. (`src/agents/tools/`)

#### Networking

- Gateway: WebSocket (JSON frames) + optional TLS
- Protocol v3: `RequestFrame`, `ResponseFrame`, `EventFrame`
- Handshake: `connect` method with device identity (RSA key signing)
- Events: streaming via `agent` and `chat` event types
- OpenAI HTTP: standard `/v1/chat/completions` with SSE streaming

#### Auth

- **Device auth**: RSA key pair stored locally, device pairing flow with gateway approval
- **Gateway auth**: shared token or password
- **LLM auth**: API keys resolved from auth profiles -> env vars -> config -> CLI credential sync
- **Secure storage (Android)**: `EncryptedSharedPreferences` with AES-256-GCM master key (`SecurePrefs.kt`)

### 0.2 "What Is Reusable on Mobile" vs "Needs Rewrite"

#### Reusable (on Android)

| Component | Path | Why Reusable |
|-----------|------|-------------|
| Gateway WebSocket protocol | `src/gateway/protocol/` | JSON-based, well-defined, already implemented in Kotlin |
| Android gateway client | `apps/android/app/.../gateway/GatewaySession.kt` | Full WS client with device auth, already working |
| Android chat controller | `apps/android/app/.../chat/ChatController.kt` | Session management, streaming, history, already working |
| Android secure storage | `apps/android/app/.../SecurePrefs.kt` | EncryptedSharedPreferences, production-ready |
| Android device identity | `apps/android/app/.../gateway/DeviceIdentityStore.kt` | RSA key generation and signing |
| Android device auth | `apps/android/app/.../gateway/DeviceAuthStore.kt` | Token persistence |
| Chat data models | `apps/android/app/.../chat/ChatModels.kt` | Message types, session entries |
| Gateway TLS | `apps/android/app/.../gateway/GatewayTls.kt` | Trust-on-first-use TLS |
| Gateway discovery | `apps/android/app/.../gateway/GatewayDiscovery.kt` | Bonjour/mDNS + DNS-SD |
| Protocol constants | `apps/android/app/.../protocol/OpenClawProtocolConstants.kt` | Version, client IDs |
| Theme | `apps/android/app/.../ui/OpenClawTheme.kt` | Material3 theming |
| UI components | `apps/android/app/.../ui/` | Chat sheet, settings sheet, status pill |
| Tool display | `apps/android/app/.../tools/ToolDisplay.kt` | Tool call rendering |
| Build config | `apps/android/app/build.gradle.kts` | Gradle build, deps, signing |

#### Needs Rewrite / New

| Component | Why |
|-----------|-----|
| **Direct LLM API client** | Current app only talks to gateway; needs direct OpenAI/Anthropic API calls for standalone mode |
| **Onboarding flow** | Current app assumes gateway exists; needs API key entry + provider selection |
| **Local session storage** | Sessions live on gateway filesystem; need Room/SQLite for local persistence |
| **Standalone agent runner** | `runEmbeddedPiAgent()` is Node.js; need Kotlin equivalent for tool-less chat |
| **Model/provider config UI** | No UI for selecting models or configuring providers; need settings screen |
| **Offline handling** | No offline mode; need message queueing and clear offline state |

#### Drop for MVP

| Component | Why |
|-----------|-----|
| Tool sandboxing (Docker) | Cannot run Docker on Android |
| Channel providers (WhatsApp, Telegram, etc.) | Server-side; irrelevant for mobile client |
| CLI/TUI | Terminal-specific |
| Voice wake (Sherpa ONNX) | Complex native integration; V1.1 |
| Screen recording | Requires media projection; V1.1 |
| Canvas WebView | A2UI canvas is gateway-hosted; V1.1 (needs gateway) |
| Node.js runtime embedding | Heavy, fragile on Android |

### 0.3 Dependency Risk List

| Risk | Details | Impact |
|------|---------|--------|
| **Node.js engine** | Embedded runner depends on Node.js + npm packages (`@mariozechner/pi-ai`, `@mariozechner/pi-coding-agent`) | Cannot run natively on Android. Must either bridge or rewrite. |
| **File system layout** | Sessions at `~/.openclaw/sessions/`, config at `~/.openclaw/config.json` | Android uses app-private storage. Needs adaptation. |
| **Docker/sandbox** | Tool execution requires Docker containers | Impossible on Android. Tools must be dropped or proxied. |
| **Terminal UI** | `@clack/prompts`, ANSI colors, `osc-progress` | N/A for mobile; drop entirely. |
| **systemd/launchd** | Foreground service patterns exist but are different | Existing `NodeForegroundService.kt` already handles this. |
| **Native crypto** | Device identity uses `java.security.KeyPairGenerator` (RSA) | Already implemented in Android. No risk. |
| **WebView dependency** | Canvas UI requires gateway-hosted web content | Cannot work standalone. Replace with native Compose UI. |
| **pi-ai streaming** | LLM streaming via `streamSimple()` in TypeScript | Must reimplement in Kotlin using OkHttp/Ktor SSE. |

### 0.4 Truth Table

| # | Feature in OpenClaw | Where It Lives | Mobile Status |
|---|-------------------|----------------|---------------|
| 1 | Multi-provider LLM chat | `src/agents/pi-embedded-runner/`, `src/agents/models-config.providers.ts` | **Rewrite** - Kotlin HTTP client calling OpenAI/Anthropic APIs directly |
| 2 | Streaming responses | `@mariozechner/pi-ai` `streamSimple()` | **Rewrite** - OkHttp SSE or Ktor streaming |
| 3 | Session management | `src/gateway/server-methods/sessions.*` + filesystem JSONL | **Rewrite** - Room database for local storage |
| 4 | Chat history | `chat.history` RPC + JSONL files | **Rewrite** - Room + in-memory cache |
| 5 | Model/provider selection | `src/agents/model-selection.ts`, `models-config.providers.ts` | **Rewrite** - Kotlin enum/sealed class with same provider list |
| 6 | API key management | `src/agents/model-auth.ts`, `src/agents/auth-profiles/` | **Wrap** - Reuse `SecurePrefs.kt` pattern, add provider-specific key storage |
| 7 | Config system | `src/config/` JSON5 + Zod | **Rewrite** - DataStore/SharedPreferences, simpler schema |
| 8 | Gateway protocol (WS) | `src/gateway/protocol/`, `apps/android/.../gateway/` | **Reuse** - Existing Kotlin implementation works |
| 9 | Gateway discovery (mDNS) | `apps/android/.../gateway/GatewayDiscovery.kt` | **Reuse** - Already implemented |
| 10 | Device auth (RSA) | `apps/android/.../gateway/DeviceIdentityStore.kt` | **Reuse** - Already implemented |
| 11 | Secure storage | `apps/android/.../SecurePrefs.kt` | **Reuse** - EncryptedSharedPreferences |
| 12 | Chat UI | `apps/android/.../ui/ChatSheet.kt`, `ui/chat/` | **Reuse + Extend** - Promote from bottom sheet to full screen |
| 13 | Settings UI | `apps/android/.../ui/SettingsSheet.kt` | **Reuse + Extend** - Add onboarding, provider config |
| 14 | Tool execution | `src/agents/sandbox.ts`, Docker containers | **Drop** for MVP - No Docker on Android |
| 15 | Tool display | `apps/android/.../tools/ToolDisplay.kt` | **Reuse** - Show tool calls from gateway mode |
| 16 | Thinking levels | Chat controller `normalizeThinking()` | **Reuse** - Already in `ChatController.kt` |
| 17 | Attachments | `ChatController.sendMessage()` with base64 | **Reuse** - Already supports image attachments |
| 18 | Voice wake | `apps/android/.../voice/VoiceWakeManager.kt` | **Drop** for MVP - Complex native dep |
| 19 | Talk mode (voice) | `apps/android/.../voice/TalkModeManager.kt` | **Drop** for MVP |
| 20 | Camera capture | `apps/android/.../node/CameraCaptureManager.kt` | **Drop** for MVP |
| 21 | Screen recording | `apps/android/.../node/ScreenRecordManager.kt` | **Drop** for MVP |
| 22 | SMS access | `apps/android/.../node/SmsManager.kt` | **Drop** for MVP |
| 23 | Canvas (A2UI WebView) | `apps/android/.../node/CanvasController.kt`, `ui/RootScreen.kt` | **Drop** for MVP - Requires gateway-hosted content |
| 24 | Foreground service | `apps/android/.../NodeForegroundService.kt` | **Reuse** - Keep for background streaming |
| 25 | OpenAI-compatible HTTP | `src/gateway/openai-http.ts` | **Reuse concept** - Use same API shape for direct calls |
| 26 | Cron/scheduled tasks | `src/gateway/server-methods/cron.*` | **Drop** for MVP |
| 27 | Multi-channel routing | `src/routing/` | **Drop** - Server-side only |
| 28 | Extension/plugin system | `extensions/` | **Drop** for MVP |
| 29 | Markdown rendering | Chat UI already renders markdown | **Reuse** |
| 30 | Theme/colors | `ui/OpenClawTheme.kt` | **Reuse** |

---

## PHASE 1: Mobile Architecture Decision

### Decision: Native Android (Kotlin + Jetpack Compose) - Option A

#### Justification

1. **Existing codebase is already Kotlin + Compose.** There are 52 production Kotlin files in `apps/android/` using Jetpack Compose, Material3, OkHttp, kotlinx.serialization, CameraX, EncryptedSharedPreferences. Starting from scratch in Flutter or React Native would throw away working, tested code.

2. **No cross-platform benefit for MVP.** The iOS app (`apps/ios/`) is SwiftUI and shares only the gateway protocol (generated from TypeBox schemas). The two apps are already separate native implementations. Adding a cross-platform layer introduces complexity without reducing work - we'd still need to port the gateway protocol, secure storage, and device auth.

3. **Direct LLM API calls are simple HTTP.** The core new work (calling OpenAI/Anthropic APIs with SSE streaming) is straightforward in Kotlin with OkHttp or Ktor. No need for JavaScript bridging, React Native modules, or Flutter platform channels.

4. **Android-specific features are already native.** EncryptedSharedPreferences, Foreground Service, CameraX - all already implemented in Kotlin. Cross-platform would require platform channel bridges for each.

5. **Build system is ready.** `apps/android/app/build.gradle.kts` is configured with compileSdk 36, minSdk 31, Compose BOM 2025.12.00, all dependencies declared.

#### What "Option D" (embedded server) would look like and why we reject it

Running Node.js on Android (via `nodejs-mobile` or similar) to embed the gateway is technically possible but:
- Adds ~30-50MB to APK size for the Node.js runtime
- Fragile on ARM64, no guaranteed long-term support
- Startup time would be 3-5 seconds for the Node process
- Still need native UI for onboarding, permissions, lifecycle
- Battery drain from a persistent Node.js process
- The embedded runner depends on filesystem layout, npm packages, and Docker for tools

**Verdict**: Not worth the complexity. Direct Kotlin implementation is cleaner.

### Bridging Strategy

The OpenClaw logic is TypeScript/Node.js. We do NOT bridge it. Instead:

1. **For standalone mode (MVP)**: Kotlin calls LLM APIs directly using OkHttp. The API contracts (OpenAI chat completions, Anthropic messages) are stable, well-documented, and simple to implement.

2. **For gateway mode (existing)**: Keep the existing `GatewaySession.kt` WebSocket client unchanged. It already works.

3. **Shared concepts**: Reimplement in Kotlin the minimal set: provider definitions, model metadata, session data model. These are data structures, not complex logic.

The pain is honest: we rewrite ~500 lines of TypeScript (streaming HTTP client + provider config + session persistence) in Kotlin. This is less work than any bridging approach.

---

## PHASE 2: Product Scope

### 2.1 MVP Scope

The app has **two modes**:

1. **Standalone mode** (new): User enters API key, app calls LLM directly. No gateway needed.
2. **Gateway mode** (existing): User connects to an OpenClaw gateway. Full feature set.

MVP ships standalone mode as the primary experience. Gateway mode comes free (it already works).

#### Screen: Onboarding

- Provider picker: OpenAI, Anthropic, Google (Gemini), Custom OpenAI-compatible
- API key input field (masked, paste-friendly)
- Model selector (populated from provider's known models, or free-text for custom)
- "Test connection" button that sends a trivial completion request
- Skip to gateway mode option ("Connect to OpenClaw Gateway instead")
- **No OAuth for MVP.** OAuth requires a registered app, redirect URI handling, and token refresh. API key is simpler and works with all providers. OAuth is V1.1.

#### Screen: Chat (standalone mode)

- Full-screen chat (promoted from bottom sheet)
- Message list: user messages, assistant messages with markdown rendering
- Text input with send button
- Streaming response display (tokens appear as they arrive)
- Thinking level selector (off / low / medium / high) - for providers that support it
- Model indicator in toolbar
- Abort button during generation
- Error display (rate limits, auth failures, network errors)

#### Screen: Chat (gateway mode)

- Same as standalone but messages route through gateway
- Tool call display (reuse existing `ToolDisplay.kt`)
- Streaming via gateway events (already implemented)

#### Screen: Sessions

- List sessions with last message preview and timestamp
- Tap to open session
- Long-press to rename or delete
- "New session" button
- In standalone mode: sessions stored in Room database
- In gateway mode: sessions fetched via `sessions.list` RPC

#### Screen: Settings

- **Provider config**: switch provider, change API key, change model
- **Gateway config**: manual host/port, token/password (reuse existing `SettingsSheet.kt`)
- **App settings**: theme (dark/light/system), thinking level default
- **About**: version, OpenClaw links

#### Safe Storage

- API keys stored via `EncryptedSharedPreferences` (already in `SecurePrefs.kt`)
- Master key: AES-256-GCM via Android Keystore
- Keys never logged (already enforced - `SecurePrefs` uses encrypted values)
- Keys never included in crash reports or analytics

#### Offline Behavior

Explicit definition:
- **Standalone mode offline**: Show "No internet connection" banner. Chat input disabled. Existing conversations visible (read-only from local Room DB). Retry on connectivity change via `ConnectivityManager`.
- **Gateway mode offline**: Existing reconnection loop in `GatewaySession.runLoop()` handles this - exponential backoff, status updates via `onDisconnected`. No changes needed.
- **No message queueing**: Messages are not queued for later sending. If offline, the user sees an error immediately. Queueing adds complexity and can cause confusion with LLM context ordering.

### 2.2 V1.1 Features (Post-MVP)

| Feature | OpenClaw Source | Notes |
|---------|----------------|-------|
| OAuth login (Copilot, Codex) | `src/agents/cli-credentials.ts` | PKCE flow for GitHub Copilot tokens |
| Voice wake | `apps/android/.../voice/VoiceWakeManager.kt` | Already implemented, just needs standalone integration |
| Talk mode | `apps/android/.../voice/TalkModeManager.kt` | TTS + STT, already implemented |
| Camera capture | `apps/android/.../node/CameraCaptureManager.kt` | For vision model inputs |
| File attachments | Extend existing attachment support | PDF, images, documents |
| Multi-conversation tabs | `sessions.list` RPC | Quick-switch between sessions |
| Tool execution (gateway) | `tools/ToolDisplay.kt` + gateway RPC | Show tool results inline |
| Canvas/A2UI | `node/CanvasController.kt` | Requires gateway; render rich outputs |
| Export conversations | Local Room DB | Share as text/markdown/JSON |
| Widget | New | Home screen widget for quick messages |
| Ollama/local models | `models-config.providers.ts` (Ollama provider) | Connect to local Ollama instance on LAN |
| Bedrock support | `models-config.providers.ts` (Bedrock provider) | AWS SDK for Android |
| System prompt customization | `config.json` agent defaults | User-editable system prompt |

---

## PHASE 3: Implementation Plan

### Milestone Breakdown

#### M0: Project Restructure + Skeleton (Effort: S)

**Goal**: Restructure the existing Android project to support dual-mode (standalone + gateway).

Tasks:
1. Create `apps/android/app/src/main/java/ai/openclaw/android/standalone/` package
2. Create `apps/android/app/src/main/java/ai/openclaw/android/data/` package for Room entities
3. Add Room + DataStore dependencies to `build.gradle.kts`
4. Create `NavigationGraph.kt` with bottom nav: Chat, Sessions, Settings
5. Create `AppMode.kt` sealed class: `Standalone(provider, apiKey, model)` | `Gateway(endpoint, token)`
6. Create `AppState.kt` to hold current mode, persisted in DataStore

Acceptance criteria:
- App compiles and launches
- Navigation between 3 tabs works
- Existing gateway mode still functional

Files to create:
```
standalone/
  StandaloneChatEngine.kt
  LlmApiClient.kt
  LlmProvider.kt
  StreamingResponse.kt
data/
  AppDatabase.kt
  SessionEntity.kt
  MessageEntity.kt
  SessionDao.kt
  MessageDao.kt
navigation/
  NavigationGraph.kt
  AppMode.kt
  AppState.kt
```

#### M1: Onboarding (Effort: S)

**Goal**: New user can enter API key and select model.

Tasks:
1. Create `ui/onboarding/OnboardingScreen.kt` - provider picker, API key input, model selector
2. Create `ui/onboarding/ProviderCard.kt` - visual card for each provider
3. Create `standalone/LlmProvider.kt` - enum: OpenAI, Anthropic, Google, Custom
4. Create `standalone/ProviderConfig.kt` - base URL, API format, known models per provider
5. Extend `SecurePrefs.kt` with `saveProviderApiKey(provider, key)`, `loadProviderApiKey(provider)`
6. Create `standalone/ConnectionTester.kt` - sends minimal completion request to verify key
7. Wire onboarding into navigation: show on first launch, skip if key exists

Acceptance criteria:
- User can select OpenAI, enter API key, pick gpt-4o
- "Test connection" returns success/failure
- Key persisted in EncryptedSharedPreferences
- Subsequent launches skip onboarding

#### M2: Standalone Chat (Effort: M)

**Goal**: User can send messages and see streaming responses.

Tasks:
1. Create `standalone/LlmApiClient.kt`:
   - `sendMessage(messages, model, stream=true)` -> `Flow<StreamChunk>`
   - OpenAI format: POST `/v1/chat/completions` with `stream: true`, parse SSE
   - Anthropic format: POST `/v1/messages` with `stream: true`, parse SSE
   - Google format: POST with `streamGenerateContent`, parse SSE
   - Handle thinking/extended thinking parameter per provider
2. Create `standalone/StandaloneChatEngine.kt`:
   - Manages conversation history (list of messages)
   - Calls `LlmApiClient` with full history
   - Exposes `StateFlow<List<ChatMessage>>` and `StateFlow<String?>` for streaming text
   - Handles abort via `Job.cancel()`
3. Promote `ChatSheet.kt` content to `ui/chat/ChatScreen.kt` (full-screen Composable)
4. Create `ui/chat/ChatInput.kt` - text field, send button, thinking selector, abort button
5. Create `ui/chat/MessageBubble.kt` - user/assistant message rendering with markdown
6. Wire `StandaloneChatEngine` into `ChatScreen` via ViewModel

Acceptance criteria:
- User sends "Hello" to OpenAI gpt-4o, sees streaming response
- Tokens appear incrementally as SSE chunks arrive
- Abort stops generation mid-stream
- Thinking level selector works (for Claude models)
- Error states displayed (rate limit, auth failure, network)

#### M3: Sessions (Effort: M)

**Goal**: Conversations persist across app restarts.

Tasks:
1. Implement Room database (`AppDatabase.kt`):
   - `SessionEntity`: id, title, model, provider, createdAt, updatedAt
   - `MessageEntity`: id, sessionId, role, content (JSON), timestampMs
   - `SessionDao`: CRUD + list ordered by updatedAt
   - `MessageDao`: insert, getBySessionId, deleteBySessionId
2. Create `data/SessionRepository.kt`:
   - `createSession()`, `listSessions()`, `getMessages(sessionId)`, `addMessage()`, `deleteSession()`, `renameSession()`
   - Auto-generate session title from first user message (truncate to 50 chars)
3. Create `ui/sessions/SessionsScreen.kt`:
   - List of sessions with title, last message preview, timestamp
   - Tap to open, long-press for rename/delete dialog
   - FAB for new session
4. Wire session lifecycle into `StandaloneChatEngine`:
   - New session created on first message if none active
   - Messages persisted after each send/receive
   - Session list refreshed on changes
5. Gateway mode sessions: keep existing `ChatController.fetchSessions()` path

Acceptance criteria:
- New conversation auto-creates session in Room DB
- Closing and reopening app shows previous conversations
- Tap session loads its messages
- Delete session removes it and its messages
- New session button starts fresh conversation

#### M4: Gateway Mode Integration (Effort: S)

**Goal**: Existing gateway mode works alongside standalone mode.

Tasks:
1. Create `ui/settings/ModeSelector.kt` - toggle between Standalone and Gateway
2. Refactor `MainViewModel.kt` to use `AppMode`:
   - Standalone: delegates to `StandaloneChatEngine`
   - Gateway: delegates to existing `NodeRuntime` -> `ChatController`
3. Reuse existing `SettingsSheet.kt` gateway config (host, port, token, TLS)
4. Add gateway discovery toggle in settings
5. Unified chat UI that works in both modes (same `ChatScreen`, different engine)

Acceptance criteria:
- User can switch between standalone and gateway mode in settings
- Gateway mode: all existing functionality preserved
- Standalone mode: direct API chat works
- Mode persisted across restarts

#### M5: Polish, Testing, Packaging (Effort: M)

**Goal**: App is shippable.

Tasks:
1. Error handling audit:
   - Network errors: show retry button
   - Auth errors: prompt to re-enter API key
   - Rate limits: show countdown if `retry-after` header present
   - Malformed responses: show "unexpected response" with details
2. UI polish:
   - Proper loading states (shimmer/skeleton for messages)
   - Empty states (no sessions, no messages)
   - Haptic feedback on send
   - Keyboard handling (IME insets)
   - Dark/light theme toggle
3. Testing:
   - Unit tests for `LlmApiClient` (mock OkHttp responses)
   - Unit tests for `SessionRepository` (Room in-memory DB)
   - Unit tests for `StandaloneChatEngine` (mock API client)
   - UI tests for onboarding flow
   - Integration test: full send/receive cycle with mock server
4. ProGuard/R8 rules for release build
5. App icon, splash screen
6. Build signed APK
7. Write release notes

Acceptance criteria:
- All unit tests pass
- App runs without crashes across 10 manual test scenarios
- APK size < 15MB
- Cold start < 2 seconds
- Signed release APK generated

### Timeline (Effort Units)

| Milestone | Effort | Depends On |
|-----------|--------|------------|
| M0: Skeleton | S (1-2 days) | - |
| M1: Onboarding | S (1-2 days) | M0 |
| M2: Chat | M (3-5 days) | M0, M1 |
| M3: Sessions | M (3-5 days) | M2 |
| M4: Gateway Integration | S (1-2 days) | M2 |
| M5: Polish + Testing | M (3-5 days) | M3, M4 |
| **Total** | **~12-21 days** | |

### 3.1 Proposed Folder Structure

```
apps/android/app/src/main/java/ai/openclaw/android/
├── MainActivity.kt                    # (existing) entry point
├── MainViewModel.kt                   # (modify) add AppMode routing
├── NodeApp.kt                         # (existing) Application class
├── NodeRuntime.kt                     # (existing) gateway runtime
├── NodeForegroundService.kt           # (existing) background service
├── SecurePrefs.kt                     # (extend) add provider key storage
├── SessionKey.kt                      # (existing)
│
├── navigation/                        # NEW - app navigation
│   ├── AppNavGraph.kt                 # NavHost with routes
│   ├── AppMode.kt                     # Sealed class: Standalone | Gateway
│   └── AppState.kt                    # Persisted app mode + settings
│
├── standalone/                        # NEW - direct LLM integration
│   ├── LlmProvider.kt                # Enum: OpenAI, Anthropic, Google, Custom
│   ├── ProviderConfig.kt             # Base URLs, API format, known models
│   ├── LlmApiClient.kt              # HTTP client for LLM APIs (streaming)
│   ├── StandaloneChatEngine.kt       # Manages conversation state
│   ├── ConnectionTester.kt           # Verify API key works
│   └── SseParser.kt                  # Server-Sent Events parser
│
├── data/                              # NEW - local persistence
│   ├── AppDatabase.kt                # Room database
│   ├── SessionEntity.kt             # Session table
│   ├── MessageEntity.kt             # Message table
│   ├── SessionDao.kt                # Session queries
│   ├── MessageDao.kt                # Message queries
│   └── SessionRepository.kt         # Repository pattern
│
├── chat/                              # (existing) gateway chat
│   ├── ChatController.kt            # (existing) gateway chat logic
│   └── ChatModels.kt                # (existing) shared data models
│
├── gateway/                           # (existing) gateway connection
│   ├── GatewaySession.kt            # (existing) WebSocket client
│   ├── GatewayDiscovery.kt          # (existing) mDNS discovery
│   ├── GatewayEndpoint.kt           # (existing)
│   ├── GatewayProtocol.kt           # (existing)
│   ├── GatewayTls.kt                # (existing)
│   ├── DeviceIdentityStore.kt       # (existing)
│   └── DeviceAuthStore.kt           # (existing)
│
├── ui/                                # UI layer
│   ├── OpenClawTheme.kt             # (existing) Material3 theme
│   ├── RootScreen.kt                # (modify) add navigation
│   ├── StatusPill.kt                # (existing)
│   ├── ChatSheet.kt                 # (existing, keep for gateway mode)
│   ├── SettingsSheet.kt             # (existing, extend)
│   │
│   ├── onboarding/                   # NEW
│   │   ├── OnboardingScreen.kt      # Provider + API key + model
│   │   └── ProviderCard.kt          # Visual provider selector
│   │
│   ├── chat/                         # (existing + extend)
│   │   ├── ChatScreen.kt            # NEW - full-screen chat
│   │   ├── ChatInput.kt             # NEW - input bar
│   │   ├── MessageBubble.kt         # NEW - message rendering
│   │   └── (existing files)          # Keep existing chat bubble code
│   │
│   └── sessions/                     # NEW
│       ├── SessionsScreen.kt        # Session list
│       └── SessionItem.kt           # Session row
│
├── node/                              # (existing) gateway node features
│   ├── CameraCaptureManager.kt      # (existing, V1.1)
│   ├── CanvasController.kt          # (existing, V1.1)
│   ├── ScreenRecordManager.kt       # (existing, V1.1)
│   └── SmsManager.kt                # (existing, V1.1)
│
├── voice/                             # (existing, V1.1)
│   └── ...
│
├── tools/                             # (existing)
│   └── ToolDisplay.kt               # (existing, reuse in gateway mode)
│
└── protocol/                          # (existing)
    ├── OpenClawProtocolConstants.kt  # (existing)
    └── OpenClawCanvasA2UIAction.kt   # (existing)
```

**Mapping to OpenClaw concepts:**

| OpenClaw Concept | Android Location | Notes |
|-----------------|-----------------|-------|
| Agent | `standalone/StandaloneChatEngine.kt` | Simplified: manages messages + calls LLM |
| Session | `data/SessionEntity.kt` + `SessionRepository.kt` | Local Room DB |
| Tools | `tools/ToolDisplay.kt` (display only) | Execution only in gateway mode |
| Config | `SecurePrefs.kt` + `navigation/AppState.kt` | EncryptedSharedPreferences + DataStore |
| Provider | `standalone/LlmProvider.kt` + `ProviderConfig.kt` | Subset of `models-config.providers.ts` |
| Model | `standalone/ProviderConfig.kt` | Known models per provider |

---

## PHASE 4: Integration Strategy

### 4.1 Core Engine Boundary

```
┌─────────────────────────────────────────┐
│              Android App                 │
│                                          │
│  ┌──────────────────────────────────┐   │
│  │         UI Layer (Compose)        │   │
│  │  Onboarding │ Chat │ Sessions │   │   │
│  │  Settings   │      │          │   │   │
│  └──────┬───────────────┬────────┘   │   │
│         │               │             │   │
│  ┌──────▼──────┐ ┌──────▼──────────┐ │   │
│  │  Standalone  │ │  Gateway Mode   │ │   │
│  │    Engine    │ │  (existing)     │ │   │
│  │             │ │                  │ │   │
│  │ LlmApiClient│ │ GatewaySession  │ │   │
│  │ SseParser   │ │ ChatController  │ │   │
│  │ SessionRepo │ │ DeviceAuth      │ │   │
│  └──────┬──────┘ └──────┬──────────┘ │   │
│         │               │             │   │
│  ┌──────▼───────────────▼────────┐   │   │
│  │        Shared Layer            │   │   │
│  │  SecurePrefs │ ChatModels │    │   │   │
│  │  AppMode     │ Theme      │    │   │   │
│  └────────────────────────────────┘   │   │
└─────────────────────────────────────────┘
         │                    │
         ▼                    ▼
   LLM APIs (HTTPS)    Gateway (WSS)
   OpenAI/Anthropic     OpenClaw Server
   /Google/Custom
```

#### What becomes shared "core" library:
- `chat/ChatModels.kt` - message types, session entries
- `SecurePrefs.kt` - secure credential storage
- `standalone/LlmProvider.kt` - provider definitions
- `data/` - Room database, repositories

#### What becomes mobile UI only:
- `ui/` - all Compose screens, navigation
- `navigation/` - app mode, state

#### What becomes a thin API layer:
- `standalone/LlmApiClient.kt` - direct HTTP calls to LLM providers
- `gateway/GatewaySession.kt` - WebSocket calls to gateway (already exists)

### 4.2 How the App Talks to the Engine

**Standalone mode: In-process library calls (direct HTTP)**

```
ChatScreen -> StandaloneChatEngine -> LlmApiClient -> OkHttp -> LLM API
                                          │
                                     SseParser (streaming)
                                          │
                                    Flow<StreamChunk>
```

- `LlmApiClient` is a plain Kotlin class, instantiated in-process
- No localhost server, no IPC, no separate process
- Streaming via Kotlin `Flow` backed by OkHttp's `EventSource` or raw SSE parsing
- Thread model: IO dispatcher for network, Main for UI updates

**Gateway mode: WebSocket (existing)**

```
ChatScreen -> ChatController -> GatewaySession (WS) -> OpenClaw Gateway
                                      │
                                 onEvent callbacks
                                      │
                                 StateFlow updates
```

Already implemented and working. No changes needed.

### 4.3 Security Implications

| Concern | Standalone Mode | Gateway Mode |
|---------|----------------|--------------|
| API key exposure | Key stored in EncryptedSharedPreferences. Sent over HTTPS to LLM provider. Never logged. | Key stays on gateway server. Only gateway token on device. |
| Network security | HTTPS to LLM APIs (TLS 1.2+). Certificate pinning optional. | WSS with TOFU TLS (`GatewayTls.kt`). |
| On-device storage | Room DB encrypted at rest (Android FBE). Keys in AES-256-GCM encrypted prefs. | Same. |
| Credential leakage | OkHttp interceptors must NOT log Authorization headers. | Already handled. |
| Root/debug detection | Not in MVP. V1.1: warn if device is rooted. | Same. |

### 4.4 Performance Implications

| Concern | Standalone Mode | Gateway Mode |
|---------|----------------|--------------|
| Latency | Direct HTTPS to LLM API (~100-500ms first token). Best possible latency. | WS to gateway + gateway to LLM. Extra hop adds ~10-50ms. |
| Bandwidth | Only LLM traffic. Efficient. | Gateway protocol overhead is minimal (JSON frames). |
| Battery | OkHttp connection pooling. No persistent socket when idle. | Persistent WebSocket + heartbeat. More battery. |
| Memory | Message history in Room DB. Only active session in memory. | Gateway manages history. Lower memory. |
| Cold start | No server to start. Instant. | Must discover/connect to gateway. 1-5 seconds. |

---

## PHASE 5: Credentials and Authentication

### 5.1 API Key Path (Required for MVP)

#### Storage

```kotlin
// In SecurePrefs.kt (extend existing)
fun saveProviderApiKey(provider: LlmProvider, apiKey: String) {
    val key = "provider.apiKey.${provider.id}"
    prefs.edit { putString(key, apiKey.trim()) }
}

fun loadProviderApiKey(provider: LlmProvider): String? {
    val key = "provider.apiKey.${provider.id}"
    return prefs.getString(key, null)?.trim()?.takeIf { it.isNotEmpty() }
}

fun clearProviderApiKey(provider: LlmProvider) {
    val key = "provider.apiKey.${provider.id}"
    prefs.edit { remove(key) }
}
```

Backed by `EncryptedSharedPreferences` with:
- Master key: `MasterKey.KeyScheme.AES256_GCM`
- Key encryption: `AES256_SIV`
- Value encryption: `AES256_GCM`
- Hardware-backed keystore on supported devices (API 31+ guarantees this)

#### Key Lifecycle

1. **Entry**: User types/pastes key in onboarding or settings
2. **Validation**: `ConnectionTester.testApiKey(provider, key)` sends a minimal request
3. **Storage**: On success, key saved to EncryptedSharedPreferences
4. **Usage**: `LlmApiClient` reads key from `SecurePrefs` on each request
5. **Rotation**: User can change key in settings at any time
6. **Deletion**: User can clear key, returns to onboarding

#### Key Format Validation (Pre-Network)

```kotlin
fun validateKeyFormat(provider: LlmProvider, key: String): Boolean = when (provider) {
    LlmProvider.OpenAI -> key.startsWith("sk-") && key.length > 20
    LlmProvider.Anthropic -> key.startsWith("sk-ant-") && key.length > 20
    LlmProvider.Google -> key.length > 20  // API keys vary
    LlmProvider.Custom -> key.isNotBlank()
}
```

### 5.2 OAuth Path (V1.1 - Future Work)

The repo has OAuth patterns in `src/agents/cli-credentials.ts`:
- GitHub Copilot: reads from `~/.codex/auth.json` (device code flow)
- Qwen: reads from `~/.qwen/oauth_creds.json`
- MiniMax: reads from `~/.minimax/oauth_creds.json`

For V1.1 Android OAuth:
- Use Android `CustomTabsIntent` for PKCE flow
- Register deep link scheme `openclaw://oauth/callback`
- Store OAuth tokens in EncryptedSharedPreferences
- Implement token refresh with `refresh_token`
- GitHub Copilot would use device code flow (show code, poll for approval)

**Not in MVP** because: OAuth requires registered app credentials, redirect URI handling, token refresh logic, and provider-specific flows. API key works universally and ships faster.

### 5.3 Log Sanitization

Rules to enforce:
1. **OkHttp logging interceptor**: Use `HttpLoggingInterceptor.Level.BASIC` in debug, `NONE` in release. Never `BODY` (would log API keys in headers).
2. **Custom header redaction**:
   ```kotlin
   val loggingInterceptor = HttpLoggingInterceptor().apply {
       level = if (BuildConfig.DEBUG) Level.BASIC else Level.NONE
       redactHeader("Authorization")
       redactHeader("x-api-key")
       redactHeader("api-key")
   }
   ```
3. **Crash reporting**: If adding Crashlytics or similar, configure breadcrumb filters to exclude any key starting with `sk-` or `Bearer`.
4. **Logcat**: Never `Log.d/i/w/e` any value from `SecurePrefs`. In debug builds, log "API key present: true/false" not the key itself.

---

## PHASE 6: Concrete Outputs

### 6.1 Mobile ADR (Architecture Decision Record)

**ADR-001: Native Android with Dual-Mode Architecture**

**Status**: Proposed

**Context**: OpenClaw is a TypeScript/Node.js agent platform with CLI, gateway server, and existing native mobile apps (iOS/Android). The existing Android app is a gateway client only - it requires a running OpenClaw gateway server. The goal is a standalone Android app where users can add an API key and start chatting with LLMs without running a server.

**Decision**: Extend the existing native Android app (Kotlin + Jetpack Compose) with a standalone mode that calls LLM APIs directly via OkHttp, alongside the existing gateway mode.

**Rationale**:
1. 52 existing Kotlin files provide working gateway infrastructure, UI components, secure storage, and device auth
2. Direct HTTP to LLM APIs is simpler than embedding Node.js or bridging TypeScript
3. Native Android provides best UX: EncryptedSharedPreferences, Foreground Service, CameraX - all already implemented
4. No cross-platform framework justified: iOS app is separate SwiftUI codebase; no code sharing to gain
5. Dual-mode preserves existing gateway functionality while adding standalone capability

**Consequences**:
- LLM streaming client must be reimplemented in Kotlin (~500 lines)
- Session persistence must use Room DB instead of filesystem JSONL
- Tool execution unavailable in standalone mode (no Docker on Android)
- Provider/model definitions must be maintained separately from TypeScript source

**Alternatives Rejected**:
- Flutter/React Native: Would discard 52 working Kotlin files and require platform channel bridges for security, camera, etc.
- Embedded Node.js: 30-50MB size overhead, fragile ARM64 support, slow startup, battery drain
- Remote-only (cloud gateway): Requires server infrastructure, defeats "just add an API key" goal

### 6.2 Technical Spec

#### Screens

| Screen | Route | State Source | Key Components |
|--------|-------|-------------|----------------|
| Onboarding | `/onboarding` | `OnboardingViewModel` | ProviderPicker, ApiKeyField, ModelSelector, TestButton |
| Chat | `/chat/{sessionId?}` | `ChatViewModel` | MessageList, ChatInput, StreamingText, AbortButton |
| Sessions | `/sessions` | `SessionsViewModel` | SessionList, NewSessionFAB, RenameDialog, DeleteDialog |
| Settings | `/settings` | `SettingsViewModel` | ModeSelector, ProviderConfig, GatewayConfig, ThemeToggle |

#### State Management

- **ViewModel** per screen (Jetpack `ViewModel` + `StateFlow`)
- **Repository pattern** for data access (Room DB, SecurePrefs, network)
- **No DI framework** for MVP (manual construction in `Application.onCreate`). Hilt is V1.1.
- **Coroutines** for async: `viewModelScope` for UI-bound, `Dispatchers.IO` for network/DB

#### Data Models

```kotlin
// Provider definition
enum class LlmProvider(val id: String, val displayName: String, val apiFormat: ApiFormat) {
    OpenAI("openai", "OpenAI", ApiFormat.OPENAI_COMPLETIONS),
    Anthropic("anthropic", "Anthropic", ApiFormat.ANTHROPIC_MESSAGES),
    Google("google", "Google Gemini", ApiFormat.GOOGLE_GENERATIVE),
    Custom("custom", "Custom (OpenAI-compatible)", ApiFormat.OPENAI_COMPLETIONS),
}

enum class ApiFormat { OPENAI_COMPLETIONS, ANTHROPIC_MESSAGES, GOOGLE_GENERATIVE }

// Session entity (Room)
@Entity(tableName = "sessions")
data class SessionEntity(
    @PrimaryKey val id: String,      // UUID
    val title: String,                // Auto from first message or user-set
    val provider: String,             // LlmProvider.id
    val model: String,                // e.g. "gpt-4o"
    val createdAt: Long,              // epoch ms
    val updatedAt: Long,              // epoch ms
)

// Message entity (Room)
@Entity(tableName = "messages", foreignKeys = [...])
data class MessageEntity(
    @PrimaryKey val id: String,       // UUID
    val sessionId: String,
    val role: String,                 // "user" | "assistant" | "system"
    val contentJson: String,          // JSON array of content blocks
    val timestampMs: Long,
)

// Streaming chunk
sealed class StreamChunk {
    data class Text(val delta: String) : StreamChunk()
    data class Thinking(val delta: String) : StreamChunk()
    data class Done(val usage: Usage?) : StreamChunk()
    data class Error(val message: String, val retryable: Boolean) : StreamChunk()
}
```

#### API Contracts

**Standalone mode - OpenAI format**:
```
POST https://api.openai.com/v1/chat/completions
Authorization: Bearer sk-...
Content-Type: application/json

{
  "model": "gpt-4o",
  "messages": [{"role": "user", "content": "Hello"}],
  "stream": true
}

Response: SSE stream
data: {"choices":[{"delta":{"content":"Hi"}}]}
data: [DONE]
```

**Standalone mode - Anthropic format**:
```
POST https://api.anthropic.com/v1/messages
x-api-key: sk-ant-...
anthropic-version: 2023-06-01
Content-Type: application/json

{
  "model": "claude-sonnet-4-5-20250929",
  "messages": [{"role": "user", "content": "Hello"}],
  "stream": true,
  "max_tokens": 4096
}

Response: SSE stream
event: content_block_delta
data: {"delta":{"type":"text_delta","text":"Hi"}}

event: message_stop
data: {}
```

**Gateway mode - existing WebSocket protocol**: No changes. See `GatewaySession.kt`.

### 6.3 Task Checklist (ClickUp-Ready)

```
## M0: Project Skeleton
- [ ] Create `navigation/AppMode.kt` sealed class (Standalone | Gateway)
- [ ] Create `navigation/AppState.kt` with DataStore persistence
- [ ] Create `navigation/AppNavGraph.kt` with NavHost (Chat, Sessions, Settings)
- [ ] Add Room dependency to `build.gradle.kts`
- [ ] Add DataStore dependency to `build.gradle.kts`
- [ ] Create `data/AppDatabase.kt` Room database class
- [ ] Create `data/SessionEntity.kt` and `data/MessageEntity.kt`
- [ ] Create `data/SessionDao.kt` and `data/MessageDao.kt`
- [ ] Create `data/SessionRepository.kt`
- [ ] Create `standalone/` package with placeholder classes
- [ ] Modify `MainActivity.kt` to use AppNavGraph
- [ ] Verify existing gateway mode still works after restructure
- [ ] Run existing tests, ensure no regressions

## M1: Onboarding
- [ ] Create `standalone/LlmProvider.kt` enum
- [ ] Create `standalone/ProviderConfig.kt` with base URLs and known models
- [ ] Extend `SecurePrefs.kt` with provider API key methods
- [ ] Create `standalone/ConnectionTester.kt`
- [ ] Create `ui/onboarding/OnboardingScreen.kt`
- [ ] Create `ui/onboarding/ProviderCard.kt`
- [ ] Wire onboarding into nav graph (show on first launch)
- [ ] Add key format validation (pre-network check)
- [ ] Test: enter valid OpenAI key -> success
- [ ] Test: enter invalid key -> meaningful error
- [ ] Test: subsequent launch skips onboarding

## M2: Standalone Chat
- [ ] Create `standalone/SseParser.kt` for SSE stream parsing
- [ ] Create `standalone/LlmApiClient.kt` with OkHttp
- [ ] Implement OpenAI chat completions format (streaming)
- [ ] Implement Anthropic messages format (streaming)
- [ ] Implement Google Gemini format (streaming)
- [ ] Create `standalone/StandaloneChatEngine.kt`
- [ ] Create `ui/chat/ChatScreen.kt` (full-screen)
- [ ] Create `ui/chat/ChatInput.kt` (text field + send + thinking + abort)
- [ ] Create `ui/chat/MessageBubble.kt` (user + assistant + markdown)
- [ ] Wire streaming text display (tokens appear incrementally)
- [ ] Implement abort (cancel coroutine Job)
- [ ] Handle error states in UI (network, auth, rate limit)
- [ ] Test: send message to OpenAI -> streaming response
- [ ] Test: send message to Anthropic -> streaming response
- [ ] Test: abort mid-stream -> generation stops
- [ ] Test: thinking level changes sent correctly

## M3: Sessions
- [ ] Implement SessionDao queries (list, insert, update, delete)
- [ ] Implement MessageDao queries (insert, getBySession, deleteBySession)
- [ ] Implement SessionRepository with auto-title generation
- [ ] Create `ui/sessions/SessionsScreen.kt`
- [ ] Create `ui/sessions/SessionItem.kt`
- [ ] Wire session creation on first message
- [ ] Wire message persistence (save after each send/receive)
- [ ] Implement session switching in ChatScreen
- [ ] Implement session rename dialog
- [ ] Implement session delete with confirmation
- [ ] Test: create conversation -> close app -> reopen -> conversation restored
- [ ] Test: multiple sessions listed with correct previews
- [ ] Test: delete session removes it and its messages

## M4: Gateway Integration
- [ ] Create `ui/settings/ModeSelector.kt` (Standalone vs Gateway toggle)
- [ ] Refactor MainViewModel to route by AppMode
- [ ] Unified ChatScreen works with both engines
- [ ] Settings screen shows provider config (standalone) or gateway config (gateway)
- [ ] Gateway discovery toggle in settings
- [ ] Test: switch to gateway mode -> connect to gateway -> chat works
- [ ] Test: switch back to standalone -> direct API chat works
- [ ] Test: mode persisted across restarts

## M5: Polish + Testing
- [ ] Unit test: LlmApiClient OpenAI format (mock OkHttp)
- [ ] Unit test: LlmApiClient Anthropic format (mock OkHttp)
- [ ] Unit test: SseParser with various SSE formats
- [ ] Unit test: SessionRepository CRUD (Room in-memory)
- [ ] Unit test: StandaloneChatEngine message flow
- [ ] Unit test: ConnectionTester success/failure
- [ ] UI test: Onboarding flow (Compose test)
- [ ] UI test: Chat send/receive (Compose test)
- [ ] Error handling: network errors show retry
- [ ] Error handling: auth errors prompt re-enter key
- [ ] Error handling: rate limits show retry-after
- [ ] Add empty states (no sessions, no messages)
- [ ] Add loading states (shimmer for messages)
- [ ] Dark/light theme toggle in settings
- [ ] App icon and splash screen
- [ ] ProGuard/R8 rules for release
- [ ] Build signed release APK
- [ ] Manual testing: 10 scenarios on real device
- [ ] APK size check (< 15MB target)
- [ ] Cold start time check (< 2s target)
```

### 6.4 Risk Register

| # | Risk | Likelihood | Impact | Mitigation |
|---|------|-----------|--------|------------|
| R1 | **SSE parsing fragility** - Different LLM providers use slightly different SSE formats (OpenAI vs Anthropic vs Google). Edge cases in chunking, multi-line data fields, or non-standard events could break streaming. | High | Medium | Write comprehensive unit tests with real response samples from each provider. Use a battle-tested SSE parser if available (OkHttp EventSource). Test against each provider's actual API. |
| R2 | **API format drift** - LLM providers change their API formats or add new required fields. | Medium | Medium | Pin to known API versions (e.g., `anthropic-version: 2023-06-01`). Abstract API format behind `LlmApiClient` interface for easy updates. Monitor provider changelogs. |
| R3 | **EncryptedSharedPreferences corruption** - Known issue on some devices where the master key gets invalidated (factory reset, backup restore). | Medium | High | Catch `SecurityException` and `GeneralSecurityException`, wipe and recreate prefs, redirect user to onboarding. Document this as a known edge case. This is already the pattern in `SecurePrefs.kt`. |
| R4 | **Room migration failures** - Schema changes between versions break existing data. | Low (MVP) | High | Use `fallbackToDestructiveMigration()` for MVP. Implement proper migrations before V1.1 when schema is stable. |
| R5 | **Large conversation memory** - Long conversations with many messages could cause OOM or slow Room queries. | Medium | Medium | Paginate message loading (load last 100, then load more on scroll). Implement conversation compaction (summarize + truncate old messages) as V1.1 feature. Set context window limits per model. |
| R6 | **Android 12+ background restrictions** - Foreground service restrictions could kill streaming in background. | Low | Medium | Streaming should complete in foreground. If user backgrounds the app mid-stream, the coroutine continues in the foreground service (already exists). Show notification with progress. |
| R7 | **Rate limiting** - Users hit rate limits, especially on free-tier API keys. | High | Low | Parse `retry-after` headers. Show clear error with countdown. Don't auto-retry (user might want to change prompt). |
| R8 | **Gateway protocol version mismatch** - Gateway updates protocol to v4, app still speaks v3. | Low | High | Protocol version negotiation already exists in `ConnectParams.minProtocol/maxProtocol`. App should handle `PROTOCOL_MISMATCH` error gracefully and prompt for update. |
| R9 | **Custom provider compatibility** - User enters custom OpenAI-compatible endpoint that doesn't fully conform. | High | Low | Test connection validates basic response format. Show raw error from API on failure. Document expected API contract in settings help text. |
| R10 | **Token counting accuracy** - Without accurate token counting, users can't estimate costs or context usage. | Medium | Low | MVP: don't show token counts. V1.1: use `tiktoken-rs` or estimate from character count (4 chars/token heuristic). Provider response includes `usage` field - display that. |

---

## Appendix A: Key File References

Quick reference for the implementing developer:

| What | Path |
|------|------|
| Existing Android app root | `apps/android/` |
| Android source | `apps/android/app/src/main/java/ai/openclaw/android/` |
| Build config | `apps/android/app/build.gradle.kts` |
| Main activity | `apps/android/app/.../MainActivity.kt` |
| ViewModel | `apps/android/app/.../MainViewModel.kt` |
| Runtime (gateway orchestration) | `apps/android/app/.../NodeRuntime.kt` |
| Gateway WS client | `apps/android/app/.../gateway/GatewaySession.kt` |
| Chat controller (gateway) | `apps/android/app/.../chat/ChatController.kt` |
| Chat models | `apps/android/app/.../chat/ChatModels.kt` |
| Secure storage | `apps/android/app/.../SecurePrefs.kt` |
| Root UI screen | `apps/android/app/.../ui/RootScreen.kt` |
| Chat UI | `apps/android/app/.../ui/ChatSheet.kt` |
| Settings UI | `apps/android/app/.../ui/SettingsSheet.kt` |
| Theme | `apps/android/app/.../ui/OpenClawTheme.kt` |
| Provider definitions (TS reference) | `src/agents/models-config.providers.ts` |
| Model auth (TS reference) | `src/agents/model-auth.ts` |
| Gateway protocol schemas | `src/gateway/protocol/` |
| OpenAI HTTP endpoint (TS reference) | `src/gateway/openai-http.ts` |
| Config types (TS reference) | `src/config/types.models.ts` |

## Appendix B: Provider Quick Reference

From `src/agents/models-config.providers.ts`:

| Provider | Base URL | API Format | Auth Header | Key Models |
|----------|----------|-----------|-------------|------------|
| OpenAI | `https://api.openai.com/v1` | `openai-completions` | `Authorization: Bearer <key>` | gpt-4o, gpt-4o-mini, o1, o3, o4-mini |
| Anthropic | `https://api.anthropic.com` | `anthropic-messages` | `x-api-key: <key>` | claude-sonnet-4-5, claude-haiku-3-5, claude-opus-4 |
| Google | `https://generativelanguage.googleapis.com/v1beta` | `google-generative-ai` | `x-goog-api-key: <key>` | gemini-2.0-flash, gemini-2.5-pro |
| GitHub Copilot | `https://api.githubcopilot.com` | `openai-completions` | `Authorization: Bearer <token>` | (requires OAuth) |
| Ollama | `http://localhost:11434/v1` | `openai-completions` | (none) | (local models) |

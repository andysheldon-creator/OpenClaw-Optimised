# Handover Prompt: Android App Implementation

> Copy-paste this entire prompt to the implementing AI agent.

---

## SYSTEM

You are a senior Android engineer implementing a mobile app. You write clean Kotlin, ship incrementally, and test as you go. You are precise with file paths, follow existing code style, and never introduce unnecessary abstractions.

## CONTEXT

You are working in the OpenClaw repository at `/home/user/openclaw`. There is an existing Android app at `apps/android/` that is a **gateway client** - it connects to an OpenClaw gateway server via WebSocket to chat with LLMs. Your job is to extend this app to also work in **standalone mode** where users enter an API key and chat directly with LLM providers (OpenAI, Anthropic, Google) without needing a gateway.

### What Already Exists (DO NOT rewrite these)

The existing Android app has 52 Kotlin files. Key components you MUST preserve and build upon:

| File | What It Does | Your Action |
|------|-------------|-------------|
| `apps/android/app/build.gradle.kts` | Build config, compileSdk 36, minSdk 31, Compose BOM 2025.12 | **Add** Room + DataStore deps |
| `SecurePrefs.kt` | EncryptedSharedPreferences with AES-256-GCM master key | **Extend** with provider API key storage |
| `gateway/GatewaySession.kt` | Full WebSocket client with device auth, reconnection | **Do not touch** |
| `chat/ChatController.kt` | Gateway chat: send, stream, history, sessions | **Do not touch** |
| `chat/ChatModels.kt` | ChatMessage, ChatMessageContent, ChatSessionEntry, etc. | **Reuse** these types |
| `MainViewModel.kt` | Delegates to NodeRuntime, exposes StateFlows | **Modify** to route by AppMode |
| `NodeRuntime.kt` | Gateway runtime orchestration | **Do not touch** |
| `ui/ChatSheet.kt` | Bottom sheet chat UI (gateway mode) | **Keep** for gateway mode |
| `ui/SettingsSheet.kt` | Gateway settings (host, port, token, name) | **Extend** with provider settings |
| `ui/OpenClawTheme.kt` | Material3 theme | **Reuse** |
| `ui/StatusPill.kt` | Connection status indicator | **Reuse** |
| `ui/chat/` | Chat bubble rendering | **Reuse** and extend |
| `NodeForegroundService.kt` | Foreground service for background execution | **Reuse** for background streaming |

### Architecture Decision

**Dual-mode app**: Standalone (direct LLM API) + Gateway (existing WebSocket).

Read the full architecture plan at `docs/mobile/ANDROID_ARCHITECTURE_PLAN.md` for complete context including:
- Truth table of every OpenClaw feature and its mobile status
- Folder structure
- Data models
- API contracts
- Risk register

### Build & Run

```bash
# From repo root
cd apps/android
./gradlew assembleDebug
# APK at app/build/outputs/apk/debug/
```

Existing tests: `./gradlew test`

## YOUR TASK

Implement the Android app following the milestone plan below. Work milestone by milestone. After each milestone, verify the app compiles and existing tests pass.

### Milestone 0: Project Skeleton

Create these new files:

1. **`navigation/AppMode.kt`** - Sealed class:
```kotlin
sealed class AppMode {
    data class Standalone(val provider: LlmProvider, val model: String) : AppMode()
    data class Gateway(val endpoint: GatewayEndpoint?) : AppMode()
}
```

2. **`navigation/AppState.kt`** - Reads/writes current mode to DataStore. Expose `StateFlow<AppMode?>` (null = not configured, show onboarding).

3. **`data/AppDatabase.kt`** - Room database with `SessionEntity` and `MessageEntity`.
   - `SessionEntity`: id (PK, UUID string), title, provider, model, createdAt (Long), updatedAt (Long)
   - `MessageEntity`: id (PK, UUID string), sessionId (FK), role ("user"|"assistant"|"system"), contentJson (String - JSON array of content blocks), timestampMs (Long)

4. **`data/SessionDao.kt`** and **`data/MessageDao.kt`** - Standard Room DAOs.

5. **`data/SessionRepository.kt`** - CRUD + auto-title from first message.

6. **`standalone/LlmProvider.kt`** - Enum with: OpenAI, Anthropic, Google, Custom. Include id, displayName, baseUrl, apiFormat, authHeader pattern, known models list.

7. Add to `build.gradle.kts`:
```kotlin
implementation("androidx.room:room-runtime:2.7.1")
implementation("androidx.room:room-ktx:2.7.1")
ksp("androidx.room:room-compiler:2.7.1")
implementation("androidx.datastore:datastore-preferences:1.1.7")
```
(Also add the KSP plugin to the plugins block.)

**Acceptance**: App compiles. Existing gateway mode works. New files exist but are not wired into UI yet.

### Milestone 1: Onboarding

1. **Extend `SecurePrefs.kt`** with:
   - `saveProviderApiKey(provider: String, key: String)`
   - `loadProviderApiKey(provider: String): String?`
   - `clearProviderApiKey(provider: String)`
   - `saveSelectedProvider(providerId: String)`
   - `loadSelectedProvider(): String?`
   - `saveSelectedModel(model: String)`
   - `loadSelectedModel(): String?`

2. **`standalone/ConnectionTester.kt`** - Takes provider + API key, sends a minimal request (single token completion), returns success/error message. Use OkHttp.

3. **`ui/onboarding/OnboardingScreen.kt`** - Compose screen:
   - Provider cards (OpenAI, Anthropic, Google, Custom)
   - API key text field (masked with toggle visibility)
   - Model dropdown (populated from LlmProvider.knownModels)
   - For Custom: additional base URL field
   - "Test Connection" button with loading state
   - "Continue" button (enabled after successful test or skip)
   - "Connect to Gateway" text button at bottom

4. Wire into navigation: if `AppState.mode` is null, show onboarding. Otherwise show chat.

**Acceptance**: Fresh install shows onboarding. User selects OpenAI, enters API key, tests connection, taps Continue. App navigates to chat screen. Subsequent launches skip onboarding.

### Milestone 2: Standalone Chat

This is the core milestone. Build the LLM client and chat UI.

1. **`standalone/SseParser.kt`** - Parses SSE streams:
   - Reads from `BufferedSource` (OkHttp response body)
   - Emits `SseEvent(event: String?, data: String)` objects
   - Handles multi-line `data:` fields, empty lines, comments
   - Handles `[DONE]` terminator

2. **`standalone/LlmApiClient.kt`** - HTTP client using OkHttp:
   ```kotlin
   fun chat(
       provider: LlmProvider,
       baseUrl: String,
       apiKey: String,
       model: String,
       messages: List<ChatMessage>,
       thinking: String = "off",
       stream: Boolean = true,
   ): Flow<StreamChunk>
   ```
   - **OpenAI format**: POST `{baseUrl}/chat/completions`, `Authorization: Bearer {key}`, parse `choices[0].delta.content`
   - **Anthropic format**: POST `{baseUrl}/v1/messages`, `x-api-key: {key}`, `anthropic-version: 2023-06-01`, parse `content_block_delta` events. For thinking, add `thinking: {type: "enabled", budget_tokens: N}` based on thinking level.
   - **Google format**: POST `{baseUrl}/models/{model}:streamGenerateContent?key={key}&alt=sse`, parse `candidates[0].content.parts[0].text`
   - Return `Flow<StreamChunk>` where StreamChunk is: `Text(delta)`, `Thinking(delta)`, `Done(usage)`, `Error(msg, retryable)`

3. **`standalone/StandaloneChatEngine.kt`**:
   - Holds `MutableStateFlow<List<ChatMessage>>` for current conversation
   - Holds `MutableStateFlow<String?>` for streaming assistant text
   - `sendMessage(text, thinking)`: appends user message, calls LlmApiClient, collects flow, appends assistant message on completion
   - `abort()`: cancels the current Job
   - Persists to Room DB via SessionRepository

4. **`ui/chat/ChatScreen.kt`** - Full-screen Composable:
   - LazyColumn of messages (reuse/adapt existing chat bubble code from `ui/chat/`)
   - Streaming text shown as a partially-complete assistant message
   - Model name in top bar
   - Toolbar with: back to sessions, thinking level selector, settings gear

5. **`ui/chat/ChatInput.kt`** - Bottom bar:
   - TextField with hint "Send a message"
   - Send button (disabled when empty or streaming)
   - Abort button (visible during streaming, replaces send)

6. **`ui/chat/MessageBubble.kt`** - Message display:
   - User messages: right-aligned, themed background
   - Assistant messages: left-aligned, different background
   - Support markdown rendering (use existing approach from ChatSheet or simple Text with annotated strings)
   - Thinking blocks: collapsible, muted style

**Acceptance**: User sends "What is 2+2?" to OpenAI gpt-4o. Streaming response appears token by token. Full response shows as assistant message. Abort works mid-stream. Thinking level works with Claude models.

### Milestone 3: Sessions

1. Wire `SessionRepository` into `StandaloneChatEngine`:
   - On first message: create SessionEntity, persist
   - On each message send/receive: persist MessageEntity
   - Update session's `updatedAt` on each interaction
   - Auto-title: first user message truncated to 50 chars

2. **`ui/sessions/SessionsScreen.kt`**:
   - LazyColumn of sessions ordered by updatedAt desc
   - Each item: title, last message preview (truncated), relative timestamp
   - Tap -> navigate to ChatScreen with sessionId
   - Long press -> context menu (Rename, Delete)
   - FAB: new session

3. **`ui/sessions/SessionItem.kt`** - Row composable for session list.

4. Navigation: Bottom nav with Chat (current session) and Sessions (list). Or: sessions as a drawer/list that replaces the chat area.

**Acceptance**: Multiple conversations persist across app restarts. Session list shows correct previews. Delete works. New session starts fresh.

### Milestone 4: Gateway Integration

1. **`ui/settings/ModeSelector.kt`** - In settings, toggle between "Standalone" and "Gateway" mode.

2. Modify **`MainViewModel.kt`**:
   - When `AppMode.Standalone`: chat delegates to `StandaloneChatEngine`
   - When `AppMode.Gateway`: chat delegates to existing `NodeRuntime` -> `ChatController`
   - Unified `chatMessages`, `chatStreamingText`, `sendChat()`, `abortChat()` StateFlows

3. Ensure `ChatScreen` works with both engines (they expose the same StateFlow interface).

4. Gateway settings (host, port, token, TLS) remain in settings, shown only when gateway mode is selected.

**Acceptance**: User switches to gateway mode, connects to gateway, chats. Switches back to standalone, chats with direct API. Mode persists.

### Milestone 5: Polish + Testing

1. Write unit tests:
   - `SseParserTest.kt` - various SSE formats, edge cases
   - `LlmApiClientTest.kt` - mock OkHttp, verify request format for each provider
   - `SessionRepositoryTest.kt` - Room in-memory DB, CRUD operations
   - `StandaloneChatEngineTest.kt` - mock API client, verify message flow

2. Error handling:
   - Network: "No internet connection" with retry
   - 401/403: "Invalid API key" with button to re-enter
   - 429: "Rate limited" with retry-after countdown if header present
   - 500+: "Server error" with details
   - Timeout: "Request timed out" with retry

3. UI polish:
   - Empty state for sessions list
   - Empty state for new chat
   - Loading indicator during connection test
   - Keyboard IME inset handling
   - Dark/light theme toggle

4. Build signed release APK.

**Acceptance**: All tests pass. App handles all error states gracefully. Release APK builds. Size < 15MB.

## IMPORTANT CONSTRAINTS

1. **Do NOT delete or break existing files.** The gateway mode must continue to work throughout.
2. **Use existing code style.** Look at `GatewaySession.kt` and `ChatController.kt` for patterns: kotlinx.serialization for JSON, OkHttp for HTTP, StateFlow for reactive state, coroutines for async.
3. **Never log API keys.** Use `SecurePrefs` for storage. Redact `Authorization` and `x-api-key` headers in any logging interceptor.
4. **No new dependencies without justification.** The existing deps (OkHttp, kotlinx-serialization, Compose, Material3) cover nearly everything. Room and DataStore are the only required additions.
5. **Test on real device preferred.** If no device available, use emulator with API 31+.
6. **Commit after each milestone** with message format: `android: M{N} - {description}`.

## REFERENCE FILES

Read these files before starting (in order of importance):

1. `docs/mobile/ANDROID_ARCHITECTURE_PLAN.md` - Full plan with truth table, data models, API contracts, risk register
2. `apps/android/app/build.gradle.kts` - Current build config and dependencies
3. `apps/android/app/src/main/java/ai/openclaw/android/SecurePrefs.kt` - Secure storage pattern to follow
4. `apps/android/app/src/main/java/ai/openclaw/android/chat/ChatController.kt` - Gateway chat pattern (your standalone engine should expose similar StateFlows)
5. `apps/android/app/src/main/java/ai/openclaw/android/chat/ChatModels.kt` - Data types to reuse
6. `apps/android/app/src/main/java/ai/openclaw/android/MainViewModel.kt` - ViewModel pattern to extend
7. `apps/android/app/src/main/java/ai/openclaw/android/ui/ChatSheet.kt` - Existing chat UI to learn from
8. `apps/android/app/src/main/java/ai/openclaw/android/standalone/LlmApiClient.kt` - (you create this)
9. `src/agents/models-config.providers.ts` - TypeScript provider definitions (reference for Kotlin port)
10. `src/gateway/openai-http.ts` - OpenAI-compatible endpoint (reference for API format)

## START

Begin with Milestone 0. Read the existing files listed above, then create the skeleton. After each milestone, state what you created, what you verified, and what's next.

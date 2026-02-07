---
summary: "Complete reference of all OpenClaw configuration fields"
read_when:
  - Looking up a specific config field
  - Understanding available configuration options
title: "Configuration Reference"
---

# Configuration Reference

Complete reference for all fields in `~/.openclaw/openclaw.json`. Fields are grouped by
the category shown in the Control UI. Use `openclaw config get <path>` / `openclaw config set <path> <value>`
to read or write any field from the CLI.

Related:

- Configuration overview: [Configuration](/gateway/configuration)
- Examples: [Configuration Examples](/gateway/configuration-examples)
- CLI: [config](/cli/config) (non-interactive) and [configure](/cli/configure) (interactive wizard)

## Diagnostics

| Field | Description |
| ----- | ----------- |
| `diagnostics.enabled` | Enable diagnostics subsystem. |
| `diagnostics.flags` | Targeted diagnostics log flags (e.g. `["telegram.http"]`). Supports wildcards like `"telegram.*"` or `"*"`. |
| `diagnostics.otel.enabled` | Enable OpenTelemetry export. |
| `diagnostics.otel.endpoint` | OTLP endpoint URL. |
| `diagnostics.otel.protocol` | OTLP protocol (grpc or http). |
| `diagnostics.otel.headers` | Custom headers for the OTLP exporter. |
| `diagnostics.otel.serviceName` | Service name reported to the collector. |
| `diagnostics.otel.traces` | Enable trace export. |
| `diagnostics.otel.metrics` | Enable metrics export. |
| `diagnostics.otel.logs` | Enable log export. |
| `diagnostics.otel.sampleRate` | Trace sample rate (0.0 - 1.0). |
| `diagnostics.otel.flushIntervalMs` | Flush interval in ms for the OTLP exporter. |
| `diagnostics.cacheTrace.enabled` | Log cache trace snapshots for embedded agent runs (default: false). |
| `diagnostics.cacheTrace.filePath` | JSONL output path for cache trace logs. |
| `diagnostics.cacheTrace.includeMessages` | Include full message payloads in trace output. |
| `diagnostics.cacheTrace.includePrompt` | Include prompt text in trace output. |
| `diagnostics.cacheTrace.includeSystem` | Include system prompt in trace output. |

## Gateway

| Field | Description |
| ----- | ----------- |
| `gateway.remote.url` | Remote Gateway WebSocket URL (ws:// or wss://). |
| `gateway.remote.sshTarget` | SSH tunnel target (format: `user@host` or `user@host:port`). |
| `gateway.remote.sshIdentity` | Optional SSH identity file path (passed to `ssh -i`). |
| `gateway.remote.token` | Remote Gateway auth token. |
| `gateway.remote.password` | Remote Gateway auth password. |
| `gateway.remote.tlsFingerprint` | Expected sha256 TLS fingerprint (pin to avoid MITM). |
| `gateway.auth.token` | Required for gateway access (unless using Tailscale Serve identity). |
| `gateway.auth.password` | Required for Tailscale funnel. |
| `gateway.controlUi.basePath` | URL prefix where the Control UI is served (e.g. `/openclaw`). |
| `gateway.controlUi.root` | Filesystem root for Control UI assets. |
| `gateway.controlUi.allowedOrigins` | Allowed browser origins for Control UI/WebChat websocket connections. |
| `gateway.controlUi.allowInsecureAuth` | Allow Control UI auth over insecure HTTP (not recommended). |
| `gateway.controlUi.dangerouslyDisableDeviceAuth` | **Dangerous.** Disable Control UI device identity checks. |
| `gateway.http.endpoints.chatCompletions.enabled` | Enable OpenAI-compatible `POST /v1/chat/completions` endpoint (default: false). |
| `gateway.reload.mode` | Hot reload strategy for config changes (`"hybrid"` recommended). |
| `gateway.reload.debounceMs` | Debounce window (ms) before applying config changes. |
| `gateway.nodes.browser.mode` | Node browser routing (`"auto"`, `"manual"`, or `"off"`). |
| `gateway.nodes.browser.node` | Pin browser routing to a specific node id or name. |
| `gateway.nodes.allowCommands` | Extra node.invoke commands beyond defaults. |
| `gateway.nodes.denyCommands` | Commands to block even if in node claims or default allowlist. |

## Agents

| Field | Description |
| ----- | ----------- |
| `agents.defaults.workspace` | Agent workspace directory. |
| `agents.defaults.repoRoot` | Repository root shown in system prompt (overrides auto-detect). |
| `agents.defaults.bootstrapMaxChars` | Max characters of workspace bootstrap files injected into system prompt (default: 20000). |
| `agents.defaults.model.primary` | Primary model (provider/model). |
| `agents.defaults.model.fallbacks` | Ordered fallback models used when the primary fails. |
| `agents.defaults.imageModel.primary` | Image model for when primary lacks image input. |
| `agents.defaults.imageModel.fallbacks` | Ordered fallback image models. |
| `agents.defaults.models` | Configured model catalog (keys are full provider/model IDs). |
| `agents.defaults.humanDelay.mode` | Delay style for block replies (`"off"`, `"natural"`, `"custom"`). |
| `agents.defaults.humanDelay.minMs` | Min delay (ms) for custom humanDelay (default: 800). |
| `agents.defaults.humanDelay.maxMs` | Max delay (ms) for custom humanDelay (default: 2500). |
| `agents.defaults.cliBackends` | CLI backends for text-only fallback (claude-cli, codex-cli). |
| `agents.defaults.envelopeTimezone` | Timezone for message envelopes (`"utc"`, `"local"`, `"user"`, or IANA string). |
| `agents.defaults.envelopeTimestamp` | Include timestamps in message envelopes (`"on"` or `"off"`). |
| `agents.defaults.envelopeElapsed` | Include elapsed time in message envelopes (`"on"` or `"off"`). |
| `agents.list[].skills` | Per-agent skill allowlist (omit = all; empty = none). |
| `agents.list[].identity.avatar` | Avatar: workspace-relative path, URL, or data URI. |
| `agents.list[].tools.profile` | Per-agent tool profile override. |
| `agents.list[].tools.alsoAllow` | Per-agent tool allowlist additions. |
| `agents.list[].tools.byProvider` | Per-agent tool policy by provider. |

## Tools

| Field | Description |
| ----- | ----------- |
| `tools.profile` | Global tool profile. |
| `tools.alsoAllow` | Global tool allowlist additions. |
| `tools.byProvider` | Tool policy by provider. |
| `tools.exec.applyPatch.enabled` | Enable apply_patch for OpenAI models when allowed by tool policy. |
| `tools.exec.applyPatch.allowModels` | Model allowlist for apply_patch (e.g. `"gpt-5.2"`). |
| `tools.exec.notifyOnExit` | Backgrounded exec sessions enqueue system event on exit (default: true). |
| `tools.exec.approvalRunningNoticeMs` | Exec approval UX timing (ms). |
| `tools.exec.host` | Exec host binding. |
| `tools.exec.security` | Exec security mode. |
| `tools.exec.ask` | Exec ask mode. |
| `tools.exec.node` | Exec node binding. |
| `tools.exec.pathPrepend` | Directories to prepend to PATH for exec runs. |
| `tools.exec.safeBins` | Allow stdin-only safe binaries without explicit allowlist entries. |

## Tools - Messaging

| Field | Description |
| ----- | ----------- |
| `tools.message.allowCrossContextSend` | Legacy: allow cross-context sends across all providers. |
| `tools.message.crossContext.allowWithinProvider` | Allow sends within the same provider (default: true). |
| `tools.message.crossContext.allowAcrossProviders` | Allow sends across different providers (default: false). |
| `tools.message.crossContext.marker.enabled` | Add visible origin marker on cross-context sends (default: true). |
| `tools.message.crossContext.marker.prefix` | Prefix text for cross-context markers (supports `{channel}`). |
| `tools.message.crossContext.marker.suffix` | Suffix text for cross-context markers (supports `{channel}`). |
| `tools.message.broadcast.enabled` | Enable broadcast action (default: true). |

## Tools - Web

| Field | Description |
| ----- | ----------- |
| `tools.web.search.enabled` | Enable web_search tool (requires a provider API key). |
| `tools.web.search.provider` | Search provider (`"brave"` or `"perplexity"`). |
| `tools.web.search.apiKey` | Brave Search API key (fallback: `BRAVE_API_KEY` env var). |
| `tools.web.search.maxResults` | Default number of results (1-10). |
| `tools.web.search.timeoutSeconds` | Timeout for web_search requests. |
| `tools.web.search.cacheTtlMinutes` | Cache TTL for web_search results. |
| `tools.web.fetch.enabled` | Enable web_fetch tool. |
| `tools.web.fetch.maxChars` | Max characters returned by web_fetch (truncated). |
| `tools.web.fetch.timeoutSeconds` | Timeout for web_fetch requests. |
| `tools.web.fetch.cacheTtlMinutes` | Cache TTL for web_fetch results. |
| `tools.web.fetch.maxRedirects` | Max redirects for web_fetch (default: 3). |
| `tools.web.fetch.userAgent` | Override User-Agent header for web_fetch. |
| `tools.web.fetch.readability` | Use Readability to extract main content from HTML. |
| `tools.web.fetch.firecrawl.enabled` | Enable Firecrawl fallback for web_fetch. |
| `tools.web.fetch.firecrawl.apiKey` | Firecrawl API key (fallback: `FIRECRAWL_API_KEY`). |
| `tools.web.fetch.firecrawl.baseUrl` | Firecrawl base URL. |

## Tools - Media Understanding

| Field | Description |
| ----- | ----------- |
| `tools.media.models` | Shared models for media understanding. |
| `tools.media.concurrency` | Max parallel media processing jobs. |
| `tools.media.image.enabled` | Enable image understanding. |
| `tools.media.image.maxBytes` | Max image size (bytes). |
| `tools.media.image.maxChars` | Max output characters for image descriptions. |
| `tools.media.image.prompt` | Custom prompt for image understanding. |
| `tools.media.image.timeoutSeconds` | Timeout for image understanding. |
| `tools.media.image.attachments` | Image attachment policy. |
| `tools.media.image.models` | Model list for image understanding. |
| `tools.media.image.scope` | Image understanding scope. |
| `tools.media.audio.enabled` | Enable audio understanding. |
| `tools.media.audio.maxBytes` | Max audio size (bytes). |
| `tools.media.audio.maxChars` | Max output characters for audio transcription. |
| `tools.media.audio.prompt` | Custom prompt for audio understanding. |
| `tools.media.audio.timeoutSeconds` | Timeout for audio understanding. |
| `tools.media.audio.language` | Language hint for audio transcription. |
| `tools.media.audio.attachments` | Audio attachment policy. |
| `tools.media.audio.models` | Model list for audio understanding. |
| `tools.media.audio.scope` | Audio understanding scope. |
| `tools.media.video.enabled` | Enable video understanding. |
| `tools.media.video.maxBytes` | Max video size (bytes). |
| `tools.media.video.maxChars` | Max output characters for video descriptions. |
| `tools.media.video.prompt` | Custom prompt for video understanding. |
| `tools.media.video.timeoutSeconds` | Timeout for video understanding. |
| `tools.media.video.attachments` | Video attachment policy. |
| `tools.media.video.models` | Model list for video understanding. |
| `tools.media.video.scope` | Video understanding scope. |
| `tools.links.enabled` | Enable link understanding. |
| `tools.links.maxLinks` | Max links extracted per message. |
| `tools.links.timeoutSeconds` | Timeout for link understanding. |
| `tools.links.models` | Model list for link understanding. |
| `tools.links.scope` | Link understanding scope. |

## Memory Search

| Field | Description |
| ----- | ----------- |
| `agents.defaults.memorySearch.enabled` | Enable memory search. |
| `agents.defaults.memorySearch.sources` | Sources to index (default: `["memory"]`; add `"sessions"` for transcripts). |
| `agents.defaults.memorySearch.extraPaths` | Extra paths to include (directories or .md files). |
| `agents.defaults.memorySearch.experimental.sessionMemory` | Experimental session transcript indexing. |
| `agents.defaults.memorySearch.provider` | Embedding provider (`"openai"`, `"gemini"`, `"voyage"`, or `"local"`). |
| `agents.defaults.memorySearch.model` | Embedding model override. |
| `agents.defaults.memorySearch.fallback` | Fallback provider when embeddings fail. |
| `agents.defaults.memorySearch.remote.baseUrl` | Custom base URL for remote embeddings. |
| `agents.defaults.memorySearch.remote.apiKey` | Custom API key for remote embedding provider. |
| `agents.defaults.memorySearch.remote.headers` | Extra headers for remote embeddings. |
| `agents.defaults.memorySearch.remote.batch.concurrency` | Max concurrent embedding batch jobs (default: 2). |
| `agents.defaults.memorySearch.local.modelPath` | Local GGUF model path or `hf:` URI (node-llama-cpp). |
| `agents.defaults.memorySearch.store.path` | SQLite index path. |
| `agents.defaults.memorySearch.store.vector.enabled` | Enable sqlite-vec for vector search (default: true). |
| `agents.defaults.memorySearch.store.vector.extensionPath` | Override path to sqlite-vec extension library. |
| `agents.defaults.memorySearch.chunking.tokens` | Chunk size in tokens. |
| `agents.defaults.memorySearch.chunking.overlap` | Chunk overlap in tokens. |
| `agents.defaults.memorySearch.sync.onSessionStart` | Reindex on session start. |
| `agents.defaults.memorySearch.sync.onSearch` | Lazy reindex on search after changes. |
| `agents.defaults.memorySearch.sync.watch` | Watch memory files for changes (chokidar). |
| `agents.defaults.memorySearch.sync.sessions.deltaBytes` | Min appended bytes before session reindex (default: 100000). |
| `agents.defaults.memorySearch.sync.sessions.deltaMessages` | Min appended JSONL lines before session reindex (default: 50). |
| `agents.defaults.memorySearch.query.maxResults` | Max search results. |
| `agents.defaults.memorySearch.query.minScore` | Min similarity score. |
| `agents.defaults.memorySearch.query.hybrid.enabled` | Enable hybrid BM25 + vector search (default: true). |
| `agents.defaults.memorySearch.query.hybrid.vectorWeight` | Weight for vector similarity (0-1). |
| `agents.defaults.memorySearch.query.hybrid.textWeight` | Weight for BM25 text relevance (0-1). |
| `agents.defaults.memorySearch.query.hybrid.candidateMultiplier` | Candidate pool multiplier (default: 4). |
| `agents.defaults.memorySearch.cache.enabled` | Cache chunk embeddings to speed up reindexing (default: true). |
| `agents.defaults.memorySearch.cache.maxEntries` | Cap on cached embeddings (best-effort). |

## Memory (QMD backend)

| Field | Description |
| ----- | ----------- |
| `memory.backend` | Memory backend (`"builtin"` or `"qmd"`). |
| `memory.citations` | Citation behavior (`"auto"`, `"on"`, or `"off"`). |
| `memory.qmd.command` | Path to the qmd binary (default: resolves from PATH). |
| `memory.qmd.includeDefaultMemory` | Auto-index MEMORY.md + memory/**/*.md (default: true). |
| `memory.qmd.paths` | Additional directories/files to index (path + glob pattern). |
| `memory.qmd.sessions.enabled` | Enable QMD session transcript indexing (default: false). |
| `memory.qmd.sessions.exportDir` | Directory for sanitized session exports. |
| `memory.qmd.sessions.retentionDays` | Retention window before pruning (default: unlimited). |
| `memory.qmd.update.interval` | QMD refresh interval (duration string, default: 5m). |
| `memory.qmd.update.debounceMs` | Min delay between QMD refresh runs (default: 15000). |
| `memory.qmd.update.onBoot` | Run QMD update on gateway startup (default: true). |
| `memory.qmd.update.embedInterval` | Embedding refresh interval (default: 60m; 0 disables). |
| `memory.qmd.limits.maxResults` | Max QMD results per query (default: 6). |
| `memory.qmd.limits.maxSnippetChars` | Max characters per snippet (default: 700). |
| `memory.qmd.limits.maxInjectedChars` | Max total characters injected per turn. |
| `memory.qmd.limits.timeoutMs` | Per-query timeout (default: 4000). |
| `memory.qmd.scope` | Session/channel scope for QMD recall. |

## Auth

| Field | Description |
| ----- | ----------- |
| `auth.profiles` | Named auth profiles (provider + mode + optional email). |
| `auth.order` | Ordered auth profile IDs per provider (for automatic failover). |
| `auth.cooldowns.billingBackoffHours` | Base backoff hours when a profile fails due to billing (default: 5). |
| `auth.cooldowns.billingBackoffHoursByProvider` | Per-provider overrides for billing backoff. |
| `auth.cooldowns.billingMaxHours` | Cap for billing backoff (default: 24). |
| `auth.cooldowns.failureWindowHours` | Failure window for backoff counters (default: 24). |

## Commands

| Field | Description |
| ----- | ----------- |
| `commands.native` | Register native commands with channels (Discord/Slack/Telegram). |
| `commands.nativeSkills` | Register native skill commands with channels. |
| `commands.text` | Allow text command parsing (slash commands). |
| `commands.bash` | Allow `!` / `/bash` chat command (default: false; requires `tools.elevated`). |
| `commands.bashForegroundMs` | How long bash waits before backgrounding (default: 2000). |
| `commands.config` | Allow `/config` chat command (default: false). |
| `commands.debug` | Allow `/debug` chat command (default: false). |
| `commands.restart` | Allow `/restart` and gateway restart actions (default: false). |
| `commands.useAccessGroups` | Enforce access-group allowlists for commands. |
| `commands.ownerAllowFrom` | Owner allowlist for owner-only tools/commands. |

## Session

| Field | Description |
| ----- | ----------- |
| `session.dmScope` | DM session scoping (`"main"`, `"per-peer"`, `"per-channel-peer"`, or `"per-account-channel-peer"`). |
| `session.agentToAgent.maxPingPongTurns` | Max reply-back turns between agents (0-5). |

## Messages

| Field | Description |
| ----- | ----------- |
| `messages.ackReaction` | Ack reaction emoji. |
| `messages.ackReactionScope` | Ack reaction scope. |
| `messages.inbound.debounceMs` | Inbound message debounce (ms). |

## UI

| Field | Description |
| ----- | ----------- |
| `ui.seamColor` | Accent color for the CLI/Control UI. |
| `ui.assistant.name` | Assistant display name. |
| `ui.assistant.avatar` | Assistant avatar. |

## Browser

| Field | Description |
| ----- | ----------- |
| `browser.evaluateEnabled` | Allow JavaScript evaluation in browser tool. |
| `browser.snapshotDefaults.mode` | Default browser snapshot mode. |
| `browser.remoteCdpTimeoutMs` | Remote CDP timeout (ms). |
| `browser.remoteCdpHandshakeTimeoutMs` | Remote CDP handshake timeout (ms). |
| `nodeHost.browserProxy.enabled` | Expose local browser control server via node proxy. |
| `nodeHost.browserProxy.allowProfiles` | Allowlist of browser profile names exposed via proxy. |

## Plugins

| Field | Description |
| ----- | ----------- |
| `plugins.enabled` | Enable plugin/extension loading (default: true). |
| `plugins.allow` | Plugin allowlist (when set, only listed plugins load). |
| `plugins.deny` | Plugin denylist (deny wins over allow). |
| `plugins.load.paths` | Additional plugin files or directories to load. |
| `plugins.slots` | Select plugins for exclusive slots (memory, etc.). |
| `plugins.slots.memory` | Active memory plugin id, or `"none"` to disable. |
| `plugins.entries` | Per-plugin settings keyed by plugin id. |
| `plugins.entries.*.enabled` | Override plugin enable/disable (restart required). |
| `plugins.entries.*.config` | Plugin-defined config payload. |

## Skills

| Field | Description |
| ----- | ----------- |
| `skills.load.watch` | Watch skills directory for changes. |
| `skills.load.watchDebounceMs` | Skills watch debounce (ms). |

## Channel-specific

Each channel supports `allowFrom`, `groups`, `dmPolicy`, and `configWrites`.
Channel-specific fields are documented in their respective channel docs
([WhatsApp](/channels/whatsapp), [Telegram](/channels/telegram), [Discord](/channels/discord),
[Slack](/channels/slack), [Signal](/channels/signal), [iMessage](/channels/imessage),
[BlueBubbles](/channels/bluebubbles), [MS Teams](/channels/msteams), [Mattermost](/channels/mattermost)).

Notable channel-specific fields:

| Field | Description |
| ----- | ----------- |
| `channels.telegram.botToken` | Telegram Bot Token. |
| `channels.telegram.streamMode` | Draft stream mode. |
| `channels.telegram.draftChunk.*` | Draft chunking (minChars, maxChars, breakPreference). |
| `channels.telegram.retry.*` | Retry policy (attempts, minDelayMs, maxDelayMs, jitter). |
| `channels.telegram.capabilities.inlineButtons` | Enable inline buttons. |
| `channels.discord.token` | Discord Bot Token. |
| `channels.discord.intents.presence` | Discord Presence Intent. |
| `channels.discord.intents.guildMembers` | Discord Guild Members Intent. |
| `channels.discord.pluralkit.*` | PluralKit integration (enabled, token). |
| `channels.slack.botToken` | Slack Bot Token. |
| `channels.slack.appToken` | Slack App Token. |
| `channels.slack.userToken` | Slack User Token. |
| `channels.slack.thread.*` | Thread settings (historyScope, inheritParent). |
| `channels.slack.allowBots` | Allow bot-authored messages (default: false). |
| `channels.mattermost.botToken` | Mattermost Bot Token. |
| `channels.mattermost.baseUrl` | Mattermost server base URL. |
| `channels.mattermost.chatmode` | Reply mode (`"oncall"`, `"onchar"`, `"onmessage"`). |
| `channels.whatsapp.selfChatMode` | Self-phone mode for WhatsApp. |
| `channels.whatsapp.debounceMs` | WhatsApp message debounce (ms). |

# Component Inventory & Migration Map

> Complete catalog of everything in the current Lit UI and its React target.
> This is the single source of truth for tracking migration progress.
> Before migrating any view, check this document to see what primitives already exist.

---

## A. Shared Primitives Mapping

Every UI pattern that appears in 2+ views, mapped to its React target.

| Current Pattern | CSS Class(es) | Occurrences (files) | React Target | Radix Primitive | Priority |
|---|---|---|---|---|---|
| Dropdown/popover panel | `.sn-panel`, `.sn-wrapper`, `.sn-trigger` | session-navigator, command-palette | `<Popover>` | `@radix-ui/react-popover` | P0 |
| Voice/option select | `.voice-select`, `.voice-select__dropdown` | chat compose | `<Select>` | `@radix-ui/react-select` | P0 |
| Modal/dialog | `.modal`, `.modal-backdrop`, confirm-dialog | confirm-dialog, channel-wizard, onboarding-wizard, progress-modal, keyboard-shortcuts, cron modal, automation form, exec-approval | `<Dialog>` | `@radix-ui/react-dialog` | P0 |
| Danger confirm | confirm-dialog `showDangerConfirmDialog()` | session delete, config reset, channel disconnect | `<AlertDialog>` | `@radix-ui/react-alert-dialog` | P0 |
| Toast notifications | `.toast`, toast singleton | everywhere (success/error/info/warning) | `<Toast>` | `@radix-ui/react-toast` | P0 |
| Tooltips | HTML `title=""` attributes | everywhere | `<Tooltip>` | `@radix-ui/react-tooltip` | P0 |
| Button variants | `.btn`, `.btn--primary/secondary/danger/icon/sm` | all views | `<Button>` | Custom (no Radix) | P0 |
| Icon button | `.icon-btn`, `.icon-btn--send/abort/recording/active` | chat compose, chat controls | `<IconButton>` | Custom | P0 |
| Card container | `.card`, `.card-title`, `.card-sub` | overview, debug, channels, agents, config | `<Card>` | Custom | P0 |
| Glass panel | `.glass`, `.glass-strong`, inline `backdrop-filter` | chat, sidebar, topbar, nav | `<GlassPanel>` | Custom | P0 |
| Form inputs | `.form-input`, `.form-select`, `.form-checkbox`, `.form-radio` | config, cron, channels, automations, onboarding | `<Input>`, `<Select>`, `<Checkbox>`, `<RadioGroup>` | Radix primitives | P0 |
| Save button | `renderSaveButton()` with state machine | config, exec-approvals, channels | `<SaveButton>` | Custom | P1 |
| Tabs | `.tabs`, `.tab-button` | nav, config sections, sessions view modes, overseer | `<Tabs>` | `@radix-ui/react-tabs` | P1 |
| Badge/pill | `.badge`, `.pill`, `.sn-badge` | sessions, agents, channels, status | `<Badge>` | Custom | P1 |
| Status dot | `.sn-status-dot`, `.statusDot` | session-navigator, topbar, agents | `<StatusDot>` | Custom | P1 |
| Collapsible section | Nav groups, session groups, tool cards, task sidebar | nav, sessions, chat sidebar | `<Collapsible>` | `@radix-ui/react-collapsible` | P1 |
| Split pane | `.chat-split-container`, `<clawdbrain-resizable-divider>` | chat sidebar, logs sidebar | `<SplitPane>` | Custom | P1 |
| Search input | `.sn-panel__search`, `.logs-search`, command palette | session-navigator, logs, sessions, config, command palette | `<SearchInput>` | Custom | P1 |
| Scroll area | Custom scrollbars on `.chat-thread`, `.sn-sessions`, logs | chat, logs, session navigator | `<ScrollArea>` | `@radix-ui/react-scroll-area` | P1 |
| Progress bar | `.progress`, automation progress | automations, compaction | `<Progress>` | `@radix-ui/react-progress` | P2 |
| Skeleton loader | `.skeleton`, `.chat-skeleton` | chat loading | `<Skeleton>` | Custom | P2 |
| Avatar | `.chat-avatar`, `.agents-avatar`, `.sn-agent__avatar` | chat, agents, session-navigator | `<Avatar>` | `@radix-ui/react-avatar` | P2 |
| Empty state | `.sn-empty`, inline "No data" messages | multiple views | `<EmptyState>` | Custom | P2 |
| Toggle/switch | `.toggle` | config, settings | `<Switch>` | `@radix-ui/react-switch` | P2 |
| Separator | `.chat-controls__separator`, `.toolbar-separator` | chat, toolbar | `<Separator>` | `@radix-ui/react-separator` | P2 |
| Code block | `.code-block`, `.code-block__header`, `.code-block__copy` | chat messages, debug | `<CodeBlock>` | Custom | P2 |
| Markdown renderer | `toSanitizedMarkdownHtml()` | chat, sidebar | `<Markdown>` | Custom (react-markdown) | P2 |
| Stat card | `.stat`, `.stat-label`, `.stat-value` | overview, debug | `<StatCard>` | Custom | P2 |

---

## B. View-by-View Migration Map

### B.1 Chat View

**Source files:**
- `ui/src/ui/views/chat.ts` (744 LOC)
- `ui/src/ui/chat/grouped-render.ts` (313 LOC)
- `ui/src/ui/chat/message-normalizer.ts` (90 LOC)
- `ui/src/ui/chat/message-extract.ts` (139 LOC)
- `ui/src/ui/chat/tool-cards.ts` (144 LOC)
- `ui/src/ui/chat/tool-helpers.ts` (37 LOC)
- `ui/src/ui/chat/copy-as-markdown.ts` (93 LOC)
- `ui/src/ui/chat/constants.ts` (12 LOC)
- `ui/src/ui/views/chat-task-sidebar.ts` (333 LOC)
- `ui/src/ui/views/markdown-sidebar.ts` (37 LOC)

**CSS files:**
- `chat/layout.css` (1,067 LOC)
- `chat/text.css` (293 LOC)
- `chat/grouped.css` (429 LOC)
- `chat/tool-cards.css` (346 LOC)
- `chat/sidebar.css` (118 LOC)
- `chat/task-sidebar.css` (453 LOC)

**React target structure:**
```
components/chat/
  ChatView.tsx              ← chat.ts
  ChatHeader.tsx            ← chat header section
  ChatThread.tsx            ← message scroll area
  ChatComposer.tsx          ← compose card + toolbar
  MessageGroup.tsx          ← grouped-render.ts
  StreamingIndicator.tsx    ← streaming group
  ToolCard.tsx              ← tool-cards.ts
  TaskSidebar.tsx           ← chat-task-sidebar.ts
  MarkdownSidebar.tsx       ← markdown-sidebar.ts
  CopyAsMarkdown.tsx        ← copy-as-markdown.ts
```

**State dependencies:**
- `useChatStore` — messages, stream, draft, attachments, queue, audio, TTS, sidebar
- `useSessionStore` — sessionKey, navigator state
- `useConnectionStore` — connected
- `useAgentStore` — assistantName, assistantAvatar

**Shared primitives used:**
`<ScrollArea>`, `<Popover>` (session navigator), `<Select>` (voice), `<IconButton>`, `<Tooltip>`, `<SplitPane>`, `<Skeleton>`, `<Avatar>`, `<Badge>`, `<CodeBlock>`, `<Markdown>`, `<Button>`

---

### B.2 Sessions View

**Source files:**
- `ui/src/ui/views/sessions.ts` (2,552 LOC — largest view)
- `ui/src/ui/views/sessions-grouped.ts` (new grouped view)

**CSS files:**
- Styles in `components.css` (session-specific sections)
- `session-navigator.css` (771 LOC)

**React target structure:**
```
components/sessions/
  SessionsView.tsx          ← sessions.ts (main)
  SessionsTable.tsx         ← table view mode
  SessionsList.tsx          ← list view mode
  SessionsGrouped.tsx       ← grouped view mode
  SessionFilters.tsx        ← filter/sort controls
  SessionPreviewDrawer.tsx  ← preview drawer
  SessionRow.tsx            ← individual session entry
```

**State dependencies:**
- `useSessionStore` — sessionsResult, filters, sort, viewMode, drawer, preview
- `useAgentStore` — agentsList (for agent labels)
- `useConnectionStore` — connected

**Shared primitives used:**
`<Tabs>` (view modes), `<SearchInput>`, `<Select>` (filters), `<Badge>`, `<StatusDot>`, `<Button>`, `<Dialog>` (delete confirm), `<EmptyState>`, `<Tooltip>`, `<ScrollArea>`

---

### B.3 Config View

**Source files:**
- `ui/src/ui/views/config.ts` (1,388 LOC)
- `ui/src/ui/views/config-form.ts` (7 LOC — re-export)
- `ui/src/ui/views/config-form.analyze.ts` (265 LOC)
- `ui/src/ui/views/config-form.render.ts` (276 LOC)
- `ui/src/ui/views/config-form.node.ts` (1,007 LOC)
- `ui/src/ui/views/config-form.shared.ts` (164 LOC)

**CSS files:**
- `config.css` (2,813 LOC)

**React target structure:**
```
components/config/
  ConfigView.tsx            ← config.ts
  ConfigSidebar.tsx         ← section navigation
  ConfigFormView.tsx        ← form mode
  ConfigRawView.tsx         ← raw YAML editor
  ConfigSection.tsx         ← form section renderer
  ConfigField.tsx           ← individual field (text/select/checkbox/slider/stepper)
  ConfigSearch.tsx          ← config search
```

**State dependencies:**
- `useConfigStore` — configRaw, configForm, schema, dirty, mode, sections
- `useConnectionStore` — connected

**Shared primitives used:**
`<Tabs>` (form/raw), `<Input>`, `<Select>`, `<Checkbox>`, `<Switch>`, `<Slider>`, `<SearchInput>`, `<SaveButton>`, `<Card>`, `<Collapsible>`, `<Tooltip>`, `<ScrollArea>`

---

### B.4 Channels View

**Source files:**
- `ui/src/ui/views/channels.ts` (667 LOC)
- `ui/src/ui/views/channel-config-wizard.ts` (831 LOC)
- `ui/src/ui/views/channels.config.ts` (134 LOC)
- `ui/src/ui/views/channels.shared.ts` (218 LOC)
- `ui/src/ui/views/channels.types.ts` (72 LOC)
- `ui/src/ui/views/channels.discord.ts` (41 LOC)
- `ui/src/ui/views/channels.slack.ts` (41 LOC)
- `ui/src/ui/views/channels.telegram.ts` (95 LOC)
- `ui/src/ui/views/channels.signal.ts` (47 LOC)
- `ui/src/ui/views/channels.imessage.ts` (41 LOC)
- `ui/src/ui/views/channels.whatsapp.ts` (119 LOC)
- `ui/src/ui/views/channels.googlechat.ts` (53 LOC)
- `ui/src/ui/views/channels.nostr.ts` (207 LOC)
- `ui/src/ui/views/channels.nostr-profile-form.ts` (312 LOC)

**CSS files:**
- `channel-wizard.css` (895 LOC)
- Channel styles in `components.css`

**React target structure:**
```
components/channels/
  ChannelsView.tsx          ← channels.ts
  ChannelCard.tsx           ← per-channel status card
  ChannelConfigWizard.tsx   ← channel-config-wizard.ts (Dialog)
  ChannelForm.tsx           ← shared form layout
  channels/                 ← per-channel config forms
    DiscordConfig.tsx
    SlackConfig.tsx
    TelegramConfig.tsx
    SignalConfig.tsx
    IMessageConfig.tsx
    WhatsAppConfig.tsx
    GoogleChatConfig.tsx
    NostrConfig.tsx
    NostrProfileForm.tsx
```

**State dependencies:**
- `useChannelStore` — channelsSnapshot, whatsapp QR, nostr profile, wizard state
- `useConnectionStore` — connected
- `useConfigStore` — channel config values

**Shared primitives used:**
`<Dialog>` (wizard), `<Card>`, `<Input>`, `<Button>`, `<SaveButton>`, `<Badge>`, `<StatusDot>`, `<Tooltip>`

---

### B.5 Logs View

**Source files:**
- `ui/src/ui/views/logs.ts` (776 LOC)

**CSS files:**
- `logs.css` (1,331 LOC)

**React target structure:**
```
components/logs/
  LogsView.tsx              ← logs.ts
  LogsToolbar.tsx           ← filter/search controls
  LogsOutput.tsx            ← log entries list
  LogEntry.tsx              ← individual log line
  LogsStatusBar.tsx         ← footer status
  LogsSidebar.tsx           ← session sidebar
  JsonViewer.tsx            ← expandable JSON display
```

**State dependencies:**
- `useLogStore` — entries, cursor, filters, presets, autoFollow
- `useConnectionStore` — connected

**Shared primitives used:**
`<SearchInput>`, `<Button>`, `<Badge>`, `<Tooltip>`, `<ScrollArea>`, `<Collapsible>` (JSON viewer), `<SplitPane>` (sidebar)

---

### B.6 Cron View

**Source files:**
- `ui/src/ui/views/cron.ts` (666 LOC)

**CSS files:**
- Cron styles in `components.css`

**React target structure:**
```
components/cron/
  CronView.tsx              ← cron.ts
  CronJobList.tsx           ← job listing
  CronJobCard.tsx           ← individual job
  CronJobForm.tsx           ← form for new/edit job (Dialog)
  CronRunLog.tsx            ← run history
```

**State dependencies:**
- `useCronStore` — cronJobs, cronStatus, form, runs
- `useAgentStore` — agentsList (for agent selection)
- `useConnectionStore` — connected

**Shared primitives used:**
`<Dialog>` (form modal), `<Input>`, `<Select>`, `<Button>`, `<Card>`, `<Badge>`, `<StatusDot>`, `<Tooltip>`, `<EmptyState>`

---

### B.7 Debug View

**Source files:**
- `ui/src/ui/views/debug.ts` (730 LOC)

**CSS files:**
- Debug styles in `components.css`

**React target structure:**
```
components/debug/
  DebugView.tsx             ← debug.ts
  DebugStatus.tsx           ← status/health cards
  DebugModels.tsx           ← model catalog
  DebugMethodCaller.tsx     ← RPC method tester
  DebugHeartbeat.tsx        ← heartbeat display
```

**State dependencies:**
- `useDebugStore` — status, health, models, heartbeat, method caller
- `useConnectionStore` — connected

**Shared primitives used:**
`<Card>`, `<StatCard>`, `<Input>`, `<Button>`, `<CodeBlock>`, `<Badge>`, `<Tooltip>`

---

### B.8 Overview View

**Source files:**
- `ui/src/ui/views/overview.ts` (435 LOC)

**React target structure:**
```
components/overview/
  OverviewView.tsx
  PresenceCard.tsx
  AgentSummaryCard.tsx
  HealthCard.tsx
  SystemMetrics.tsx
```

**State dependencies:**
- `useConnectionStore` — connected, hello
- `useAgentStore` — agentsList
- Presence data (from gateway hello)

**Shared primitives used:**
`<Card>`, `<StatCard>`, `<Badge>`, `<StatusDot>`, `<Avatar>`

---

### B.9 Agents View

**Source files:**
- `ui/src/ui/views/agents.ts` (496 LOC)

**CSS files:**
- `agents.css` (409 LOC)

**React target structure:**
```
components/agents/
  AgentsView.tsx
  AgentList.tsx
  AgentDetail.tsx
  AgentSessionList.tsx
```

**State dependencies:**
- `useAgentStore` — agentsList, selected agent, search, session filter
- `useSessionStore` — session data per agent

**Shared primitives used:**
`<SearchInput>`, `<Avatar>`, `<Badge>`, `<Card>`, `<ScrollArea>`, `<EmptyState>`, `<StatusDot>`

---

### B.10 Automations View

**Source files:**
- `ui/src/ui/views/automations.ts` (313 LOC)
- `ui/src/ui/views/automation-form.ts` (315 LOC)
- `ui/src/ui/views/run-history.ts` (395 LOC)
- `ui/src/ui/views/progress-modal.ts` (227 LOC)

**React target structure:**
```
components/automations/
  AutomationsView.tsx
  AutomationCard.tsx
  AutomationForm.tsx        ← Dialog
  RunHistory.tsx
  ProgressModal.tsx         ← Dialog
```

**State dependencies:**
- `useAutomationStore` — automations, form, progress, run history

**Shared primitives used:**
`<Dialog>` (form + progress), `<Input>`, `<Select>`, `<Button>`, `<Card>`, `<Badge>`, `<Progress>`, `<SearchInput>`, `<Collapsible>`, `<EmptyState>`

---

### B.11 Overseer View

**Source files:**
- `ui/src/ui/views/overseer.ts` (1,722 LOC)
- `ui/src/ui/views/overseer-simulator.ts` (1,369 LOC)
- `ui/src/ui/views/overseer.graph.ts` (413 LOC)

**CSS files:**
- `overseer-simulator.css` (1,170 LOC)

**React target structure:**
```
components/overseer/
  OverseerView.tsx
  OverseerGoalPanel.tsx
  OverseerGraph.tsx
  OverseerTreeView.tsx
  OverseerDrawer.tsx
  OverseerSimulator.tsx
```

**State dependencies:**
- `useOverseerStore` — status, goals, viewport, drag, simulator

**Shared primitives used:**
`<Card>`, `<Button>`, `<Badge>`, `<Tabs>`, `<Collapsible>`, `<Dialog>`, `<Input>`, `<Tooltip>`, `<ScrollArea>`

---

### B.12 Remaining Views

| View | Source | LOC | React Target | Primitives |
|------|--------|-----|-------------|------------|
| Skills | `views/skills.ts` | 296 | `SkillsView.tsx` | `<Card>`, `<Button>`, `<Badge>`, `<Input>` |
| Instances | `views/instances.ts` | 96 | `InstancesView.tsx` | `<Card>`, `<Button>`, `<Badge>` |
| Nodes | `views/nodes.ts` | 1,433 | `NodesView.tsx` + subcomponents | `<Card>`, `<Badge>`, `<StatusDot>`, `<Collapsible>`, `<ScrollArea>` |
| Landing | `views/landing.ts` + `landing/` dir | ~700 | `LandingView.tsx` + sections | Mostly standalone |
| Onboarding | `views/onboarding-wizard.ts` + helpers | ~1,512 | `OnboardingWizard.tsx` + steps | `<Dialog>`, `<Card>`, `<Button>`, `<Input>`, `<Progress>` |
| Exec Approvals | `views/exec-approval.ts` | 266 | `ExecApprovalPrompt.tsx` | `<AlertDialog>`, `<Button>`, `<Card>`, `<Badge>` |

---

## C. State Migration Map

Every field in `AppViewState` and where it migrates.

### C.1 Connection & UI Chrome → `useConnectionStore` + `useUIStore`

| Current Field | Store | Hook |
|---|---|---|
| `connected` | `useConnectionStore` | `.connected` |
| `hello` | `useConnectionStore` | `.hello` |
| `client` | `useConnectionStore` | `.client` |
| `lastError` | `useConnectionStore` | `.lastError` |
| `tab` | `useUIStore` | `.tab` |
| `theme` / `themeResolved` | `useUIStore` | `.theme` |
| `onboarding` | `useUIStore` | `.onboarding` |
| `settings` | `useUIStore` | `.settings` |
| `navShowAdvanced` | `useUIStore` | `.navShowAdvanced` |
| `commandPaletteOpen` + related | `useUIStore` | `.commandPalette.*` |
| `eventLog` / `eventLogBuffer` | `useDebugStore` | `.eventLog` |

### C.2 Chat → `useChatStore`

| Current Field | Migration |
|---|---|
| `chatMessage` | Local state in `<ChatComposer>` (via React Hook Form) |
| `chatAttachments` | Local state in `<ChatComposer>` |
| `chatMessages` | `useChatHistoryQuery(sessionKey)` (React Query) |
| `chatToolMessages` | Derived from chat messages |
| `chatStream` / `chatStreamStartedAt` | `useChatStore.stream` (Zustand, updated via SSE) |
| `chatRunId` | `useChatStore.runId` |
| `chatLoading` | `useChatHistoryQuery().isLoading` |
| `chatSending` | `useSendChatMutation().isPending` |
| `chatQueue` | `useChatStore.queue` |
| `audio*` / `tts*` / `readAloud*` | `useChatStore.audio.*` (sub-slice) |
| `sidebarOpen` / `sidebarContent` | Local state in `<ChatView>` |
| `taskSidebar*` | Local state in `<TaskSidebar>` |
| `compactionStatus` | `useChatStore.compaction` |

### C.3 Sessions → `useSessionStore`

| Current Field | Migration |
|---|---|
| `sessionsResult` | `useSessionsQuery()` (React Query) |
| `sessionsSearch` / `sessionsFilter*` / `sessionsSort*` | `useSessionStore` filter state |
| `sessionsViewMode` | `useSessionStore.viewMode` (persisted to localStorage) |
| `sessionsPreviewEntry` | `useSessionPreviewQuery(key)` (React Query) |
| `sessionsDrawerKey` / `sessionsDrawerExpanded` | Local state in `<SessionPreviewDrawer>` |
| `sessionsActiveTasksByKey` | `useSessionStore.activeTasks` |
| `sessionNavigator` | Local state in `<SessionNavigator>` |

### C.4 Config → `useConfigStore`

| Current Field | Migration |
|---|---|
| `configRaw` / `configRawOriginal` | React Hook Form for raw mode |
| `configSnapshot` | `useConfigQuery()` (React Query) |
| `configSchema` | `useConfigSchemaQuery()` (React Query) |
| `configForm` / `configFormOriginal` | React Hook Form for form mode |
| `configFormDirty` | React Hook Form `formState.isDirty` |
| `configFormMode` | `useConfigStore.mode` |
| `configActiveSection` / `configActiveSubsection` | Local state or URL param |
| `configSearchQuery` | Local state in `<ConfigSearch>` |

### C.5 Other Domains

| Domain | Current Location | React Target |
|---|---|---|
| Channels | `channels*`, `whatsapp*`, `nostr*`, `channelWizard*` | `useChannelStore` + React Query |
| Cron | `cron*` | `useCronStore` + React Query |
| Automations | `automation*` | `useAutomationStore` + React Query |
| Overseer | `overseer*`, `simulator` | `useOverseerStore` + React Query |
| Logs | `logs*` | `useLogStore` + React Query (polling) |
| Debug | `debug*` | `useDebugStore` + React Query |
| Agents | `agents*`, `assistant*` | `useAgentStore` + React Query |
| Skills | `skills*` | React Query (no separate store needed) |
| Devices/Instances | `devices*` | React Query |
| Exec Approvals | `execApproval*` | `useExecApprovalStore` + React Query |

---

## D. CSS File Migration Map

| Current CSS File | LOC | Migration Target | Notes |
|---|---|---|---|
| `design-system.css` | 1,193 | **Keep as-is** | Global tokens, no changes needed |
| `base.css` | 277 | **Keep as-is** | Resets, fonts, global styles |
| `layout.css` | 782 | `AppLayout.module.css` | Shell grid, topbar, nav, content area |
| `layout.mobile.css` | 402 | Merged into `AppLayout.module.css` | Mobile overrides |
| `components.css` | 12,664 | **Decompose** into component modules | Each React component gets its CSS Module. This file is deleted. |
| `chat/layout.css` | 1,067 | `ChatView.module.css` + sub-component modules |
| `chat/text.css` | 293 | `ChatText.module.css` | Keep as shared chat text styles |
| `chat/grouped.css` | 429 | `MessageGroup.module.css` |
| `chat/tool-cards.css` | 346 | `ToolCard.module.css` |
| `chat/sidebar.css` | 118 | `ChatSidebar.module.css` |
| `chat/task-sidebar.css` | 453 | `TaskSidebar.module.css` |
| `config.css` | 2,813 | `ConfigView.module.css` + sub-component modules |
| `logs.css` | 1,331 | `LogsView.module.css` + sub-component modules |
| `agents.css` | 409 | `AgentsView.module.css` |
| `session-navigator.css` | 771 | `SessionNavigator.module.css` |
| `channel-wizard.css` | 895 | `ChannelConfigWizard.module.css` |
| `onboarding-wizard.css` | 891 | `OnboardingWizard.module.css` |
| `orbital.css` | 254 | `Orbital.module.css` (if kept) |
| `overseer-simulator.css` | 1,170 | `OverseerSimulator.module.css` |
| `landing-animations.css` | 271 | `LandingAnimations.module.css` |

---

## E. Utility File Migration Map

These files have no framework dependency and migrate with minimal changes.

| Current File | LOC | Migration | Changes Needed |
|---|---|---|---|
| `format.ts` | 74 | `lib/format.ts` | None — pure functions |
| `session-grouping.ts` | 377 | `lib/session-grouping.ts` | None — pure functions |
| `session-meta.ts` | 39 | `lib/session-meta.ts` | None |
| `gateway.ts` | 311 | `lib/gateway.ts` | None — class with callbacks |
| `storage.ts` | 159 | `lib/storage.ts` | None — localStorage wrappers |
| `navigation.ts` | 317 | `lib/navigation.ts` | None — URL/hash helpers |
| `icons.ts` | 244 | **Replace** with `lucide-react` | Delete file; import icons directly |
| `markdown.ts` | 117 | `lib/markdown.ts` or use `react-markdown` | Evaluate if custom sanitization is still needed |
| `uuid.ts` | 51 | `lib/uuid.ts` | None |
| `theme.ts` | 16 | `lib/theme.ts` | None |
| `theme-transition.ts` | 106 | `hooks/useThemeTransition.ts` | Convert to React hook |
| `tool-display.ts` | 198 | `lib/tool-display.ts` | None |
| `device-auth.ts` | 99 | `lib/device-auth.ts` | None |
| `device-identity.ts` | 110 | `lib/device-identity.ts` | None |
| `global-shortcuts.ts` | 155 | `hooks/useGlobalShortcuts.ts` | Convert to React hook |
| `assistant-identity.ts` | 49 | Part of `useAgentStore` | Merge into store |

---

## F. Controller Migration Map

Controllers contain business logic that calls the gateway. They become React Query hooks + Zustand actions.

| Current Controller | LOC | React Target | Pattern |
|---|---|---|---|
| `controllers/chat.ts` | 199 | `hooks/useChatActions.ts` | Zustand actions + `useMutation` |
| `controllers/sessions.ts` | 149 | `hooks/useSessionQueries.ts` | `useQuery` + `useMutation` |
| `controllers/config.ts` | 209 | `hooks/useConfigQueries.ts` | `useQuery` + `useMutation` |
| `controllers/channels.ts` | 83 | `hooks/useChannelQueries.ts` | `useQuery` |
| `controllers/cron.ts` | 221 | `hooks/useCronQueries.ts` | `useQuery` + `useMutation` |
| `controllers/agents.ts` | 25 | `hooks/useAgentQueries.ts` | `useQuery` |
| `controllers/automations.ts` | 445 | `hooks/useAutomationQueries.ts` | `useQuery` + `useMutation` |
| `controllers/overseer.ts` | 519 | `hooks/useOverseerQueries.ts` | `useQuery` + `useMutation` |
| `controllers/debug.ts` | 80 | `hooks/useDebugQueries.ts` | `useQuery` |
| `controllers/logs.ts` | 136 | `hooks/useLogQueries.ts` | `useQuery` with polling |
| `controllers/nodes.ts` | 29 | `hooks/useNodeQueries.ts` | `useQuery` |
| `controllers/skills.ts` | 152 | `hooks/useSkillQueries.ts` | `useQuery` + `useMutation` |
| `controllers/devices.ts` | 147 | `hooks/useDeviceQueries.ts` | `useQuery` + `useMutation` |
| `controllers/tts.ts` | 77 | `hooks/useTtsQueries.ts` | `useQuery` + `useMutation` |
| `controllers/onboarding.ts` | 535 | `hooks/useOnboarding.ts` | Complex — multi-step state machine |
| `controllers/chat-tasks.ts` | 225 | `hooks/useChatTasks.ts` | Derived from tool stream |
| `controllers/exec-approvals.ts` | 165 | `hooks/useExecApprovalQueries.ts` | `useQuery` + `useMutation` |
| `controllers/exec-approval.ts` | 85 | Merge into above | Single approval handling |
| `controllers/presence.ts` | 35 | Part of gateway hello handling | Inline |
| `controllers/assistant-identity.ts` | 35 | Part of `useAgentStore` | Inline |
| `controllers/overseer-simulator.ts` | 1,020 | `hooks/useOverseerSimulator.ts` | Complex — own Zustand slice |

---

## G. Component Files Migration Map

| Current Component | LOC | React Target | Notes |
|---|---|---|---|
| `components/session-navigator.ts` | 452 | `components/session-navigator/SessionNavigator.tsx` | Uses `<Popover>` instead of manual positioning |
| `components/command-palette.ts` | 443 | `components/command-palette/CommandPalette.tsx` | Uses `<Dialog>` with `cmdk` library |
| `components/toast.ts` | 364 | `components/ui/Toast.tsx` | Uses `@radix-ui/react-toast` |
| `components/design-utils.ts` | 519 | **Decompose** — each helper becomes a primitive | `renderPanel` → `<Card>`, `renderTabs` → `<Tabs>`, etc. |
| `components/confirm-dialog.ts` | 213 | `components/ui/AlertDialog.tsx` | Uses `@radix-ui/react-alert-dialog` |
| `components/search-highlight.ts` | 154 | `components/ui/SearchHighlight.tsx` | Pure render — minimal change |
| `components/resizable-divider.ts` | 109 | `components/ui/SplitPane.tsx` | Replace LitElement with React |
| `components/keyboard-shortcuts-modal.ts` | 211 | `components/KeyboardShortcutsModal.tsx` | Uses `<Dialog>` |
| `components/save-button.ts` | 182 | `components/ui/SaveButton.tsx` | State machine pattern stays |
| `components/orbital.ts` | 132 | `components/Orbital.tsx` | Replace LitElement with React |
| `components/fuzzy-search.ts` | 125 | `lib/fuzzy-search.ts` | Pure function — no framework dependency |
| `components/command-history.ts` | 66 | `lib/command-history.ts` | Pure — no framework dependency |
| `components/command-favorites.ts` | 88 | `lib/command-favorites.ts` | Pure — no framework dependency |

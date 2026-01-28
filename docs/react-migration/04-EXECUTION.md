# Phased Execution Plan

> The migration sequence, structured to minimize risk and hybrid Lit+React coexistence.
> Each phase lists specific files, dependencies, and definition of done.

---

## Migration Principles

1. **Primitives first, views second.** No view migration begins until the shared component library (Phase 1) is complete and tested.
2. **Simplest views first.** Validate the architecture on low-risk surfaces before tackling the complex ones.
3. **Feature parity, not feature improvement.** Each migrated view must match existing behavior before adding new features. Do not improve UX during migration.
4. **One view at a time.** Each view is fully migrated (component + CSS + state + tests) before starting the next. No half-migrated views.
5. **Delete old code immediately.** When a view is fully migrated, delete the Lit render function and its CSS. Do not keep dead code.
6. **Coexistence is temporary.** The Lit shell stays until all views are migrated, then it is replaced. Target: zero Lit code at the end.

---

## Phase 0: Scaffold React Shell

**Goal:** React rendering works alongside Lit. Zustand stores are initialized. Gateway events flow to both systems.

### Tasks

| # | Task | Files Created / Modified | Depends On |
|---|------|--------------------------|------------|
| 0.1 | Install React + dependencies | `package.json`, `pnpm-lock.yaml` | — |
| 0.2 | Configure Vite for React | `vite.config.ts` | 0.1 |
| 0.3 | Create React entry point | `ui/src/App.tsx`, `ui/src/main-react.tsx` | 0.2 |
| 0.4 | Create Zustand store skeletons | `ui/src/stores/*.ts` (12 files) | 0.1 |
| 0.5 | Create state bridge (Lit ↔ Zustand) | `ui/src/lib/state-bridge.ts` | 0.4 |
| 0.6 | Create gateway hook | `ui/src/hooks/useGateway.ts` | 0.4 |
| 0.7 | Install and configure React Query | `ui/src/lib/query-client.ts` | 0.1 |
| 0.8 | Set up ESLint + react-hooks plugin | `.eslintrc.js` or `eslint.config.js` | 0.1 |
| 0.9 | Create React mount bridge in Lit | `ui/src/ui/react-bridge.ts` | 0.3, 0.5 |
| 0.10 | Verify: React component renders inside Lit shell | Integration test | 0.9 |

### Dependencies to Install

```bash
pnpm add react react-dom @tanstack/react-query zustand
pnpm add -D @types/react @types/react-dom @vitejs/plugin-react
pnpm add -D @testing-library/react @testing-library/jest-dom
pnpm add -D eslint-plugin-react-hooks
```

### Definition of Done

- [ ] A React `<div>Hello React</div>` renders inside the Lit app shell
- [ ] Zustand stores exist with empty slices
- [ ] State bridge syncs `connected`, `tab`, `theme` from Lit → Zustand
- [ ] React Query client is initialized
- [ ] ESLint catches hooks violations
- [ ] `pnpm build` succeeds
- [ ] `pnpm test` passes

---

## Phase 1: Shared Primitives Library

**Goal:** All 31 shared UI primitives (from Doc 03) are built, styled, and tested in isolation. No view migration yet.

### Tasks

| # | Task | Component(s) | Radix Package |
|---|------|-------------|---------------|
| 1.1 | Core buttons | `Button`, `IconButton`, `SaveButton` | — |
| 1.2 | Layout primitives | `Card`, `GlassPanel`, `Separator`, `SplitPane` | `@radix-ui/react-separator` |
| 1.3 | Text & display | `Badge`, `StatusDot`, `StatCard`, `EmptyState`, `Skeleton`, `Avatar` | `@radix-ui/react-avatar` |
| 1.4 | Form inputs | `Input`, `Textarea`, `Checkbox`, `Switch`, `RadioGroup`, `Slider`, `Select` | `@radix-ui/react-checkbox`, `@radix-ui/react-switch`, `@radix-ui/react-radio-group`, `@radix-ui/react-slider`, `@radix-ui/react-select` |
| 1.5 | Overlays & positioning | `Popover`, `Dialog`, `AlertDialog`, `Tooltip`, `Toast` | `@radix-ui/react-popover`, `@radix-ui/react-dialog`, `@radix-ui/react-alert-dialog`, `@radix-ui/react-tooltip`, `@radix-ui/react-toast` |
| 1.6 | Navigation & disclosure | `Tabs`, `Collapsible`, `ScrollArea`, `SearchInput` | `@radix-ui/react-tabs`, `@radix-ui/react-collapsible`, `@radix-ui/react-scroll-area` |
| 1.7 | Content rendering | `CodeBlock`, `Markdown`, `Progress` | `@radix-ui/react-progress` |
| 1.8 | Icon system | Replace `icons.ts` with `lucide-react` | — |
| 1.9 | Storybook or test page | Visual catalog of all primitives | — |

### Dependencies to Install

```bash
# Radix primitives
pnpm add @radix-ui/react-popover @radix-ui/react-dialog @radix-ui/react-alert-dialog \
  @radix-ui/react-tooltip @radix-ui/react-select @radix-ui/react-tabs \
  @radix-ui/react-collapsible @radix-ui/react-toggle @radix-ui/react-toggle-group \
  @radix-ui/react-scroll-area @radix-ui/react-separator @radix-ui/react-switch \
  @radix-ui/react-checkbox @radix-ui/react-radio-group @radix-ui/react-slider \
  @radix-ui/react-progress @radix-ui/react-avatar @radix-ui/react-toast \
  @radix-ui/react-visually-hidden

# Icons
pnpm add lucide-react

# Markdown rendering
pnpm add react-markdown remark-gfm rehype-highlight

# Form management
pnpm add react-hook-form @hookform/resolvers zod
```

### Definition of Done

- [ ] All 31 primitives exist in `ui/src/components/ui/`
- [ ] Each has a CSS Module using existing design tokens
- [ ] Each has a `.test.tsx` file with variant, disabled, keyboard, and a11y tests
- [ ] All primitives render correctly in dark and light themes
- [ ] Visual test page shows all primitives with all variants
- [ ] `pnpm build` succeeds
- [ ] `pnpm test` passes with no regressions

---

## Phase 2: Migrate Simple Views (Validation)

**Goal:** Validate the full migration pattern (component + state + queries + CSS Module) on low-risk views. Fix any architectural issues discovered.

### Views to Migrate

| # | View | Current LOC | Complexity | Why First |
|---|------|-------------|------------|-----------|
| 2.1 | Debug | 730 | Low | Read-only display, minimal state, few interactions |
| 2.2 | Logs | 776 | Low-Medium | Polling pattern, filters, scroll management |
| 2.3 | Skills | 296 | Low | Simple CRUD list, few primitives |
| 2.4 | Instances | 96 | Very Low | Simple list display |

### Per-View Migration Steps

For each view:

1. **Create React Query hooks** for data fetching (`useDebugQuery()`, etc.)
2. **Create Zustand store** (if needed) for view-specific state
3. **Create React component tree** using shared primitives
4. **Create CSS Module** from existing CSS (extract relevant rules)
5. **Mount in Lit shell** via React bridge
6. **Test**: Verify feature parity manually + automated tests
7. **Delete Lit code**: Remove old render function + unused CSS
8. **Update Inventory**: Mark as migrated in Doc 02

### Definition of Done

- [ ] All 4 views render via React inside the Lit shell
- [ ] State flows correctly (Zustand → component → user action → mutation → re-render)
- [ ] Polling works via React Query `refetchInterval`
- [ ] Dark/light theme works
- [ ] No Lit render functions remain for these views
- [ ] Old CSS selectors for these views are deleted or moved to CSS Modules
- [ ] No regressions in unmigrated views

---

## Phase 3: Migrate Medium-Complexity Views

**Goal:** Migrate views with forms, multiple sub-components, and moderate state complexity.

### Views to Migrate

| # | View | Current LOC | Complexity | Key Challenges |
|---|------|-------------|------------|----------------|
| 3.1 | Overview | 435 | Medium | Multiple stat cards, presence data |
| 3.2 | Agents | 496 | Medium | Master-detail layout, search/filter |
| 3.3 | Cron | 666 | Medium | Form modal, schedule builder, run log |
| 3.4 | Channels | 2,878 (14 files) | Medium-High | Wizard dialog, per-channel forms, WhatsApp QR, Nostr profile |
| 3.5 | Automations | 1,250 (4 files) | Medium | Multi-step form, progress modal SSE, run history |
| 3.6 | Sessions | 2,552+ | High | Largest view. 3 view modes, complex filters, preview drawer, active tasks |
| 3.7 | Config | 3,107 (6 files) | High | Schema-driven form, raw YAML editor, section navigation, dirty detection |
| 3.8 | Nodes | 1,433 | Medium-High | Hierarchical tree, streaming connections |

### Migration Order Rationale

- **Overview → Agents**: Simple read-only display, establishes card/stat patterns.
- **Cron**: First form modal migration. Validates `<Dialog>` + React Hook Form pattern.
- **Channels**: Tests the wizard dialog pattern at scale (14 source files).
- **Automations**: Tests SSE-driven progress modal (real-time updates from gateway).
- **Sessions**: Largest view. Benefits from all primitives being battle-tested on smaller views first.
- **Config**: Most complex form. Schema-driven rendering is unique to this view. React Hook Form + Zod validation. Migrated last in this phase because it's the highest-risk form.
- **Nodes**: Hierarchical tree view, independent of other views.

### Per-View: Channels (Example Detail)

**Step 1: Create store + queries**
```
hooks/useChannelQueries.ts    ← channels.status query
stores/useChannelStore.ts     ← wizard state, WhatsApp state, Nostr state
```

**Step 2: Create components**
```
components/channels/
  ChannelsView.tsx            ← Main view
  ChannelCard.tsx             ← Per-channel status card (uses <Card>, <Badge>, <StatusDot>)
  ChannelConfigWizard.tsx     ← <Dialog size="lg"> with multi-pane layout
  ChannelForm.tsx             ← Shared form layout (uses <Input>, <Select>, <Button>)
  channels/
    DiscordConfig.tsx         ← Per-channel form
    SlackConfig.tsx
    ... (10 more)
  ChannelsView.module.css
  ChannelCard.module.css
  ChannelConfigWizard.module.css
```

**Step 3: CSS Migration**
- Extract from `channel-wizard.css` (895 LOC) → `ChannelConfigWizard.module.css`
- Extract channel card styles from `components.css` → `ChannelCard.module.css`
- Delete `channel-wizard.css`

**Step 4: Test**
- Wizard opens, navigates sections, saves config
- WhatsApp QR flow works
- Nostr profile editing works
- All channel cards show correct status

**Step 5: Delete Lit code**
- Remove all 14 `channels.*.ts` files from `ui/src/ui/views/`
- Remove `channel-wizard.css`
- Update `app-render.ts` to use React bridge for channels tab

### Definition of Done

- [ ] All 8 views render via React
- [ ] All forms use React Hook Form with proper validation
- [ ] All modals use `<Dialog>` / `<AlertDialog>` from primitives
- [ ] Dirty detection works in Config and Channel views
- [ ] SSE-driven progress modal works for Automations
- [ ] Sessions view supports all 3 modes (list/table/grouped) with filters
- [ ] Config form/raw mode switch works
- [ ] No Lit render functions remain for these views
- [ ] All view-specific CSS files are deleted or converted to CSS Modules

---

## Phase 4: Migrate Chat View

**Goal:** Migrate the highest-complexity view: real-time streaming, audio/TTS, rich message rendering, split pane sidebar, session navigator.

### Why Last

Chat is the most complex view (6+ CSS files, 10+ source files, real-time streaming, audio recording, TTS playback, image attachments, tool cards, task sidebar, markdown rendering). Every shared primitive is exercised here. By migrating it last, all primitives are battle-tested and all architectural patterns are proven.

### Sub-tasks

| # | Task | Source → Target | Key Primitives |
|---|------|-----------------|----------------|
| 4.1 | Chat store + queries | `controllers/chat.ts` → `useChatStore` + `useChatHistoryQuery` | — |
| 4.2 | Session navigator | `session-navigator.ts` → `<SessionNavigator>` | `<Popover>`, `<SearchInput>`, `<Avatar>`, `<Badge>`, `<ScrollArea>` |
| 4.3 | Chat header + controls | Chat header section → `<ChatHeader>` | `<Tooltip>`, `<IconButton>`, `<Separator>` |
| 4.4 | Message rendering | `grouped-render.ts` → `<MessageGroup>` | `<Avatar>`, `<Badge>`, `<Markdown>`, `<CodeBlock>` |
| 4.5 | Tool cards | `tool-cards.ts` → `<ToolCard>` | `<Card>`, `<Collapsible>`, `<CodeBlock>` |
| 4.6 | Chat composer | Compose card → `<ChatComposer>` | `<Input>` (textarea), `<IconButton>`, `<Select>` (voice), `<Tooltip>` |
| 4.7 | Streaming display | Streaming group → `<StreamingIndicator>` | `<Skeleton>` |
| 4.8 | Audio recording | Audio state → `useAudioRecording()` hook | `<IconButton>` (recording variant) |
| 4.9 | TTS playback | TTS state → `useTts()` hook | `<Select>` (provider), `<IconButton>` |
| 4.10 | Image attachments | Attachment state → `<AttachmentPreview>` | Custom |
| 4.11 | Task sidebar | `chat-task-sidebar.ts` → `<TaskSidebar>` | `<SplitPane>`, `<Collapsible>`, `<Badge>`, `<ScrollArea>` |
| 4.12 | Markdown sidebar | `markdown-sidebar.ts` → `<MarkdownSidebar>` | `<SplitPane>`, `<Markdown>` |
| 4.13 | Chat skeleton | Loading state → `<ChatSkeleton>` | `<Skeleton>` |
| 4.14 | Auto-scroll | `app-scroll.ts` → `useScrollAnchor()` hook | — |
| 4.15 | Copy as markdown | `copy-as-markdown.ts` → `<CopyAsMarkdown>` | `<Button>` |
| 4.16 | Integration test | Full chat flow (send, stream, tool call, abort) | All |

### CSS Migration

| Source CSS | LOC | Target CSS Module |
|-----------|-----|-------------------|
| `chat/layout.css` | 1,067 | `ChatView.module.css`, `ChatComposer.module.css` |
| `chat/text.css` | 293 | `ChatText.module.css` (shared) |
| `chat/grouped.css` | 429 | `MessageGroup.module.css` |
| `chat/tool-cards.css` | 346 | `ToolCard.module.css` |
| `chat/sidebar.css` | 118 | `ChatSidebar.module.css` |
| `chat/task-sidebar.css` | 453 | `TaskSidebar.module.css` |
| `session-navigator.css` | 771 | `SessionNavigator.module.css` |

### Definition of Done

- [ ] Full chat flow works: send message → stream response → display final
- [ ] Tool calls render as cards with expandable details
- [ ] Session navigator uses `<Popover>` — no overflow/clipping issues
- [ ] Audio recording works (if browser supports Web Speech API)
- [ ] TTS playback works with provider selection
- [ ] Image attachments can be added/removed/sent
- [ ] Task sidebar shows tool execution progress
- [ ] Markdown sidebar shows tool output
- [ ] Auto-scroll follows new messages
- [ ] Chat skeleton displays during loading
- [ ] Copy as markdown works
- [ ] Streaming indicator animates during response
- [ ] Split pane resizable divider works
- [ ] Message queuing works when sending is in progress
- [ ] Abort button cancels in-flight request

---

## Phase 5: Migrate App Shell & Global Components

**Goal:** Replace the Lit `ClawdbrainApp` element with a React root. Migrate global components (command palette, topbar, navigation, onboarding).

### Sub-tasks

| # | Task | Source → Target |
|---|------|----------------|
| 5.1 | App layout shell | `app.ts` + `layout.css` → `<AppLayout>` with CSS Module |
| 5.2 | Topbar | Topbar section → `<Topbar>` |
| 5.3 | Navigation sidebar | Nav section → `<Navigation>` with `<Tabs>`, `<Collapsible>` |
| 5.4 | Command palette | `command-palette.ts` → `<CommandPalette>` (consider `cmdk` library) |
| 5.5 | Keyboard shortcuts modal | `keyboard-shortcuts-modal.ts` → `<KeyboardShortcutsModal>` using `<Dialog>` |
| 5.6 | Onboarding wizard | `onboarding-wizard.ts` + helpers → `<OnboardingWizard>` using `<Dialog>` |
| 5.7 | Overseer views | `overseer.ts` + simulator → React components |
| 5.8 | Landing page | `landing/` → React components |
| 5.9 | Exec approval prompt | `exec-approval.ts` → `<ExecApprovalPrompt>` using `<AlertDialog>` |
| 5.10 | Toast provider | Move to React `<ToastProvider>` wrapping `<App>` |
| 5.11 | Theme management | `theme.ts` + `theme-transition.ts` → `useTheme()` hook |
| 5.12 | Hash routing | `navigation.ts` → `useHashRouting()` hook |
| 5.13 | Global shortcuts | `global-shortcuts.ts` → `useGlobalShortcuts()` hook |
| 5.14 | React root replaces Lit | Delete `app.ts`, use `main.tsx` → `createRoot` |

### Definition of Done

- [ ] `<ClawdbrainApp>` LitElement is deleted
- [ ] `main.tsx` calls `createRoot` and renders `<App>`
- [ ] All state lives in Zustand stores (no `@state()` decorators)
- [ ] All data fetching uses React Query (no manual polling)
- [ ] Navigation works via hash routing hook
- [ ] Command palette works with keyboard shortcut
- [ ] Onboarding wizard works for new users
- [ ] Theme switching works with transition animation
- [ ] Toast notifications work via Radix provider
- [ ] Global keyboard shortcuts work

---

## Phase 6: Cleanup

**Goal:** Remove all Lit dependencies, dead CSS, and legacy code.

### Tasks

| # | Task | Details |
|---|------|---------|
| 6.1 | Delete Lit app files | `app.ts`, `app-render.ts`, `app-render.helpers.ts`, `app-gateway.ts`, `app-settings.ts`, `app-view-state.ts`, `app-chat.ts`, `app-tool-stream.ts`, `app-lifecycle.ts`, `app-polling.ts`, `app-scroll.ts`, `app-channels.ts`, `app-defaults.ts`, `app-events.ts` |
| 6.2 | Delete Lit view files | All files in `ui/src/ui/views/` |
| 6.3 | Delete Lit component files | All files in `ui/src/ui/components/` |
| 6.4 | Delete Lit controller files | All files in `ui/src/ui/controllers/` (logic moved to hooks) |
| 6.5 | Delete old CSS files | `components.css`, `chat/*.css` (view-specific), `config.css`, `logs.css`, `agents.css`, `session-navigator.css`, `channel-wizard.css`, `onboarding-wizard.css`, `orbital.css`, `overseer-simulator.css` |
| 6.6 | Keep global CSS | `design-system.css`, `base.css` (still needed for tokens and resets) |
| 6.7 | Remove Lit dependencies | `lit`, `@lit/context`, `@lit-labs/signals` from `package.json` |
| 6.8 | Remove state bridge | `lib/state-bridge.ts` (no longer needed) |
| 6.9 | Update build config | Remove any Lit-specific Vite config |
| 6.10 | Full regression test | All views, all features, dark/light themes, mobile |
| 6.11 | Bundle size audit | Compare before/after bundle sizes |
| 6.12 | Performance audit | Lighthouse, React DevTools profiler |

### Definition of Done

- [ ] Zero Lit imports in the codebase
- [ ] `lit` removed from `package.json`
- [ ] No orphaned CSS files
- [ ] Bundle size is within acceptable range (target: < 2x current; React + Radix add ~50-60KB gzipped)
- [ ] All tests pass
- [ ] All features work in both themes
- [ ] Mobile responsive behavior works

---

## Risk Mitigation

| Risk | Mitigation |
|------|-----------|
| State sync bugs during coexistence | Comprehensive integration tests. State bridge has bi-directional sync tests. |
| CSS specificity conflicts | CSS Modules eliminate global class collisions. New components never share class names with old ones. |
| Gateway event handling regression | Gateway client is unchanged. Only the event dispatch target changes (Lit state → Zustand store). Test each event type. |
| Performance regression (React overhead) | Monitor bundle size and render performance. React 19's compiler and concurrent features should offset any overhead. Chat streaming is the critical path — profile it. |
| Scroll position loss during migration | `useScrollAnchor()` hook preserves auto-scroll behavior. Test with large message histories. |
| Form state loss on view switch | React Query caches query data. Zustand persists form state. React Hook Form persists draft state. |
| Breaking changes in Radix | Pin Radix package versions. Update deliberately after testing. |
| Migration fatigue (too long) | Each phase has clear milestones. Phase 2 validates the approach early. If the approach doesn't work, pivot before Phase 3. |

---

## Estimated Phase Dependencies

```
Phase 0 (scaffold)
  ↓
Phase 1 (primitives) ← BLOCKER: no view migration until complete
  ↓
Phase 2 (simple views) ← validates architecture
  ↓
Phase 3 (medium views) ← can partially overlap if Phase 2 is stable
  ↓
Phase 4 (chat) ← depends on all primitives being battle-tested
  ↓
Phase 5 (app shell) ← depends on all views being migrated
  ↓
Phase 6 (cleanup)
```

Phases 2 and 3 can overlap if different developers work on different views, as long as Phase 1 is complete and the architectural patterns from Phase 2 are proven.

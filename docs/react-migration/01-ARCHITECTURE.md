# Architecture Decisions

> Migration from Lit Web Components to React.
> This document locks in technology choices before implementation begins.
> Finalize and freeze this document before any migration code is written.

---

## 1. Framework & Rendering

| Decision | Choice | Rationale |
|----------|--------|-----------|
| UI Framework | **React 19** | Latest stable. Server Components not needed (SPA), but the new `use()` hook, `useOptimistic`, and improved Suspense are valuable. |
| Language | **TypeScript (strict)** | Already TypeScript; keep strict mode. |
| JSX Transform | **Automatic** (`react-jsx`) | No `import React` boilerplate. |
| Module Format | **ESM** | Already ESM; no change. |

### Why React 19 specifically

- `useActionState` and `useOptimistic` simplify form submission flows (config editor, cron form, automation form, channel wizard).
- Improved `<Suspense>` boundaries let us replace manual `loading` booleans with declarative loading states.
- `ref` as a prop (no `forwardRef`) simplifies component APIs.
- React Compiler (opt-in) can eliminate manual `useMemo`/`useCallback` in the future.

---

## 2. Bundler & Dev Server

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Bundler | **Vite 6** | Already using Vite for the Lit app. Zero config change for React via `@vitejs/plugin-react`. |
| HMR | **Vite + React Fast Refresh** | Instant component-level hot reload. |
| Path aliases | `@/` → `ui/src/` | Match existing convention if any; otherwise establish `@/` as source root. |

### Vite Config Changes

```ts
// vite.config.ts
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@': resolve(__dirname, 'ui/src') },
  },
});
```

The existing `lit` plugin (if any) is removed after full migration. During the coexistence phase, both can run side by side since Vite handles JSX and Lit tagged templates independently.

---

## 3. Component Library & UI Primitives

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Headless primitives | **Radix UI** | Unstyled, accessible, composable. Handles positioning (Floating UI internally), focus trapping, keyboard navigation, ARIA attributes. |
| Styled components | **Custom on top of Radix** (shadcn/ui pattern) | Copy-paste ownership model. We own every component file; no version-lock to a library's opinions. |
| Icons | **Lucide React** | Already using Lucide-compatible SVGs in `icons.ts`. Direct drop-in with `lucide-react` package. |

### Why Radix + custom styling (not full shadcn/ui install)

shadcn/ui is a code generator that produces Radix-based components with Tailwind styling. We want the *pattern* (own the component files, compose Radix primitives) but with our *existing design system* (CSS custom properties, glass morphism, accent palette). Installing shadcn/ui CLI and adapting its output would fight our tokens. Instead:

1. Use Radix primitives directly (`@radix-ui/react-popover`, `@radix-ui/react-dialog`, etc.)
2. Style them with our CSS custom properties
3. Export from a `ui/src/components/ui/` directory (shadcn convention)
4. Each component is a single file we fully control

### Radix packages to install

```
@radix-ui/react-popover          # Dropdowns, session navigator
@radix-ui/react-dialog            # Modals, confirm dialogs, wizards
@radix-ui/react-tooltip           # Replace title="" attributes
@radix-ui/react-select            # Voice select, form selects
@radix-ui/react-dropdown-menu     # Context menus, action menus
@radix-ui/react-tabs              # Nav tabs, config sections, view modes
@radix-ui/react-collapsible       # Expandable sections, nav groups
@radix-ui/react-toggle            # Theme toggle, boolean switches
@radix-ui/react-toggle-group      # Filter chips, view mode switcher
@radix-ui/react-scroll-area       # Custom scrollbars (chat thread, logs)
@radix-ui/react-separator          # Visual separators
@radix-ui/react-switch             # Config toggles
@radix-ui/react-checkbox           # Config checkboxes
@radix-ui/react-radio-group        # Config radio groups
@radix-ui/react-slider             # Config sliders
@radix-ui/react-progress           # Progress bars
@radix-ui/react-avatar             # Agent/user avatars
@radix-ui/react-badge              # Status badges (via custom)
@radix-ui/react-toast              # Toast notifications
@radix-ui/react-alert-dialog       # Dangerous confirm dialogs
@radix-ui/react-visually-hidden    # Accessibility helper
```

---

## 4. Styling Approach

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Primary styling | **CSS Modules + CSS custom properties** | Scoped styles, no runtime cost, preserves existing design token system. |
| Design tokens | **Keep existing `:root` custom properties** | `--accent`, `--panel`, `--border`, `--text`, etc. already define the full palette. No reason to rewrite. |
| Utility classes | **Tailwind CSS v4** (already imported in design-system.css) | Already present via `@import "tailwindcss"`. Use sparingly for layout utilities (`flex`, `gap-*`, `p-*`). Component-specific styles stay in CSS Modules. |
| Glass morphism | **Shared CSS class + CSS Module compose** | Extract `.glass`, `.glass-strong` as composable base classes. |
| Dark/Light theme | **CSS custom properties + `data-theme` attribute** | Already works this way. React reads `data-theme` from `<html>`. No change. |

### CSS Module Convention

```
ui/src/components/ui/Button/
  Button.tsx
  Button.module.css

ui/src/views/Chat/
  Chat.tsx
  Chat.module.css
```

Each component owns its styles. Global tokens (`--accent`, `--border`, etc.) are referenced inside modules via `var()`. No global CSS class dependencies beyond the design system tokens.

### Tailwind Usage Rules

- **Use for**: Layout utilities (`flex`, `grid`, `gap-*`, `p-*`, `m-*`, `w-*`, `h-*`, `overflow-*`), responsive breakpoints (`md:`, `lg:`).
- **Do NOT use for**: Colors, borders, shadows, border-radius, typography, animations. These come from CSS custom properties to maintain theme consistency.
- Rationale: Tailwind handles the boring layout plumbing. Our design tokens handle the visual identity.

---

## 5. State Management

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Global state | **Zustand** | Minimal API, no boilerplate, supports slices pattern for splitting the current monolithic `AppViewState`. Works outside React tree (gateway event handlers). |
| Server state | **TanStack Query (React Query) v5** | Replaces manual `loading`/`error`/`data` triples, polling intervals, and cache invalidation. Built-in stale-while-revalidate, retry, and optimistic updates. |
| Local UI state | **React `useState` / `useReducer`** | For component-scoped state (form drafts, dropdown open, expanded sections). |
| Form state | **React Hook Form + Zod** | Config editor, cron form, automation form, channel wizard all have complex validation. RHF handles dirty detection, validation, and submission. Zod provides schema-based validation (can reuse JSON schema from config). |

### Zustand Store Architecture

The current `AppViewState` has ~441 fields in a single LitElement class. Split into domain slices:

```
stores/
  useConnectionStore.ts    # connected, hello, client, lastError
  useChatStore.ts          # messages, stream, draft, attachments, queue, audio/TTS
  useSessionStore.ts       # sessionsResult, filters, sort, viewMode, navigator state
  useConfigStore.ts        # configRaw, configForm, schema, dirty detection
  useChannelStore.ts       # channelsSnapshot, whatsapp/nostr state, wizard
  useCronStore.ts          # cronJobs, cronStatus, cronForm
  useAutomationStore.ts    # automations, form, progress modal, run history
  useOverseerStore.ts      # overseerStatus, goals, viewport, simulator
  useLogStore.ts           # entries, cursor, filters, presets
  useUIStore.ts            # tab, theme, onboarding, settings, commandPalette
  useAgentStore.ts         # agentsList, selected agent, identity
  useDebugStore.ts         # status, health, models, heartbeat
```

Each slice exports a hook (`useChatStore()`) and can also be accessed imperatively (`useChatStore.getState()`) from gateway event handlers outside the React tree.

### TanStack Query Usage

Replace the current polling pattern (`setInterval` + manual state) with React Query:

```tsx
// Before (Lit)
startLogsPolling() {
  this._logsInterval = setInterval(() => loadLogs(this), 2000);
}

// After (React Query)
const { data, error, isLoading } = useQuery({
  queryKey: ['logs', filters],
  queryFn: () => gateway.request('logs.poll', { cursor, limit, filters }),
  refetchInterval: 2000,
  enabled: tab === 'logs',
});
```

Queries to migrate:
- `sessions.list` → `useSessionsQuery()`
- `chat.history` → `useChatHistoryQuery(sessionKey)`
- `config.get` → `useConfigQuery()`
- `config.schema` → `useConfigSchemaQuery()`
- `channels.status` → `useChannelsQuery()`
- `cron.jobs` + `cron.status` → `useCronQuery()`
- `logs.poll` → `useLogsQuery(cursor, filters)`
- `debug.status` + `debug.health` → `useDebugQuery()`
- `agents.list` → `useAgentsQuery()`
- `skills.status` → `useSkillsQuery()`
- `overseer.status` → `useOverseerQuery()`
- `automations.list` → `useAutomationsQuery()`

Mutations (write operations) use `useMutation()`:
- `chat.send` → `useSendChatMutation()`
- `config.set` → `useSaveConfigMutation()`
- `sessions.delete` → `useDeleteSessionMutation()`
- `cron.add` / `cron.toggle` / `cron.run` → `useCronMutations()`
- etc.

---

## 6. Gateway Integration

| Decision | Choice | Rationale |
|----------|--------|-----------|
| WebSocket client | **Keep `GatewayBrowserClient`** | Well-tested, handles reconnection, SSE/WS switching. No reason to rewrite. |
| React integration | **Custom hook + Zustand** | `useGateway()` hook initializes client, stores connection state in Zustand, dispatches events to appropriate stores. |
| SSE event handling | **Zustand actions called from event handler** | Gateway events (chat stream, agent lifecycle, presence) update Zustand stores directly. React components subscribe to slices. |

### Gateway Hook Pattern

```tsx
// hooks/useGateway.ts
export function useGateway() {
  const setConnected = useConnectionStore(s => s.setConnected);
  const handleChatEvent = useChatStore(s => s.handleEvent);
  // ...

  useEffect(() => {
    const client = new GatewayBrowserClient({
      onHello: (hello) => { setConnected(true); /* load initial data */ },
      onClose: () => setConnected(false),
      onEvent: (evt) => {
        switch (evt.type) {
          case 'chat': handleChatEvent(evt); break;
          case 'agent': handleAgentEvent(evt); break;
          // ...
        }
      },
    });
    return () => client.disconnect();
  }, [gatewayUrl]);
}
```

---

## 7. Routing

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Router | **Hash-based routing (keep current)** | The app uses `#/chat`, `#/config`, etc. No server-side routing needed. |
| Implementation | **Zustand `tab` field + URL sync** | The current approach works. React components read `tab` from `useUIStore()`. A `useHashSync()` hook keeps URL and store in sync. |

### Why not React Router

The app is a single-page dashboard with tab navigation, not a multi-page app with nested routes, params, or loaders. React Router would add complexity for no benefit. The current hash-based tab system is simpler and already works.

If the app grows to need deep linking (e.g., `/sessions/:id`, `/config/:section`), React Router can be added later without disrupting the architecture.

---

## 8. Testing

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Test runner | **Vitest** (keep) | Already configured with V8 coverage. |
| Component testing | **React Testing Library** | Standard for React. Tests behavior, not implementation. |
| Hook testing | **`renderHook` from RTL** | For testing custom hooks (stores, queries). |
| E2E | **Existing e2e setup** | No change needed. |

### Migration Testing Strategy

Each migrated component gets a corresponding `.test.tsx` file. Existing `.test.ts` files for utilities (format, session-grouping, fuzzy-search) are unchanged since they have no framework dependency.

---

## 9. Code Organization

```
ui/src/
  components/
    ui/                    # Shared primitives (Button, Card, Popover, etc.)
    session-navigator/     # Session navigator composite component
    command-palette/       # Command palette composite component
    toast/                 # Toast notification system
    chat/                  # Chat-specific components (MessageGroup, Composer, etc.)
  views/                   # Page-level views (Chat, Config, Sessions, etc.)
  hooks/                   # Custom hooks (useGateway, useScrollAnchor, etc.)
  stores/                  # Zustand stores (one per domain)
  lib/                     # Non-React utilities (format, session-grouping, gateway client)
  types/                   # TypeScript type definitions
  styles/                  # Global CSS (design-system.css, base.css, tokens)
  App.tsx                  # Root component
  main.tsx                 # Entry point (createRoot)
```

### Key Conventions

- **One component per file**. Default export is the component. Named exports for types/sub-components.
- **Colocated styles**: `Component.module.css` next to `Component.tsx`.
- **Colocated tests**: `Component.test.tsx` next to `Component.tsx`.
- **Hooks prefix**: All custom hooks start with `use` (enforced by React rules-of-hooks lint).
- **Store naming**: `use[Domain]Store` (e.g., `useChatStore`, `useSessionStore`).

---

## 10. Coexistence Strategy (During Migration)

During the transition period, Lit and React will coexist:

| Approach | Detail |
|----------|--------|
| **Rendering boundary** | The Lit `ClawdbrainApp` element remains the root. Each migrated view is wrapped in a React root mounted into a Lit-rendered `<div>`. |
| **State bridge** | Zustand stores are initialized from the existing `AppViewState`. During coexistence, a bidirectional sync layer keeps both in sync. |
| **Gateway sharing** | The `GatewayBrowserClient` instance is shared. Lit handlers and React event handlers both update Zustand stores. |
| **CSS sharing** | Global CSS (design-system.css, base.css) is shared. New React components use CSS Modules that reference the same custom properties. |
| **Removal** | Once all views are migrated, the Lit root, `app.ts`, and all `app-*.ts` files are deleted. The React `App.tsx` becomes the sole root. |

### Mounting Pattern

```tsx
// Bridge: mount a React view inside a Lit template
import { createRoot } from 'react-dom/client';

// In Lit render():
html`<div id="react-logs-view"></div>`;

// After render, mount React:
const container = this.shadowRoot?.getElementById('react-logs-view');
if (container && !container._reactRoot) {
  container._reactRoot = createRoot(container);
  container._reactRoot.render(<LogsView />);
}
```

This is ugly but temporary. Each view migrates independently. Once all views are React, the Lit shell is replaced with a React root.

---

## 11. Lint & Formatting

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Linter | **ESLint + eslint-plugin-react-hooks** | React hooks rules are critical. Add `@typescript-eslint` recommended. |
| Formatter | **Keep oxfmt** if it handles JSX; otherwise add **Prettier** for `.tsx` files. |
| Import sorting | **eslint-plugin-simple-import-sort** | Consistent import ordering. |

Existing `oxlint` rules continue to apply to non-React code during coexistence.

---

## 12. Accessibility

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Focus management | **Radix built-in** | Radix primitives handle focus trapping, return focus, and keyboard navigation. |
| ARIA labels | **Explicit on all interactive elements** | Continue existing practice. Radix adds most automatically. |
| Keyboard navigation | **Radix + custom hooks** | Command palette, session navigator, and form navigation use keyboard shortcuts. Radix handles arrow-key navigation within dropdowns/menus. |
| Screen reader | **Semantic HTML + Radix** | Use `<main>`, `<nav>`, `<section>`, `<article>`, `<aside>`. Radix adds `role`, `aria-expanded`, `aria-selected`, etc. |

---

## Decisions NOT Made Here

These are deferred until implementation reveals the right answer:

- **Virtualized lists**: If session lists or log entries become slow, add `@tanstack/react-virtual`. Not needed upfront.
- **Animation library**: CSS animations + transitions cover current needs. Framer Motion is an option if complex orchestrated animations are needed later.
- **i18n**: Not currently needed. If added, use `react-intl` or `next-intl`.
- **Monorepo structure**: The UI is a single package. If it grows, consider splitting `components/ui/` into a shared package. Not needed now.

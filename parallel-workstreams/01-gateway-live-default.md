# Workstream A: Make live gateway the default (invert DEV-only mock gating)

## Executive summary

The web app currently defaults to mock data in production because nearly every gateway-backed hook gates on `import.meta.env.DEV && useLiveGateway`. This makes production builds non-functional unless the developer flag is set. The fix is to invert the default so **gateway is the primary data source** and mock data is only used when the developer explicitly opts into mock mode. This should be a mechanical update across hooks, plus a small adjustment to the gateway enablement logic in the root layout/provider. Focus on low-risk, consistent behavior across all hooks.

## Problem statement

- Production builds currently do **not** hit the gateway for core views (agents, conversations, nodes, agent status, mutations, etc.).
- The `liveMode` boolean is defined as `(import.meta.env?.DEV ?? false) && useLiveGateway`, which is false in production and makes hooks fall back to mocked responses.
- The root layout enables the gateway auth guard only in production or when `useLiveGateway` is true in dev, but it still ties connection to the same dev-only gate.

## Target outcome

- In production, live gateway data is used by default.
- In dev, mocks are used **only** when the developer explicitly opts into mock mode.
- Gateway auth guard + stream handling respect the same single “gateway enabled” switch used across hooks.

## Key references

- **Root gateway enablement**: `apps/web/src/routes/__root.tsx` currently computes `gatewayEnabled` as `!isDev || useLiveGateway`. This is almost correct and can be leveraged as the single source of truth if you align hook gating with it.【F:apps/web/src/routes/\_\_root.tsx†L18-L48】
- **App gateway provider**: `apps/web/src/main.tsx` currently enables the GatewayProvider auto-connect only when `liveMode` is true (dev & enabled) or when URL token/password is set. This is likely too strict if production should auto-connect by default.【F:apps/web/src/main.tsx†L36-L60】
- **Hook gating patterns to update**:
  - `apps/web/src/hooks/queries/useAgents.ts` (multiple `liveMode` usages).【F:apps/web/src/hooks/queries/useAgents.ts†L134-L215】
  - `apps/web/src/hooks/queries/useConversations.ts`.【F:apps/web/src/hooks/queries/useConversations.ts†L120-L240】
  - `apps/web/src/hooks/queries/useNodes.ts`.【F:apps/web/src/hooks/queries/useNodes.ts†L89-L182】
  - `apps/web/src/hooks/queries/useAgentStatus.ts`.【F:apps/web/src/hooks/queries/useAgentStatus.ts†L31-L76】
  - `apps/web/src/hooks/mutations/useAgentMutations.ts`.【F:apps/web/src/hooks/mutations/useAgentMutations.ts†L86-L205】
  - `apps/web/src/hooks/mutations/useConversationMutations.ts` (uses `useLiveMode()` helper).【F:apps/web/src/hooks/mutations/useConversationMutations.ts†L86-L151】

## Scope & rationale

### Must change

1. **Define a shared gateway-enabled flag** that defaults to true in production, and in dev it should use the user’s UI toggle (e.g. `useLiveGateway`) unless a “force mock” flag is explicitly set.
2. **Update each hook** to use the shared flag rather than hard-coded `import.meta.env.DEV` checks.
3. **Ensure GatewayProvider auto-connect** reflects the shared flag so it connects in production by default.
4. **Keep mock fallbacks** for offline use, but only when explicitly selected in dev.

### Should not change

- The actual API adapters or mock data shape. Keep behavior consistent with current mock output.
- Gateway RPC semantics (only the gating logic needs changing here).

## Proposed implementation sketch

> **Goal:** Replace `liveMode = import.meta.env.DEV && useLiveGateway` with a centralized “gateway enabled” flag that is true in production by default.

### Example pattern (conceptual)

```ts
// central helper in store or a hook
const isDev = import.meta.env?.DEV ?? false;
const useLiveGateway = useUIStore((s) => s.useLiveGateway);
const gatewayEnabled = !isDev || useLiveGateway;

// optional: add a new UI flag for mock mode
const mockMode = isDev && !useLiveGateway;
```

Then replace existing hook logic with:

```ts
const gatewayEnabled = useGatewayEnabled();
const modeKey = gatewayEnabled ? "live" : "mock";
```

**Where to put it:**

- If you create a helper hook (e.g., `useGatewayEnabled()`), place it in a shared area like `apps/web/src/hooks/` or `apps/web/src/stores/` and use it across all query/mutation hooks to avoid drift.

## Specific file-by-file checklist

- `apps/web/src/main.tsx`: remove the dev-only gate from `autoConnect` if appropriate; it should connect when `gatewayEnabled` is true (likely always in production).【F:apps/web/src/main.tsx†L36-L60】
- `apps/web/src/routes/__root.tsx`: keep or re-use existing `gatewayEnabled` computed value; ensure this matches new hook behavior.【F:apps/web/src/routes/\_\_root.tsx†L18-L48】
- `apps/web/src/hooks/queries/useAgents.ts`: update each `liveMode` check and `modeKey` usage to use the shared gateway-enabled flag.【F:apps/web/src/hooks/queries/useAgents.ts†L134-L215】
- `apps/web/src/hooks/queries/useConversations.ts`: update `liveMode` and mode keys across conversations and messages.【F:apps/web/src/hooks/queries/useConversations.ts†L120-L240】
- `apps/web/src/hooks/queries/useNodes.ts`: update gating for nodes, devices, exec approvals.【F:apps/web/src/hooks/queries/useNodes.ts†L89-L182】
- `apps/web/src/hooks/queries/useAgentStatus.ts`: update `liveMode` (used by `getAgentStatus`).【F:apps/web/src/hooks/queries/useAgentStatus.ts†L31-L76】
- `apps/web/src/hooks/mutations/useAgentMutations.ts`: update `liveMode` + `listKey` usage to follow gateway enabled flag.【F:apps/web/src/hooks/mutations/useAgentMutations.ts†L86-L205】
- `apps/web/src/hooks/mutations/useConversationMutations.ts`: update `useLiveMode()` helper to match new behavior (i.e., live by default in prod).【F:apps/web/src/hooks/mutations/useConversationMutations.ts†L86-L151】

## Validation ideas

- **Smoke check**: With `import.meta.env.DEV = false`, verify `useAgents` and `useConversations` attempt to call gateway RPCs instead of mock data.
- **Dev mock mode**: With `useLiveGateway=false` (if that flag is meant to select mocks), ensure hooks still return mock data.

## Non-goals

- Replacing mock data content.
- Re-architecting gateway reconnection or adding new features.

## Notes for the agent

- Keep changes mechanical and consistent across hooks.
- Avoid changing API adapter behavior; the only change is how you decide live vs mock.
- If you add a new helper hook or store selector, use it everywhere to avoid “one-off” gating behavior.

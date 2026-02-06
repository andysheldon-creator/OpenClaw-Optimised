# Workstream B: Gateway URL + auth persistence + URL cleanup

## Executive summary

The web UI currently hardcodes the gateway WebSocket URL and reads auth tokens from query params without persisting them or removing them from the browser URL. This prevents non-local deployments and leaves sensitive tokens in the URL bar/history. This workstream should **persist gateway URL + auth**, allow a settings form to edit them, and **strip credentials** from the URL after first load.

## Problem statement

- `useGatewayUrl()` always returns `ws://127.0.0.1:18789`, so non-local gateways cannot be configured without code changes.【F:apps/web/src/hooks/useGatewayConnection.ts†L233-L260】
- `main.tsx` parses `token` and `password` from URL params, but does not persist or sanitize the URL, leaving secrets visible in history and copy/paste operations.【F:apps/web/src/main.tsx†L36-L60】
- There are existing shells for auth and config (e.g. `GatewayAuthGuard`, `GatewayAuthModal`, `GatewayConfigConnected`), but wiring and persistence are incomplete.

## Target outcome

- Gateway URL can be set and stored (e.g., in `localStorage`) with a sane default fallback.
- Auth credentials from the query string are persisted if provided once, then stripped from the URL.
- All subsequent app sessions use the persisted settings unless overridden.

## Key references

- `useGatewayConnection.ts` includes `useGatewayUrl()` which currently hardcodes the URL.【F:apps/web/src/hooks/useGatewayConnection.ts†L233-L260】
- `main.tsx` contains `getGatewayAuthFromUrl()` and uses the values to initialize `GatewayProvider`. It currently leaves query params intact.【F:apps/web/src/main.tsx†L36-L60】
- `GatewayAuthGuard` is already used in `__root.tsx` and could benefit from a consistent “gateway enabled” policy once URL + auth are persisted.【F:apps/web/src/routes/\_\_root.tsx†L18-L48】

## Scope & rationale

### Must change

1. **Persist gateway URL**: Update `useGatewayUrl()` to read from `localStorage` first, with `ws://127.0.0.1:18789` as fallback.
2. **Persist auth tokens**: When `token` or `password` is present in URL query params, save them (e.g., in `localStorage`) and clear them from the URL.
3. **Clean URL**: Use `history.replaceState` to remove `token`, `password`, and possibly `gatewayUrl` from the query string after persistence.
4. **Wire settings UI**: Update the gateway settings form (likely `GatewayConfigConnected.tsx`) to read/write URL and auth values from storage.

### Should not change

- Gateway RPC contract or auth flow semantics.
- The existing GatewayProvider and `useGatewayConnection` API; only integrate persisted values.

## Proposed implementation sketch

### 1) Define storage helpers (conceptual)

```ts
const STORAGE_KEYS = {
  gatewayUrl: "openclaw.gatewayUrl",
  gatewayToken: "openclaw.gatewayToken",
  gatewayPassword: "openclaw.gatewayPassword",
};

function loadStoredGatewayConfig() {
  return {
    gatewayUrl: localStorage.getItem(STORAGE_KEYS.gatewayUrl) ?? "ws://127.0.0.1:18789",
    token: localStorage.getItem(STORAGE_KEYS.gatewayToken) ?? undefined,
    password: localStorage.getItem(STORAGE_KEYS.gatewayPassword) ?? undefined,
  };
}
```

### 2) Sanitize URL after first load

```ts
const params = new URLSearchParams(window.location.search);
const token = params.get("token");
const password = params.get("password");
const gatewayUrl = params.get("gatewayUrl");

if (token || password || gatewayUrl) {
  // persist to storage
  // ...
  params.delete("token");
  params.delete("password");
  params.delete("gatewayUrl");
  window.history.replaceState({}, document.title, `${window.location.pathname}?${params}`);
}
```

### 3) Use persisted values to init GatewayProvider

- In `main.tsx`, load from storage first, then apply any URL overrides, and pass them into `GatewayProvider`.

### 4) Update `useGatewayUrl()`

- Replace hardcoded URL return with stored value + fallback.

## Specific file-by-file checklist

- `apps/web/src/hooks/useGatewayConnection.ts`: update `useGatewayUrl()` to read from storage (with default fallback).【F:apps/web/src/hooks/useGatewayConnection.ts†L233-L260】
- `apps/web/src/main.tsx`: persist URL+auth from query params, strip from URL, and pass stored values into `GatewayProvider`.【F:apps/web/src/main.tsx†L36-L60】
- `apps/web/src/routes/__root.tsx`: ensure `GatewayAuthGuard` still wraps the app and uses the final settings consistently.【F:apps/web/src/routes/\_\_root.tsx†L18-L48】
- `apps/web/src/components/.../GatewayConfigConnected.tsx` (if present): wire UI inputs to storage (confirm actual location when implementing).

## Validation ideas

- Load with `?gatewayUrl=ws://example:18789&token=abc`: confirm storage is updated and URL is cleaned.
- Reload without query params: confirm the app connects using stored values.

## Notes for the agent

- Avoid adding new dependencies; `localStorage` and built-in URL APIs are sufficient.
- Keep any storage key names consistent and centralized to avoid typos.
- If you add a small helper module for storage, keep it simple and scoped to gateway config.

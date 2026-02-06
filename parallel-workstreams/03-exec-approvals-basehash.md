# Workstream C: Fix exec approvals `baseHash` parameter

## Executive summary

The web UI sends the wrong parameter name when updating exec approvals. The gateway expects `baseHash`, but the UI sends `hash`, which causes `exec.approvals.set` to fail silently. This is a simple, high-impact fix that should be a one-line change in the API adapter.

## Problem statement

- The RPCs `exec.approvals.set` and `exec.approvals.node.set` expect `{ file, baseHash }`.
- The web adapter sends `{ file, hash }`, which doesn’t match the server contract and breaks approvals updates.

## Target outcome

- Replace `hash` with `baseHash` in both gateway RPC calls.

## Key reference

- `apps/web/src/lib/api/nodes.ts` contains the `setExecApprovals` adapter that currently uses `hash` in the request payload.【F:apps/web/src/lib/api/nodes.ts†L149-L197】

## Scope & rationale

### Must change

- In `setExecApprovals`, rename the payload property from `hash` to `baseHash` for both gateway and node variants.

### Should not change

- The external signature of `setExecApprovals` (the function can still accept a `hash` argument in its own signature if you don’t want to change callers).
- Any unrelated device or node APIs.

## Proposed implementation sketch

```ts
return client.request("exec.approvals.node.set", {
  nodeId,
  file,
  baseHash: hash,
});

return client.request("exec.approvals.set", { file, baseHash: hash });
```

## Validation ideas

- Run a UI flow that updates exec approvals and verify the gateway accepts the request (no RPC error).

## Notes for the agent

- Keep the change minimal and scoped to the adapter.
- If you adjust the function signature to `baseHash`, update any call sites accordingly; otherwise mapping `hash` → `baseHash` is sufficient.

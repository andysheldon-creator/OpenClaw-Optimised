# Node auth + pairing protocol fields (draft)

Goal: **write down the exact wire fields** we expect for node/operator connections and device-bound auth/pairing.

This is intentionally a _draft_ that makes ambiguities explicit, so we can quickly converge on a single, testable schema.

Related background:

- `docs/refactor/clawnet.md#unified-authentication--pairing`

---

## Terminology

- **Gateway**: OpenClaw gateway.
- **Client**: any connecting device (node runtime, operator UI, CLI, etc.).
- **Role**: per-connection role (e.g. `node` vs `operator`).
- **Device identity**: stable identity derived from a device public key (preferred).
- **Pairing**: operator approval that results in credentials issuance.

---

## High-level phases

1. **Unauthenticated connect**

- Client connects to gateway.
- Client presents a minimal `clientHello` (identity + desired role + capabilities).

2. **Authentication**

- If the client already has credentials:
  - prove possession (device key signature) and/or present an issued token.
- Otherwise:
  - gateway creates a pairing request for `deviceId`.

3. **Pairing approval**

- Operator approves/denies.
- Gateway issues credentials bound to device key + role/scope.

4. **Authenticated reconnect (or upgrade)**

- Client connects again with credentials.

---

## Proposed message shapes

### 1) Connection metadata (transport)

**TBD:** WS vs HTTP+SSE vs gRPC. This doc assumes a WS-like message envelope.

Envelope (example):

```json
{
  "type": "connect",
  "id": "c_01J...",
  "ts": "2026-02-06T17:45:00.000Z",
  "payload": {}
}
```

Notes:

- `id` enables request/response correlation.
- `ts` is optional but useful for debug.

### 2) `connect.hello`

Sent by client immediately on connect.

```json
{
  "type": "connect.hello",
  "payload": {
    "device": {
      "deviceId": "dev_...",
      "displayName": "Deano’s Mac mini",
      "platform": "darwin",
      "app": "openclaw-node",
      "version": "x.y.z"
    },
    "role": "node",
    "scope": ["node.invoke"],
    "caps": {
      "supportsDeviceAuth": true,
      "supportsBearer": false
    },
    "commands": ["screen.record", "camera.snap"]
  }
}
```

**Open questions (need confirmation):**

- Do we want `scope` and `commands` on the wire at connect time, or only after auth?
- Is `commands` client-declared, server-declared, or an intersection?

### 3) `connect.auth` (client → gateway)

Two variants are likely needed during transitions:

#### A) Device-bound auth (preferred)

Gateway challenges, client signs.

Challenge:

```json
{
  "type": "connect.challenge",
  "payload": {
    "nonce": "base64...",
    "alg": "ed25519"
  }
}
```

Response:

```json
{
  "type": "connect.auth",
  "payload": {
    "kind": "device",
    "deviceId": "dev_...",
    "publicKey": "base64...",
    "nonce": "base64...",
    "signature": "base64...",
    "role": "node"
  }
}
```

#### B) Bearer token (temporary/compat)

```json
{
  "type": "connect.auth",
  "payload": {
    "kind": "bearer",
    "token": "...",
    "role": "node"
  }
}
```

**Open questions:**

- Should `role` be _bound inside_ the token/attestation only (and omitted from the auth message)?
- Do we want `connect.auth` to allow role switching, or require a new connection per role?

### 4) Pairing request + approval

If auth fails / no credentials:

```json
{
  "type": "pairing.requested",
  "payload": {
    "pairingId": "pair_...",
    "deviceId": "dev_...",
    "displayName": "Deano’s Mac mini",
    "requestedRole": "node",
    "requestedScope": ["node.invoke"],
    "requestedCommands": ["screen.record", "camera.snap"],
    "createdAt": "2026-02-06T17:45:00.000Z"
  }
}
```

Operator approves:

```json
{
  "type": "pairing.approve",
  "payload": {
    "pairingId": "pair_...",
    "grantedRole": "node",
    "grantedScope": ["node.invoke"],
    "grantedCommands": ["screen.record", "camera.snap"],
    "expiresAt": null
  }
}
```

Gateway issues credentials:

```json
{
  "type": "pairing.issued",
  "payload": {
    "pairingId": "pair_...",
    "credential": {
      "kind": "deviceToken",
      "token": "...",
      "boundToDeviceId": "dev_...",
      "boundToPublicKey": "base64...",
      "role": "node",
      "scope": ["node.invoke"],
      "commands": ["screen.record", "camera.snap"],
      "issuedAt": "2026-02-06T17:46:00.000Z"
    }
  }
}
```

**Open questions:**

- Are `pairing.*` messages part of the same transport, or separate REST endpoints?
- What is the persistence format on device? (We already have `device-auth.json` in some places.)

---

## Minimal acceptance criteria

- One canonical list of fields for:
  - client identity
  - device-bound auth challenge/response
  - pairing requested/approve/deny/issued
- At least one end-to-end example (node) and one (operator).

---

## Next step

- Confirm the exact field names + where they live today in code.
- Update this doc to remove ambiguity and add references to implementation locations.

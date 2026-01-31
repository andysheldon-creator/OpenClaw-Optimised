# OpenBotAuth (OBA) Publisher Verification

OpenClaw supports optional publisher identity verification for plugins and skills using the [OpenBotAuth](https://github.com/openbotauth/openbotauth) specification. Publishers can cryptographically sign their plugin manifests and skill metadata, allowing users to verify authenticity.

## How It Works

Publishers register Ed25519 key pairs and host JWKS (JSON Web Key Set) endpoints (e.g. on the OpenBotAuth registry or any HTTPS endpoint). When a plugin or skill includes an `oba` block, OpenClaw can fetch the publisher's public key from the JWKS URL and verify the signature locally.

### Verification Flow

1. Plugin/skill includes an `oba` block with publisher identity and signature
2. By default, OpenClaw classifies the block **offline** (no network required)
3. When `--verify` is passed, OpenClaw fetches the publisher's JWKS from the `owner` URL
4. The Ed25519 signature is verified locally using Node.js `crypto.verify()`

## Status Model

| Status     | Meaning                                                            | When                                                                                 |
| ---------- | ------------------------------------------------------------------ | ------------------------------------------------------------------------------------ |
| `unsigned` | No `oba` block present                                             | Default for plugins/skills without publisher identity                                |
| `signed`   | `oba` block has valid fields including signature, not yet verified | Offline parse only (default CLI behavior)                                            |
| `verified` | Signature verified against publisher's JWKS                        | Only with `--verify` flag (requires network)                                         |
| `invalid`  | Malformed `oba` block or verification failed                       | Offline (malformed) or `--verify` (signature mismatch, key not found, fetch failure) |

## OBA Block Format

The `oba` block is a JSON object with the following fields:

```json
{
  "owner": "https://api.openbotauth.org/jwks/hammadtq.json",
  "kid": "key-id-from-registry",
  "alg": "EdDSA",
  "sig": "base64url-encoded-ed25519-signature"
}
```

- **owner**: JWKS URL for the publisher (may be hosted on the OpenBotAuth registry or any HTTPS JWKS endpoint)
- **kid**: Key ID matching a key in the JWKS
- **alg**: Algorithm, must be `EdDSA` (Ed25519)
- **sig**: Base64url-encoded Ed25519 signature over the canonicalized container

## Plugin Verification

For plugins, the `oba` block is placed at the root of `openclaw.plugin.json`, as a sibling to `id` and `configSchema`:

```json
{
  "id": "my-plugin",
  "configSchema": { ... },
  "oba": {
    "owner": "https://api.openbotauth.org/jwks/example-publisher.json",
    "kid": "my-key-id",
    "alg": "EdDSA",
    "sig": "..."
  }
}
```

### CLI Usage

```bash
# List plugins (offline - shows signed/unsigned status)
openclaw plugins list

# List plugins with verification (fetches JWKS, verifies signatures)
openclaw plugins list --verify

# Show plugin details with verification
openclaw plugins info my-plugin --verify

# JSON output includes oba and obaVerification fields
openclaw plugins list --json --verify
```

## Skill Verification

For skills, the `oba` block is placed at the root of the JSON5 metadata object in the SKILL.md frontmatter, as a sibling to the `openclaw` key:

```markdown
---
metadata:
  {
    openclaw: { emoji: "...", requires: { ... } },
    oba:
      {
        owner: "https://api.openbotauth.org/jwks/example-publisher.json",
        kid: "my-key-id",
        alg: "EdDSA",
        sig: "...",
      },
  }
---
```

### CLI Usage

```bash
# List skills (offline - shows signed/unsigned status)
openclaw skills list

# List skills with verification
openclaw skills list --verify

# Show skill details with verification
openclaw skills info my-skill --verify

# JSON output includes oba and obaVerification fields
openclaw skills list --json --verify
```

## Signing Process

The signature covers the entire container (plugin manifest JSON or skill metadata JSON5 object) with only the `sig` field removed from the `oba` block. The `owner`, `kid`, and `alg` fields remain in the signed payload, binding the publisher identity to the content.

### Canonicalization

Before signing, the container is canonicalized using deterministic JSON serialization:

- Object keys are sorted alphabetically
- No whitespace
- The `oba.sig` field is removed (but `oba.owner`, `oba.kid`, `oba.alg` remain)

## Security Notes

- Default CLI commands are fully **offline** and never make network requests
- The `--verify` flag is the only path that triggers network access (JWKS fetch)
- JWKS responses are cached in-memory per `owner` URL to avoid redundant fetches
- Fetch requests have a 3-second timeout via `AbortController`
- Only Ed25519 (`EdDSA`) signatures are supported
- Verification is **display-only** and does not affect plugin/skill loading behavior

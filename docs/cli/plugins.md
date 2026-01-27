---
summary: "CLI reference for `clawdbrain plugins` (list, install, enable/disable, doctor)"
read_when:
  - You want to install or manage in-process Gateway plugins
  - You want to debug plugin load failures
---

# `clawdbrain plugins`

Manage Gateway plugins/extensions (loaded in-process).

Related:
- Plugin system: [Plugins](/plugin)
- Plugin manifest + schema: [Plugin manifest](/plugins/manifest)
- Security hardening: [Security](/gateway/security)

## Commands

```bash
clawdbrain plugins list
clawdbrain plugins info <id>
clawdbrain plugins enable <id>
clawdbrain plugins disable <id>
clawdbrain plugins doctor
clawdbrain plugins update <id>
clawdbrain plugins update --all
```

Bundled plugins ship with Clawdbrain but start disabled. Use `plugins enable` to
activate them.

All plugins must ship a `clawdbrain.plugin.json` file with an inline JSON Schema
(`configSchema`, even if empty). Missing/invalid manifests or schemas prevent
the plugin from loading and fail config validation.

### Install

```bash
clawdbrain plugins install <path-or-spec>
```

Security note: treat plugin installs like running code. Prefer pinned versions.

Supported archives: `.zip`, `.tgz`, `.tar.gz`, `.tar`.

Use `--link` to avoid copying a local directory (adds to `plugins.load.paths`):

```bash
clawdbrain plugins install -l ./my-plugin
```

### Update

```bash
clawdbrain plugins update <id>
clawdbrain plugins update --all
clawdbrain plugins update <id> --dry-run
```

Updates only apply to plugins installed from npm (tracked in `plugins.installs`).

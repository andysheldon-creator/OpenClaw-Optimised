# Security Audit

Restricts access to sensitive credential and configuration files.

## What this does

This guardrail plugin intercepts file access tool calls (`read`, `write`, `edit`, `exec`, `find`, `grep`) and blocks operations targeting sensitive paths like SSH keys, cloud credentials, and API tokens.

## Built-in rules

### Credential files

| Rule ID              | Description                 | Protected paths                                                                                | Operations  |
| -------------------- | --------------------------- | ---------------------------------------------------------------------------------------------- | ----------- |
| `ssh-keys`           | SSH private keys and config | `~/.ssh/id_*`, `~/.ssh/*_key`, `~/.ssh/config`, `~/.ssh/known_hosts`, `~/.ssh/authorized_keys` | read, write |
| `gpg-keys`           | GPG private keys            | `~/.gnupg/private-keys-v1.d/*`, `~/.gnupg/secring.gpg`                                         | read, write |
| `aws-credentials`    | AWS credentials             | `~/.aws/credentials`, `~/.aws/config`                                                          | read, write |
| `gcloud-credentials` | Google Cloud credentials    | `~/.config/gcloud/credentials.db`, `~/.config/gcloud/application_default_credentials.json`     | read, write |
| `azure-credentials`  | Azure credentials           | `~/.azure/credentials`, `~/.azure/accessTokens.json`                                           | read, write |
| `kube-config`        | Kubernetes config           | `~/.kube/config`, `~/.kube/credentials/*`                                                      | read, write |
| `docker-config`      | Docker auth                 | `~/.docker/config.json`                                                                        | read, write |

### AI assistant credentials

| Rule ID                | Description    | Protected paths                                       | Operations  |
| ---------------------- | -------------- | ----------------------------------------------------- | ----------- |
| `claude-credentials`   | Claude Code    | `~/.claude/*`, `~/.claude.json`, `~/.config/claude/*` | read, write |
| `openclaw-credentials` | OpenClaw       | `~/.openclaw/credentials/*`, `~/.openclaw/sessions/*` | read, write |
| `openai-credentials`   | OpenAI API     | `~/.openai/*`, `~/.config/openai/*`                   | read, write |
| `copilot-credentials`  | GitHub Copilot | `~/.config/github-copilot/*`, `~/.copilot/*`          | read, write |
| `codex-credentials`    | OpenAI Codex   | `~/.codex/*`                                          | read, write |
| `qwen-credentials`     | Qwen OAuth     | `~/.qwen/*`                                           | read, write |
| `minimax-credentials`  | MiniMax OAuth  | `~/.minimax/*`                                        | read, write |

### Package manager credentials

| Rule ID            | Description            | Protected paths                      | Operations  |
| ------------------ | ---------------------- | ------------------------------------ | ----------- |
| `npm-credentials`  | npm auth               | `~/.npmrc`, `~/.npm/_authToken`      | read, write |
| `pypi-credentials` | PyPI                   | `~/.pypirc`                          | read, write |
| `git-credentials`  | Git credential storage | `~/.git-credentials`, `~/.gitconfig` | read, write |
| `netrc`            | Network auth           | `~/.netrc`                           | read, write |

### System and config files

| Rule ID         | Description           | Protected paths                                                                      | Operations  |
| --------------- | --------------------- | ------------------------------------------------------------------------------------ | ----------- |
| `system-passwd` | System password files | `/etc/passwd`, `/etc/shadow`, `/etc/sudoers`                                         | read, write |
| `shell-config`  | Shell configuration   | `~/.bashrc`, `~/.bash_profile`, `~/.profile`, `~/.zshrc`, `~/.zprofile`, `~/.zshenv` | write only  |
| `fish-config`   | Fish shell config     | `~/.config/fish/config.fish`                                                         | write only  |
| `env-files`     | Environment variables | `**/.env`, `**/.env.local`, `**/.env.production`, `**/.env.*`                        | read        |

### Certificate and key files

| Rule ID             | Description            | Protected paths                                | Operations  |
| ------------------- | ---------------------- | ---------------------------------------------- | ----------- |
| `certificate-files` | Certs and private keys | `**/*.pem`, `**/*.key`, `**/*.p12`, `**/*.pfx` | read, write |
| `password-store`    | Pass password manager  | `~/.password-store/*`                          | read, write |

### Other credentials

| Rule ID                  | Description      | Protected paths                                                      | Operations  |
| ------------------------ | ---------------- | -------------------------------------------------------------------- | ----------- |
| `whatsapp-credentials`   | WhatsApp session | `**/whatsapp/*/creds.json`                                           | read, write |
| `google-cli-credentials` | Google CLI OAuth | `~/.config/gcloud/**/credentials.json`, `**/gogcli/credentials.json` | read, write |

## Exception paths

To reduce false positives, the following paths are automatically **allowed**:

- `node_modules/` - npm dependencies
- `*.test.*`, `/test/`, `/tests/` - test files
- `/fixtures/`, `/__fixtures__/` - test fixtures
- `/mocks/`, `/__mocks__/` - mock files
- `package-lock.json`, `pnpm-lock.yaml`, `yarn.lock` - lockfiles

## Configuration

```jsonc
{
  "plugins": {
    "security-audit": {
      // Allow access through if evaluation fails (default: true)
      "failOpen": true,

      // Additional sensitive path patterns (glob-like)
      "extraPaths": ["~/.secrets/*", "**/api-keys.json"],

      // Paths to allow even if they match block rules
      "allowPaths": [
        "~/.aws/config", // Allow reading AWS config but not credentials
      ],

      // Disable specific built-in rules
      "disabledRules": [
        "env-files", // Allow reading .env files
      ],

      // Stage configuration
      "stages": {
        "beforeToolCall": {
          "enabled": true,
          "mode": "block", // or "monitor" to log without blocking
        },
      },
    },
  },
}
```

## Operation types

The plugin determines operation type based on the tool:

| Tool                           | Operation                                                                                         |
| ------------------------------ | ------------------------------------------------------------------------------------------------- |
| `read`                         | read                                                                                              |
| `write`, `edit`, `apply_patch` | write                                                                                             |
| `find`, `grep`                 | read                                                                                              |
| `exec`                         | Depends on command (`cat`/`head`/`tail` = read, `cp`/`mv`/`rm`/`echo >` = write, other = execute) |

## Pattern syntax

Path patterns support glob-like syntax:

- `*` matches any characters except `/`
- `**` matches any characters including `/`
- `~` expands to home directory

## Related

- [command-safety-guard](../command-safety-guard/) - Blocks dangerous shell commands

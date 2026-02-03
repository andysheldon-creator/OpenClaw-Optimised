# Command Safety Guard

Blocks execution of potentially destructive shell commands before they run.

## What this does

This guardrail plugin intercepts `exec` tool calls and checks the command against a set of dangerous patterns. It prevents catastrophic operations like:

- Recursive forced deletion (`rm -rf /`)
- Direct disk writes (`dd of=/dev/sda`)
- Fork bombs and resource exhaustion
- Privilege escalation attempts
- Data exfiltration via network tools

## Built-in rules

| Rule ID                      | Description                                                                                     | Severity |
| ---------------------------- | ----------------------------------------------------------------------------------------------- | -------- |
| `rm-recursive-force`         | `rm -rf` or `rm -fr` flags                                                                      | error    |
| `rm-root`                    | Deletion targeting `/`, `/bin`, `/usr`, `/etc`, `/var`, `/home`, `/opt`, `/Users`, `~`, `$HOME` | error    |
| `rm-current-dir`             | Deleting `.`, `..`, or `.*`                                                                     | error    |
| `rm-all-files`               | Deleting `*` in current directory                                                               | error    |
| `find-delete-root`           | `find / ... -delete`                                                                            | error    |
| `dd-device`                  | `dd` writing to `/dev/`                                                                         | error    |
| `mkfs`                       | Filesystem creation                                                                             | error    |
| `format-disk`                | `fdisk`, `parted`, `gdisk` on `/dev/`                                                           | error    |
| `shutdown-reboot`            | `shutdown`, `reboot`, `poweroff`, `halt`, `init 0/6`                                            | error    |
| `chmod-recursive-permissive` | `chmod -R 777`                                                                                  | warning  |
| `chmod-any-permissive`       | Any `chmod 777`                                                                                 | warning  |
| `chmod-remove-perms`         | `chmod 000` on `/bin`, `/usr`, `/etc`                                                           | error    |
| `chown-recursive-root`       | `chown -R root` on sensitive paths                                                              | error    |
| `chown-root-dir`             | `chown -R` on `/`                                                                               | error    |
| `fork-bomb`                  | Fork bomb pattern `:(){ :\|:& };:`                                                              | error    |
| `infinite-loop-yes`          | `yes \|` infinite output                                                                        | warning  |
| `curl-upload`                | Uploading files via `curl -F`, `--form`, `-d`, etc.                                             | warning  |
| `nc-listener`                | Netcat listener or reverse shell                                                                | error    |
| `base64-pipe-curl`           | Base64 piped to network commands                                                                | warning  |
| `curl-pipe-interpreter`      | `curl/wget ... \| bash/python/etc`                                                              | error    |
| `cat-ssh-keys`               | Reading SSH private keys                                                                        | error    |
| `cat-env-credentials`        | Reading `.env`, `.netrc`, `.aws/credentials`, `.npmrc`                                          | error    |
| `history-clear`              | Clearing shell history                                                                          | warning  |
| `shred-logs`                 | Shredding log files                                                                             | error    |
| `sudo-passwd`                | `sudo passwd`                                                                                   | error    |
| `visudo-echo`                | `echo ... > /etc/sudoers`                                                                       | error    |
| `system-file-overwrite`      | `> /etc/passwd`, `/etc/shadow`, `/etc/group`                                                    | error    |
| `git-no-verify`              | `git commit --no-verify`                                                                        | error    |
| `docker-prune-all`           | `docker system prune -a --volumes`                                                              | error    |

## Configuration

```jsonc
{
  "plugins": {
    "command-safety-guard": {
      // Allow commands through if evaluation fails (default: true)
      "failOpen": true,

      // Additional regex patterns to block
      "extraPatterns": ["\\bkubectl\\s+delete\\s+namespace"],

      // Patterns to allow even if they match block rules
      "allowPatterns": ["rm -rf ./node_modules"],

      // Disable specific built-in rules
      "disabledRules": ["infinite-loop-yes"],

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

## False positive handling

The plugin strips quoted strings before pattern matching to reduce false positives. For example, this command will **not** be blocked:

```bash
echo "To delete everything, run: rm -rf /"
```

Only actual dangerous commands outside of quotes are flagged.

## Severity levels

- **error**: Command is blocked immediately
- **warning**: Command is blocked in `block` mode, logged in `monitor` mode

## Related

- [security-audit](../security-audit/) - Blocks access to sensitive files and credentials

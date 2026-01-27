# Google Antigravity Auth (Clawdbrain plugin)

OAuth provider plugin for **Google Antigravity** (Cloud Code Assist).

## Enable

Bundled plugins are disabled by default. Enable this one:

```bash
clawdbrain plugins enable google-antigravity-auth
```

Restart the Gateway after enabling.

## Authenticate

```bash
clawdbrain models auth login --provider google-antigravity --set-default
```

## Notes

- Antigravity uses Google Cloud project quotas.
- If requests fail, ensure Gemini for Google Cloud is enabled.

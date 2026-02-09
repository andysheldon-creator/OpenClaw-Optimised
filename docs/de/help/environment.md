---
summary: "„Wo OpenClaw Umgebungsvariablen lädt und die Rangfolge der Priorität“"
read_when:
  - Sie müssen wissen, welche Umgebungsvariablen geladen werden und in welcher Reihenfolge
  - Sie beheben fehlende API-Schlüssel im Gateway
  - Sie dokumentieren Anbieter-Authentifizierung oder Deployment-Umgebungen
title: "„Umgebungsvariablen“"
---

# Umgebungsvariablen

OpenClaw bezieht Umgebungsvariablen aus mehreren Quellen. Die Regel lautet: **Bestehende Werte niemals überschreiben**.

## Priorität (höchste → niedrigste)

1. **Prozessumgebung** (was der Gateway-Prozess bereits von der übergeordneten Shell/dem Daemon erhält).
2. **`.env` im aktuellen Arbeitsverzeichnis** (dotenv-Standard; überschreibt nicht).
3. **Globales `.env`** unter `~/.openclaw/.env` (auch bekannt als `$OPENCLAW_STATE_DIR/.env`; überschreibt nicht).
4. **Konfigurationsblock `env`** in `~/.openclaw/openclaw.json` (wird nur angewendet, wenn fehlend).
5. **Optionale Login-Shell-Importierung** (`env.shellEnv.enabled` oder `OPENCLAW_LOAD_SHELL_ENV=1`), nur für fehlende erwartete Schlüssel angewendet.

Wenn die Konfigurationsdatei vollständig fehlt, wird Schritt 4 übersprungen; der Shell-Import wird weiterhin ausgeführt, sofern aktiviert.

## Konfigurationsblock `env`

Zwei gleichwertige Möglichkeiten, Inline-Umgebungsvariablen zu setzen (beide ohne Überschreiben):

```json5
{
  env: {
    OPENROUTER_API_KEY: "sk-or-...",
    vars: {
      GROQ_API_KEY: "gsk-...",
    },
  },
}
```

## Shell-Umgebungsvariablenimport

`env.shellEnv` führt Ihre Login-Shell aus und importiert nur **fehlende** erwartete Schlüssel:

```json5
{
  env: {
    shellEnv: {
      enabled: true,
      timeoutMs: 15000,
    },
  },
}
```

Env var Äquivalenten:

- `OPENCLAW_LOAD_SHELL_ENV=1`
- `OPENCLAW_SHELL_ENV_TIMEOUT_MS=15000`

## Env var Substitution in der Konfiguration

Sie können Umgebungsvariablen direkt in Konfigurations-Stringwerten referenzieren, indem Sie die Syntax `${VAR_NAME}` verwenden:

```json5
{
  models: {
    providers: {
      "vercel-gateway": {
        apiKey: "${VERCEL_GATEWAY_API_KEY}",
      },
    },
  },
}
```

Siehe [Konfiguration: Ersetzung von Umgebungsvariablen](/gateway/configuration#env-var-substitution-in-config) für vollständige Details.

## Path-related env vars

| Variable               | Zweck                                                                                                                                                                                                                               |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `OPENCLAW_HOME`        | Override the home directory used for all internal path resolution (`~/.openclaw/`, agent dirs, sessions, credentials). Useful when running OpenClaw as a dedicated service user. |
| `OPENCLAW_STATE_DIR`   | Override the state directory (default `~/.openclaw`).                                                                                                                                            |
| `OPENCLAW_CONFIG_PATH` | Überschreiben des Pfads zur Konfigurationsdatei (Standard `~/.openclaw/openclaw.json`).                                                                                                          |

### `OPENCLAW_HOME`

Wenn gesetzt, ersetzt `OPENCLAW_HOME` das System-Home-Verzeichnis (`$HOME` / `os.homedir()`) für die gesamte interne Pfadauflösung. Dies ermöglicht eine vollständige Dateisystem-Isolation für headless Service-Accounts.

**Priorität:** `OPENCLAW_HOME` > `$HOME` > `USERPROFILE` > `os.homedir()`

**Beispiel** (macOS LaunchDaemon):

```xml
<key>EnvironmentVariables</key>
<dict>
  <key>OPENCLAW_HOME</key>
  <string>/Users/kira</string>
</dict>
```

`OPENCLAW_HOME` kann auch auf einen Tilde-Pfad gesetzt werden (z. B. `~/svc`), der vor der Verwendung mithilfe von `$HOME` expandiert wird.

## Verwandt

- [Gateway-Konfiguration](/gateway/configuration)
- [FAQ: Umgebungsvariablen und .env-Laden](/help/faq#env-vars-and-env-loading)
- [Modellübersicht](/concepts/models)

---
summary: "Откуда OpenClaw загружает переменные окружения и порядок приоритета"
read_when:
  - Вам нужно знать, какие переменные env были загружены, и в каком порядке
  - Вы отлаживаете отсутствие ключей API в Gateway (шлюз)
  - Вы документируете аутентификацию провайдеров или окружения развертывания
title: "Переменные окружения"
---

# Переменные окружения

OpenClaw получает переменные окружения из нескольких источников. Правило — **никогда не переопределять существующие значения**.

## Приоритет (от наивысшего к низшему)

1. **Окружение процесса** (то, что процесс Gateway (шлюз) уже получил от родительской оболочки/демона).
2. **`.env` в текущем рабочем каталоге** (dotenv по умолчанию; не переопределяет).
3. **Глобальный `.env`** по адресу `~/.openclaw/.env` (также известен как `$OPENCLAW_STATE_DIR/.env`; не переопределяет).
4. **Блок Config `env`** в `~/.openclaw/openclaw.json` (применяется только при отсутствии значения).
5. **Необязательный импорт login-shell** (`env.shellEnv.enabled` или `OPENCLAW_LOAD_SHELL_ENV=1`), применяется только для отсутствующих ожидаемых ключей.

Если файл конфига полностью отсутствует, шаг 4 пропускается; импорт оболочки всё равно выполняется, если включён.

## Блок Config `env`

Два эквивалентных способа установки inline env vars (оба являются непереходящими):

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

## Импорт Shell env

`env.shellEnv` запускает вашу login-shell и импортирует только **отсутствующие** ожидаемые ключи:

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

Env var эквиваленты:

- `OPENCLAW_LOAD_SHELL_ENV=1`
- `OPENCLAW_SHELL_ENV_TIMEOUT_MS=15000`

## Подстановка переменных окружения в конфиге

Вы можете напрямую ссылаться на переменные окружения в строковых значениях конфига, используя синтаксис `${VAR_NAME}`:

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

Подробности см. в разделе [Конфигурация: подстановка переменных окружения](/gateway/configuration#env-var-substitution-in-config).

## Переменные окружения, связанные с путями

| Переменная             | Назначение                                                                                                                                                                                                                                                              |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `OPENCLAW_HOME`        | Переопределяет домашний каталог, используемый для всего внутреннего разрешения путей (`~/.openclaw/`, каталоги агентов, сессии, учётные данные). Полезно при запуске OpenClaw под отдельным сервисным пользователем. |
| `OPENCLAW_STATE_DIR`   | Переопределяет каталог состояния (по умолчанию `~/.openclaw`).                                                                                                                                                                       |
| `OPENCLAW_CONFIG_PATH` | Override the config file path (default `~/.openclaw/openclaw.json`).                                                                                                                                                                 |

### `OPENCLAW_HOME`

When set, `OPENCLAW_HOME` replaces the system home directory (`$HOME` / `os.homedir()`) for all internal path resolution. This enables full filesystem isolation for headless service accounts.

**Precedence:** `OPENCLAW_HOME` > `$HOME` > `USERPROFILE` > `os.homedir()`

**Example** (macOS LaunchDaemon):

```xml
<key>EnvironmentVariables</key>
<dict>
  <key>OPENCLAW_HOME</key>
  <string>/Users/kira</string>
</dict>
```

`OPENCLAW_HOME` can also be set to a tilde path (e.g. `~/svc`), which gets expanded using `$HOME` before use.

## Связанное

- [Конфигурация Gateway](/gateway/configuration)
- [FAQ: переменные окружения и загрузка .env](/help/faq#env-vars-and-env-loading)
- [Обзор моделей](/concepts/models)

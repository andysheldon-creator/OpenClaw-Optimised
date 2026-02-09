---
summary: "Où OpenClaw charge les variables d'environnement et l'ordre de priorité"
read_when:
  - Vous devez savoir quelles sont les variables d'env qui sont chargées, et dans quel ordre
  - Vous dépannez des clés API manquantes dans la Gateway (passerelle)
  - Vous documentez l'authentification des fournisseurs ou les environnements de déploiement
title: "Variables d'environnement"
---

# Variables d'environnement

OpenClaw charge les variables d'environnement à partir de plusieurs sources. La règle est de **ne jamais écraser les valeurs existantes**.

## Priorité (de la plus élevée à la plus basse)

1. **Environnement du processus** (ce que le processus de la Gateway (passerelle) possède déjà depuis le shell/le démon parent).
2. **`.env` dans le répertoire de travail courant** (valeur par défaut de dotenv ; n’écrase pas).
3. **`.env` global** à `~/.openclaw/.env` (alias `$OPENCLAW_STATE_DIR/.env` ; n’écrase pas).
4. **Bloc de configuration `env`** dans `~/.openclaw/openclaw.json` (appliqué uniquement si manquant).
5. **Import facultatif du shell de connexion** (`env.shellEnv.enabled` ou `OPENCLAW_LOAD_SHELL_ENV=1`), appliqué uniquement pour les clés attendues manquantes.

Si le fichier de configuration est entièrement absent, l’étape 4 est ignorée ; l’import du shell s’exécute toujours s’il est activé.

## Bloc de configuration `env`

Deux façons équivalentes de définir des variables d'environnement inline (les deux sans écrasement) :

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

## Import des variables d'environnement du shell

`env.shellEnv` lance votre shell de connexion et importe uniquement les clés attendues **manquantes** :

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

Env var équivalents:

- `OPENCLAW_LOAD_SHELL_ENV=1`
- `OPENCLAW_SHELL_ENV_TIMEOUT_MS=15000`

## Substitution de variables d'environnement dans la configuration

Vous pouvez référencer des variables d'environnement directement dans les valeurs de chaînes de la configuration en utilisant la syntaxe `${VAR_NAME}` :

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

Voir [Configuration : substitution de variables d'environnement](/gateway/configuration#env-var-substitution-in-config) pour plus de détails.

## Path-related env vars

| Variable               | Objectif                                                                                                                                                                                                                            |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `OPENCLAW_HOME`        | Override the home directory used for all internal path resolution (`~/.openclaw/`, agent dirs, sessions, credentials). Useful when running OpenClaw as a dedicated service user. |
| `OPENCLAW_STATE_DIR`   | Override the state directory (default `~/.openclaw`).                                                                                                                                            |
| `OPENCLAW_CONFIG_PATH` | Remplacer le chemin du fichier de configuration (par défaut `~/.openclaw/openclaw.json`).                                                                                                        |

### `OPENCLAW_HOME`

Lorsqu’il est défini, `OPENCLAW_HOME` remplace le répertoire personnel du système (`$HOME` / `os.homedir()`) pour toute la résolution interne des chemins. Cela permet une isolation complète du système de fichiers pour les comptes de service sans interface graphique.

**Priorité :** `OPENCLAW_HOME` > `$HOME` > `USERPROFILE` > `os.homedir()`

**Exemple** (LaunchDaemon macOS) :

```xml
<key>EnvironmentVariables</key>
<dict>
  <key>OPENCLAW_HOME</key>
  <string>/Users/kira</string>
</dict>
```

`OPENCLAW_HOME` peut également être défini avec un chemin utilisant le tilde (par ex. `~/svc`), qui est développé à l’aide de `$HOME` avant utilisation.

## Liens connexes

- [Configuration de la Gateway (passerelle)](/gateway/configuration)
- [FAQ : variables d'environnement et chargement de .env](/help/faq#env-vars-and-env-loading)
- [Présentation des modèles](/concepts/models)

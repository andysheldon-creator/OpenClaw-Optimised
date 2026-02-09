# 4. Модель угроз OpenClaw v1.0

## 5. Фреймворк MITRE ATLAS

6. **Версия:** 1.0-draft
   **Последнее обновление:** 2026-02-04
   **Методология:** MITRE ATLAS + диаграммы потоков данных
   **Фреймворк:** [MITRE ATLAS](https://atlas.mitre.org/) (Ландшафт враждебных угроз для ИИ-систем)

### 7. Атрибуция фреймворка

8. Эта модель угроз построена на основе [MITRE ATLAS](https://atlas.mitre.org/), отраслевого стандарта для документирования враждебных угроз ИИ/ML-системам. 9. ATLAS поддерживается организацией [MITRE](https://www.mitre.org/) в сотрудничестве с сообществом специалистов по безопасности ИИ.

10. **Ключевые ресурсы ATLAS:**

- 11. [Техники ATLAS](https://atlas.mitre.org/techniques/)
- 12. [Тактики ATLAS](https://atlas.mitre.org/tactics/)
- 13. [Кейс-стади ATLAS](https://atlas.mitre.org/studies/)
- 14. [ATLAS на GitHub](https://github.com/mitre-atlas/atlas-data)
- 15. [Участие в развитии ATLAS](https://atlas.mitre.org/resources/contribute)

### 16. Участие в развитии этой модели угроз

17. Это живой документ, поддерживаемый сообществом OpenClaw. 18. См. [CONTRIBUTING-THREAT-MODEL.md](./CONTRIBUTING-THREAT-MODEL.md) с рекомендациями по внесению вклада:

- 19. Сообщение о новых угрозах
- 20. Обновление существующих угроз
- 21. Предложение цепочек атак
- 22. Предложение мер по смягчению рисков

---

## 1. 23. Введение

### 24. 1.1 Назначение

25. Эта модель угроз документирует враждебные угрозы платформе ИИ-агентов OpenClaw и маркетплейсу навыков ClawHub, используя фреймворк MITRE ATLAS, специально разработанный для ИИ/ML-систем.

### 26. 1.2 Область применения

| Компонент                                                    | 27. Включено | Примечания                                                                                                    |
| ------------------------------------------------------------ | ----------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| 28. Среда выполнения агентов OpenClaw | Да                                  | 29. Основное выполнение агентов, вызовы инструментов, сессии                           |
| Gateway (шлюз)                            | Да                                  | 30. Аутентификация, маршрутизация, интеграция каналов                                  |
| 31. Интеграции каналов                | Да                                  | 32. WhatsApp, Telegram, Discord, Signal, Slack и т. д. |
| 33. Маркетплейс ClawHub               | Да                                  | 34. Публикация навыков, модерация, распространение                                     |
| 35. Серверы MCP                       | Да                                  | 36. Внешние поставщики инструментов                                                    |
| 37. Устройства пользователей          | 38. Частично | 39. Мобильные приложения, десктоп-клиенты                                              |

### 40. 1.3 Вне области применения

41. Ничто явно не исключено из области применения данной модели угроз.

---

## 2. 42. Архитектура системы

### 43. 2.1 Границы доверия

```
44. ┌─────────────────────────────────────────────────────────────────┐
│                    НЕДОВЕРЕННАЯ ЗОНА                            │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐              │
│  │  WhatsApp   │  │  Telegram   │  │   Discord   │  ...         │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘              │
│         │                │                │                      │
└─────────┼────────────────┼────────────────┼──────────────────────┘
          │                │                │
          ▼                ▼                ▼
┌─────────────────────────────────────────────────────────────────┐
│                 ГРАНИЦА ДОВЕРИЯ 1: Доступ к каналам              │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │                      ШЛЮЗ                                 │   │
│  │  • Сопряжение устройств (льготный период 30 с)            │   │
│  │  • Проверка AllowFrom / AllowList                         │   │
│  │  • Аутентификация Token/Password/Tailscale                │   │
│  └──────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                 ГРАНИЦА ДОВЕРИЯ 2: Изоляция сессий               │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │                   СЕССИИ АГЕНТОВ                          │   │
│  │  • Ключ сессии = agent:channel:peer                       │   │
│  │  • Политики инструментов для каждого агента               │   │
│  │  • Журналирование транскриптов                             │   │
│  └──────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                 ГРАНИЦА ДОВЕРИЯ 3: Выполнение инструментов       │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │                  ПЕСОЧНИЦА ВЫПОЛНЕНИЯ                     │   │
│  │  • Docker-песочница ИЛИ хост (exec-approvals)             │   │
│  │  • Удалённое выполнение Node                              │   │
│  │  • Защита от SSRF (DNS pinning + блокировка IP)           │   │
│  └──────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                 ГРАНИЦА ДОВЕРИЯ 4: Внешний контент              │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │              ЗАГРУЖЕННЫЕ URL / EMAIL / WEBHOOKS           │
│  │  • Обёртывание внешнего контента (XML-теги)               │
│  │  • Внедрение уведомлений о безопасности                   │
│  └──────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                 ГРАНИЦА ДОВЕРИЯ 5: Цепочка поставок             │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │                      CLAWHUB                              │   │
│  │  • Публикация навыков (semver, обязателен SKILL.md)       │   │
│  │  • Флаги модерации на основе шаблонов                     │   │
│  │  • Сканирование VirusTotal (скоро)                       │   │
│  │  • Проверка возраста аккаунта GitHub                     │   │
│  └──────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

### 45. 2.2 Потоки данных

| 46. Поток | 47. Источник | 48. Назначение | 49. Данные       | 50. Защита |
| -------------------------------- | ----------------------------------- | ------------------------------------- | --------------------------------------- | --------------------------------- |
| F1                               | Канал                               | Gateway (шлюз)     | Сообщения пользователя                  | TLS, AllowFrom                    |
| F2                               | Gateway (шлюз)   | Агент                                 | Маршрутизируемые сообщения              | Изоляция сессий                   |
| F3                               | Агент                               | Инструменты                           | Вызовы инструментов                     | Применение политик                |
| F4                               | Агент                               | Внешний                               | web_fetch requests | Блокировка SSRF                   |
| F5                               | ClawHub                             | Агент                                 | Код навыков                             | Модерация, сканирование           |
| F6                               | Агент                               | Channel                               | Ответы                                  | Фильтрация вывода                 |

---

## 3. Threat Analysis by ATLAS Tactic

### 3.1 Разведка (AML.TA0002)

#### T-RECON-001: Обнаружение конечных точек агента

| Атрибут                   | Value                                                                                                  |
| ------------------------- | ------------------------------------------------------------------------------------------------------ |
| **ATLAS ID**              | AML.T0006 - Активное сканирование                                                      |
| **Описание**              | Злоумышленник сканирует открытые конечные точки шлюза OpenClaw                                         |
| **Вектор атаки**          | Сетевое сканирование, запросы Shodan, перечисление DNS                                                 |
| **Затронутые компоненты** | Шлюз, открытые конечные точки API                                                                      |
| **Текущие меры защиты**   | Опция аутентификации Tailscale, привязка к loopback по умолчанию                                       |
| **Residual Risk**         | Средний — публичные шлюзы обнаружимы                                                                   |
| **Рекомендации**          | Документировать безопасное развертывание, добавить ограничение скорости на конечных точках обнаружения |

#### T-RECON-002: Зондирование интеграции каналов

| Атрибут                 | Value                                                                                           |
| ----------------------- | ----------------------------------------------------------------------------------------------- |
| **ATLAS ID**            | AML.T0006 - Активное сканирование                                               |
| **Описание**            | Злоумышленник зондирует каналы обмена сообщениями для выявления учетных записей, управляемых ИИ |
| **Вектор атаки**        | Отправка тестовых сообщений, наблюдение за шаблонами ответов                                    |
| **Affected Components** | All channel integrations                                                                        |
| **Current Mitigations** | None specific                                                                                   |
| **Residual Risk**       | Low - Limited value from discovery alone                                                        |
| **Рекомендации**        | Consider response timing randomization                                                          |

---

### 3.2 Initial Access (AML.TA0004)

#### T-ACCESS-001: Pairing Code Interception

| Attribute               | Value                                                     |
| ----------------------- | --------------------------------------------------------- |
| **ATLAS ID**            | AML.T0040 - AI Model Inference API Access |
| **Description**         | Attacker intercepts pairing code during 30s grace period  |
| **Attack Vector**       | Shoulder surfing, network sniffing, social engineering    |
| **Affected Components** | Device pairing system                                     |
| **Current Mitigations** | 30s expiry, codes sent via existing channel               |
| **Residual Risk**       | Medium - Grace period exploitable                         |
| **Рекомендации**        | Reduce grace period, add confirmation step                |

#### T-ACCESS-002: AllowFrom Spoofing

| Attribute               | Value                                                                          |
| ----------------------- | ------------------------------------------------------------------------------ |
| **ATLAS ID**            | AML.T0040 - AI Model Inference API Access                      |
| **Description**         | Attacker spoofs allowed sender identity in channel                             |
| **Attack Vector**       | Depends on channel - phone number spoofing, username impersonation             |
| **Affected Components** | AllowFrom validation per channel                                               |
| **Current Mitigations** | Channel-specific identity verification                                         |
| **Residual Risk**       | Medium - Some channels vulnerable to spoofing                                  |
| **Рекомендации**        | Document channel-specific risks, add cryptographic verification where possible |

#### T-ACCESS-003: Token Theft

| Attribute               | Value                                                                    |
| ----------------------- | ------------------------------------------------------------------------ |
| **ATLAS ID**            | AML.T0040 - AI Model Inference API Access                |
| **Description**         | Attacker steals authentication tokens from config files                  |
| **Attack Vector**       | Malware, unauthorized device access, config backup exposure              |
| **Affected Components** | ~/.openclaw/credentials/, config storage |
| **Current Mitigations** | Права на файлы                                                           |
| **Residual Risk**       | High - Tokens stored in plaintext                                        |
| **Рекомендации**        | Implement token encryption at rest, add token rotation                   |

---

### 3.3 Execution (AML.TA0005)

#### T-EXEC-001: Direct Prompt Injection

| Attribute               | Value                                                                                        |
| ----------------------- | -------------------------------------------------------------------------------------------- |
| **ATLAS ID**            | AML.T0051.000 - LLM Prompt Injection: Direct |
| **Description**         | Attacker sends crafted prompts to manipulate agent behavior                                  |
| **Attack Vector**       | Channel messages containing adversarial instructions                                         |
| **Affected Components** | Agent LLM, all input surfaces                                                                |
| **Current Mitigations** | Pattern detection, external content wrapping                                                 |
| **Residual Risk**       | Critical - Detection only, no blocking; sophisticated attacks bypass                         |
| **Рекомендации**        | Implement multi-layer defense, output validation, user confirmation for sensitive actions    |

#### T-EXEC-002: Indirect Prompt Injection

| Attribute               | Value                                                                                          |
| ----------------------- | ---------------------------------------------------------------------------------------------- |
| **ATLAS ID**            | AML.T0051.001 - LLM Prompt Injection: Indirect |
| **Description**         | Attacker embeds malicious instructions in fetched content                                      |
| **Attack Vector**       | Malicious URLs, poisoned emails, compromised webhooks                                          |
| **Affected Components** | web_fetch, email ingestion, external data sources                         |
| **Current Mitigations** | Content wrapping with XML tags and security notice                                             |
| **Residual Risk**       | High - LLM may ignore wrapper instructions                                                     |
| **Рекомендации**        | Implement content sanitization, separate execution contexts                                    |

#### T-EXEC-003: Tool Argument Injection

| Attribute               | Value                                                                                        |
| ----------------------- | -------------------------------------------------------------------------------------------- |
| **ATLAS ID**            | AML.T0051.000 - LLM Prompt Injection: Direct |
| **Description**         | Attacker manipulates tool arguments through prompt injection                                 |
| **Attack Vector**       | Crafted prompts that influence tool parameter values                                         |
| **Affected Components** | All tool invocations                                                                         |
| **Current Mitigations** | Exec approvals for dangerous commands                                                        |
| **Residual Risk**       | High - Relies on user judgment                                                               |
| **Рекомендации**        | Implement argument validation, parameterized tool calls                                      |

#### T-EXEC-004: Exec Approval Bypass

| Attribute               | Value                                                      |
| ----------------------- | ---------------------------------------------------------- |
| **ATLAS ID**            | AML.T0043 - Craft Adversarial Data         |
| **Description**         | Attacker crafts commands that bypass approval allowlist    |
| **Attack Vector**       | Command obfuscation, alias exploitation, path manipulation |
| **Affected Components** | exec-approvals.ts, command allowlist       |
| **Current Mitigations** | Allowlist + ask mode                                       |
| **Residual Risk**       | High - No command sanitization                             |
| **Рекомендации**        | Implement command normalization, expand blocklist          |

---

### 3.4 Persistence (AML.TA0006)

#### T-PERSIST-001: Malicious Skill Installation

| Attribute               | Value                                                                                                |
| ----------------------- | ---------------------------------------------------------------------------------------------------- |
| **ATLAS ID**            | AML.T0010.001 - Supply Chain Compromise: AI Software |
| **Description**         | Attacker publishes malicious skill to ClawHub                                                        |
| **Attack Vector**       | Create account, publish skill with hidden malicious code                                             |
| **Affected Components** | ClawHub, skill loading, agent execution                                                              |
| **Current Mitigations** | GitHub account age verification, pattern-based moderation flags                                      |
| **Residual Risk**       | Critical - No sandboxing, limited review                                                             |
| **Рекомендации**        | VirusTotal integration (in progress), skill sandboxing, community review          |

#### T-PERSIST-002: Skill Update Poisoning

| Attribute               | Value                                                                                                |
| ----------------------- | ---------------------------------------------------------------------------------------------------- |
| **ATLAS ID**            | AML.T0010.001 - Supply Chain Compromise: AI Software |
| **Description**         | Attacker compromises popular skill and pushes malicious update                                       |
| **Attack Vector**       | Account compromise, social engineering of skill owner                                                |
| **Affected Components** | ClawHub versioning, auto-update flows                                                                |
| **Current Mitigations** | Version fingerprinting                                                                               |
| **Residual Risk**       | High - Auto-updates may pull malicious versions                                                      |
| **Рекомендации**        | Implement update signing, rollback capability, version pinning                                       |

#### T-PERSIST-003: Agent Configuration Tampering

| Attribute               | Value                                                                                         |
| ----------------------- | --------------------------------------------------------------------------------------------- |
| **ATLAS ID**            | AML.T0010.002 - Supply Chain Compromise: Data |
| **Description**         | Attacker modifies agent configuration to persist access                                       |
| **Attack Vector**       | Config file modification, settings injection                                                  |
| **Affected Components** | Agent config, tool policies                                                                   |
| **Current Mitigations** | Права на файлы                                                                                |
| **Residual Risk**       | Medium - Requires local access                                                                |
| **Рекомендации**        | Config integrity verification, audit logging for config changes                               |

---

### 3.5 Defense Evasion (AML.TA0007)

#### T-EVADE-001: Moderation Pattern Bypass

| Attribute               | Value                                                                                     |
| ----------------------- | ----------------------------------------------------------------------------------------- |
| **ATLAS ID**            | AML.T0043 - Craft Adversarial Data                                        |
| **Description**         | Attacker crafts skill content to evade moderation patterns                                |
| **Attack Vector**       | Unicode homoglyphs, encoding tricks, dynamic loading                                      |
| **Affected Components** | ClawHub moderation.ts                                                     |
| **Current Mitigations** | Pattern-based FLAG_RULES                                             |
| **Residual Risk**       | High - Simple regex easily bypassed                                                       |
| **Рекомендации**        | Add behavioral analysis (VirusTotal Code Insight), AST-based detection |

#### T-EVADE-002: Content Wrapper Escape

| Attribute               | Value                                                     |
| ----------------------- | --------------------------------------------------------- |
| **ATLAS ID**            | AML.T0043 - Craft Adversarial Data        |
| **Description**         | Attacker crafts content that escapes XML wrapper context  |
| **Attack Vector**       | Tag manipulation, context confusion, instruction override |
| **Affected Components** | External content wrapping                                 |
| **Current Mitigations** | XML tags + security notice                                |
| **Residual Risk**       | Medium - Novel escapes discovered regularly               |
| **Рекомендации**        | Multiple wrapper layers, output-side validation           |

---

### 3.6 Discovery (AML.TA0008)

#### T-DISC-001: Tool Enumeration

| Attribute               | Value                                                     |
| ----------------------- | --------------------------------------------------------- |
| **ATLAS ID**            | AML.T0040 - AI Model Inference API Access |
| **Description**         | Attacker enumerates available tools through prompting     |
| **Attack Vector**       | "What tools do you have?" style queries                   |
| **Affected Components** | Agent tool registry                                       |
| **Current Mitigations** | None specific                                             |
| **Residual Risk**       | Low - Tools generally documented                          |
| **Рекомендации**        | Consider tool visibility controls                         |

#### T-DISC-002: Session Data Extraction

| Attribute               | Value                                                     |
| ----------------------- | --------------------------------------------------------- |
| **ATLAS ID**            | AML.T0040 - AI Model Inference API Access |
| **Description**         | Attacker extracts sensitive data from session context     |
| **Attack Vector**       | "What did we discuss?" queries, context probing           |
| **Affected Components** | Session transcripts, context window                       |
| **Current Mitigations** | Session isolation per sender                              |
| **Residual Risk**       | Medium - Within-session data accessible                   |
| **Рекомендации**        | Implement sensitive data redaction in context             |

---

### 3.7 Collection & Exfiltration (AML.TA0009, AML.TA0010)

#### T-EXFIL-001: Data Theft via web_fetch

| Attribute               | Value                                                                  |
| ----------------------- | ---------------------------------------------------------------------- |
| **ATLAS ID**            | AML.T0009 - Collection                                 |
| **Description**         | Attacker exfiltrates data by instructing agent to send to external URL |
| **Attack Vector**       | Prompt injection causing agent to POST data to attacker server         |
| **Affected Components** | web_fetch tool                                    |
| **Current Mitigations** | SSRF blocking for internal networks                                    |
| **Residual Risk**       | High - External URLs permitted                                         |
| **Рекомендации**        | Implement URL allowlisting, data classification awareness              |

#### T-EXFIL-002: Unauthorized Message Sending

| Attribute               | Value                                                            |
| ----------------------- | ---------------------------------------------------------------- |
| **ATLAS ID**            | AML.T0009 - Collection                           |
| **Description**         | Attacker causes agent to send messages containing sensitive data |
| **Attack Vector**       | Prompt injection causing agent to message attacker               |
| **Affected Components** | Message tool, channel integrations                               |
| **Current Mitigations** | Outbound messaging gating                                        |
| **Residual Risk**       | Medium - Gating may be bypassed                                  |
| **Рекомендации**        | Требовать явного подтверждения для новых получателей             |

#### T-EXFIL-003: Сбор учетных данных

| Атрибут                    | Value                                                         |
| -------------------------- | ------------------------------------------------------------- |
| **Идентификатор ATLAS**    | AML.T0009 - Сбор                              |
| **Описание**               | Вредоносный навык собирает учетные данные из контекста агента |
| **Вектор атаки**           | Код навыка читает переменные окружения, файлы конфигурации    |
| **Затронутые компоненты**  | Среда выполнения навыка                                       |
| **Текущие меры смягчения** | Отсутствуют специальные меры для навыков                      |
| **Остаточный риск**        | Критический — навыки выполняются с привилегиями агента        |
| **Рекомендации**           | Песочница для навыков, изоляция учетных данных                |

---

### 3.8 Воздействие (AML.TA0011)

#### T-IMPACT-001: Неавторизованное выполнение команд

| Атрибут                    | Value                                                               |
| -------------------------- | ------------------------------------------------------------------- |
| **Идентификатор ATLAS**    | AML.T0031 - Подрыв целостности модели ИИ            |
| **Описание**               | Злоумышленник выполняет произвольные команды в системе пользователя |
| **Вектор атаки**           | Инъекция подсказок в сочетании с обходом одобрения выполнения       |
| **Affected Components**    | Инструмент Bash, выполнение команд                                  |
| **Текущие меры смягчения** | Одобрения выполнения, опция песочницы Docker                        |
| **Остаточный риск**        | Critical - Host execution without sandbox                           |
| **Рекомендации**           | Использовать песочницу по умолчанию, улучшить UX одобрений          |

#### T-IMPACT-002: Истощение ресурсов (DoS)

| Атрибут                    | Value                                                                     |
| -------------------------- | ------------------------------------------------------------------------- |
| **ATLAS ID**               | AML.T0031 - Подрыв целостности модели ИИ                  |
| **Description**            | Злоумышленник истощает API-кредиты или вычислительные ресурсы             |
| **Вектор атаки**           | Автоматизированная засыпка сообщениями, дорогостоящие вызовы инструментов |
| **Затронутые компоненты**  | Шлюз, сессии агента, провайдер API                                        |
| **Текущие меры смягчения** | None                                                                      |
| **Остаточный риск**        | Высокий — отсутствует ограничение скорости                                |
| **Рекомендации**           | Реализовать лимиты запросов на отправителя, бюджеты затрат                |

#### T-IMPACT-003: Ущерб репутации

| Атрибут                    | Value                                                                         |
| -------------------------- | ----------------------------------------------------------------------------- |
| **Идентификатор ATLAS**    | AML.T0031 — Подрыв целостности модели ИИ                      |
| **Описание**               | Злоумышленник заставляет агента отправлять вредоносный/оскорбительный контент |
| **Вектор атаки**           | Инъекция промпта, вызывающая неуместные ответы                                |
| **Затронутые компоненты**  | Генерация вывода, обмен сообщениями в каналах                                 |
| **Текущие меры смягчения** | Политики контента провайдера LLM                                              |
| **Остаточный риск**        | Средний — фильтры провайдера несовершенны                                     |
| **Рекомендации**           | Слой фильтрации вывода, пользовательские элементы управления                  |

---

## 4. Анализ цепочки поставок ClawHub

### 4.1 Текущие меры безопасности

| Контроль                              | Реализация                                                      | Эффективность                                                              |
| ------------------------------------- | --------------------------------------------------------------- | -------------------------------------------------------------------------- |
| Возраст учетной записи GitHub         | `requireGitHubAccountAge()`                                     | Средний — повышает порог для новых злоумышленников                         |
| Санация путей                         | `sanitizePath()`                                                | Высокая — предотвращает обход путей                                        |
| Проверка типа файлов                  | `isTextFile()`                                                  | Средний — только текстовые файлы, но они все равно могут быть вредоносными |
| Ограничения размера                   | 50 МБ суммарного пакета                                         | Высокая — предотвращает истощение ресурсов                                 |
| Обязательный SKILL.md | Обязательный readme                                             | Низкая ценность для безопасности — только информационно                    |
| Модерация по шаблонам                 | FLAG_RULES в moderation.ts | Низкая — легко обходится                                                   |
| Статус модерации                      | Поле `moderationStatus`                                         | Средний — возможна ручная проверка                                         |

### 4.2 Шаблоны флагов модерации

Текущие шаблоны в `moderation.ts`:

```javascript
// Known-bad identifiers
/(keepcold131\/ClawdAuthenticatorTool|ClawdAuthenticatorTool)/i

// Suspicious keywords
/(malware|stealer|phish|phishing|keylogger)/i
/(api[-_ ]?key|token|password|private key|secret)/i
/(wallet|seed phrase|mnemonic|crypto)/i
/(discord\.gg|webhook|hooks\.slack)/i
/(curl[^\n]+\|\s*(sh|bash))/i
/(bit\.ly|tinyurl\.com|t\.co|goo\.gl|is\.gd)/i
```

**Ограничения:**

- Проверяются только slug, displayName, summary, frontmatter, metadata и пути файлов
- Фактическое содержимое кода навыка не анализируется
- Простые регулярные выражения легко обходятся с помощью обфускации
- Отсутствует поведенческий анализ

### 4.3 Планируемые улучшения

| Улучшение               | Status                                                   | Влияние                                                               |
| ----------------------- | -------------------------------------------------------- | --------------------------------------------------------------------- |
| Интеграция с VirusTotal | В процессе                                               | High - Code Insight behavioral analysis                               |
| Community Reporting     | Partial (`skillReports` table exists) | Medium                                                                |
| Audit Logging           | Partial (`auditLogs` table exists)    | Medium                                                                |
| Badge System            | Implemented                                              | Medium - `highlighted`, `official`, `deprecated`, `redactionApproved` |

---

## 5. Risk Matrix

### 5.1 Likelihood vs Impact

| Threat ID     | Likelihood | Impact   | Risk Level   | Priority |
| ------------- | ---------- | -------- | ------------ | -------- |
| T-EXEC-001    | High       | Critical | **Critical** | P0       |
| T-PERSIST-001 | High       | Critical | **Critical** | P0       |
| T-EXFIL-003   | Medium     | Critical | **Critical** | P0       |
| T-IMPACT-001  | Medium     | Critical | **High**     | P1       |
| T-EXEC-002    | High       | High     | **High**     | P1       |
| T-EXEC-004    | Medium     | High     | **High**     | P1       |
| T-ACCESS-003  | Medium     | High     | **High**     | P1       |
| T-EXFIL-001   | Medium     | High     | **High**     | P1       |
| T-IMPACT-002  | High       | Medium   | **High**     | P1       |
| T-EVADE-001   | High       | Medium   | **Medium**   | P2       |
| T-ACCESS-001  | Low        | High     | **Medium**   | P2       |
| T-ACCESS-002  | Low        | High     | **Medium**   | P2       |
| T-PERSIST-002 | Low        | High     | **Medium**   | P2       |

### 5.2 Critical Path Attack Chains

**Attack Chain 1: Skill-Based Data Theft**

```
T-PERSIST-001 → T-EVADE-001 → T-EXFIL-003
(Publish malicious skill) → (Evade moderation) → (Harvest credentials)
```

**Attack Chain 2: Prompt Injection to RCE**

```
T-EXEC-001 → T-EXEC-004 → T-IMPACT-001
(Inject prompt) → (Bypass exec approval) → (Execute commands)
```

**Attack Chain 3: Indirect Injection via Fetched Content**

```
T-EXEC-002 → T-EXFIL-001 → External exfiltration
(Poison URL content) → (Agent fetches & follows instructions) → (Data sent to attacker)
```

---

## 6. Recommendations Summary

### 6.1 Immediate (P0)

| ID    | Recommendation                                       | Addresses                  |
| ----- | ---------------------------------------------------- | -------------------------- |
| R-001 | Complete VirusTotal integration                      | T-PERSIST-001, T-EVADE-001 |
| R-002 | Implement skill sandboxing                           | T-PERSIST-001, T-EXFIL-003 |
| R-003 | Добавить проверку вывода для чувствительных действий | T-EXEC-001, T-EXEC-002     |

### 6.2 Краткосрочные (P1)

| ID    | Рекомендация                                                 | Устраняет    |
| ----- | ------------------------------------------------------------ | ------------ |
| R-004 | Внедрить ограничение скорости                                | T-IMPACT-002 |
| R-005 | Добавить шифрование токенов при хранении                     | T-ACCESS-003 |
| R-006 | Улучшить UX утверждения exec и проверку                      | T-EXEC-004   |
| R-007 | Внедрить белый список URL для web_fetch | T-EXFIL-001  |

### 6.3 Среднесрочные (P2)

| ID    | Рекомендация                                                     | Устраняет     |
| ----- | ---------------------------------------------------------------- | ------------- |
| R-008 | Добавить криптографическую проверку канала там, где это возможно | T-ACCESS-002  |
| R-009 | Внедрить проверку целостности конфигурации                       | T-PERSIST-003 |
| R-010 | Добавить подписывание обновлений и закрепление версий            | T-PERSIST-002 |

---

## 7. Приложения

### 7.1 Сопоставление техник ATLAS

| ATLAS ID                                      | Название техники                               | Угрозы OpenClaw                                                  |
| --------------------------------------------- | ---------------------------------------------- | ---------------------------------------------------------------- |
| AML.T0006                     | Активное сканирование                          | T-RECON-001, T-RECON-002                                         |
| AML.T0009                     | Сбор                                           | T-EXFIL-001, T-EXFIL-002, T-EXFIL-003                            |
| AML.T0010.001 | Цепочка поставок: ПО ИИ        | T-PERSIST-001, T-PERSIST-002                                     |
| AML.T0010.002 | Цепочка поставок: Данные       | T-PERSIST-003                                                    |
| AML.T0031                     | Erode AI Model Integrity                       | T-IMPACT-001, T-IMPACT-002, T-IMPACT-003                         |
| AML.T0040                     | AI Model Inference API Access                  | T-ACCESS-001, T-ACCESS-002, T-ACCESS-003, T-DISC-001, T-DISC-002 |
| AML.T0043                     | Craft Adversarial Data                         | T-EXEC-004, T-EVADE-001, T-EVADE-002                             |
| AML.T0051.000 | LLM Prompt Injection: Direct   | T-EXEC-001, T-EXEC-003                                           |
| AML.T0051.001 | LLM Prompt Injection: Indirect | T-EXEC-002                                                       |

### 7.2 Key Security Files

| Путь                                | Назначение                  | Risk Level   |
| ----------------------------------- | --------------------------- | ------------ |
| `src/infra/exec-approvals.ts`       | Command approval logic      | **Critical** |
| `src/gateway/auth.ts`               | Gateway authentication      | **Critical** |
| `src/web/inbound/access-control.ts` | Channel access control      | **Critical** |
| `src/infra/net/ssrf.ts`             | SSRF protection             | **Critical** |
| `src/security/external-content.ts`  | Prompt injection mitigation | **Critical** |
| `src/agents/sandbox/tool-policy.ts` | Tool policy enforcement     | **Critical** |
| `convex/lib/moderation.ts`          | ClawHub moderation          | **High**     |
| `convex/lib/skillPublish.ts`        | Skill publishing flow       | **High**     |
| `src/routing/resolve-route.ts`      | Session isolation           | **Medium**   |

### 7.3 Glossary

| Term                 | Definition                                                    |
| -------------------- | ------------------------------------------------------------- |
| **ATLAS**            | MITRE's Adversarial Threat Landscape for AI Systems           |
| **ClawHub**          | OpenClaw's skill marketplace                                  |
| **Gateway**          | OpenClaw's message routing and authentication layer           |
| **MCP**              | Протокол контекста модели — интерфейс провайдера инструментов |
| **Prompt Injection** | Attack where malicious instructions are embedded in input     |
| **Skill**            | Загружаемое расширение для агентов OpenClaw                   |
| **SSRF**             | Подделка запросов на стороне сервера                          |

---

_Эта модель угроз является живым документом._ Сообщайте о проблемах безопасности на security@openclaw.ai

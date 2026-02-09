# Contributing to the OpenClaw Threat Model

Thanks for helping make OpenClaw more secure. This threat model is a living document and we welcome contributions from anyone - you don't need to be a security expert.

## Ways to Contribute

### Add a Threat

Spotted an attack vector or risk we haven't covered? Open an issue on [openclaw/trust](https://github.com/openclaw/trust/issues) and describe it in your own words. You don't need to know any frameworks or fill in every field - just describe the scenario.

**Helpful to include (but not required):**

- The attack scenario and how it could be exploited
- Which parts of OpenClaw are affected (CLI, gateway, channels, ClawHub, MCP servers, etc.)
- How severe you think it is (low / medium / high / critical)
- Any links to related research, CVEs, or real-world examples

We'll handle the ATLAS mapping, threat IDs, and risk assessment during review. If you want to include those details, great - but it's not expected.

> **This is for adding to the threat model, not reporting live vulnerabilities.** If you've found an exploitable vulnerability, see our [Trust page](https://trust.openclaw.ai) for responsible disclosure instructions.

### Suggest a Mitigation

Have an idea for how to address an existing threat? Open an issue or PR referencing the threat. Useful mitigations are specific and actionable - for example, "per-sender rate limiting of 10 messages/minute at the gateway" is better than "implement rate limiting."

### Propose an Attack Chain

Attack chains show how multiple threats combine into a realistic attack scenario. If you see a dangerous combination, describe the steps and how an attacker would chain them together. A short narrative of how the attack unfolds in practice is more valuable than a formal template.

### Fix or Improve Existing Content

Typos, clarifications, outdated info, better examples - PRs welcome, no issue needed.

## Что мы используем

### MITRE ATLAS

Эта модель угроз построена на [MITRE ATLAS](https://atlas.mitre.org/) (Adversarial Threat Landscape for AI Systems) — фреймворке, разработанном специально для угроз ИИ/ML, таких как инъекция подсказок, злоупотребление инструментами и эксплуатация агентов. Вам не нужно знать ATLAS, чтобы внести вклад — мы сопоставляем отправленные материалы с фреймворком во время проверки.

### Идентификаторы угроз

Каждой угрозе присваивается идентификатор вида `T-EXEC-003`. Категории:

| Код     | Категория                                    |
| ------- | -------------------------------------------- |
| RECON   | Разведка — сбор информации                   |
| ACCESS  | Начальный доступ — получение доступа         |
| EXEC    | Исполнение — выполнение вредоносных действий |
| PERSIST | Закрепление — поддержание доступа            |
| EVADE   | Обход защиты — уклонение от обнаружения      |
| DISC    | Discovery - learning about the environment   |
| EXFIL   | Экcфильтрация — кража данных                 |
| IMPACT  | Воздействие — ущерб или нарушение работы     |

Идентификаторы назначаются сопровождающими во время проверки. Вам не нужно выбирать один.

### Уровни риска

| Level           | Значение                                                                      |
| --------------- | ----------------------------------------------------------------------------- |
| **Критический** | Полный компромисс системы или высокая вероятность + критическое воздействие   |
| **Высокий**     | Вероятен значительный ущерб или средняя вероятность + критическое воздействие |
| **Средний**     | Умеренный риск или низкая вероятность + высокое воздействие                   |
| **Low**         | Маловероятное и ограниченное воздействие                                      |

Если вы не уверены в уровне риска, просто опишите воздействие, и мы его оценим.

## Процесс проверки

1. **Triage** - We review new submissions within 48 hours
2. **Оценка** — Мы проверяем осуществимость, назначаем сопоставление с ATLAS и идентификатор угрозы, подтверждаем уровень риска
3. **Документирование** — Мы убеждаемся, что всё отформатировано и завершено
4. **Слияние** — Добавление в модель угроз и визуализацию

## Ресурсы

- [Веб-сайт ATLAS](https://atlas.mitre.org/)
- [Техники ATLAS](https://atlas.mitre.org/techniques/)
- [Кейс-стади ATLAS](https://atlas.mitre.org/studies/)
- [Модель угроз OpenClaw](./THREAT-MODEL-ATLAS.md)

## Контакты

- **Уязвимости безопасности:** см. нашу [страницу Trust](https://trust.openclaw.ai) для инструкций по сообщению
- **Вопросы по модели угроз:** откройте issue в [openclaw/trust](https://github.com/openclaw/trust/issues)
- 1. **Общий чат:** канал Discord #security

## 2. Признание

3. Участники, внесшие вклад в модель угроз, отмечаются в разделе благодарностей модели угроз, примечаниях к релизам и зале славы безопасности OpenClaw за значительный вклад.

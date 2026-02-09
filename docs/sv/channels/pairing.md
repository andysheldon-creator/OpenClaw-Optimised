---
summary: "Översikt av parning: godkänn vem som kan DM:a dig + vilka noder som kan ansluta"
read_when:
  - Konfigurera åtkomstkontroll för DM
  - Para en ny iOS-/Android-nod
  - Granska OpenClaws säkerhetsläge
title: "Parning"
---

# Parning

“Parning” är OpenClaws explicita **ägargodkännande** steg.
Den används på två ställen:

1. **DM-parning** (vem som får prata med boten)
2. **Nodparning** (vilka enheter/noder som får ansluta till gateway-nätverket)

Säkerhetskontext: [Security](/gateway/security)

## 1. DM-parning (inkommande chattåtkomst)

När en kanal är konfigurerad med DM-policy `pairing` får okända avsändare en kort kod och deras meddelande **behandlas inte** förrän du godkänner.

Standard-DM-policyer dokumenteras i: [Security](/gateway/security)

Parningskoder:

- 8 tecken, versaler, inga tvetydiga tecken (`0O1I`).
- **Förfaller efter 1 timme**. Botten skickar bara ett parningsmeddelande när en ny begäran skapas (ungefär en gång per timme per avsändare).
- Väntande DM-parningsbegäranden är som standard begränsade till **3 per kanal**; ytterligare begäranden ignoreras tills en går ut eller godkänns.

### Godkänn en avsändare

```bash
openclaw pairing list telegram
openclaw pairing approve telegram <CODE>
```

Stödda kanaler: `telegram`, `whatsapp`, `signal`, `imessage`, `discord`, `slack`.

### Var tillståndet lagras

Lagring under `~/.openclaw/credentials/`:

- Väntande begäranden: `<channel>-pairing.json`
- Godkänd tillåtelselista: `<channel>-allowFrom.json`

Behandla dessa som känsliga (de styr åtkomsten till din assistent).

## 2. Nod-/enhetsparning (iOS/Android/macOS/headless-noder)

Noder ansluter till Gateway som **enheter** med `roll: node`. Gateway
skapar en anordning parningsbegäran som måste godkännas.

### Pair via Telegram (recommended for iOS)

If you use the `device-pair` plugin, you can do first-time device pairing entirely from Telegram:

1. In Telegram, message your bot: `/pair`
2. The bot replies with two messages: an instruction message and a separate **setup code** message (easy to copy/paste in Telegram).
3. On your phone, open the OpenClaw iOS app → Settings → Gateway.
4. Paste the setup code and connect.
5. Back in Telegram: `/pair approve`

The setup code is a base64-encoded JSON payload that contains:

- `url`: the Gateway WebSocket URL (`ws://...` or `wss://...`)
- `token`: a short-lived pairing token

Treat the setup code like a password while it is valid.

### Godkänn en nodenhet

```bash
openclaw devices list
openclaw devices approve <requestId>
openclaw devices reject <requestId>
```

### Lagring av nodparningstillstånd

Lagring under `~/.openclaw/devices/`:

- `pending.json` (kortlivad; väntande begäranden går ut)
- `paired.json` (parade enheter + token)

### Noteringar

- Den äldre `node.pair.*` API (CLI: `openclaw noder väntande/godkänna`) är en
  separat gateway-ägda parbutik. WS-noder kräver fortfarande enhet parning.

## Relaterad dokumentation

- Säkerhetsmodell + promptinjektion: [Security](/gateway/security)
- Uppdatera säkert (kör doctor): [Updating](/install/updating)
- Kanal-konfigurationer:
  - Telegram: [Telegram](/channels/telegram)
  - WhatsApp: [WhatsApp](/channels/whatsapp)
  - Signal: [Signal](/channels/signal)
  - BlueBubbles (iMessage): [BlueBubbles](/channels/bluebubbles)
  - iMessage (legacy): [iMessage](/channels/imessage)
  - Discord: [Discord](/channels/discord)
  - Slack: [Slack](/channels/slack)

---
summary: "جوڑی بنانے کا جائزہ: کس کو آپ کو DM کرنے کی اجازت ہے + کون سے نوڈز شامل ہو سکتے ہیں"
read_when:
  - DM رسائی کنٹرول سیٹ اپ کرنا
  - نئے iOS/Android نوڈ کو جوڑنا
  - OpenClaw کی سکیورٹی پوزیشن کا جائزہ لینا
title: "جوڑی بنانا"
---

# جوڑی بنانا

“Pairing” is OpenClaw’s explicit **owner approval** step.
It is used in two places:

1. **DM جوڑی بنانا** (کون بوٹ سے بات کر سکتا ہے)
2. **نوڈ جوڑی بنانا** (کون سے ڈیوائسز/نوڈز گیٹ وے نیٹ ورک میں شامل ہو سکتے ہیں)

سکیورٹی سیاق: [Security](/gateway/security)

## 1. DM جوڑی بنانا (ان باؤنڈ چیٹ رسائی)

جب کسی چینل کو DM پالیسی `pairing` کے ساتھ کنفیگر کیا جاتا ہے، تو نامعلوم ارسال کنندگان کو ایک مختصر کوڈ ملتا ہے اور آپ کی منظوری تک ان کا پیغام **پروسیس نہیں** کیا جاتا۔

ڈیفالٹ DM پالیسیاں یہاں دستاویزی ہیں: [Security](/gateway/security)

جوڑی بنانے کے کوڈز:

- 8 حروف، بڑے حروف میں، بغیر مبہم حروف (`0O1I`)۔
- **Expire after 1 hour**. The bot only sends the pairing message when a new request is created (roughly once per hour per sender).
- زیرِ التوا DM جوڑی بنانے کی درخواستیں بطورِ طے شدہ **ہر چینل پر 3** تک محدود ہیں؛ اضافی درخواستیں اس وقت تک نظرانداز کی جاتی ہیں جب تک کوئی ایک میعاد ختم نہ ہو یا منظور نہ ہو جائے۔

### کسی ارسال کنندہ کی منظوری

```bash
openclaw pairing list telegram
openclaw pairing approve telegram <CODE>
```

معاون چینلز: `telegram`, `whatsapp`, `signal`, `imessage`, `discord`, `slack`۔

### اسٹیٹ کہاں محفوظ ہوتی ہے

`~/.openclaw/credentials/` کے تحت محفوظ:

- زیرِ التوا درخواستیں: `<channel>-pairing.json`
- منظور شدہ اجازت فہرست اسٹور: `<channel>-allowFrom.json`

انہیں حساس سمجھیں (یہ آپ کے اسسٹنٹ تک رسائی کو کنٹرول کرتے ہیں)۔

## 2. نوڈ ڈیوائس جوڑی بنانا (iOS/Android/macOS/ہیڈلیس نوڈز)

Nodes connect to the Gateway as **devices** with `role: node`. The Gateway
creates a device pairing request that must be approved.

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

### نوڈ ڈیوائس کی منظوری

```bash
openclaw devices list
openclaw devices approve <requestId>
openclaw devices reject <requestId>
```

### نوڈ جوڑی بنانے کی اسٹیٹ کا ذخیرہ

`~/.openclaw/devices/` کے تحت محفوظ:

- `pending.json` (مختصر مدت؛ زیرِ التوا درخواستیں میعاد ختم ہو جاتی ہیں)
- `paired.json` (جوڑی بنے ہوئے ڈیوائسز + ٹوکنز)

### نوٹس

- The legacy `node.pair.*` API (CLI: `openclaw nodes pending/approve`) is a
  separate gateway-owned pairing store. WS nodes still require device pairing.

## متعلقہ دستاویزات

- سکیورٹی ماڈل + پرامپٹ انجیکشن: [Security](/gateway/security)
- محفوظ طریقے سے اپڈیٹ کرنا (رن ڈاکٹر): [Updating](/install/updating)
- چینل کنفیگز:
  - Telegram: [Telegram](/channels/telegram)
  - WhatsApp: [WhatsApp](/channels/whatsapp)
  - Signal: [Signal](/channels/signal)
  - BlueBubbles (iMessage): [BlueBubbles](/channels/bluebubbles)
  - iMessage (لیگیسی): [iMessage](/channels/imessage)
  - Discord: [Discord](/channels/discord)
  - Slack: [Slack](/channels/slack)

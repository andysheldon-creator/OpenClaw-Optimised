---
summary: "Eşleştirmeye genel bakış: size DM atabilecekleri ve hangi düğümlerin katılabileceğini onaylayın"
read_when:
  - DM erişim denetimini ayarlarken
  - Yeni bir iOS/Android düğümünü eşleştirirken
  - OpenClaw güvenlik duruşunu gözden geçirirken
title: "Pairing"
---

# Pairing

“Eşleştirme”, OpenClaw’ın açık **sahip onayı** adımıdır.
İki yerde kullanılır:

1. **DM eşleştirme** (botla kimlerin konuşmasına izin verildiği)
2. **Düğüm eşleştirme** (hangi cihazların/düğümlerin gateway (ağ geçidi) ağına katılmasına izin verildiği)

Güvenlik bağlamı: [Güvenlik](/gateway/security)

## 1. DM eşleştirme (gelen sohbet erişimi)

Bir kanal DM politikası `pairing` ile yapılandırıldığında, bilinmeyen göndericilere kısa bir kod verilir ve onaylayana kadar mesajları **işlenmez**.

Varsayılan DM politikaları şu belgede yer alır: [Güvenlik](/gateway/security)

Eşleştirme kodları:

- 8 karakter, büyük harf, belirsiz karakter yok (`0O1I`).
- **1 saat sonra sona erer**. Bot, yeni bir istek oluşturulduğunda (gönderici başına yaklaşık saatte bir) yalnızca bir eşleştirme mesajı gönderir.
- Bekleyen DM eşleştirme istekleri varsayılan olarak **kanal başına 3** ile sınırlıdır; biri süresi dolana veya onaylanana kadar ek istekler yok sayılır.

### Bir göndericiyi onaylayın

```bash
openclaw pairing list telegram
openclaw pairing approve telegram <CODE>
```

Desteklenen kanallar: `telegram`, `whatsapp`, `signal`, `imessage`, `discord`, `slack`.

### Where the state lives

`~/.openclaw/credentials/` altında saklanır:

- Bekleyen istekler: `<channel>-pairing.json`
- Onaylı izin listesi deposu: `<channel>-allowFrom.json`

Treat these as sensitive (they gate access to your assistant).

## 2. Düğüm cihaz eşleştirme (iOS/Android/macOS/başsız düğümler)

Düğümler, `role: node` ile **cihaz** olarak Gateway’e bağlanır. Gateway (Ağ Geçidi),
onaylanması gereken bir cihaz eşleştirme isteği oluşturur.

### Telegram üzerinden eşleştirme (iOS için önerilir)

`device-pair` eklentisini kullanırsanız, ilk kez cihaz eşleştirmesini tamamen Telegram üzerinden yapabilirsiniz:

1. Telegram’da botunuza mesaj gönderin: `/pair`
2. Bot iki mesajla yanıt verir: bir talimat mesajı ve ayrı bir **kurulum kodu** mesajı (Telegram’da kolayca kopyala/yapıştır için).
3. Telefonunuzda OpenClaw iOS uygulamasını açın → Ayarlar → Gateway.
4. Kurulum kodunu yapıştırın ve bağlanın.
5. Tekrar Telegram’a dönün: `/pair approve`

Kurulum kodu, aşağıdakileri içeren base64 kodlu bir JSON yüküdür:

- `url`: Gateway WebSocket URL’si (`ws://...` veya `wss://...`)
- `token`: kısa ömürlü bir eşleştirme belirteci

Geçerli olduğu sürece kurulum kodunu bir parola gibi değerlendirin.

### Bir düğüm cihazını onaylayın

```bash
openclaw devices list
openclaw devices approve <requestId>
openclaw devices reject <requestId>
```

### Düğüm eşleştirme durumu depolaması

`~/.openclaw/devices/` altında saklanır:

- `pending.json` (kısa ömürlü; bekleyen isteklerin süresi dolar)
- `paired.json` (eşleştirilmiş cihazlar + belirteçler)

### Notlar

- Eski `node.pair.*` API’si (CLI: `openclaw nodes pending/approve`) gateway’ye ait ayrı bir eşleştirme deposudur. WS düğümleri yine de cihaz eşleştirmesi gerektirir.

## İlgili belgeler

- Güvenlik modeli + prompt enjeksiyonu: [Güvenlik](/gateway/security)
- Güvenli şekilde güncelleme (doctor çalıştırma): [Güncelleme](/install/updating)
- Kanal yapılandırmaları:
  - Telegram: [Telegram](/channels/telegram)
  - WhatsApp: [WhatsApp](/channels/whatsapp)
  - Signal: [Signal](/channels/signal)
  - BlueBubbles (iMessage): [BlueBubbles](/channels/bluebubbles)
  - iMessage (eski): [iMessage](/channels/imessage)
  - Discord: [Discord](/channels/discord)
  - Slack: [Slack](/channels/slack)

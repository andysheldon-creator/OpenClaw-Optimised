---
summary: "Alt ajanlar: sonuçları istekte bulunan sohbet kanalına duyuran, izole ajan çalıştırmaları oluşturma"
read_when:
  - Ajan üzerinden arka plan/paralel çalışma istiyorsunuz
  - sessions_spawn veya alt ajan araç politikasını değiştiriyorsunuz
title: "50. Alt Ajanlar"
---

# 50. Alt Ajanlar

Alt ajanlar, ana sohbeti engellemeden arka plan görevleri çalıştırmanıza olanak tanır. Bir alt ajan oluşturduğunuzda, kendi yalıtılmış oturumunda çalışır, işini yapar ve tamamlandığında sonucu sohbete bildirir.

**Kullanım senaryoları:**

- Ana ajan soruları yanıtlamaya devam ederken bir konuyu araştırmak
- Birden fazla uzun görevi paralel olarak çalıştırmak (web kazıma, kod analizi, dosya işleme)
- Çoklu ajan kurulumunda görevleri uzmanlaşmış ajanlara devretmek

## Hızlı Başlangıç

Alt ajanları kullanmanın en basit yolu, ajanınıza doğal bir şekilde sormaktır:

> "En son Node.js sürüm notlarını araştırmak için bir alt ajan oluştur"

Ajan, perde arkasında `sessions_spawn` aracını çağırır. Alt ajan tamamlandığında, bulgularını sohbetinize geri bildirir.

Seçenekler konusunda açık da olabilirsiniz:

> "Bugüne ait sunucu günlüklerini analiz etmek için bir alt ajan oluştur.
> gpt-5.2 kullan ve 5 dakikalık zaman aşımı ayarla." Ana ajan, bir görev açıklamasıyla `sessions_spawn` çağrısını yapar.

## Nasıl Çalışır

<Steps>
  <Step title="Main agent spawns">
    Çağrı **engelleyici değildir** — ana ajan hemen `{ status: "accepted", runId, childSessionKey }` yanıtını alır. 
    Yeni bir yalıtılmış oturum oluşturulur (`agent:
    :subagent:
    `) ve özel `subagent` kuyruk şeridinde çalışır.
  
  </Step>
  <Step title="Sub-agent runs in the background">Alt ajan tamamlandığında, bulgularını talepte bulunan sohbete geri bildirir.<agentId>Ana ajan, doğal dilde bir özet gönderir.<uuid>Alt ajan oturumu 60 dakika sonra otomatik olarak arşivlenir (yapılandırılabilir).</Step>
  <Step title="Result is announced">
    Dökümler korunur. Her alt ajanın **kendi** bağlamı ve token kullanımı vardır.
  </Step>
  <Step title="Session is archived">
    Maliyetlerden tasarruf etmek için alt ajanlar için daha ucuz bir model ayarlayın — aşağıdaki [Varsayılan Model Ayarlama](#setting-a-default-model) bölümüne bakın. Alt ajanlar, yapılandırma gerektirmeden kutudan çıktığı gibi çalışır.
  </Step>
</Steps>

<Tip>
Model: hedef ajanın normal model seçimi (`subagents.model` ayarlanmadıkça) Düşünme: alt ajan için geçersiz kılma yok (`subagents.thinking` ayarlanmadıkça)
</Tip>

## Yapılandırma

Maksimum eşzamanlı: 8 Varsayılanlar:

- Otomatik arşivleme: 60 dakika sonra
- Varsayılan Model Ayarlama
- Token maliyetlerinden tasarruf etmek için alt ajanlar için daha ucuz bir model kullanın:
- {
  agents: {
  defaults: {
  subagents: {
  model: "minimax/MiniMax-M2.1",
  },
  },
  },
  }

### Varsayılan Düşünme Seviyesini Ayarlama

Use a cheaper model for sub-agents to save on token costs:

```json5
{
  agents: {
    defaults: {
      subagents: {
        model: "minimax/MiniMax-M2.1",
      },
    },
  },
}
```

### Setting a Default Thinking Level

```json5
{
  agents: {
    defaults: {
      subagents: {
        thinking: "low",
      },
    },
  },
}
```

### Aracı Bazında Geçersiz Kılmalar

Çok aracılı bir kurulumda, alt aracı varsayımlarını aracı başına ayarlayabilirsiniz:

```json5
{
  agents: {
    list: [
      {
        id: "researcher",
        subagents: {
          model: "anthropic/claude-sonnet-4",
        },
      },
      {
        id: "assistant",
        subagents: {
          model: "minimax/MiniMax-M2.1",
        },
      },
    ],
  },
}
```

### Eşzamanlılık

Aynı anda kaç alt aracın çalışabileceğini kontrol edin:

```json5
{
  agents: {
    defaults: {
      subagents: {
        maxConcurrent: 4, // default: 8
      },
    },
  },
}
```

Alt aracılar, ana aracı kuyruğundan ayrı, kendilerine adanmış bir kuyruk şeridi (`subagent`) kullanır; böylece alt aracı çalışmaları gelen yanıtları engellemez.

### Otomatik Arşivleme

Alt aracı oturumları, yapılandırılabilir bir süreden sonra otomatik olarak arşivlenir:

```json5
{
  agents: {
    defaults: {
      subagents: {
        archiveAfterMinutes: 120, // default: 60
      },
    },
  },
}
```

<Note>
Arşivleme, dökümü `*.deleted olarak yeniden adlandırır.<timestamp>` (aynı klasör) — dökümler silinmez, korunur. Otomatik arşivleme zamanlayıcıları en iyi çaba esaslıdır; ağ geçidi yeniden başlatılırsa bekleyen zamanlayıcılar kaybolur.
</Note>

## `sessions_spawn` Aracı

Bu, aracının alt aracılar oluşturmak için çağırdığı araçtır.

### Parametreler

| Parametre           | Ana makine hacim bağlaması | Varsayılan                             | Açıklama                                                                                                |
| ------------------- | -------------------------- | -------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `task`              | string                     | _(zorunlu)_         | Alt aracının ne yapması gerektiği                                                                       |
| `etiket`            | string                     | —                                      | Tanımlama için kısa etiket                                                                              |
| `agentId`           | string                     | _(çağıranın aracı)_ | Farklı bir aracı kimliği altında oluştur (izin verilmiş olmalıdır)                   |
| `model`             | string                     | _(isteğe bağlı)_    | Bu alt aracı için modeli geçersiz kıl                                                                   |
| `thinking`          | string                     | _(isteğe bağlı)_    | Düşünme seviyesini geçersiz kıl (`off`, `low`, `medium`, `high` vb.) |
| `runTimeoutSeconds` | sayı                       | `0` (sınırsız)      | Alt aracıyı N saniye sonra durdur                                                                       |
| `temizlik`          | "delete" \| "keep"         | "keep"                                 | "delete" duyurudan hemen sonra arşivler                                                                 |

### Model Çözümleme Sırası

Alt aracı modeli şu sırayla çözülür (ilk eşleşen kazanır):

1. `sessions_spawn` çağrısındaki açık `model` parametresi
2. Aracı başına yapılandırma: `agents.list[].subagents.model`
3. Genel varsayılan: `agents.defaults.subagents.model`
4. Hedef aracının, yeni oturum için normal model çözümlemesi

Düşünme seviyesi şu sırayla çözülür:

1. `sessions_spawn` çağrısındaki açık `thinking` parametresi
2. Aracı başına yapılandırma: `agents.list[].subagents.thinking`
3. Genel varsayılan: `agents.defaults.subagents.thinking`
4. Aksi halde alt aracıya özgü bir düşünme geçersiz kılması uygulanmaz

<Note>
Geçersiz model değerleri sessizce atlanır — alt aracı, araç sonucunda bir uyarıyla birlikte bir sonraki geçerli varsayılanla çalışır.</Note>

### Aracılar Arası Oluşturma

Varsayılan olarak, alt aracılar yalnızca kendi aracı kimlikleri altında oluşturulabilir. Bir aracının diğer aracı kimlikleri altında alt aracılar oluşturmasına izin vermek için:

```json5
{
  agents: {
    list: [
      {
        id: "orchestrator",
        subagents: {
          allowAgents: ["researcher", "coder"], // veya herhangi birine izin vermek için ["*"]
        },
      },
    ],
  },
}
```

<Tip>`sessions_spawn` için şu anda hangi aracı kimliklerine izin verildiğini keşfetmek için `agents_list` aracını kullanın.</Tip>

## Alt Aracıları Yönetme (`/subagents`)

Geçerli oturum için alt aracı çalışmalarını incelemek ve kontrol etmek üzere `/subagents` eğik çizgi komutunu kullanın:

| Command                                    | Açıklama                                                                      |
| ------------------------------------------ | ----------------------------------------------------------------------------- |
| `/subagents list`                          | Tüm alt aracı çalışmalarını listele (aktif ve tamamlanmış) |
| `/subagents stop <id\\|#\\|all>`         | Stop a running sub-agent                                                      |
| `/subagents log <id\\|#> [limit] [tools]` | Alt aracı dökümünü görüntüle                                                  |
| `/subagents info <id\\|#>`                | Ayrıntılı çalışma meta verilerini göster                                      |
| `/subagents send <id\\|#> <message>`      | Çalışan bir alt aracıya mesaj gönder                                          |

Alt aracıları liste dizini (`1`, `2`), çalışma kimliği öneki, tam oturum anahtarı veya `last` ile referans alabilirsiniz.

<AccordionGroup>
  <Accordion title="Example: list and stop a sub-agent">```
    /subagents list
    ```

    ````
    ```
    🧭 Subagents (current session)
    Active: 1 · Done: 2
    1) ✅ · research logs · 2m31s · run a1b2c3d4 · agent:main:subagent:...
    2) ✅ · check deps · 45s · run e5f6g7h8 · agent:main:subagent:...
    3) 🔄 · deploy staging · 1m12s · run i9j0k1l2 · agent:main:subagent:...
    ```
    
    ```
    /subagents stop 3
    ```
    
    ```
    ⚙️ Stop requested for deploy staging.
    ```
    ````

  </Accordion>
  <Accordion title="Example: inspect a sub-agent">```
    /subagents info 1
    ```

    ````
    ```
    ℹ️ Subagent info
    Status: ✅
    Label: research logs
    Task: Research the latest server error logs and summarize findings
    Run: a1b2c3d4-...
    Session: agent:main:subagent:...
    Runtime: 2m31s
    Cleanup: keep
    Outcome: ok
    ```
    ````

  </Accordion>
  <Accordion title="Example: view sub-agent log">```
    /subagents log 1 10
    ```

    ````
    Alt aracının dökümünden son 10 mesajı gösterir. Araç çağrısı mesajlarını dahil etmek için `tools` ekleyin:
    
    ```
    /subagents log 1 10 tools
    ```
    ````

  </Accordion>
  <Accordion title="Example: send a follow-up message">```
    /subagents send 3 "Also check the staging environment"
    ```

    ```
    Çalışan alt aracının oturumuna bir mesaj gönderir ve yanıt için 30 saniyeye kadar bekler.
    ```

  </Accordion>
</AccordionGroup>

## Duyuru (Sonuçlar Nasıl Geri Döner)

Bir alt aracı tamamlandığında bir **duyuru** adımından geçer:

1. Alt aracının nihai yanıtı yakalanır
2. Sonuç, durum ve istatistiklerle birlikte ana aracının oturumuna bir özet mesaj gönderilir
3. Ana aracı sohbetinize doğal dilde bir özet gönderir

Duyuru yanıtları, mevcut olduğunda iş parçacığı/konu yönlendirmesini korur (Slack iş parçacıkları, Telegram konuları, Matrix iş parçacıkları).

### Duyuru İstatistikleri

Her duyuru, şu bilgileri içeren bir istatistik satırı içerir:

- Çalışma süresi
- Token kullanımı (girdi/çıktı/toplam)
- Tahmini maliyet (`models.providers.*.models[].cost` üzerinden model fiyatlandırması yapılandırıldığında)
- Oturum anahtarı, oturum kimliği ve döküm yolu

### Duyuru Durumu

Duyuru mesajı, çalışma zamanındaki sonuca dayalı bir durum içerir (model çıktısına değil):

- **başarılı tamamlanma** (`ok`) — görev normal şekilde tamamlandı
- **hata** — görev başarısız oldu (ayrıntılar notlarda)
- **zaman aşımı** — görev `runTimeoutSeconds` süresini aştı
- **bilinmiyor** — durum belirlenemedi

<Tip>
Kullanıcıya yönelik bir duyuru gerekmezse, ana aracının özetleme adımı `NO_REPLY` döndürebilir ve hiçbir şey gönderilmez.
Bu, ajanlar arası duyuru akışında (`sessions_send`) kullanılan `ANNOUNCE_SKIP`’ten farklıdır.
</Tip>

## Araç Politikası

Varsayılan olarak, alt aracılar arka plan görevleri için güvensiz veya gereksiz olan reddedilmiş araçlar kümesi **hariç** tüm araçları alır:

<AccordionGroup>
  <Accordion title="Default denied tools">| Reddedilen araç | Neden |
|-------------|--------|
| `sessions_list` | Oturum yönetimi — ana aracı düzenler |
| `sessions_history` | Oturum yönetimi — ana aracı düzenler |
| `sessions_send` | Oturum yönetimi — ana aracı düzenler |
| `sessions_spawn` | İç içe fan-out yok (alt aracılar alt aracı oluşturamaz) |
| `gateway` | Sistem yöneticisi — alt aracıdan tehlikeli |
| `agents_list` | Sistem yöneticisi |
| `whatsapp_login` | Etkileşimli kurulum — bir görev değil |
| `session_status` | Durum/zamanlama — ana aracı koordine eder |
| `cron` | Durum/zamanlama — ana aracı koordine eder |
| `memory_search` | Bunun yerine ilgili bilgileri oluşturma isteminde geçin |
| `memory_get` | Bunun yerine ilgili bilgileri oluşturma isteminde geçin |</Accordion>
</AccordionGroup>

### Alt Aracı Araçlarını Özelleştirme

Alt aracı araçlarını daha da kısıtlayabilirsiniz:

```json5
{
  tools: {
    subagents: {
      tools: {
        // reddetme her zaman izin vermeye üstün gelir
        deny: ["browser", "firecrawl"],
      },
    },
  },
}
```

Alt aracıları **yalnızca** belirli araçlarla sınırlandırmak için:

```json5
{
  tools: {
    subagents: {
      tools: {
        allow: ["read", "exec", "process", "write", "edit", "apply_patch"],
        // ayarlanmışsa reddetme yine kazanır
      },
    },
  },
}
```

<Note>
Özel reddetme girdileri varsayılan reddetme listesine **eklenir**. `allow` ayarlanırsa, yalnızca bu araçlar kullanılabilir (varsayılan reddetme listesi yine de üstüne uygulanır).
</Note>

## Kimlik doğrulama

Alt ajan kimlik doğrulaması oturum türüne göre değil, **ajan kimliğine** göre çözülür:

- Kimlik doğrulama deposu hedef aracının `agentDir` dizininden yüklenir
- Ana aracının kimlik doğrulama profilleri **yedek** olarak birleştirilir (çakışmalarda aracı profilleri kazanır)
- Birleştirme ekleyicidir — ana profiller her zaman yedek olarak kullanılabilir

<Note>Alt ajan başına tamamen izole edilmiş kimlik doğrulama şu anda desteklenmemektedir.</Note>

## Bağlam ve Sistem İstemi

Alt ajanlar, ana ajana kıyasla azaltılmış bir sistem istemi alır:

- **Dahil edilenler:** Tooling, Workspace, Runtime bölümleri ile birlikte `AGENTS.md` ve `TOOLS.md`
- **Not included:** `SOUL.md`, `IDENTITY.md`, `USER.md`, `HEARTBEAT.md`, `BOOTSTRAP.md`

Alt ajan ayrıca, kendisine atanan göreve odaklanmasını, görevi tamamlamasını ve ana ajan gibi davranmamasını söyleyen görev odaklı bir sistem istemi alır.

## Alt Ajanların Durdurulması

| Yöntem                 | Etkisi                                                                               |
| ---------------------- | ------------------------------------------------------------------------------------ |
| Sohbette `/stop`       | Ana oturumu **ve** ondan oluşturulmuş tüm aktif alt ajan çalıştırmalarını iptal eder |
| `/subagents stop <id>` | Ana oturumu etkilemeden belirli bir alt ajanı durdurur                               |
| `runTimeoutSeconds`    | Belirtilen süreden sonra alt ajan çalıştırmasını otomatik olarak iptal eder          |

<Note>
`runTimeoutSeconds`, oturumu otomatik olarak arşivlemez. The session remains until the normal archive timer fires.
</Note>

## Tam Yapılandırma Örneği

<Accordion title="Complete sub-agent configuration">```json5
{
  agents: {
    defaults: {
      model: { primary: "anthropic/claude-sonnet-4" },
      subagents: {
        model: "minimax/MiniMax-M2.1",
        thinking: "low",
        maxConcurrent: 4,
        archiveAfterMinutes: 30,
      },
    },
    list: [
      {
        id: "main",
        default: true,
        name: "Personal Assistant",
      },
      {
        id: "ops",
        name: "Ops Agent",
        subagents: {
          model: "anthropic/claude-sonnet-4",
          allowAgents: ["main"], // ops can spawn sub-agents under "main"
        },
      },
    ],
  },
  tools: {
    subagents: {
      tools: {
        deny: ["browser"], // sub-agents can't use the browser
      },
    },
  },
}
```</Accordion>

## Sınırlamalar

<Warning>
- **En iyi çaba ile duyuru:** Gateway yeniden başlarsa, bekleyen duyuru işleri kaybolur.
- **İç içe oluşturma yok:** Alt ajanlar kendi alt ajanlarını oluşturamaz.
- **Paylaşılan kaynaklar:** Alt ajanlar gateway sürecini paylaşır; bir güvenlik supabı olarak `maxConcurrent` kullanın.
- **Otomatik arşivleme en iyi çaba ile yapılır:** Bekleyen arşiv zamanlayıcıları gateway yeniden başlatıldığında kaybolur.
</Warning>

## Ayrıca Bakın

- [Oturum Araçları](/concepts/session-tool) — `sessions_spawn` ve diğer oturum araçları hakkında ayrıntılar
- [Çok Ajanlı Sandbox ve Araçlar](/tools/multi-agent-sandbox-tools) — ajan başına araç kısıtlamaları ve sandboxing
- [Yapılandırma](/gateway/configuration) — `agents.defaults.subagents` referansı
- [Kuyruk](/concepts/queue) — `subagent` hattının nasıl çalıştığı

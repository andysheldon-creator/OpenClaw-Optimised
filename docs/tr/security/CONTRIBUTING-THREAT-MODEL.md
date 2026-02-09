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

## 1. Ne Kullanıyoruz

### 2. MITRE ATLAS

3. Bu tehdit modeli, özellikle istem enjeksiyonu, araç kötüye kullanımı ve ajan istismarı gibi AI/ML tehditleri için tasarlanmış bir çerçeve olan [MITRE ATLAS](https://atlas.mitre.org/) (Yapay Zekâ Sistemleri için Karşıt Tehdit Manzarası) üzerine kuruludur. 4. Katkıda bulunmak için ATLAS'ı bilmeniz gerekmez - gönderimleri inceleme sırasında çerçeveye eşliyoruz.

### 5. Tehdit Kimlikleri

6. Her tehdit `T-EXEC-003` gibi bir kimlik alır. 7. Kategoriler şunlardır:

| Kod                                | Category                                                              |
| ---------------------------------- | --------------------------------------------------------------------- |
| 8. RECON    | 9. Keşif - bilgi toplama                       |
| 10. ACCESS  | 11. İlk erişim - sisteme giriş elde etme       |
| 12. EXEC    | 13. Yürütme - kötü amaçlı eylemleri çalıştırma |
| 14. PERSIST | 15. Kalıcılık - erişimi sürdürme               |
| 16. EVADE   | 17. Savunmadan kaçınma - tespitten kaçma       |
| 18. DISC    | 19. Keşif - ortam hakkında bilgi edinme        |
| 20. EXFIL   | 21. Veri sızdırma - veri çalma                 |
| 22. IMPACT  | 23. Etki - hasar veya kesinti                  |

IDs are assigned by maintainers during review. 25. Birini seçmeniz gerekmez.

### 26. Risk Seviyeleri

| 27. Seviye     | 28. Anlam                                                         |
| ------------------------------------- | ---------------------------------------------------------------------------------------- |
| 29. **Kritik** | 30. Tam sistem ele geçirilmesi veya yüksek olasılık + kritik etki |
| 31. **Yüksek** | 32. Önemli hasar olası veya orta olasılık + kritik etki           |
| 33. **Orta**   | 34. Orta düzey risk veya düşük olasılık + yüksek etki             |
| 35. **Düşük**  | 36. Olasılığı düşük ve sınırlı etki                               |

37. Risk seviyesi konusunda emin değilseniz, sadece etkiyi açıklayın, biz değerlendirelim.

## 38. İnceleme Süreci

1. 39. **Ön Eleme** - Yeni gönderimleri 48 saat içinde inceliyoruz
2. 40. **Değerlendirme** - Uygulanabilirliği doğrular, ATLAS eşlemesini ve tehdit kimliğini atar, risk seviyesini doğrularız
3. 41. **Dokümantasyon** - Her şeyin biçimlendirilmiş ve eksiksiz olmasını sağlarız
4. 42. **Birleştirme** - Tehdit modeline ve görselleştirmeye eklenir

## 43) Kaynaklar

- 44. [ATLAS Web Sitesi](https://atlas.mitre.org/)
- 45. [ATLAS Teknikleri](https://atlas.mitre.org/techniques/)
- [ATLAS Case Studies](https://atlas.mitre.org/studies/)
- 47. [OpenClaw Tehdit Modeli](./THREAT-MODEL-ATLAS.md)

## 48. İletişim

- 49. **Güvenlik açıkları:** Bildirim talimatları için [Güven sayfamıza](https://trust.openclaw.ai) bakın
- 50. **Tehdit modeli soruları:** [openclaw/trust](https://github.com/openclaw/trust/issues) üzerinde bir konu açın
- **General chat:** Discord #security channel

## Recognition

Contributors to the threat model are recognized in the threat model acknowledgments, release notes, and the OpenClaw security hall of fame for significant contributions.

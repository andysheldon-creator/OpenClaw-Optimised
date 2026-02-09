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

## สิ่งที่เราใช้

### MITRE ATLAS

โมเดลภัยคุกคามนี้สร้างขึ้นบน [MITRE ATLAS](https://atlas.mitre.org/) (Adversarial Threat Landscape for AI Systems) ซึ่งเป็นเฟรมเวิร์กที่ออกแบบมาโดยเฉพาะสำหรับภัยคุกคามด้าน AI/ML เช่น การโจมตีแบบ prompt injection, การใช้เครื่องมือในทางที่ผิด และการโจมตีเอเจนต์ คุณไม่จำเป็นต้องรู้จัก ATLAS เพื่อมีส่วนร่วม — เราจะทำการแมปการส่งข้อมูลเข้ากับเฟรมเวิร์กระหว่างการตรวจทาน

### รหัสภัยคุกคาม

ภัยคุกคามแต่ละรายการจะมีรหัส เช่น `T-EXEC-003` หมวดหมู่ประกอบด้วย:

| โค้ด    | หมวดหมู่                                         |
| ------- | ------------------------------------------------ |
| RECON   | การสอดแนม — การรวบรวมข้อมูล                      |
| ACCESS  | การเข้าถึงเริ่มต้น — การเจาะเข้าไป               |
| EXEC    | การดำเนินการ — การรันการกระทำที่เป็นอันตราย      |
| PERSIST | การคงอยู่ — การรักษาการเข้าถึง                   |
| EVADE   | การหลบเลี่ยงการป้องกัน — การหลีกเลี่ยงการตรวจจับ |
| DISC    | การค้นพบ — การเรียนรู้เกี่ยวกับสภาพแวดล้อม       |
| EXFIL   | Exfiltration - stealing data                     |
| IMPACT  | ผลกระทบ — ความเสียหายหรือการหยุดชะงัก            |

รหัสจะถูกกำหนดโดยผู้ดูแลในระหว่างการตรวจทาน คุณไม่จำเป็นต้องเลือกหนึ่งรายการ

### ระดับความเสี่ยง

| ระดับ       | ความหมาย                                                                          |
| ----------- | --------------------------------------------------------------------------------- |
| **วิกฤต**   | ระบบถูกยึดทั้งหมด หรือมีความเป็นไปได้สูง + ผลกระทบวิกฤต                           |
| **สูง**     | มีแนวโน้มเกิดความเสียหายอย่างมีนัยสำคัญ หรือมีความเป็นไปได้ปานกลาง + ผลกระทบวิกฤต |
| **ปานกลาง** | ความเสี่ยงปานกลาง หรือมีความเป็นไปได้ต่ำ + ผลกระทบสูง                             |
| **ต่ำ**     | ไม่น่าจะเกิดขึ้นและมีผลกระทบจำกัด                                                 |

หากคุณไม่แน่ใจเกี่ยวกับระดับความเสี่ยง เพียงอธิบายผลกระทบ แล้วเราจะเป็นผู้ประเมินให้

## กระบวนการตรวจทาน

1. **คัดกรอง (Triage)** — เราตรวจทานการส่งใหม่ภายใน 48 ชั่วโมง
2. **การประเมิน (Assessment)** — เราตรวจสอบความเป็นไปได้ กำหนดการแมปกับ ATLAS และรหัสภัยคุกคาม และยืนยันระดับความเสี่ยง
3. **การจัดทำเอกสาร (Documentation)** — เราตรวจสอบให้แน่ใจว่าทุกอย่างมีรูปแบบถูกต้องและครบถ้วน
4. **รวม (Merge)** — เพิ่มเข้าไปในโมเดลภัยคุกคามและการแสดงผล

## แหล่งข้อมูล

- [เว็บไซต์ ATLAS](https://atlas.mitre.org/)
- [เทคนิค ATLAS](https://atlas.mitre.org/techniques/)
- [กรณีศึกษา ATLAS](https://atlas.mitre.org/studies/)
- [โมเดลภัยคุกคาม OpenClaw](./THREAT-MODEL-ATLAS.md)

## ติดต่อ

- **ช่องโหว่ด้านความปลอดภัย:** ดูคำแนะนำการรายงานได้ที่ [หน้า Trust](https://trust.openclaw.ai)
- **คำถามเกี่ยวกับโมเดลภัยคุกคาม:** เปิด issue บน [openclaw/trust](https://github.com/openclaw/trust/issues)
- 1. **แชททั่วไป:** ช่อง Discord #security

## 2. การยอมรับ

3. ผู้มีส่วนร่วมในแบบจำลองภัยคุกคามจะได้รับการยอมรับในส่วนกิตติกรรมประกาศของแบบจำลองภัยคุกาม หมายเหตุการเผยแพร่ และหอเกียรติยศด้านความปลอดภัยของ OpenClaw สำหรับการมีส่วนร่วมที่สำคัญ
